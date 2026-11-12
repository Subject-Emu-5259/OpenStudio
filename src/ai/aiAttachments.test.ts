import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  classifyAttachmentFile,
  describeAttachments,
  formatAttachmentSize,
  mergeSessionSamples,
  parsePackDropPayload,
  processAttachmentFiles,
  recordToStored,
  resolvePackFetchUrl,
  sessionSamplesFromAttachments,
  storedToRecord,
  summarizePresetParams,
} from "./aiAttachments";
import { MIDI_FILE_DND_MIME } from "../utils/midiImport";

// Minimal valid MIDI: one track, one C4 note on/off, end-of-track.
function createMinimalMidiBytes(): Uint8Array {
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, // MThd
    0x00, 0x00, 0x00, 0x06, // header length 6
    0x00, 0x00, // format 0
    0x00, 0x01, // one track
    0x00, 0x60, // division 96
    0x4d, 0x54, 0x72, 0x6b, // MTrk
    0x00, 0x00, 0x00, 0x0c, // track length 12
    0x00, 0x90, 0x3c, 0x64, // note on C4, velocity 100
    0x60, 0x80, 0x3c, 0x00, // note off after 96 ticks
    0x00, 0xff, 0x2f, 0x00, // end of track
  ]);
}

function createStubs() {
  let urlCounter = 0;
  return {
    decodeAudio: async function () {
      return { duration: 12.5 };
    },
    createObjectUrl: function () {
      urlCounter += 1;
      return "blob:test/" + urlCounter;
    },
  };
}

describe("classifyAttachmentFile", function () {
  it("classifies audio, MIDI, preset, and ZIP by extension", function () {
    expect(classifyAttachmentFile("loop.wav")).toBe("audio");
    expect(classifyAttachmentFile("LOOP.MP3")).toBe("audio");
    expect(classifyAttachmentFile("bass.flac")).toBe("audio");
    expect(classifyAttachmentFile("melody.mid")).toBe("midi");
    expect(classifyAttachmentFile("melody.midi")).toBe("midi");
    expect(classifyAttachmentFile("preset.json")).toBe("preset");
    expect(classifyAttachmentFile("pack.zip")).toBe("zip");
  });

  it("returns null for anything else", function () {
    expect(classifyAttachmentFile("readme.txt")).toBeNull();
    expect(classifyAttachmentFile("cover.png")).toBeNull();
    expect(classifyAttachmentFile("noextension")).toBeNull();
    expect(classifyAttachmentFile("")).toBeNull();
  });
});

describe("formatAttachmentSize", function () {
  it("formats bytes, KB, and MB", function () {
    expect(formatAttachmentSize(0)).toBe("0 B");
    expect(formatAttachmentSize(500)).toBe("500 B");
    expect(formatAttachmentSize(2048)).toBe("2.0 KB");
    expect(formatAttachmentSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("summarizePresetParams", function () {
  it("joins top-level keys and handles empties", function () {
    expect(summarizePresetParams({ tempo: 140, gain: 0.8 })).toContain("tempo=140");
    expect(summarizePresetParams({})).toBe("Empty preset");
  });
});

describe("processAttachmentFiles", function () {
  it("registers audio with a stubbed duration and object URL", async function () {
    const stubs = createStubs();
    const file = new File([new Uint8Array([0, 1, 2, 3])], "loop.wav", {
      type: "audio/wav",
    });
    const result = await processAttachmentFiles([file], stubs);
    expect(result.skipped).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].kind).toBe("audio");
    expect(result.records[0].durationSec).toBe(12.5);
    expect(result.records[0].objectUrl).toBe("blob:test/1");

    const descriptors = describeAttachments(result.records);
    expect(descriptors[0].samplePath).toBe("blob:test/1");
    const samples = sessionSamplesFromAttachments(result.records);
    expect(samples).toEqual([
      { name: "loop.wav", path: "blob:test/1", folder: "Attachments" },
    ]);
  });

  it("parses a MIDI file to a note count", async function () {
    const stubs = createStubs();
    const file = new File(
      [createMinimalMidiBytes() as unknown as BlobPart],
      "melody.mid",
      {
        type: "audio/midi",
      },
    );
    const result = await processAttachmentFiles([file], stubs);
    expect(result.skipped).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].kind).toBe("midi");
    expect(result.records[0].noteCount).toBe(1);
  });

  it("sanitizes preset JSON and strips secret-looking keys", async function () {
    const stubs = createStubs();
    const preset = JSON.stringify({
      tempo: 140,
      apiKey: "sk-secret",
      nested: { token: "abc", gain: 0.8 },
    });
    const file = new File([preset], "my-preset.json", {
      type: "application/json",
    });
    const result = await processAttachmentFiles([file], stubs);
    expect(result.skipped).toEqual([]);
    const record = result.records[0];
    expect(record.kind).toBe("preset");
    expect(record.presetParams).toMatchObject({ tempo: 140 });
    expect(record.presetParams).not.toHaveProperty("apiKey");
    expect(record.presetParams?.nested).toEqual({ gain: 0.8 });
    expect(record.presetSummary).toContain("tempo=140");
  });

  it("rejects a preset that is not a JSON object", async function () {
    const stubs = createStubs();
    const file = new File(["[1, 2, 3]"], "bad.json", {
      type: "application/json",
    });
    const result = await processAttachmentFiles([file], stubs);
    expect(result.records).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].name).toBe("bad.json");
  });

  it("extracts audio and MIDI from a ZIP and skips the rest", async function () {
    const stubs = createStubs();
    const zip = new JSZip();
    zip.file("loop.wav", new Uint8Array([0, 1, 2]));
    zip.file("melody.mid", createMinimalMidiBytes());
    zip.file("readme.txt", "hello");
    zip.file("inner.zip", new Uint8Array([0]));
    const blob = await zip.generateAsync({ type: "blob" });
    const zipFile = new File([blob], "pack.zip", {
      type: "application/zip",
    });
    const result = await processAttachmentFiles([zipFile], stubs);
    expect(result.records.map(function (record) {
      return record.name;
    }).sort()).toEqual(["loop.wav", "melody.mid"]);
    expect(result.records[0].sourcePack).toBe("pack.zip");
    expect(result.skipped.map(function (item) {
      return item.name;
    }).sort()).toEqual(["inner.zip", "readme.txt"]);
  });

  it("enforces the ZIP file-count cap", async function () {
    const stubs = createStubs();
    const zip = new JSZip();
    zip.file("a.wav", new Uint8Array([0]));
    zip.file("b.wav", new Uint8Array([0]));
    zip.file("c.wav", new Uint8Array([0]));
    const blob = await zip.generateAsync({ type: "blob" });
    const zipFile = new File([blob], "pack.zip", {
      type: "application/zip",
    });
    const result = await processAttachmentFiles(
      [zipFile],
      Object.assign({}, stubs, { zipMaxFiles: 2 }),
    );
    expect(result.records).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("cap");
  });

  it("enforces the ZIP byte cap", async function () {
    const stubs = createStubs();
    const zip = new JSZip();
    zip.file("a.wav", new Uint8Array([0, 0, 0]));
    zip.file("b.wav", new Uint8Array([0, 0, 0]));
    const blob = await zip.generateAsync({ type: "blob" });
    const zipFile = new File([blob], "pack.zip", {
      type: "application/zip",
    });
    const result = await processAttachmentFiles(
      [zipFile],
      Object.assign({}, stubs, { zipMaxBytes: 5 }),
    );
    expect(result.records).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toContain("cap");
  });

  it("skips unsupported top-level files", async function () {
    const stubs = createStubs();
    const file = new File(["hello"], "readme.txt", { type: "text/plain" });
    const result = await processAttachmentFiles([file], stubs);
    expect(result.records).toHaveLength(0);
    expect(result.skipped[0].reason).toContain("Unsupported");
  });
});

describe("mergeSessionSamples", function () {
  it("puts session samples first without duplicating paths", function () {
    const session = [{ name: "a.wav", path: "blob:1", folder: "Attachments" }];
    const catalog = [
      { name: "a.wav", path: "blob:1", folder: "Attachments" },
      { name: "b.wav", path: "/packs/b.wav", folder: "Cxdy" },
    ];
    expect(mergeSessionSamples(catalog, session)).toEqual([
      { name: "a.wav", path: "blob:1", folder: "Attachments" },
      { name: "b.wav", path: "/packs/b.wav", folder: "Cxdy" },
    ]);
  });
});

describe("recordToStored and storedToRecord", function () {
  it("round-trips a record with a fresh object URL", async function () {
    const stubs = createStubs();
    const file = new File([new Uint8Array([0, 1])], "loop.wav", {
      type: "audio/wav",
    });
    const result = await processAttachmentFiles([file], stubs);
    const stored = recordToStored(result.records[0]);
    expect(stored).not.toHaveProperty("objectUrl");
    const restored = storedToRecord(stored, function () {
      return "blob:restored/1";
    });
    expect(restored.objectUrl).toBe("blob:restored/1");
    expect(restored.durationSec).toBe(12.5);
    expect(restored.name).toBe("loop.wav");
  });
});

function makeDataTransfer(entries: Record<string, string>) {
  return {
    getData: function (mimeType: string) {
      return entries[mimeType] || "";
    },
  };
}

describe("parsePackDropPayload", function () {
  it("reads a pack sample from its custom mime type", function () {
    const payload = JSON.stringify({
      tab: "packs",
      folder: "TRENCH PACK Leaks (Producergrind)",
      file: "Moto 95 BPM C# Min.wav",
      samplePath: "/packs/TRENCH%20PACK%20Leaks%20(Producergrind)/Moto.wav",
    });
    const result = parsePackDropPayload(
      makeDataTransfer({ "application/x-daw-sample": payload }),
    );
    expect(result).toEqual({
      kind: "sample",
      name: "Moto 95 BPM C# Min.wav",
      url: "/packs/TRENCH%20PACK%20Leaks%20(Producergrind)/Moto.wav",
    });
  });

  it("falls back to text/plain when the custom mime is unavailable", function () {
    const payload = JSON.stringify({
      tab: "packs",
      folder: "Cxdy - 2025 Stashkit/808",
      file: "cxdy 808 1.wav",
      samplePath: "/packs/Cxdy%20-%202025%20Stashkit/808/cxdy%20808%201.wav",
    });
    const result = parsePackDropPayload(
      makeDataTransfer({ "text/plain": payload }),
    );
    expect(result).toEqual({
      kind: "sample",
      name: "cxdy 808 1.wav",
      url: "/packs/Cxdy%20-%202025%20Stashkit/808/cxdy%20808%201.wav",
    });
  });

  it("reads a pack MIDI item from its custom mime type", function () {
    const payload = JSON.stringify({
      type: "openstudio-midi-file",
      version: 1,
      fileName: "Crown Check 120 BPM C Min.mid",
      midiPath: "/packs/PG%20-%20SHOOTER/Crown%20Check.mid",
    });
    const result = parsePackDropPayload(
      makeDataTransfer({ [MIDI_FILE_DND_MIME]: payload }),
    );
    expect(result).toEqual({
      kind: "midi",
      name: "Crown Check 120 BPM C Min.mid",
      url: "/packs/PG%20-%20SHOOTER/Crown%20Check.mid",
    });
  });

  it("reads a pack MIDI item from the text/plain fallback", function () {
    const payload = JSON.stringify({
      type: "openstudio-midi-file",
      version: 1,
      fileName: "Crown Check 120 BPM C Min.mid",
      midiPath: "/packs/PG%20-%20SHOOTER/Crown%20Check.mid",
    });
    const result = parsePackDropPayload(
      makeDataTransfer({ "text/plain": payload }),
    );
    expect(result?.kind).toBe("midi");
    expect(result?.name).toBe("Crown Check 120 BPM C Min.mid");
  });

  it("ignores plugin drags", function () {
    const payload = JSON.stringify({
      tab: "plugins",
      type: "instrument",
      pluginRef: "piano",
      pluginName: "Piano",
    });
    expect(
      parsePackDropPayload(
        makeDataTransfer({
          "application/x-daw-plugin": payload,
          "text/plain": payload,
        }),
      ),
    ).toBeNull();
  });

  it("ignores garbage text and empty transfers", function () {
    expect(
      parsePackDropPayload(makeDataTransfer({ "text/plain": "hello" })),
    ).toBeNull();
    expect(parsePackDropPayload(makeDataTransfer({}))).toBeNull();
    expect(parsePackDropPayload(null)).toBeNull();
  });

  it("ignores payloads missing the file or path", function () {
    const noFile = JSON.stringify({ tab: "packs", samplePath: "/packs/x.wav" });
    const noPath = JSON.stringify({ tab: "packs", file: "x.wav" });
    expect(
      parsePackDropPayload(makeDataTransfer({ "text/plain": noFile })),
    ).toBeNull();
    expect(
      parsePackDropPayload(makeDataTransfer({ "text/plain": noPath })),
    ).toBeNull();
  });

  it("survives a throwing getData", function () {
    const throwing = {
      getData: function () {
        throw new Error("denied");
      },
    };
    expect(parsePackDropPayload(throwing)).toBeNull();
  });
});

describe("resolvePackFetchUrl", function () {
  it("passes https URLs through", function () {
    expect(
      resolvePackFetchUrl("https://example.com/packs/loop.wav"),
    ).toBe("https://example.com/packs/loop.wav");
  });

  it("passes site-origin pack paths through when no R2 base is set", function () {
    expect(resolvePackFetchUrl("/packs/Cxdy/loop.wav")).toBe(
      "/packs/Cxdy/loop.wav",
    );
  });

  it("returns empty for empty input", function () {
    expect(resolvePackFetchUrl("")).toBe("");
    expect(resolvePackFetchUrl(null)).toBe("");
  });
});
