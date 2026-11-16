import { describe, it, expect } from "vitest";
import { getActiveFxState } from "./getActiveFxState";
import {
  FX_EFFECT_CHORUS,
  FX_EFFECT_COMPRESSOR,
  FX_EFFECT_DELAY,
  FX_EFFECT_FILTER,
  FX_EFFECT_GRAPHIC_EQ,
  FX_EFFECT_MAXIMIZER,
  FX_EFFECT_REVERB,
  FX_EFFECT_SATURATION,
  FX_EFFECT_TRANSIENT,
} from "../domain/fxParams";

describe("getActiveFxState", () => {
  it("returns disabled defaults for missing inserts", () => {
    const state = getActiveFxState(null);
    expect(state.eqEnabled).toBe(false);
    expect(state.reverbEnabled).toBe(false);
    expect(state.maximizerEnabled).toBe(false);
    expect(state.compressorEnabled).toBe(false);
    expect(state.compressorParams.thresholdDb).toBe(-24);
    expect(state.compressorParams.ratio).toBe(4);
    expect(state.saturationEnabled).toBe(false);
    expect(state.saturationParams.drive).toBe(0.3);
    expect(state.saturationParams.mode).toBe("soft");
    expect(state.filterEnabled).toBe(false);
    expect(state.filterParams.cutoffHz).toBe(18000);
    expect(state.filterParams.mode).toBe("lowpass");
    expect(state.delayEnabled).toBe(false);
    expect(state.delayParams.timeMs).toBe(320);
    expect(state.delayParams.feedback).toBe(0.35);
    expect(state.chorusEnabled).toBe(false);
    expect(state.chorusParams.rateHz).toBe(0.8);
    expect(state.chorusParams.delayMs).toBe(15);
    expect(state.transientEnabled).toBe(false);
    expect(state.transientParams.attack).toBe(0);
    expect(state.transientParams.sustain).toBe(0);
    expect(state.transientParams.mix).toBe(1);
    expect(state.eqParams.points).toHaveLength(7);
  });

  it("ignores disabled slots", () => {
    const state = getActiveFxState({
      fxSlots: [
        {
          enabled: false,
          effectType: FX_EFFECT_REVERB,
          params: { dryWet: 1 },
        },
      ],
    });

    expect(state.reverbEnabled).toBe(false);
    expect(state.reverbParams.dryWet).toBeCloseTo(0.34, 5);
  });

  it("enables and sanitizes supported effect slots", () => {
    const state = getActiveFxState({
      fxSlots: [
        {
          enabled: true,
          effectType: FX_EFFECT_GRAPHIC_EQ,
          params: { points: [{ frequencyHz: 5, gainDb: 999, q: 99 }] },
        },
        {
          enabled: true,
          effectType: FX_EFFECT_REVERB,
          params: { dryWet: 4, decayTime: 50 },
        },
        {
          enabled: true,
          effectType: FX_EFFECT_MAXIMIZER,
          params: { thresholdDb: -99, ceilingDb: 5, character: 3 },
        },
        {
          enabled: true,
          effectType: FX_EFFECT_COMPRESSOR,
          params: { thresholdDb: -99, ratio: 99, attackSec: 0, mix: 2 },
        },
        {
          enabled: true,
          effectType: FX_EFFECT_SATURATION,
          params: { drive: 2, mode: "bogus", tone: -1, outputDb: 99, mix: 2 },
        },
        {
          enabled: true,
          effectType: FX_EFFECT_FILTER,
          params: { cutoffHz: 5, resonance: 99, mode: "peaking", mix: 2 },
        },
        {
          enabled: true,
          effectType: FX_EFFECT_DELAY,
          params: { timeMs: 5000, feedback: 1.5, mix: 2, hiCutHz: 500 },
        },
        {
          enabled: true,
          effectType: FX_EFFECT_CHORUS,
          params: { rateHz: 99, depth: 2, delayMs: 1, mix: -1 },
        },
        {
          enabled: true,
          effectType: FX_EFFECT_TRANSIENT,
          params: { attack: 5, sustain: -5, mix: 2 },
        },
      ],
    });

    expect(state.eqEnabled).toBe(true);
    expect(state.eqParams.points[0].frequencyHz).toBe(20);
    expect(state.eqParams.points[0].gainDb).toBe(18);
    expect(state.eqParams.points[0].q).toBe(8);
    expect(state.reverbEnabled).toBe(true);
    expect(state.reverbParams.dryWet).toBe(1);
    expect(state.reverbParams.decayTime).toBe(20);
    expect(state.maximizerEnabled).toBe(true);
    expect(state.maximizerParams.thresholdDb).toBe(-24);
    expect(state.maximizerParams.ceilingDb).toBe(0);
    expect(state.maximizerParams.character).toBe(1);
    expect(state.compressorEnabled).toBe(true);
    expect(state.compressorParams.thresholdDb).toBe(-60);
    expect(state.compressorParams.ratio).toBe(20);
    expect(state.compressorParams.attackSec).toBe(0.0005);
    expect(state.compressorParams.mix).toBe(1);
    expect(state.saturationEnabled).toBe(true);
    expect(state.saturationParams.drive).toBe(1);
    expect(state.saturationParams.mode).toBe("soft");
    expect(state.saturationParams.tone).toBe(0);
    expect(state.saturationParams.outputDb).toBe(12);
    expect(state.saturationParams.mix).toBe(1);
    expect(state.filterEnabled).toBe(true);
    expect(state.filterParams.cutoffHz).toBe(20);
    expect(state.filterParams.resonance).toBe(20);
    expect(state.filterParams.mode).toBe("lowpass");
    expect(state.filterParams.mix).toBe(1);
    expect(state.delayEnabled).toBe(true);
    expect(state.delayParams.timeMs).toBe(2000);
    expect(state.delayParams.feedback).toBe(0.85);
    expect(state.delayParams.mix).toBe(1);
    expect(state.delayParams.hiCutHz).toBe(1200);
    expect(state.chorusEnabled).toBe(true);
    expect(state.chorusParams.rateHz).toBe(8);
    expect(state.chorusParams.depth).toBe(1);
    expect(state.chorusParams.delayMs).toBe(5);
    expect(state.chorusParams.mix).toBe(0);
    expect(state.transientEnabled).toBe(true);
    expect(state.transientParams.attack).toBe(1);
    expect(state.transientParams.sustain).toBe(-1);
    expect(state.transientParams.mix).toBe(1);
  });
});
