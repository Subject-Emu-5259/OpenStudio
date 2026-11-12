import JSZip from "jszip";
import {
  MIDI_FILE_DND_MIME,
  parseMidiArrayBufferToStepNotes,
} from "../utils/midiImport";
import { toSafeSampleUrl } from "../utils/sampleUrl";
import type { StoredAttachment } from "./aiAttachmentStore";
import type {
  AiAttachmentDescriptor,
  AiAttachmentKind,
  AiSample,
} from "../types/ai";

// Session attachments for the AI agent chat: files the user pastes, drops,
// or picks so the agent can use them in a plan. Audio becomes a blob-URL
// sample the existing sample ops can reference; MIDI becomes a note
// count the agent places with piano ops; presets become sanitized
// settings the agent applies with plugin/FX ops. Nothing here touches
// the public packs bucket — attachments live in the browser session
// (plus IndexedDB backup) and die with the tab unless restored locally.

export const AI_ATTACHMENT_MAX_ZIP_FILES = 50;
export const AI_ATTACHMENT_MAX_ZIP_BYTES = 200 * 1024 * 1024;
export const AI_ATTACHMENT_FOLDER = "Attachments";

const AUDIO_EXTENSIONS = new Set(["wav", "mp3", "flac"]);
const MIDI_EXTENSIONS = new Set(["mid", "midi"]);
const SECRET_KEY_PATTERN = /key|token|secret|password|auth|bearer|session|cookie/i;

export interface AiAttachmentFileLike {
  name: string
  size?: number
  arrayBuffer: () => Promise<ArrayBuffer>
  text?: () => Promise<string>
  slice?: (start?: number, end?: number) => Blob
}

export interface AiAttachmentRecord {
  id: string
  name: string
  kind: AiAttachmentKind
  size: number
  blob: Blob
  objectUrl: string
  durationSec?: number
  noteCount?: number
  presetSummary?: string
  presetParams?: Record<string, unknown>
  sourcePack?: string
}

export interface AiAttachmentSkipped {
  name: string
  reason: string
}

export interface AiAttachmentProcessResult {
  records: AiAttachmentRecord[]
  skipped: AiAttachmentSkipped[]
}

export interface AiAttachmentProcessOptions {
  // Decodes an audio buffer to its duration. Defaults to AudioContext.
  decodeAudio?: (buffer: ArrayBuffer) => Promise<{ duration: number }>
  // Creates the playable URL for a blob. Defaults to URL.createObjectURL.
  createObjectUrl?: (blob: Blob) => string
  // ZIP caps (defaults: 50 files / 200 MB). Overridable for tests.
  zipMaxFiles?: number
  zipMaxBytes?: number
}

export function getAttachmentExtension(name: unknown): string {
  const raw = String(name || "").trim().toLowerCase();
  const dot = raw.lastIndexOf(".");
  if (dot < 0) {
    return "";
  }
  return raw.slice(dot + 1);
}

export function classifyAttachmentFile(
  name: unknown,
): AiAttachmentKind | "zip" | null {
  const extension = getAttachmentExtension(name);
  if (AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }
  if (MIDI_EXTENSIONS.has(extension)) {
    return "midi";
  }
  if (extension === "json") {
    return "preset";
  }
  if (extension === "zip") {
    return "zip";
  }
  return null;
}

export function createAttachmentId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return (
    "att-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e9).toString(36)
  );
}

export function formatAttachmentSize(bytes: unknown): string {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }
  if (size < 1024) {
    return size + " B";
  }
  if (size < 1024 * 1024) {
    return (size / 1024).toFixed(1) + " KB";
  }
  return (size / (1024 * 1024)).toFixed(1) + " MB";
}

async function defaultDecodeAudio(
  buffer: ArrayBuffer,
): Promise<{ duration: number }> {
  const AudioContextClass =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!AudioContextClass) {
    throw new Error("AudioContext is not available.");
  }
  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(buffer);
    return { duration: Number(decoded?.duration || 0) };
  } finally {
    if (typeof context.close === "function") {
      await context.close().catch(function () {
        // Closing is best-effort; a failed close must not fail the file.
      });
    }
  }
}

function defaultCreateObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

async function fileToBlob(file: AiAttachmentFileLike): Promise<Blob> {
  if (typeof Blob !== "undefined" && file instanceof Blob) {
    return file as unknown as Blob;
  }
  const buffer = await file.arrayBuffer();
  return new Blob([buffer]);
}

async function decodeDurationSafe(
  blob: Blob,
  options: AiAttachmentProcessOptions,
): Promise<number | undefined> {
  try {
    const buffer = await blob.arrayBuffer();
    const decode = options.decodeAudio || defaultDecodeAudio;
    const decoded = await decode(buffer);
    const duration = Number(decoded?.duration || 0);
    return duration > 0 ? duration : undefined;
  } catch {
    // Duration is nice-to-have: a file that will not decode still gets
    // registered (playback may still work through the sample path).
    return undefined;
  }
}

// Recursively strips secret-looking keys and caps sizes so a preset can
// never smuggle keys, tokens, or huge blobs into a model payload.
function sanitizePresetValue(value: unknown, depth: number): unknown {
  if (depth <= 0) {
    return undefined;
  }
  if (typeof value === "string") {
    return value.slice(0, 200);
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map(function (item) {
        return sanitizePresetValue(item, depth - 1);
      })
      .filter(function (item) {
        return item !== undefined;
      });
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>).forEach(function (key) {
      if (SECRET_KEY_PATTERN.test(key)) {
        return;
      }
      const cleaned = sanitizePresetValue(
        (value as Record<string, unknown>)[key],
        depth - 1,
      );
      if (cleaned !== undefined) {
        result[key.slice(0, 100)] = cleaned;
      }
    });
    return result;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  return undefined;
}

export function summarizePresetParams(
  params: Record<string, unknown>,
): string {
  const keys = Object.keys(params);
  if (keys.length === 0) {
    return "Empty preset";
  }
  return keys
    .slice(0, 12)
    .map(function (key) {
      const value = params[key];
      if (value && typeof value === "object") {
        return key + " (group)";
      }
      return key + "=" + String(value).slice(0, 40);
    })
    .join(", ");
}

async function processAudioRecord(
  file: AiAttachmentFileLike,
  blob: Blob,
  options: AiAttachmentProcessOptions,
  sourcePack?: string,
): Promise<AiAttachmentRecord> {
  const createObjectUrl = options.createObjectUrl || defaultCreateObjectUrl;
  return {
    id: createAttachmentId(),
    name: String(file.name || "audio"),
    kind: "audio",
    size: Number(file.size || blob.size || 0),
    blob,
    objectUrl: createObjectUrl(blob),
    durationSec: await decodeDurationSafe(blob, options),
    sourcePack,
  };
}

async function processMidiRecord(
  file: AiAttachmentFileLike,
  blob: Blob,
  options: AiAttachmentProcessOptions,
  sourcePack?: string,
): Promise<AiAttachmentRecord> {
  let noteCount: number | undefined;
  try {
    const buffer = await blob.arrayBuffer();
    const notes = parseMidiArrayBufferToStepNotes(buffer) as unknown[];
    noteCount = Array.isArray(notes) ? notes.length : 0;
  } catch {
    noteCount = undefined;
  }
  const createObjectUrl = options.createObjectUrl || defaultCreateObjectUrl;
  return {
    id: createAttachmentId(),
    name: String(file.name || "midi"),
    kind: "midi",
    size: Number(file.size || blob.size || 0),
    blob,
    objectUrl: createObjectUrl(blob),
    noteCount,
    sourcePack,
  };
}

async function processPresetRecord(
  file: AiAttachmentFileLike,
  blob: Blob,
  options: AiAttachmentProcessOptions,
  sourcePack?: string,
): Promise<AiAttachmentRecord> {
  const text = await blob.text();
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Preset must be a JSON object.");
  }
  const sanitized = sanitizePresetValue(parsed, 3) as Record<string, unknown>;
  const paramsJson = JSON.stringify(sanitized || {});
  const presetParams =
    paramsJson.length > 2000
      ? (JSON.parse(paramsJson.slice(0, 2000)) as Record<string, unknown>)
      : sanitized;
  const createObjectUrl = options.createObjectUrl || defaultCreateObjectUrl;
  return {
    id: createAttachmentId(),
    name: String(file.name || "preset"),
    kind: "preset",
    size: Number(file.size || blob.size || 0),
    blob,
    objectUrl: createObjectUrl(blob),
    presetSummary: summarizePresetParams(sanitized || {}),
    presetParams: (presetParams || {}) as Record<string, unknown>,
    sourcePack,
  };
}

async function processSingleRecord(
  file: AiAttachmentFileLike,
  kind: AiAttachmentKind,
  options: AiAttachmentProcessOptions,
  sourcePack?: string,
): Promise<AiAttachmentRecord> {
  const blob = await fileToBlob(file);
  if (kind === "audio") {
    return processAudioRecord(file, blob, options, sourcePack);
  }
  if (kind === "midi") {
    return processMidiRecord(file, blob, options, sourcePack);
  }
  return processPresetRecord(file, blob, options, sourcePack);
}

async function processZipRecord(
  file: AiAttachmentFileLike,
  options: AiAttachmentProcessOptions,
): Promise<AiAttachmentProcessResult> {
  const records: AiAttachmentRecord[] = [];
  const skipped: AiAttachmentSkipped[] = [];
  const packName = String(file.name || "pack.zip");
  const maxFiles = options.zipMaxFiles ?? AI_ATTACHMENT_MAX_ZIP_FILES;
  const maxBytes = options.zipMaxBytes ?? AI_ATTACHMENT_MAX_ZIP_BYTES;
  let totalBytes = 0;

  let zip: JSZip;
  try {
    const buffer = await file.arrayBuffer();
    zip = await JSZip.loadAsync(buffer);
  } catch {
    skipped.push({ name: packName, reason: "Could not read this ZIP file." });
    return { records, skipped };
  }

  const entries = Object.keys(zip.files)
    .map(function (path) {
      return zip.files[path];
    })
    .filter(function (entry) {
      return entry && !entry.dir;
    });

  for (const entry of entries) {
    const leafName = String(entry.name || "").split("/").pop() || entry.name;
    const kind = classifyAttachmentFile(leafName);
    if (kind === "zip") {
      skipped.push({ name: leafName, reason: "Nested ZIP files are skipped." });
      continue;
    }
    if (kind === null) {
      skipped.push({ name: leafName, reason: "Unsupported file type." });
      continue;
    }
    if (records.length >= maxFiles) {
      skipped.push({
        name: leafName,
        reason: "Pack cap reached (" + maxFiles + " files).",
      });
      continue;
    }
    let memberBlob: Blob;
    try {
      memberBlob = await entry.async("blob");
    } catch {
      skipped.push({ name: leafName, reason: "Could not extract this file." });
      continue;
    }
    if (totalBytes + memberBlob.size > maxBytes) {
      skipped.push({
        name: leafName,
        reason: "Pack size cap reached (" + formatAttachmentSize(maxBytes) + ").",
      });
      continue;
    }
    totalBytes += memberBlob.size;
    try {
      const memberFile = new File([memberBlob], leafName, {
        type: memberBlob.type,
      }) as unknown as AiAttachmentFileLike;
      records.push(
        await processSingleRecord(memberFile, kind, options, packName),
      );
    } catch (error) {
      skipped.push({
        name: leafName,
        reason: error instanceof Error ? error.message : "Could not read this file.",
      });
    }
  }

  return { records, skipped };
}

export async function processAttachmentFiles(
  files: Array<AiAttachmentFileLike | File>,
  options: AiAttachmentProcessOptions = {},
): Promise<AiAttachmentProcessResult> {
  const records: AiAttachmentRecord[] = [];
  const skipped: AiAttachmentSkipped[] = [];

  for (const file of files) {
    const kind = classifyAttachmentFile(file.name);
    if (kind === null) {
      skipped.push({
        name: String(file.name || "file"),
        reason: "Unsupported file type.",
      });
      continue;
    }
    if (kind === "zip") {
      const zipped = await processZipRecord(
        file as AiAttachmentFileLike,
        options,
      );
      records.push(...zipped.records);
      skipped.push(...zipped.skipped);
      continue;
    }
    try {
      records.push(
        await processSingleRecord(
          file as AiAttachmentFileLike,
          kind,
          options,
        ),
      );
    } catch (error) {
      skipped.push({
        name: String(file.name || "file"),
        reason: error instanceof Error ? error.message : "Could not read this file.",
      });
    }
  }

  return { records, skipped };
}

// Serializable descriptors for the model payload. Audio descriptors carry
// the blob samplePath so the model copies it into sample ops exactly.
export function describeAttachments(
  records: AiAttachmentRecord[],
): AiAttachmentDescriptor[] {
  return (Array.isArray(records) ? records : []).map(function (record) {
    const descriptor: AiAttachmentDescriptor = {
      name: record.name,
      kind: record.kind,
    };
    if (record.kind === "audio" && record.objectUrl) {
      descriptor.samplePath = record.objectUrl;
    }
    if (record.durationSec !== undefined) {
      descriptor.durationSec = record.durationSec;
    }
    if (record.noteCount !== undefined) {
      descriptor.noteCount = record.noteCount;
    }
    if (record.presetSummary) {
      descriptor.presetSummary = record.presetSummary;
    }
    if (record.presetParams) {
      descriptor.presetParams = record.presetParams;
    }
    if (record.sourcePack) {
      descriptor.sourcePack = record.sourcePack;
    }
    return descriptor;
  });
}

// Audio attachments as samples, so the existing sample-path validation
// accepts them and the model sees them in availableSamples.
export function sessionSamplesFromAttachments(
  records: AiAttachmentRecord[],
): AiSample[] {
  return (Array.isArray(records) ? records : [])
    .filter(function (record) {
      return record.kind === "audio" && Boolean(record.objectUrl);
    })
    .map(function (record) {
      return {
        name: record.name,
        path: record.objectUrl,
        folder: AI_ATTACHMENT_FOLDER,
      };
    });
}

// Session samples first, then the pack catalog, without duplicates.
export function mergeSessionSamples(
  samples: AiSample[],
  sessionSamples: AiSample[],
): AiSample[] {
  const seen = new Set<string>();
  const result: AiSample[] = [];
  sessionSamples.concat(Array.isArray(samples) ? samples : []).forEach(
    function (sample) {
      const path = String(sample?.path || "");
      if (!path || seen.has(path)) {
        return;
      }
      seen.add(path);
      result.push(sample);
    },
  );
  return result;
}

export function revokeAttachmentUrl(record: AiAttachmentRecord): void {
  try {
    if (record.objectUrl) {
      URL.revokeObjectURL(record.objectUrl);
    }
  } catch {
    // Revoking is best-effort.
  }
}

// Session record -> storable copy (no object URL; blobs store directly).
export function recordToStored(record: AiAttachmentRecord): StoredAttachment {
  const stored: StoredAttachment = {
    id: record.id,
    name: record.name,
    kind: record.kind,
    size: record.size,
    blob: record.blob,
  };
  if (record.durationSec !== undefined) {
    stored.durationSec = record.durationSec;
  }
  if (record.noteCount !== undefined) {
    stored.noteCount = record.noteCount;
  }
  if (record.presetSummary) {
    stored.presetSummary = record.presetSummary;
  }
  if (record.presetParams) {
    stored.presetParams = record.presetParams;
  }
  if (record.sourcePack) {
    stored.sourcePack = record.sourcePack;
  }
  return stored;
}

// Stored copy -> session record, with a fresh playable URL (blob URLs
// do not survive a refresh, so restore always re-creates them).
export function storedToRecord(
  stored: StoredAttachment,
  createObjectUrl: (blob: Blob) => string = defaultCreateObjectUrl,
): AiAttachmentRecord {
  const record: AiAttachmentRecord = {
    id: stored.id,
    name: stored.name,
    kind: stored.kind,
    size: stored.size,
    blob: stored.blob,
    objectUrl: createObjectUrl(stored.blob),
  };
  if (stored.durationSec !== undefined) {
    record.durationSec = stored.durationSec;
  }
  if (stored.noteCount !== undefined) {
    record.noteCount = stored.noteCount;
  }
  if (stored.presetSummary) {
    record.presetSummary = stored.presetSummary;
  }
  if (stored.presetParams) {
    record.presetParams = stored.presetParams;
  }
  if (stored.sourcePack) {
    record.sourcePack = stored.sourcePack;
  }
  return record;
}

// Drag payloads from the Packs area into the agent chat. Pack items already
// carry a JSON payload in a custom mime plus a text/plain fallback; plugin
// payloads (tab "plugins") are deliberately not accepted here — only pack
// samples and pack MIDI become chat attachments.

export const PACK_SAMPLE_DND_MIME = "application/x-daw-sample";

export interface PackDropPayload {
  kind: "sample" | "midi";
  name: string;
  url: string;
}

function readDropData(
  dataTransfer: Pick<DataTransfer, "getData"> | null | undefined,
  mimeType: string,
): string {
  try {
    const value = dataTransfer?.getData?.(mimeType);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function parseDropJson(raw: string): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON — not a pack drop.
  }
  return null;
}

function sampleDropFromJson(
  json: Record<string, unknown> | null,
): PackDropPayload | null {
  if (!json || json.tab !== "packs") {
    return null;
  }
  const samplePath =
    typeof json.samplePath === "string" ? json.samplePath.trim() : "";
  const file = typeof json.file === "string" ? json.file.trim() : "";
  if (!samplePath || !file) {
    return null;
  }
  return { kind: "sample", name: file, url: samplePath };
}

function midiDropFromJson(
  json: Record<string, unknown> | null,
): PackDropPayload | null {
  if (!json || json.type !== "openstudio-midi-file") {
    return null;
  }
  const midiPath =
    typeof json.midiPath === "string" ? json.midiPath.trim() : "";
  const fileName =
    typeof json.fileName === "string" ? json.fileName.trim() : "";
  if (!midiPath || !fileName) {
    return null;
  }
  return { kind: "midi", name: fileName, url: midiPath };
}

export function parsePackDropPayload(
  dataTransfer: Pick<DataTransfer, "getData"> | null | undefined,
): PackDropPayload | null {
  const candidates = [
    readDropData(dataTransfer, PACK_SAMPLE_DND_MIME),
    readDropData(dataTransfer, MIDI_FILE_DND_MIME),
    readDropData(dataTransfer, "text/plain"),
  ];
  for (const raw of candidates) {
    const json = parseDropJson(raw);
    if (!json) {
      continue;
    }
    const sample = sampleDropFromJson(json);
    if (sample) {
      return sample;
    }
    const midi = midiDropFromJson(json);
    if (midi) {
      return midi;
    }
  }
  return null;
}

// Resolves a pack path from a drop payload into a fetchable URL: the R2
// URL when packs live there, site-origin /packs otherwise. Falls back to
// the raw value when it is already a usable URL.
export function resolvePackFetchUrl(rawUrl: unknown): string {
  const input = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!input) {
    return "";
  }
  return toSafeSampleUrl(input) || input;
}
