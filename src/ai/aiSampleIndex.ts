import type { AiSample } from "../types/ai"

interface PackManifestItem {
  name?: unknown
  path?: unknown
}

interface PackManifestFolder {
  folder?: unknown
  items?: unknown
}

interface PackManifest {
  folders?: unknown
}

function makePacksPath(relativePath: unknown): string {
  const cleanRelative = String(relativePath || "")
    .replace(/^\/+/, "")
    .trim();
  const isFileProtocol =
    typeof window !== "undefined" && window.location.protocol === "file:";

  if (isFileProtocol) {
    const normalized = cleanRelative.replace(/^packs\/?/i, "");
    return (
      "openstudio://packs/" +
      normalized
        .split("/")
        .filter(Boolean)
        .map(function (segment) {
          return encodeURIComponent(segment);
        })
        .join("/")
    );
  }

  // Packs can live on R2 instead of the app origin: VITE_PACKS_BASE_URL
  // points at the bucket's /packs prefix, and is empty for local serving.
  const packsBaseUrl = String(import.meta.env.VITE_PACKS_BASE_URL || "").replace(/\/+$/, "");
  if (packsBaseUrl && cleanRelative.startsWith("packs/")) {
    return packsBaseUrl + "/" + cleanRelative.slice("packs/".length);
  }

  return "/" + cleanRelative;
}

function normalizePackItemPath(rawPath: unknown): string {
  const input = String(rawPath || "").trim();
  if (!input) {
    return "";
  }

  if (/^(https?:|file:|openstudio:)/i.test(input)) {
    return input;
  }

  const noLeadingSlash = input.replace(/^\/+/, "");
  if (noLeadingSlash.startsWith("packs/")) {
    return makePacksPath(noLeadingSlash);
  }

  return makePacksPath("packs/" + noLeadingSlash);
}

export async function loadAiSampleIndex(limit = 240): Promise<AiSample[]> {
  try {
    const response = await fetch(
      makePacksPath("packs/manifest.json") + "?ts=" + Date.now(),
      { cache: "no-store" },
    );

    if (!response.ok) {
      return [];
    }

    const manifest = await response.json() as PackManifest;
    const folders: PackManifestFolder[] = Array.isArray(manifest?.folders)
      ? manifest.folders
      : [];
    const samples: AiSample[] = [];

    folders.forEach(function (folder) {
      const folderName = String(folder?.folder || "Packs");
      const items: Array<string | PackManifestItem> = Array.isArray(folder?.items)
        ? folder.items
        : [];
      items.forEach(function (item) {
        const name = typeof item === "string"
          ? item.split("/").pop() || item
          : String(item?.name || item?.path || "Sample").split("/").pop() || "Sample";
        const path = typeof item === "string"
          ? normalizePackItemPath(item)
          : normalizePackItemPath(item?.path);

        if (!path) {
          return;
        }

        samples.push({
          name,
          path,
          folder: folderName,
        });
      });
    });

    return limitSamplesAcrossFolders(samples, limit);
  } catch {
    return [];
  }
}

// Caps the index without letting the first folders in manifest order crowd
// out the rest: takes one sample per folder per round, so every kit stays
// visible even when the library (1,400+ files) is larger than the limit.
// A plain first-N slice hid whole packs (the TRENCH pack sat past the cut).
function limitSamplesAcrossFolders(samples: AiSample[], limit: number): AiSample[] {
  if (samples.length <= limit) {
    return samples;
  }

  const groups: AiSample[][] = [];
  const groupByFolder = new Map<string, AiSample[]>();
  samples.forEach(function (sample) {
    const key = String(sample?.folder || "Packs");
    let group = groupByFolder.get(key);
    if (!group) {
      group = [];
      groupByFolder.set(key, group);
    }
    group.push(sample);
  });
  groupByFolder.forEach(function (group) {
    groups.push(group);
  });

  const result: AiSample[] = [];
  let index = 0;
  while (result.length < limit) {
    let progressed = false;
    groups.forEach(function (group) {
      if (result.length >= limit) {
        return;
      }
      if (index < group.length) {
        result.push(group[index]);
        progressed = true;
      }
    });
    if (!progressed) {
      break;
    }
    index++;
  }
  return result;
}

function tokenizeSampleQuery(query: unknown): string[] {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(function (token) {
      return token.trim();
    })
    .filter(function (token) {
      return token.length >= 2;
    });
}

function scoreSample(sample: AiSample, tokens: string[]): number {
  const haystack = [sample?.name, sample?.folder, sample?.path]
    .join(" ")
    .toLowerCase();

  return tokens.reduce(function (score, token) {
    if (!haystack.includes(token)) {
      return score;
    }

    const name = String(sample?.name || "").toLowerCase();
    return score + (name.includes(token) ? 3 : 1);
  }, 0);
}

export function searchAiSamples(
  samples: AiSample[] | unknown,
  query: unknown,
  limit = 80,
): AiSample[] {
  const source: AiSample[] = Array.isArray(samples) ? samples : [];
  const tokens = tokenizeSampleQuery(query);

  if (tokens.length === 0) {
    return source.slice(0, limit);
  }

  return source
    .map(function (sample) {
      return {
        sample,
        score: scoreSample(sample, tokens),
      };
    })
    .filter(function (item) {
      return item.score > 0;
    })
    .sort(function (a, b) {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return String(a.sample?.name || "").localeCompare(String(b.sample?.name || ""));
    })
    .slice(0, limit)
    .map(function (item) {
      return item.sample;
    });
}
