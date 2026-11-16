import { describe, it, expect } from "vitest";
import {
  FX_EFFECT_NONE,
  FX_EFFECT_CHORUS,
  FX_EFFECT_COMPRESSOR,
  FX_EFFECT_DELAY,
  FX_EFFECT_FILTER,
  FX_EFFECT_GRAPHIC_EQ,
  FX_EFFECT_SATURATION,
  FX_EFFECT_TRANSIENT,
  getDefaultEqBandType,
  sanitizeEqBandType,
  getSafeChorusParams,
  getSafeCompressorParams,
  getSafeDelayParams,
  getSafeFilterParams,
  getSafeGraphicEqParams,
  getSafeReverbParams,
  getSafeSaturationParams,
  getSafeTransientParams,
  sanitizeMaximizerMode,
  sanitizeSaturationMode,
  sanitizeFilterMode,
  getSafeMaximizerParams,
  getChorusDepthSec,
  getSaturationDriveGain,
  getSaturationToneHz,
  buildSaturationCurve,
  buildSoftClipCurve,
} from "./fxParams";

describe("fxParams", () => {
  describe("constants", () => {
    it("exports canonical effect IDs", () => {
      expect(FX_EFFECT_NONE).toBe("none");
      expect(FX_EFFECT_GRAPHIC_EQ).toBe("graphic-eq");
      expect(FX_EFFECT_COMPRESSOR).toBe("compressor");
      expect(FX_EFFECT_SATURATION).toBe("saturation");
      expect(FX_EFFECT_FILTER).toBe("filter");
      expect(FX_EFFECT_DELAY).toBe("delay");
      expect(FX_EFFECT_CHORUS).toBe("chorus");
      expect(FX_EFFECT_TRANSIENT).toBe("transient");
    });
  });

  describe("getDefaultEqBandType", () => {
    it("returns lowshelf for first point", () => {
      expect(getDefaultEqBandType(0)).toBe("lowshelf");
    });

    it("returns highshelf for last point", () => {
      expect(getDefaultEqBandType(6)).toBe("highshelf");
    });

    it("returns peaking for middle points", () => {
      expect(getDefaultEqBandType(3)).toBe("peaking");
    });
  });

  describe("sanitizeEqBandType", () => {
    it("accepts valid types", () => {
      expect(sanitizeEqBandType("peaking", "lowshelf")).toBe("peaking");
    });

    it("falls back to provided fallback", () => {
      expect(sanitizeEqBandType("invalid", "lowshelf")).toBe("lowshelf");
    });

    it("falls back to peaking when both invalid", () => {
      expect(sanitizeEqBandType("bad", "worse")).toBe("peaking");
    });
  });

  describe("getSafeGraphicEqParams", () => {
    it("returns defaults for empty input", () => {
      const params = getSafeGraphicEqParams({});
      expect(params.points).toHaveLength(7);
      expect(params.points[0].gainDb).toBe(0);
      expect(params.points[0].bandType).toBe("lowshelf");
    });

    it("migrates legacy bands", () => {
      const params = getSafeGraphicEqParams({ bands: [3, -2, 0, 0, 0, 0, 0] });
      expect(params.points[0].gainDb).toBe(3);
      expect(params.points[1].gainDb).toBe(-2);
    });

    it("clamps frequency and gain", () => {
      const params = getSafeGraphicEqParams({
        points: [{ frequencyHz: 10, gainDb: 25, q: 10, bandType: "peaking" }],
      });
      expect(params.points[0].frequencyHz).toBe(20);
      expect(params.points[0].gainDb).toBe(18);
      expect(params.points[0].q).toBe(8);
    });
  });

  describe("getSafeReverbParams", () => {
    it("returns defaults for empty input", () => {
      const params = getSafeReverbParams({});
      expect(params.decayTime).toBe(2.8);
      expect(params.dryWet).toBe(0.34);
      expect(params.freeze).toBe(false);
    });

    it("clamps all fields", () => {
      const params = getSafeReverbParams({ decayTime: 50, size: -1, dryWet: 2 });
      expect(params.decayTime).toBe(20);
      expect(params.size).toBe(0);
      expect(params.dryWet).toBe(1);
    });
  });

  describe("sanitizeMaximizerMode", () => {
    it("returns valid mode", () => {
      expect(sanitizeMaximizerMode("irc-iii")).toBe("irc-iii");
    });

    it("falls back to irc-ii", () => {
      expect(sanitizeMaximizerMode("bad")).toBe("irc-ii");
      expect(sanitizeMaximizerMode("")).toBe("irc-ii");
    });
  });

  describe("getSafeMaximizerParams", () => {
    it("returns defaults for empty input", () => {
      const params = getSafeMaximizerParams({});
      expect(params.mode).toBe("irc-ii");
      expect(params.thresholdDb).toBe(0);
      expect(params.ceilingDb).toBe(-1);
    });

    it("clamps fields", () => {
      const params = getSafeMaximizerParams({ thresholdDb: -30, ceilingDb: -30, character: 2 });
      expect(params.thresholdDb).toBe(-24);
      expect(params.ceilingDb).toBe(-18);
      expect(params.character).toBe(1);
    });

    it("migrates legacy defaults", () => {
      const legacy = {
        thresholdDb: -6,
        ceilingDb: -0.1,
        character: 0.58,
        mode: "irc-ii",
        truePeakEnabled: true,
      };
      const params = getSafeMaximizerParams(legacy);
      expect(params.thresholdDb).toBe(0);
      expect(params.ceilingDb).toBe(-1);
      expect(params.character).toBe(0.5);
    });
  });

  describe("getSafeCompressorParams", () => {
    it("returns defaults for empty input", () => {
      const params = getSafeCompressorParams({});
      expect(params.thresholdDb).toBe(-24);
      expect(params.ratio).toBe(4);
      expect(params.kneeDb).toBe(6);
      expect(params.attackSec).toBe(0.01);
      expect(params.releaseSec).toBe(0.18);
      expect(params.makeupGainDb).toBe(0);
      expect(params.mix).toBe(1);
    });

    it("clamps all fields", () => {
      const params = getSafeCompressorParams({
        thresholdDb: -99,
        ratio: 99,
        kneeDb: 99,
        attackSec: 0,
        releaseSec: 99,
        makeupGainDb: 99,
        mix: 2,
      });
      expect(params.thresholdDb).toBe(-60);
      expect(params.ratio).toBe(20);
      expect(params.kneeDb).toBe(40);
      expect(params.attackSec).toBe(0.0005);
      expect(params.releaseSec).toBe(1);
      expect(params.makeupGainDb).toBe(24);
      expect(params.mix).toBe(1);
    });

    it("keeps valid values", () => {
      const params = getSafeCompressorParams({
        thresholdDb: -18,
        ratio: 2.5,
        kneeDb: 12,
        attackSec: 0.005,
        releaseSec: 0.3,
        makeupGainDb: 6,
        mix: 0.5,
      });
      expect(params.thresholdDb).toBe(-18);
      expect(params.ratio).toBe(2.5);
      expect(params.kneeDb).toBe(12);
      expect(params.attackSec).toBe(0.005);
      expect(params.releaseSec).toBe(0.3);
      expect(params.makeupGainDb).toBe(6);
      expect(params.mix).toBe(0.5);
    });
  });

  describe("getSafeSaturationParams", () => {
    it("returns defaults for empty input", () => {
      const params = getSafeSaturationParams({});
      expect(params.drive).toBe(0.3);
      expect(params.mode).toBe("soft");
      expect(params.tone).toBe(0.5);
      expect(params.mix).toBe(1);
      expect(params.outputDb).toBe(0);
    });

    it("clamps all fields and sanitizes mode", () => {
      const params = getSafeSaturationParams({
        drive: 2,
        mode: "bogus",
        tone: -1,
        mix: 2,
        outputDb: 99,
      });
      expect(params.drive).toBe(1);
      expect(params.mode).toBe("soft");
      expect(params.tone).toBe(0);
      expect(params.mix).toBe(1);
      expect(params.outputDb).toBe(12);
    });

    it("keeps valid values", () => {
      const params = getSafeSaturationParams({
        drive: 0.6,
        mode: "hard",
        tone: 0.25,
        mix: 0.5,
        outputDb: -3,
      });
      expect(params.drive).toBe(0.6);
      expect(params.mode).toBe("hard");
      expect(params.tone).toBe(0.25);
      expect(params.mix).toBe(0.5);
      expect(params.outputDb).toBe(-3);
    });
  });

  describe("sanitizeSaturationMode", () => {
    it("accepts soft and hard", () => {
      expect(sanitizeSaturationMode("soft")).toBe("soft");
      expect(sanitizeSaturationMode("HARD")).toBe("hard");
    });

    it("falls back to soft", () => {
      expect(sanitizeSaturationMode("bogus")).toBe("soft");
      expect(sanitizeSaturationMode("")).toBe("soft");
    });
  });

  describe("getSafeFilterParams", () => {
    it("returns defaults for empty input", () => {
      const params = getSafeFilterParams({});
      expect(params.cutoffHz).toBe(18000);
      expect(params.resonance).toBe(1);
      expect(params.mode).toBe("lowpass");
      expect(params.mix).toBe(1);
    });

    it("clamps all fields and sanitizes mode", () => {
      const params = getSafeFilterParams({
        cutoffHz: 5,
        resonance: 99,
        mode: "bogus",
        mix: 2,
      });
      expect(params.cutoffHz).toBe(20);
      expect(params.resonance).toBe(20);
      expect(params.mode).toBe("lowpass");
      expect(params.mix).toBe(1);
    });

    it("keeps valid values", () => {
      const params = getSafeFilterParams({
        cutoffHz: 800,
        resonance: 4.5,
        mode: "highpass",
        mix: 0.5,
      });
      expect(params.cutoffHz).toBe(800);
      expect(params.resonance).toBe(4.5);
      expect(params.mode).toBe("highpass");
      expect(params.mix).toBe(0.5);
    });
  });

  describe("sanitizeFilterMode", () => {
    it("accepts all four biquad modes", () => {
      expect(sanitizeFilterMode("lowpass")).toBe("lowpass");
      expect(sanitizeFilterMode("highpass")).toBe("highpass");
      expect(sanitizeFilterMode("bandpass")).toBe("bandpass");
      expect(sanitizeFilterMode("notch")).toBe("notch");
    });

    it("falls back to lowpass", () => {
      expect(sanitizeFilterMode("peaking")).toBe("lowpass");
      expect(sanitizeFilterMode("")).toBe("lowpass");
    });
  });

  describe("getSafeDelayParams", () => {
    it("returns defaults for empty input", () => {
      const params = getSafeDelayParams({});
      expect(params.timeMs).toBe(320);
      expect(params.feedback).toBe(0.35);
      expect(params.mix).toBe(0.25);
      expect(params.hiCutHz).toBe(8000);
    });

    it("clamps all fields and caps feedback below 1", () => {
      const params = getSafeDelayParams({
        timeMs: 5000,
        feedback: 1.5,
        mix: 2,
        hiCutHz: 500,
      });
      expect(params.timeMs).toBe(2000);
      // The feedback cap is the runaway guard: the loop must always decay.
      expect(params.feedback).toBe(0.85);
      expect(params.mix).toBe(1);
      expect(params.hiCutHz).toBe(1200);
    });

    it("keeps valid values", () => {
      const params = getSafeDelayParams({
        timeMs: 480,
        feedback: 0.6,
        mix: 0.4,
        hiCutHz: 12000,
      });
      expect(params.timeMs).toBe(480);
      expect(params.feedback).toBe(0.6);
      expect(params.mix).toBe(0.4);
      expect(params.hiCutHz).toBe(12000);
    });
  });

  describe("getSafeChorusParams", () => {
    it("returns defaults for empty input", () => {
      const params = getSafeChorusParams({});
      expect(params.rateHz).toBe(0.8);
      expect(params.depth).toBe(0.4);
      expect(params.delayMs).toBe(15);
      expect(params.mix).toBe(0.35);
    });

    it("clamps all fields", () => {
      const params = getSafeChorusParams({
        rateHz: 99,
        depth: 2,
        delayMs: 1,
        mix: -1,
      });
      expect(params.rateHz).toBe(8);
      expect(params.depth).toBe(1);
      expect(params.delayMs).toBe(5);
      expect(params.mix).toBe(0);
    });

    it("keeps valid values", () => {
      const params = getSafeChorusParams({
        rateHz: 1.5,
        depth: 0.7,
        delayMs: 22,
        mix: 0.5,
      });
      expect(params.rateHz).toBe(1.5);
      expect(params.depth).toBe(0.7);
      expect(params.delayMs).toBe(22);
      expect(params.mix).toBe(0.5);
    });
  });

  describe("getSafeTransientParams", () => {
    it("returns neutral defaults for empty input", () => {
      const params = getSafeTransientParams({});
      expect(params.attack).toBe(0);
      expect(params.sustain).toBe(0);
      expect(params.mix).toBe(1);
    });

    it("clamps all fields", () => {
      const params = getSafeTransientParams({
        attack: 5,
        sustain: -5,
        mix: 2,
      });
      expect(params.attack).toBe(1);
      expect(params.sustain).toBe(-1);
      expect(params.mix).toBe(1);
    });

    it("keeps valid values", () => {
      const params = getSafeTransientParams({
        attack: 0.5,
        sustain: -0.25,
        mix: 0.75,
      });
      expect(params.attack).toBe(0.5);
      expect(params.sustain).toBe(-0.25);
      expect(params.mix).toBe(0.75);
    });
  });

  describe("getChorusDepthSec", () => {
    it("maps depth 0 to a static delay and depth 1 to a 4 ms swing", () => {
      expect(getChorusDepthSec(0)).toBe(0);
      expect(getChorusDepthSec(1)).toBeCloseTo(0.004, 6);
      expect(getChorusDepthSec(0.4)).toBeCloseTo(0.0016, 6);
    });
  });

  describe("getSaturationDriveGain", () => {
    it("maps drive 0 to unity and drive 1 to 21x", () => {
      expect(getSaturationDriveGain(0)).toBe(1);
      expect(getSaturationDriveGain(1)).toBe(21);
      expect(getSaturationDriveGain(0.3)).toBeCloseTo(7, 5);
    });
  });

  describe("getSaturationToneHz", () => {
    it("maps tone log-wise from 2 kHz to 18 kHz", () => {
      expect(getSaturationToneHz(0)).toBe(2000);
      expect(getSaturationToneHz(1)).toBe(18000);
      expect(getSaturationToneHz(0.5)).toBeCloseTo(6000, 5);
    });
  });

  describe("buildSaturationCurve", () => {
    it("returns a normalized tanh curve for soft mode", () => {
      const curve = buildSaturationCurve("soft");
      expect(curve).toBeInstanceOf(Float32Array);
      expect(curve.length).toBe(4096);
      expect(curve[0]).toBeCloseTo(-1, 5);
      expect(curve[4095]).toBeCloseTo(1, 5);
      expect(curve[2048]).toBeCloseTo(0, 2);
    });

    it("returns a hard-clipped curve for hard mode", () => {
      const curve = buildSaturationCurve("hard");
      expect(curve).toBeInstanceOf(Float32Array);
      expect(curve.length).toBe(4096);
      // Ends clamp at +/-0.8 instead of reaching the rails.
      expect(curve[0]).toBeCloseTo(-0.8, 5);
      expect(curve[4095]).toBeCloseTo(0.8, 5);
      expect(curve[2048]).toBeCloseTo(0, 2);
    });
  });

  describe("buildSoftClipCurve", () => {
    it("returns Float32Array of 4096 samples", () => {
      const curve = buildSoftClipCurve(0.5);
      expect(curve).toBeInstanceOf(Float32Array);
      expect(curve.length).toBe(4096);
    });

    it("curve is symmetric around zero", () => {
      const curve = buildSoftClipCurve(0.5);
      expect(curve[0]).toBeCloseTo(-1, 1);
      expect(curve[curve.length - 1]).toBeCloseTo(1, 1);
      expect(curve[Math.floor(curve.length / 2)]).toBeCloseTo(0, 2);
    });
  });
});
