
import { describe, it, expect } from "vitest";
import {
  TRANSIENT_SHAPER_WORKLET_NAME,
  TransientEnvelopeFollower,
  TransientShaperProcessor,
} from "./transientShaperProcessor";

const SAMPLE_RATE = 48000;

function settleFollower(follower, level, samples) {
  let last = 0;
  for (let index = 0; index < samples; index += 1) {
    last = follower.processSample(level, 0, 0);
  }
  return last;
}

describe("TransientEnvelopeFollower", function () {
  it("passes silence as silence", function () {
    const follower = new TransientEnvelopeFollower(SAMPLE_RATE);
    for (let index = 0; index < 100; index += 1) {
      expect(follower.processSample(0, 1, 1)).toBe(0);
    }
  });

  it("is transparent at neutral attack and sustain", function () {
    const follower = new TransientEnvelopeFollower(SAMPLE_RATE);
    // A steady tone with no shaping must come out unchanged, from the
    // first sample (gain 1) through the settled state.
    expect(follower.processSample(0.5, 0, 0)).toBeCloseTo(0.5, 6);
    expect(settleFollower(follower, 0.5, SAMPLE_RATE)).toBeCloseTo(0.5, 6);
  });

  it("leaves a steady tone alone when attack is maxed", function () {
    const follower = new TransientEnvelopeFollower(SAMPLE_RATE);
    // Settle first so the slow envelope has caught up with the fast
    // one — the transient ratio is then ~0 and attack has nothing to
    // amplify.
    settleFollower(follower, 0.5, SAMPLE_RATE);
    const shaped = follower.processSample(0.5, 1, 0);
    expect(shaped).toBeCloseTo(0.5, 2);
  });

  it("boosts, passes, and softens an onset by attack sign", function () {
    // Same onset, three attack settings: the first sample after the
    // step is where the transient ratio is largest (~0.99).
    const boosted = new TransientEnvelopeFollower(SAMPLE_RATE);
    const neutral = new TransientEnvelopeFollower(SAMPLE_RATE);
    const softened = new TransientEnvelopeFollower(SAMPLE_RATE);

    const boostedOut = boosted.processSample(1, 1, 0);
    const neutralOut = neutral.processSample(1, 0, 0);
    const softenedOut = softened.processSample(1, -1, 0);

    expect(boostedOut).toBeGreaterThan(1.3);
    expect(neutralOut).toBeCloseTo(1, 6);
    expect(softenedOut).toBeLessThan(0.1);
    expect(boostedOut).toBeGreaterThan(neutralOut);
    expect(neutralOut).toBeGreaterThan(softenedOut);
  });

  it("lifts and cuts the body by sustain sign on a steady tone", function () {
    const lifted = new TransientEnvelopeFollower(SAMPLE_RATE);
    const neutral = new TransientEnvelopeFollower(SAMPLE_RATE);
    const cut = new TransientEnvelopeFollower(SAMPLE_RATE);

    settleFollower(lifted, 0.5, SAMPLE_RATE);
    settleFollower(neutral, 0.5, SAMPLE_RATE);
    settleFollower(cut, 0.5, SAMPLE_RATE);

    // Sustain scales the body level: +1 lifts by 60%, -1 cuts to 40%.
    expect(lifted.processSample(0.5, 0, 1)).toBeCloseTo(0.8, 2);
    expect(neutral.processSample(0.5, 0, 0)).toBeCloseTo(0.5, 2);
    expect(cut.processSample(0.5, 0, -1)).toBeCloseTo(0.2, 2);
  });

  it("never exceeds the soft-limit ceiling on a boosted onset", function () {
    const follower = new TransientEnvelopeFollower(SAMPLE_RATE);
    let max = 0;
    for (let index = 0; index < 100; index += 1) {
      max = Math.max(max, Math.abs(follower.processSample(1, 1, 1)));
    }
    expect(max).toBeLessThanOrEqual(1.5);
  });

  it("resets to a fresh state", function () {
    const follower = new TransientEnvelopeFollower(SAMPLE_RATE);
    settleFollower(follower, 0.9, SAMPLE_RATE);
    follower.reset();
    // After a reset the first onset behaves like a fresh follower.
    expect(follower.processSample(1, 1, 0)).toBeGreaterThan(1.3);
  });
});

describe("TransientShaperProcessor", function () {
  it("exposes the worklet name and attack/sustain params", function () {
    expect(TRANSIENT_SHAPER_WORKLET_NAME).toBe("transient-shaper");
    const descriptors = TransientShaperProcessor.parameterDescriptors;
    expect(descriptors).toHaveLength(2);
    expect(descriptors[0]).toMatchObject({
      name: "attack",
      defaultValue: 0,
      minValue: -1,
      maxValue: 1,
    });
    expect(descriptors[1]).toMatchObject({
      name: "sustain",
      defaultValue: 0,
      minValue: -1,
      maxValue: 1,
    });
  });

  it("processes stereo input with per-channel followers", function () {
    const processor = new TransientShaperProcessor();
    const leftIn = new Float32Array([1, 1, 1, 1]);
    const rightIn = new Float32Array([0, 0, 0, 0]);
    const leftOut = new Float32Array(4);
    const rightOut = new Float32Array(4);

    const keptAlive = processor.process(
      [[leftIn, rightIn]],
      [[leftOut, rightOut]],
      { attack: [1], sustain: [0] },
    );

    expect(keptAlive).toBe(true);
    // The left onset is boosted; the silent right channel stays silent.
    expect(leftOut[0]).toBeGreaterThan(1.3);
    expect(rightOut[0]).toBe(0);
    expect(rightOut[3]).toBe(0);
  });

  it("writes silence when no input is connected", function () {
    const processor = new TransientShaperProcessor();
    const out = new Float32Array([0.5, 0.5]);

    processor.process([[]], [[out]], { attack: [1], sustain: [1] });

    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
  });
});
