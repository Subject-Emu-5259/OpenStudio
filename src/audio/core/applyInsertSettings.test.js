import { describe, it, expect, vi } from "vitest";
import { applyInsertSettings } from "./applyInsertSettings";

function createParam(value = 0) {
  return {
    value,
    setValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
}

function createGainNode(value = 1) {
  return { gain: createParam(value) };
}

function createFilterNode() {
  return {
    type: "peaking",
    frequency: createParam(1000),
    Q: createParam(1),
    gain: createParam(0),
  };
}

function createDelayNode() {
  return { delayTime: createParam(0) };
}

function createCompressorNode() {
  return {
    threshold: createParam(-24),
    ratio: createParam(4),
    knee: createParam(6),
    attack: createParam(0.01),
    release: createParam(0.18),
    reduction: 0,
  };
}

function createWaveShaperNode() {
  return {
    curve: null,
    oversample: "none",
  };
}

function createWorkletNode() {
  // Mirrors a real AudioWorkletNode's parameters map: get("attack") and
  // get("sustain") return AudioParams the graph can automate.
  return {
    parameters: new Map([
      ["attack", createParam(0)],
      ["sustain", createParam(0)],
    ]),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createInsertNode() {
  return {
    leftToLeft: createGainNode(),
    rightToRight: createGainNode(),
    rightToLeft: createGainNode(),
    leftToRight: createGainNode(),
    panner: { pan: createParam(0) },
    fxDryGain: createGainNode(),
    fxWetGain: createGainNode(),
    eqInput: createGainNode(),
    eqLowCut: createFilterNode(),
    eqBands: [],
    compressorInput: createGainNode(),
    compressor: createCompressorNode(),
    compressorMakeupGain: createGainNode(),
    compressorDryGain: createGainNode(),
    compressorWetGain: createGainNode(),
    compressorOutput: createGainNode(),
    saturationInput: createGainNode(),
    saturationDryGain: createGainNode(),
    saturationDrive: createGainNode(),
    saturationShaper: createWaveShaperNode(),
    saturationTone: createFilterNode(),
    saturationOutputGain: createGainNode(),
    saturationWetGain: createGainNode(),
    saturationOutput: createGainNode(),
    filterInput: createGainNode(),
    filterDryGain: createGainNode(),
    filterBiquad: createFilterNode(),
    filterWetGain: createGainNode(),
    filterOutput: createGainNode(),
    transientInput: createGainNode(),
    transientDryGain: createGainNode(),
    transientNode: createWorkletNode(),
    transientWetGain: createGainNode(),
    transientOutput: createGainNode(),
    reverbInput: createGainNode(),
    reverbPreDelay: createDelayNode(),
    reverbLoCut: createFilterNode(),
    reverbHiCut: createFilterNode(),
    reverbLateLeftDelay: createDelayNode(),
    reverbLateRightDelay: createDelayNode(),
    reverbLeftFeedback: createGainNode(),
    reverbRightFeedback: createGainNode(),
    reverbLeftDamping: createFilterNode(),
    reverbRightDamping: createFilterNode(),
    reverbEarlyGain: createGainNode(),
    reverbEarlyTaps: [],
    reverbLeftToLeft: createGainNode(),
    reverbRightToRight: createGainNode(),
    reverbRightToLeft: createGainNode(),
    reverbLeftToRight: createGainNode(),
    reverbWetGain: createGainNode(),
    reverbModulators: [],
    delayInput: createGainNode(),
    delayNode: createDelayNode(),
    delayDamping: createFilterNode(),
    delayFeedback: createGainNode(),
    delayWetGain: createGainNode(),
    chorusInput: createGainNode(),
    chorusDelay: createDelayNode(),
    chorusWetGain: createGainNode(),
    chorusModulators: [
      {
        lfo: { frequency: createParam(0.8) },
        depth: createGainNode(),
        isStarted: false,
      },
    ],
    maximizerInput: createGainNode(),
    maximizerPreGain: createGainNode(),
    maximizerCompressor: {
      threshold: createParam(-24),
      ratio: createParam(12),
      knee: createParam(30),
      attack: createParam(0.003),
      release: createParam(0.25),
    },
    maximizerSoftClip: {},
    maximizerCeilingGain: createGainNode(),
    outputGain: createGainNode(),
  };
}

describe("applyInsertSettings", () => {
  function baseInsert(fxSlots) {
    return {
      active: true,
      pan: 0,
      stereoSeparation: 0,
      fader: 1,
      fxSlots,
    };
  }

  it("clamps maximizer compressor ratio to Web Audio range", () => {
    const node = createInsertNode();
    const insert = {
      active: true,
      pan: 0,
      stereoSeparation: 0,
      fader: 1,
      fxSlots: [
        {
          enabled: true,
          effectType: "maximizer",
          params: {
            mode: "irc-iv",
            thresholdDb: -24,
            ceilingDb: -1,
            character: 0,
            truePeakEnabled: true,
          },
        },
      ],
    };

    applyInsertSettings(node, insert, 0);

    expect(node.maximizerCompressor.ratio.setValueAtTime).toHaveBeenCalledWith(20, 0);
  });

  it("applies compressor params and dry/wet mix", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      {
        enabled: true,
        effectType: "compressor",
        params: {
          thresholdDb: -18,
          ratio: 8,
          kneeDb: 12,
          attackSec: 0.005,
          releaseSec: 0.3,
          makeupGainDb: 6,
          mix: 0.5,
        },
      },
    ]);

    // The offline exporter calls with useSmoothing:false, so this also
    // covers the export path (same shared implementation).
    applyInsertSettings(node, insert, 0, { useSmoothing: false });

    expect(node.compressor.threshold.setValueAtTime).toHaveBeenCalledWith(-18, 0);
    expect(node.compressor.ratio.setValueAtTime).toHaveBeenCalledWith(8, 0);
    expect(node.compressor.knee.setValueAtTime).toHaveBeenCalledWith(12, 0);
    expect(node.compressor.attack.setValueAtTime).toHaveBeenCalledWith(0.005, 0);
    expect(node.compressor.release.setValueAtTime).toHaveBeenCalledWith(0.3, 0);
    // Makeup gain is linear on the wet path only: 6 dB ~= 1.995.
    expect(node.compressorMakeupGain.gain.setValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(Math.pow(10, 6 / 20), 5),
      0,
    );
    expect(node.compressorDryGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
    expect(node.compressorWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
  });

  it("neutralizes a disabled compressor so the serial chain passes dry", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      {
        enabled: false,
        effectType: "compressor",
        params: {
          thresholdDb: -18,
          ratio: 8,
          kneeDb: 12,
          attackSec: 0.005,
          releaseSec: 0.3,
          makeupGainDb: 6,
          mix: 1,
        },
      },
    ]);

    applyInsertSettings(node, insert, 0);

    expect(node.compressor.threshold.setValueAtTime).toHaveBeenCalledWith(0, 0);
    expect(node.compressor.ratio.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.compressor.knee.setValueAtTime).toHaveBeenCalledWith(0, 0);
    expect(node.compressorMakeupGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.compressorDryGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.compressorWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
  });

  it("applies saturation params and dry/wet mix", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      {
        enabled: true,
        effectType: "saturation",
        params: {
          drive: 0.6,
          mode: "soft",
          tone: 0.5,
          outputDb: -3,
          mix: 0.5,
        },
      },
    ]);

    // The offline exporter calls with useSmoothing:false, so this also
    // covers the export path (same shared implementation).
    applyInsertSettings(node, insert, 0, { useSmoothing: false });

    // Drive 0.6 maps to a 13x pre-shaper gain (1 + 0.6 * 20).
    expect(node.saturationDrive.gain.setValueAtTime).toHaveBeenCalledWith(13, 0);
    // Tone 0.5 sits at 6 kHz on the log tilt.
    expect(node.saturationTone.type).toBe("lowpass");
    expect(node.saturationTone.frequency.setValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(6000, 5),
      0,
    );
    // Soft mode builds a normalized tanh curve; oversample stays 4x.
    expect(node.saturationShaper.curve).toBeInstanceOf(Float32Array);
    expect(node.saturationShaper.curve.length).toBe(4096);
    expect(node.saturationShaper.curve[0]).toBeCloseTo(-1, 5);
    expect(node.saturationShaper.curve[4095]).toBeCloseTo(1, 5);
    expect(node.saturationShaper.oversample).toBe("4x");
    // Output trim is linear on the wet path only: -3 dB ~= 0.708.
    expect(node.saturationOutputGain.gain.setValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(Math.pow(10, -3 / 20), 5),
      0,
    );
    expect(node.saturationDryGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
    expect(node.saturationWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
  });

  it("builds a hard-clipped curve for hard saturation mode", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      {
        enabled: true,
        effectType: "saturation",
        params: { drive: 0.3, mode: "hard", tone: 0.5, outputDb: 0, mix: 1 },
      },
    ]);

    applyInsertSettings(node, insert, 0);

    expect(node.saturationShaper.curve).toBeInstanceOf(Float32Array);
    expect(node.saturationShaper.curve[0]).toBeCloseTo(-0.8, 5);
    expect(node.saturationShaper.curve[4095]).toBeCloseTo(0.8, 5);
  });

  it("neutralizes a disabled saturation so the serial chain passes dry", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      {
        enabled: false,
        effectType: "saturation",
        params: { drive: 1, mode: "hard", tone: 0, outputDb: 12, mix: 1 },
      },
    ]);

    applyInsertSettings(node, insert, 0);

    expect(node.saturationDrive.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    // Null curve = the WaveShaper passes signal unchanged.
    expect(node.saturationShaper.curve).toBeNull();
    expect(node.saturationTone.frequency.setValueAtTime).toHaveBeenCalledWith(18000, 0);
    expect(node.saturationOutputGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.saturationDryGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.saturationWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
  });

  it("applies filter params and dry/wet mix", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      {
        enabled: true,
        effectType: "filter",
        params: {
          cutoffHz: 800,
          resonance: 4.5,
          mode: "highpass",
          mix: 0.5,
        },
      },
    ]);

    applyInsertSettings(node, insert, 0, { useSmoothing: false });

    expect(node.filterBiquad.type).toBe("highpass");
    expect(node.filterBiquad.frequency.setValueAtTime).toHaveBeenCalledWith(800, 0);
    expect(node.filterBiquad.Q.setValueAtTime).toHaveBeenCalledWith(4.5, 0);
    expect(node.filterDryGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
    expect(node.filterWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
  });

  it("neutralizes a disabled filter so the serial chain passes dry", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      {
        enabled: false,
        effectType: "filter",
        params: { cutoffHz: 200, resonance: 10, mode: "lowpass", mix: 1 },
      },
    ]);

    applyInsertSettings(node, insert, 0);

    expect(node.filterDryGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.filterWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
  });

  it("keeps the serial chain open: eq and maximizer entries always pass", () => {
    const node = createInsertNode();
    const insert = baseInsert([]);

    applyInsertSettings(node, insert, 0);

    // No effects at all: the chain still passes at unity (a zero gain in
    // series would silence the whole insert).
    expect(node.eqInput.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.maximizerInput.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.compressorInput.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.saturationInput.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.filterInput.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.transientInput.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    // Disabled maximizer goes neutral instead of gating.
    expect(node.maximizerCompressor.threshold.setValueAtTime).toHaveBeenCalledWith(0, 0);
    expect(node.maximizerCompressor.ratio.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.maximizerCompressor.knee.setValueAtTime).toHaveBeenCalledWith(0, 0);
  });

  it("applies transient params and dry/wet mix", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      {
        enabled: true,
        effectType: "transient",
        params: { attack: 0.6, sustain: -0.4, mix: 0.5 },
      },
    ]);

    // useSmoothing: false is the exporter path — the shared
    // implementation must set the worklet AudioParams there too.
    applyInsertSettings(node, insert, 0, { useSmoothing: false });

    expect(
      node.transientNode.parameters.get("attack").setValueAtTime,
    ).toHaveBeenCalledWith(0.6, 0);
    expect(
      node.transientNode.parameters.get("sustain").setValueAtTime,
    ).toHaveBeenCalledWith(-0.4, 0);
    expect(node.transientInput.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.transientDryGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
    expect(node.transientWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
  });

  it("neutralizes a disabled transient so the serial chain passes dry", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      {
        enabled: false,
        effectType: "transient",
        params: { attack: 1, sustain: -1, mix: 1 },
      },
    ]);

    applyInsertSettings(node, insert, 0);

    expect(node.transientDryGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.transientWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
  });

  it("skips param writes for the fallback node without a parameters map", () => {
    const node = createInsertNode();
    // The unity-gain fallback node (worklet module not loaded yet) has
    // no parameters map — applying settings must not throw, and the
    // dry/wet mix still applies (the fallback passes signal unchanged).
    node.transientNode = createGainNode();
    const insert = baseInsert([
      {
        enabled: true,
        effectType: "transient",
        params: { attack: 0.6, sustain: -0.4, mix: 0.5 },
      },
    ]);

    expect(function () {
      applyInsertSettings(node, insert, 0, { useSmoothing: false });
    }).not.toThrow();
    expect(node.transientDryGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
    expect(node.transientWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
  });

  it("routes dry/wet serially: insert effects keep the chain at full level", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      { enabled: true, effectType: "graphic-eq", params: { points: [] } },
    ]);

    applyInsertSettings(node, insert, 0);

    // Chain output (dry) at full level, no reverb return (wet) without reverb.
    expect(node.fxDryGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.fxWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
  });

  it("balances dry/wet when reverb runs alone", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      { enabled: true, effectType: "reverb", params: { dryWet: 0.34 } },
    ]);

    applyInsertSettings(node, insert, 0);

    expect(node.fxDryGain.gain.setValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(0.66, 5),
      0,
    );
    expect(node.fxWetGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
  });

  it("keeps the chain at full level with insert effects plus reverb", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      { enabled: true, effectType: "compressor", params: {} },
      { enabled: true, effectType: "reverb", params: { dryWet: 0.34 } },
    ]);

    applyInsertSettings(node, insert, 0);

    // With insert effects on, reverb is an addition: chain stays at 1 and
    // the reverb return stays at 1 (its level is set by dryWet on the send).
    expect(node.fxDryGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.fxWetGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
  });

  it("treats saturation and filter as insert effects for dry/wet routing", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      { enabled: true, effectType: "saturation", params: {} },
      { enabled: true, effectType: "filter", params: {} },
      { enabled: true, effectType: "reverb", params: { dryWet: 0.34 } },
    ]);

    applyInsertSettings(node, insert, 0);

    // Saturation and filter join hasInsertFx, so the chain stays at full
    // level instead of being balanced down by reverb's dryWet.
    expect(node.fxDryGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.fxWetGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
  });

  it("treats transient as an insert effect for dry/wet routing", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      { enabled: true, effectType: "transient", params: {} },
      { enabled: true, effectType: "reverb", params: { dryWet: 0.34 } },
    ]);

    applyInsertSettings(node, insert, 0);

    // Transient joins hasInsertFx, so the chain stays at full level
    // instead of being balanced down by reverb's dryWet.
    expect(node.fxDryGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.fxWetGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
  });

  it("applies delay params and send level", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      {
        enabled: true,
        effectType: "delay",
        params: {
          timeMs: 480,
          feedback: 0.6,
          hiCutHz: 12000,
          mix: 0.4,
        },
      },
    ]);

    // The offline exporter calls with useSmoothing:false, so this also
    // covers the export path (same shared implementation).
    applyInsertSettings(node, insert, 0, { useSmoothing: false });

    expect(node.delayInput.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    // Time is stored in ms, applied in seconds.
    expect(node.delayNode.delayTime.setValueAtTime).toHaveBeenCalledWith(0.48, 0);
    expect(node.delayDamping.type).toBe("lowpass");
    expect(node.delayDamping.frequency.setValueAtTime).toHaveBeenCalledWith(12000, 0);
    expect(node.delayFeedback.gain.setValueAtTime).toHaveBeenCalledWith(0.6, 0);
    expect(node.delayWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.4, 0);
    // The delay opens the shared wet bus but never touches the dry signal.
    expect(node.fxDryGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.fxWetGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
  });

  it("gates a disabled delay and kills its feedback loop", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      {
        enabled: false,
        effectType: "delay",
        params: { timeMs: 480, feedback: 0.85, hiCutHz: 8000, mix: 0.5 },
      },
    ]);

    applyInsertSettings(node, insert, 0);

    expect(node.delayInput.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
    expect(node.delayFeedback.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
    expect(node.delayWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
    // No send is open, so the shared wet bus stays closed.
    expect(node.fxWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
  });

  it("caps delay feedback below 1 even when the stored value is higher", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      {
        enabled: true,
        effectType: "delay",
        params: { timeMs: 320, feedback: 1.5, hiCutHz: 8000, mix: 0.25 },
      },
    ]);

    applyInsertSettings(node, insert, 0);

    // The sanitizer caps at 0.85 and the application clamps again — the
    // loop can never run away no matter where the value came from.
    expect(node.delayFeedback.gain.setValueAtTime).toHaveBeenCalledWith(0.85, 0);
  });

  it("applies chorus params and LFO modulation", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      {
        enabled: true,
        effectType: "chorus",
        params: {
          rateHz: 1.5,
          depth: 0.7,
          delayMs: 22,
          mix: 0.5,
        },
      },
    ]);

    // The offline exporter calls with useSmoothing:false, so this also
    // covers the export path (same shared implementation).
    applyInsertSettings(node, insert, 0, { useSmoothing: false });

    expect(node.chorusInput.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    // Base delay is stored in ms, applied in seconds.
    expect(node.chorusDelay.delayTime.setValueAtTime).toHaveBeenCalledWith(0.022, 0);
    expect(node.chorusWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
    // Depth 0.7 swings the delay time by 0.7 * 4 ms = 2.8 ms.
    expect(node.chorusModulators[0].lfo.frequency.setValueAtTime).toHaveBeenCalledWith(1.5, 0);
    expect(node.chorusModulators[0].depth.gain.setValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(0.0028, 6),
      0,
    );
    // The chorus opens the shared wet bus but never touches the dry signal.
    expect(node.fxDryGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(node.fxWetGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
  });

  it("gates a disabled chorus and flattens its LFO", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      {
        enabled: false,
        effectType: "chorus",
        params: { rateHz: 2, depth: 1, delayMs: 30, mix: 0.5 },
      },
    ]);

    applyInsertSettings(node, insert, 0);

    expect(node.chorusInput.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
    expect(node.chorusWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
    // Depth 0 means the delay time sits still at its base value.
    expect(node.chorusModulators[0].depth.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
    // No send is open, so the shared wet bus stays closed.
    expect(node.fxWetGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
  });

  it("does not treat delay and chorus as insert effects for dry/wet routing", () => {
    const node = createInsertNode();
    const insert = baseInsert([
      { enabled: true, effectType: "delay", params: {} },
      { enabled: true, effectType: "chorus", params: {} },
      { enabled: true, effectType: "reverb", params: { dryWet: 0.34 } },
    ]);

    applyInsertSettings(node, insert, 0);

    // Delay and chorus are sends, not insert effects: reverb still
    // balances the dry signal (1 - 0.34) as if it were running alone.
    expect(node.fxDryGain.gain.setValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(0.66, 5),
      0,
    );
    expect(node.fxWetGain.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);
  });
});
