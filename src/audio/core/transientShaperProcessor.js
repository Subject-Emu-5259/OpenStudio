// Transient-shaper AudioWorklet processor.
//
// This file is loaded by the browser as a STANDALONE worklet module
// (see transientShaperWorklet.js, which passes it to
// audioWorklet.addModule via `new URL`). Vite emits it as an asset
// without bundling, so it must not import anything — the DSP below is
// fully self-contained on purpose.
//
// The same file is imported by Vitest for DSP unit tests. In Node there
// is no AudioWorkletProcessor base class and no registerProcessor, so
// both are guarded: the processor class falls back to a plain base and
// registration is skipped. The envelope-follower math itself is pure
// and needs no Web Audio at all.

export const TRANSIENT_SHAPER_WORKLET_NAME = "transient-shaper";

// How much the sustain control can lift or cut the body of a sound:
// +1 sustain lifts steady-state level by 60%, -1 cuts it to 40%.
const SUSTAIN_GAIN_RANGE = 0.6;

// The shaping gain never exceeds 2x (attack +1 at a pure onset), and the
// soft limiter caps the peak at 1.5 so a boosted transient cannot clip.
const MAX_SHAPING_GAIN = 2;
const SOFT_LIMIT_CEILING = 1.5;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function onePoleCoefficient(timeConstantSec, sampleRate) {
  // One-pole lowpass coefficient for the given time constant: the
  // envelope reaches ~63% of a step after timeConstantSec.
  return 1 - Math.exp(-1 / (timeConstantSec * sampleRate));
}

function softLimit(value) {
  // Transparent below full scale; above it a tanh curve asymptotes
  // toward the ceiling instead of hard-clipping the boosted transient.
  const magnitude = Math.abs(value);
  if (magnitude <= 1) {
    return value;
  }
  const excess = SOFT_LIMIT_CEILING - 1;
  return Math.sign(value) * (1 + excess * Math.tanh(magnitude - 1));
}

/**
 * Per-channel envelope follower that splits a signal into attack
 * (onset) and sustain (body) components.
 *
 * Two one-pole envelopes track the rectified signal: a fast one (1 ms
 * attack, 20 ms release) that jumps on onsets, and a slow one (80 ms
 * attack, 180 ms release) that tracks the body level. The transient
 * ratio is the fast envelope's lead over the slow one, normalized to
 * 0..1 — near 1 right after an onset, near 0 on a steady tone. The
 * sustain ratio is the slow envelope's share of the fast one — near 1
 * on a steady tone or a decaying tail, near 0 during an onset.
 *
 * Pure DSP: no Web Audio dependencies, unit-tested in Node.
 */
export class TransientEnvelopeFollower {
  constructor(sampleRate) {
    const safeSampleRate = Number(sampleRate) > 0 ? Number(sampleRate) : 48000;
    this.fastEnv = 0;
    this.slowEnv = 0;
    this.fastAttackCoef = onePoleCoefficient(0.001, safeSampleRate);
    this.fastReleaseCoef = onePoleCoefficient(0.02, safeSampleRate);
    this.slowAttackCoef = onePoleCoefficient(0.08, safeSampleRate);
    this.slowReleaseCoef = onePoleCoefficient(0.18, safeSampleRate);
  }

  reset() {
    this.fastEnv = 0;
    this.slowEnv = 0;
  }

  /**
   * Shapes one sample. Attack lifts (positive) or softens (negative)
   * onsets; sustain lifts or shortens the body and tail. Both params
   * are -1..1; at 0 the output is the input unchanged.
   */
  processSample(input, attack, sustain) {
    const magnitude = Math.abs(input);
    const fastCoef =
      magnitude > this.fastEnv ? this.fastAttackCoef : this.fastReleaseCoef;
    this.fastEnv += (magnitude - this.fastEnv) * fastCoef;
    const slowCoef =
      magnitude > this.slowEnv ? this.slowAttackCoef : this.slowReleaseCoef;
    this.slowEnv += (magnitude - this.slowEnv) * slowCoef;

    // The +1e-6 guard keeps the ratios finite at silence (both
    // envelopes 0); a silent input shapes to silence either way.
    const transientRatio = clamp01(
      (this.fastEnv - this.slowEnv) / (this.fastEnv + 1e-6),
    );
    const sustainRatio = clamp01(this.slowEnv / (this.fastEnv + 1e-6));
    const gain = Math.max(
      0,
      Math.min(
        MAX_SHAPING_GAIN,
        1 + attack * transientRatio + sustain * SUSTAIN_GAIN_RANGE * sustainRatio,
      ),
    );
    return softLimit(input * gain);
  }
}

// The worklet global scope provides AudioWorkletProcessor; Node (unit
// tests) does not, so the class extends a plain base there. The DSP
// lives in TransientEnvelopeFollower either way.
const WorkletProcessorBase =
  typeof globalThis.AudioWorkletProcessor !== "undefined"
    ? globalThis.AudioWorkletProcessor
    : class {};

/**
 * AudioWorkletProcessor wrapper: one envelope follower per channel,
 * attack/sustain exposed as k-rate AudioParams so the mixer graph can
 * automate them like any other node parameter.
 */
export class TransientShaperProcessor extends WorkletProcessorBase {
  static get parameterDescriptors() {
    return [
      {
        name: "attack",
        defaultValue: 0,
        minValue: -1,
        maxValue: 1,
        automationRate: "k-rate",
      },
      {
        name: "sustain",
        defaultValue: 0,
        minValue: -1,
        maxValue: 1,
        automationRate: "k-rate",
      },
    ];
  }

  constructor() {
    super();
    // sampleRate is a worklet-global; Node tests fall back to 48 kHz.
    const workletSampleRate =
      typeof globalThis.sampleRate === "number" ? globalThis.sampleRate : 48000;
    this.followers = [];
    this.workletSampleRate = workletSampleRate;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const attack = parameters.attack ? parameters.attack[0] : 0;
    const sustain = parameters.sustain ? parameters.sustain[0] : 0;

    for (let channel = 0; channel < output.length; channel += 1) {
      if (!this.followers[channel]) {
        this.followers[channel] = new TransientEnvelopeFollower(
          this.workletSampleRate,
        );
      }
      const follower = this.followers[channel];
      const inputChannel = input ? input[channel] : null;
      const outputChannel = output[channel];
      for (let index = 0; index < outputChannel.length; index += 1) {
        const sample = inputChannel ? inputChannel[index] : 0;
        outputChannel[index] = follower.processSample(sample, attack, sustain);
      }
    }

    return true;
  }
}

// Registration only happens in the worklet global scope. In the main
// thread (and in Node tests) registerProcessor does not exist, so this
// module is just a container for the DSP classes there.
if (typeof globalThis.registerProcessor === "function") {
  globalThis.registerProcessor(
    TRANSIENT_SHAPER_WORKLET_NAME,
    TransientShaperProcessor,
  );
}
