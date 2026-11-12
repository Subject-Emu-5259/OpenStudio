import { describe, it, expect, vi, afterEach } from "vitest";
import { loadAiSampleIndex, searchAiSamples } from "./aiSampleIndex";

describe("searchAiSamples", function () {
  it("prioritizes samples matching the user prompt", function () {
    const samples = [
      { name: "Soft Piano.wav", folder: "Keys", path: "/packs/keys/piano.wav" },
      { name: "Trap Kick.wav", folder: "Drums", path: "/packs/drums/kick.wav" },
      { name: "Open Hat.wav", folder: "Drums", path: "/packs/drums/hat.wav" },
    ];

    const result = searchAiSamples(samples, "make a trap kick pattern", 2);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Trap Kick.wav");
  });
});

describe("loadAiSampleIndex", function () {
  afterEach(function () {
    vi.unstubAllGlobals();
  });

  it("spreads the limit across folders instead of taking the first folders only", async function () {
    const manifest = {
      folders: [
        { folder: "Kit A", items: ["a1.wav", "a2.wav", "a3.wav"] },
        { folder: "Kit B", items: ["b1.wav", "b2.wav", "b3.wav"] },
        { folder: "Kit C", items: ["c1.wav"] },
      ],
    };
    vi.stubGlobal("fetch", async function () {
      return {
        ok: true,
        json: async function () {
          return manifest;
        },
      };
    });

    const result = await loadAiSampleIndex(4);

    expect(result).toHaveLength(4);
    expect(result.map(function (sample) {
      return sample.folder;
    })).toEqual(["Kit A", "Kit B", "Kit C", "Kit A"]);
    expect(result.map(function (sample) {
      return sample.name;
    })).toEqual(["a1.wav", "b1.wav", "c1.wav", "a2.wav"]);
  });
});
