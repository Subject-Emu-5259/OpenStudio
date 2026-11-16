import { describe, it, expect } from "vitest";
import { areMixerSettingsEqual } from "./useMixerGraph";

function makeInsert(fxSlots) {
  return {
    id: "insert-1",
    active: true,
    pan: 0,
    stereoSeparation: 0,
    fader: 1,
    fxSlots,
  };
}

function compressorSlot(params) {
  return {
    id: "slot-1",
    enabled: true,
    effectType: "compressor",
    params: {
      thresholdDb: -24,
      ratio: 4,
      kneeDb: 6,
      attackSec: 0.01,
      releaseSec: 0.18,
      makeupGainDb: 0,
      mix: 1,
      ...params,
    },
  };
}

function saturationSlot(params) {
  return {
    id: "slot-1",
    enabled: true,
    effectType: "saturation",
    params: {
      drive: 0.3,
      mode: "soft",
      tone: 0.5,
      mix: 1,
      outputDb: 0,
      ...params,
    },
  };
}

function filterSlot(params) {
  return {
    id: "slot-1",
    enabled: true,
    effectType: "filter",
    params: {
      cutoffHz: 18000,
      resonance: 1,
      mode: "lowpass",
      mix: 1,
      ...params,
    },
  };
}

function delaySlot(params) {
  return {
    id: "slot-1",
    enabled: true,
    effectType: "delay",
    params: {
      timeMs: 320,
      feedback: 0.35,
      mix: 0.25,
      hiCutHz: 8000,
      ...params,
    },
  };
}

function chorusSlot(params) {
  return {
    id: "slot-1",
    enabled: true,
    effectType: "chorus",
    params: {
      rateHz: 0.8,
      depth: 0.4,
      delayMs: 15,
      mix: 0.35,
      ...params,
    },
  };
}

function transientSlot(params) {
  return {
    id: "slot-1",
    enabled: true,
    effectType: "transient",
    params: {
      attack: 0,
      sustain: 0,
      mix: 1,
      ...params,
    },
  };
}

describe("areMixerSettingsEqual", function () {
  it("treats identical compressor settings as equal", function () {
    const a = [makeInsert([compressorSlot({})])];
    const b = [makeInsert([compressorSlot({})])];
    expect(areMixerSettingsEqual(a, b)).toBe(true);
  });

  it("detects a compressor param change so knob moves apply", function () {
    const a = [makeInsert([compressorSlot({})])];
    const b = [makeInsert([compressorSlot({ thresholdDb: -18 })])];
    expect(areMixerSettingsEqual(a, b)).toBe(false);
  });

  it("detects each compressor param change", function () {
    const params = [
      { ratio: 8 },
      { kneeDb: 12 },
      { attackSec: 0.005 },
      { releaseSec: 0.3 },
      { makeupGainDb: 6 },
      { mix: 0.5 },
    ];
    params.forEach(function (change) {
      const a = [makeInsert([compressorSlot({})])];
      const b = [makeInsert([compressorSlot(change)])];
      expect(areMixerSettingsEqual(a, b)).toBe(false);
    });
  });

  it("detects a compressor slot enable toggle", function () {
    const a = [makeInsert([compressorSlot({})])];
    const off = compressorSlot({});
    off.enabled = false;
    const b = [makeInsert([off])];
    expect(areMixerSettingsEqual(a, b)).toBe(false);
  });

  it("treats identical saturation settings as equal", function () {
    const a = [makeInsert([saturationSlot({})])];
    const b = [makeInsert([saturationSlot({})])];
    expect(areMixerSettingsEqual(a, b)).toBe(true);
  });

  it("detects each saturation param change", function () {
    const params = [
      { drive: 0.6 },
      { mode: "hard" },
      { tone: 0.25 },
      { mix: 0.5 },
      { outputDb: -3 },
    ];
    params.forEach(function (change) {
      const a = [makeInsert([saturationSlot({})])];
      const b = [makeInsert([saturationSlot(change)])];
      expect(areMixerSettingsEqual(a, b)).toBe(false);
    });
  });

  it("treats identical filter settings as equal", function () {
    const a = [makeInsert([filterSlot({})])];
    const b = [makeInsert([filterSlot({})])];
    expect(areMixerSettingsEqual(a, b)).toBe(true);
  });

  it("detects each filter param change", function () {
    const params = [
      { cutoffHz: 800 },
      { resonance: 4.5 },
      { mode: "highpass" },
      { mix: 0.5 },
    ];
    params.forEach(function (change) {
      const a = [makeInsert([filterSlot({})])];
      const b = [makeInsert([filterSlot(change)])];
      expect(areMixerSettingsEqual(a, b)).toBe(false);
    });
  });

  it("treats identical delay settings as equal", function () {
    const a = [makeInsert([delaySlot({})])];
    const b = [makeInsert([delaySlot({})])];
    expect(areMixerSettingsEqual(a, b)).toBe(true);
  });

  it("detects each delay param change", function () {
    const params = [
      { timeMs: 480 },
      { feedback: 0.6 },
      { mix: 0.5 },
      { hiCutHz: 12000 },
    ];
    params.forEach(function (change) {
      const a = [makeInsert([delaySlot({})])];
      const b = [makeInsert([delaySlot(change)])];
      expect(areMixerSettingsEqual(a, b)).toBe(false);
    });
  });

  it("treats identical chorus settings as equal", function () {
    const a = [makeInsert([chorusSlot({})])];
    const b = [makeInsert([chorusSlot({})])];
    expect(areMixerSettingsEqual(a, b)).toBe(true);
  });

  it("detects each chorus param change", function () {
    const params = [
      { rateHz: 1.5 },
      { depth: 0.7 },
      { delayMs: 22 },
      { mix: 0.5 },
    ];
    params.forEach(function (change) {
      const a = [makeInsert([chorusSlot({})])];
      const b = [makeInsert([chorusSlot(change)])];
      expect(areMixerSettingsEqual(a, b)).toBe(false);
    });
  });

  it("treats identical transient settings as equal", function () {
    const a = [makeInsert([transientSlot({})])];
    const b = [makeInsert([transientSlot({})])];
    expect(areMixerSettingsEqual(a, b)).toBe(true);
  });

  it("detects each transient param change", function () {
    const params = [{ attack: 0.5 }, { sustain: -0.5 }, { mix: 0.5 }];
    params.forEach(function (change) {
      const a = [makeInsert([transientSlot({})])];
      const b = [makeInsert([transientSlot(change)])];
      expect(areMixerSettingsEqual(a, b)).toBe(false);
    });
  });
});
