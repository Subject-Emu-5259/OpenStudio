import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createMixerInsertNodes,
  startMixerInsertModulators,
  stopMixerInsertModulators,
  upgradeTransientWorkletNodes,
} from "./createMixerInsertNodes";
import { ensureTransientShaperWorklet } from "./transientShaperWorklet";

afterEach(function () {
  // The upgrade tests install a mock AudioWorkletNode global; remove it
  // so other tests see the real jsdom state (undefined).
  delete globalThis.AudioWorkletNode;
});

function createModulator(startImpl = vi.fn()) {
  return {
    lfo: {
      start: startImpl,
    },
    isStarted: false,
  };
}

describe("startMixerInsertModulators", function () {
  it("starts reverb modulators from a realtime mixer graph", function () {
    const modulator = createModulator();
    const graph = {
      inserts: new Map([["master", { reverbModulators: [modulator] }]]),
    };
    const audioCtx = { currentTime: 1.25 };

    startMixerInsertModulators(graph, audioCtx);

    expect(modulator.lfo.start).toHaveBeenCalledWith(1.25);
    expect(modulator.isStarted).toBe(true);
  });

  it("starts reverb modulators from an offline insert map", function () {
    const modulator = createModulator();
    const insertMap = new Map([["master", { reverbModulators: [modulator] }]]);
    const audioCtx = { currentTime: 0 };

    startMixerInsertModulators(insertMap, audioCtx);

    expect(modulator.lfo.start).toHaveBeenCalledWith(0);
    expect(modulator.isStarted).toBe(true);
  });

  it("does not start a modulator twice", function () {
    const modulator = createModulator();
    const graph = {
      inserts: new Map([["master", { reverbModulators: [modulator] }]]),
    };
    const audioCtx = { currentTime: 3 };

    startMixerInsertModulators(graph, audioCtx);
    startMixerInsertModulators(graph, audioCtx);

    expect(modulator.lfo.start).toHaveBeenCalledTimes(1);
  });

  it("marks a modulator started when start throws", function () {
    const modulator = createModulator(vi.fn(function () {
      throw new Error("already started");
    }));
    const graph = {
      inserts: new Map([["master", { reverbModulators: [modulator] }]]),
    };
    const audioCtx = { currentTime: 4 };

    expect(function () {
      startMixerInsertModulators(graph, audioCtx);
    }).not.toThrow();
    expect(modulator.isStarted).toBe(true);
  });

  it("starts chorus modulators alongside reverb modulators", function () {
    const reverbModulator = createModulator();
    const chorusModulator = createModulator();
    const graph = {
      inserts: new Map([
        [
          "master",
          {
            reverbModulators: [reverbModulator],
            chorusModulators: [chorusModulator],
          },
        ],
      ]),
    };
    const audioCtx = { currentTime: 2.5 };

    startMixerInsertModulators(graph, audioCtx);

    expect(reverbModulator.lfo.start).toHaveBeenCalledWith(2.5);
    expect(chorusModulator.lfo.start).toHaveBeenCalledWith(2.5);
    expect(chorusModulator.isStarted).toBe(true);
  });

  it("starts a chorus modulator when there are no reverb modulators", function () {
    const chorusModulator = createModulator();
    const graph = {
      inserts: new Map([["master", { chorusModulators: [chorusModulator] }]]),
    };
    const audioCtx = { currentTime: 1 };

    startMixerInsertModulators(graph, audioCtx);

    expect(chorusModulator.lfo.start).toHaveBeenCalledWith(1);
    expect(chorusModulator.isStarted).toBe(true);
  });

  it("does not start a chorus modulator twice", function () {
    const chorusModulator = createModulator();
    const graph = {
      inserts: new Map([["master", { chorusModulators: [chorusModulator] }]]),
    };
    const audioCtx = { currentTime: 3 };

    startMixerInsertModulators(graph, audioCtx);
    startMixerInsertModulators(graph, audioCtx);

    expect(chorusModulator.lfo.start).toHaveBeenCalledTimes(1);
  });
});

describe("stopMixerInsertModulators", function () {
  function createStoppableModulator() {
    return {
      lfo: {
        start: vi.fn(),
        stop: vi.fn(),
      },
      isStarted: true,
    };
  }

  it("stops reverb and chorus modulators that were started", function () {
    const reverbModulator = createStoppableModulator();
    const chorusModulator = createStoppableModulator();
    const node = {
      reverbModulators: [reverbModulator],
      chorusModulators: [chorusModulator],
    };

    stopMixerInsertModulators(node);

    expect(reverbModulator.lfo.stop).toHaveBeenCalledTimes(1);
    expect(chorusModulator.lfo.stop).toHaveBeenCalledTimes(1);
  });

  it("skips modulators that never started", function () {
    const chorusModulator = createStoppableModulator();
    chorusModulator.isStarted = false;

    stopMixerInsertModulators({ chorusModulators: [chorusModulator] });

    expect(chorusModulator.lfo.stop).not.toHaveBeenCalled();
  });

  it("tolerates missing modulator arrays", function () {
    expect(function () {
      stopMixerInsertModulators({});
      stopMixerInsertModulators(null);
    }).not.toThrow();
  });
});

describe("createMixerInsertNodes serial chain", function () {
  // Fake audio context that records every connection so the topology can
  // be asserted without a real AudioContext. Nodes are identified by the
  // descriptor key they land under (eqBands[i] for the band array).
  function createRecordingContext() {
    const connections = [];
    let nextId = 0;

    function createParam(value) {
      return {
        value,
        setValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      };
    }

    function createNode(kind) {
      const node = {
        __kind: kind,
        __id: kind + "-" + nextId++,
        connect: vi.fn(function (destination) {
          connections.push([node, destination]);
        }),
        disconnect: vi.fn(),
        start: vi.fn(),
      };
      if (kind === "gain") {
        node.gain = createParam(1);
      }
      if (kind === "filter") {
        node.type = "peaking";
        node.frequency = createParam(1000);
        node.Q = createParam(1);
        node.gain = createParam(0);
      }
      if (kind === "delay") {
        node.delayTime = createParam(0);
      }
      if (kind === "compressor") {
        node.threshold = createParam(-24);
        node.ratio = createParam(4);
        node.knee = createParam(6);
        node.attack = createParam(0.01);
        node.release = createParam(0.18);
        node.reduction = 0;
      }
      if (kind === "oscillator") {
        node.type = "sine";
        node.frequency = createParam(0.35);
      }
      if (kind === "panner") {
        node.pan = createParam(0);
      }
      if (kind === "waveshaper") {
        node.curve = null;
        node.oversample = "none";
      }
      return node;
    }

    const audioCtx = {
      currentTime: 0,
      createGain: function () {
        return createNode("gain");
      },
      createChannelSplitter: function () {
        return createNode("splitter");
      },
      createChannelMerger: function () {
        return createNode("merger");
      },
      createStereoPanner: function () {
        return createNode("panner");
      },
      createBiquadFilter: function () {
        return createNode("filter");
      },
      createDelay: function () {
        return createNode("delay");
      },
      createDynamicsCompressor: function () {
        return createNode("compressor");
      },
      createWaveShaper: function () {
        return createNode("waveshaper");
      },
      createOscillator: function () {
        return createNode("oscillator");
      },
      createAnalyser: function () {
        const node = createNode("analyser");
        node.fftSize = 2048;
        node.frequencyBinCount = 1024;
        return node;
      },
    };

    return { audioCtx, connections };
  }

  function nameConnections(descriptor, connections) {
    const names = new Map();
    Object.entries(descriptor).forEach(function ([key, value]) {
      if (Array.isArray(value)) {
        value.forEach(function (item, index) {
          if (item && typeof item === "object") {
            names.set(item, key + "[" + index + "]");
          }
        });
        return;
      }
      if (value && typeof value === "object") {
        names.set(value, key);
      }
    });
    return connections.map(function ([from, to]) {
      const fromName = names.get(from) || from.__id || "?";
      const toName = names.get(to) || to.__id || "?";
      return fromName + " -> " + toName;
    });
  }

  it("wires the insert chain in series with reverb as a post-chain send", function () {
    const { audioCtx, connections } = createRecordingContext();
    const { insertMap } = createMixerInsertNodes(audioCtx, [{ id: "insert-1" }]);
    const descriptor = insertMap.get("insert-1");
    const named = nameConnections(descriptor, connections);

    // Panner feeds ONLY the chain entry (no parallel branches).
    expect(named).toContain("panner -> eqInput");
    expect(named).not.toContain("panner -> fxDryGain");
    expect(named).not.toContain("panner -> reverbInput");
    expect(named).not.toContain("panner -> maximizerInput");

    // EQ -> compressor -> saturation -> filter -> transient -> maximizer.
    expect(named).toContain("eqBands[6] -> compressorInput");
    expect(named).toContain("compressorInput -> compressorDryGain");
    expect(named).toContain("compressorDryGain -> compressorOutput");
    expect(named).toContain("compressorInput -> compressor");
    expect(named).toContain("compressor -> compressorMakeupGain");
    expect(named).toContain("compressorMakeupGain -> compressorWetGain");
    expect(named).toContain("compressorWetGain -> compressorOutput");
    expect(named).toContain("compressorOutput -> saturationInput");
    expect(named).toContain("saturationInput -> saturationDryGain");
    expect(named).toContain("saturationDryGain -> saturationOutput");
    expect(named).toContain("saturationInput -> saturationDrive");
    expect(named).toContain("saturationDrive -> saturationShaper");
    expect(named).toContain("saturationShaper -> saturationTone");
    expect(named).toContain("saturationTone -> saturationOutputGain");
    expect(named).toContain("saturationOutputGain -> saturationWetGain");
    expect(named).toContain("saturationWetGain -> saturationOutput");
    expect(named).toContain("saturationOutput -> filterInput");
    expect(named).toContain("filterInput -> filterDryGain");
    expect(named).toContain("filterDryGain -> filterOutput");
    expect(named).toContain("filterInput -> filterBiquad");
    expect(named).toContain("filterBiquad -> filterWetGain");
    expect(named).toContain("filterWetGain -> filterOutput");
    expect(named).toContain("filterOutput -> transientInput");
    expect(named).toContain("transientInput -> transientDryGain");
    expect(named).toContain("transientDryGain -> transientOutput");
    expect(named).toContain("transientInput -> transientNode");
    expect(named).toContain("transientNode -> transientWetGain");
    expect(named).toContain("transientWetGain -> transientOutput");
    expect(named).toContain("transientOutput -> maximizerInput");

    // Chain tail feeds the dry gain and the reverb send; the reverb
    // return still sums into the output through the wet gain.
    expect(named).toContain("maximizerCeilingGain -> fxDryGain");
    expect(named).toContain("maximizerCeilingGain -> reverbInput");
    expect(named).toContain("reverbWetGain -> fxWetGain");
    expect(named).toContain("fxDryGain -> outputGain");
    expect(named).toContain("fxWetGain -> outputGain");
  });

  it("wires delay and chorus as post-chain sends parallel to reverb", function () {
    const { audioCtx, connections } = createRecordingContext();
    const { insertMap } = createMixerInsertNodes(audioCtx, [{ id: "insert-1" }]);
    const descriptor = insertMap.get("insert-1");
    const named = nameConnections(descriptor, connections);

    // Both sends tap the chain tail, never the panner.
    expect(named).toContain("maximizerCeilingGain -> delayInput");
    expect(named).toContain("maximizerCeilingGain -> chorusInput");
    expect(named).not.toContain("panner -> delayInput");
    expect(named).not.toContain("panner -> chorusInput");

    // Delay: input -> delay line -> damping -> wet gain -> shared wet bus,
    // with the damping output also feeding back into the delay line.
    expect(named).toContain("delayInput -> delayNode");
    expect(named).toContain("delayNode -> delayDamping");
    expect(named).toContain("delayDamping -> delayWetGain");
    expect(named).toContain("delayWetGain -> fxWetGain");
    expect(named).toContain("delayDamping -> delayFeedback");
    expect(named).toContain("delayFeedback -> delayNode");

    // Chorus: input -> modulated delay line -> wet gain -> shared wet bus.
    expect(named).toContain("chorusInput -> chorusDelay");
    expect(named).toContain("chorusDelay -> chorusWetGain");
    expect(named).toContain("chorusWetGain -> fxWetGain");
  });

  it("exposes the delay and chorus nodes and the chorus modulator on the descriptor", function () {
    const { audioCtx } = createRecordingContext();
    const { insertMap } = createMixerInsertNodes(audioCtx, [{ id: "insert-1" }]);
    const descriptor = insertMap.get("insert-1");

    expect(descriptor.delayInput).toBeDefined();
    expect(descriptor.delayNode).toBeDefined();
    expect(descriptor.delayDamping).toBeDefined();
    expect(descriptor.delayFeedback).toBeDefined();
    expect(descriptor.delayWetGain).toBeDefined();
    expect(descriptor.chorusInput).toBeDefined();
    expect(descriptor.chorusDelay).toBeDefined();
    expect(descriptor.chorusWetGain).toBeDefined();
    expect(descriptor.chorusModulators).toHaveLength(1);
    expect(descriptor.chorusModulators[0].lfo).toBeDefined();
    expect(descriptor.chorusModulators[0].depth).toBeDefined();
    expect(descriptor.chorusModulators[0].isStarted).toBe(false);
  });

  it("exposes the compressor, saturation and filter nodes on the descriptor", function () {
    const { audioCtx } = createRecordingContext();
    const { insertMap } = createMixerInsertNodes(audioCtx, [{ id: "insert-1" }]);
    const descriptor = insertMap.get("insert-1");

    expect(descriptor.compressorInput).toBeDefined();
    expect(descriptor.compressor).toBeDefined();
    expect(descriptor.compressorMakeupGain).toBeDefined();
    expect(descriptor.compressorDryGain).toBeDefined();
    expect(descriptor.compressorWetGain).toBeDefined();
    expect(descriptor.compressorOutput).toBeDefined();
    expect(descriptor.saturationInput).toBeDefined();
    expect(descriptor.saturationDryGain).toBeDefined();
    expect(descriptor.saturationDrive).toBeDefined();
    expect(descriptor.saturationShaper).toBeDefined();
    expect(descriptor.saturationTone).toBeDefined();
    expect(descriptor.saturationOutputGain).toBeDefined();
    expect(descriptor.saturationWetGain).toBeDefined();
    expect(descriptor.saturationOutput).toBeDefined();
    expect(descriptor.filterInput).toBeDefined();
    expect(descriptor.filterDryGain).toBeDefined();
    expect(descriptor.filterBiquad).toBeDefined();
    expect(descriptor.filterWetGain).toBeDefined();
    expect(descriptor.filterOutput).toBeDefined();
    // The recording context has no audioWorklet, so the transient stage
    // runs on its unity-gain fallback node.
    expect(descriptor.transientInput).toBeDefined();
    expect(descriptor.transientDryGain).toBeDefined();
    expect(descriptor.transientNode).toBeDefined();
    expect(descriptor.transientWetGain).toBeDefined();
    expect(descriptor.transientOutput).toBeDefined();
    expect(descriptor.transientWorkletReady).toBe(false);
  });
});

describe("upgradeTransientWorkletNodes", function () {
  function createWorkletContext() {
    const connections = [];
    const audioCtx = {
      currentTime: 0,
      audioWorklet: {
        addModule: vi.fn().mockResolvedValue(undefined),
      },
      createGain: function () {
        const node = {
          gain: { value: 1, setValueAtTime: vi.fn() },
          connect: vi.fn(function (destination) {
            connections.push([node, destination]);
          }),
          disconnect: vi.fn(),
        };
        return node;
      },
    };
    return { audioCtx, connections };
  }

  function installMockWorkletNode(connections) {
    globalThis.AudioWorkletNode = function (ctx, name) {
      this.name = name;
      this.parameters = new Map([
        ["attack", { value: 0, setValueAtTime: vi.fn() }],
        ["sustain", { value: 0, setValueAtTime: vi.fn() }],
      ]);
      this.connect = vi.fn(function (destination) {
        connections.push([this, destination]);
      });
      this.disconnect = vi.fn();
    };
  }

  it("returns 0 when the module is not ready", function () {
    const { audioCtx } = createWorkletContext();
    const fallback = audioCtx.createGain();
    const insertMap = new Map([
      [
        "insert-1",
        {
          transientWorkletReady: false,
          transientInput: audioCtx.createGain(),
          transientNode: fallback,
          transientWetGain: audioCtx.createGain(),
        },
      ],
    ]);

    expect(upgradeTransientWorkletNodes(insertMap, audioCtx)).toBe(0);
    expect(insertMap.get("insert-1").transientNode).toBe(fallback);
  });

  it("swaps fallback nodes for worklet nodes once the module is ready", async function () {
    const { audioCtx, connections } = createWorkletContext();
    const fallback = audioCtx.createGain();
    const transientInput = audioCtx.createGain();
    const transientWetGain = audioCtx.createGain();
    const insertMap = new Map([
      [
        "insert-1",
        {
          transientWorkletReady: false,
          transientInput,
          transientNode: fallback,
          transientWetGain,
        },
      ],
    ]);

    await ensureTransientShaperWorklet(audioCtx);
    installMockWorkletNode(connections);

    expect(upgradeTransientWorkletNodes(insertMap, audioCtx)).toBe(1);
    const descriptor = insertMap.get("insert-1");
    expect(descriptor.transientWorkletReady).toBe(true);
    expect(descriptor.transientNode).not.toBe(fallback);
    expect(descriptor.transientNode.name).toBe("transient-shaper");
    // The fallback was disconnected and the worklet node wired in.
    expect(transientInput.disconnect).toHaveBeenCalledWith(fallback);
    expect(fallback.disconnect).toHaveBeenCalled();
    expect(
      connections.some(function ([from, to]) {
        return from === transientInput && to === descriptor.transientNode;
      }),
    ).toBe(true);
    expect(
      connections.some(function ([from, to]) {
        return from === descriptor.transientNode && to === transientWetGain;
      }),
    ).toBe(true);
  });

  it("does not upgrade an insert twice", async function () {
    const { audioCtx, connections } = createWorkletContext();
    const insertMap = new Map([
      [
        "insert-1",
        {
          transientWorkletReady: false,
          transientInput: audioCtx.createGain(),
          transientNode: audioCtx.createGain(),
          transientWetGain: audioCtx.createGain(),
        },
      ],
    ]);

    await ensureTransientShaperWorklet(audioCtx);
    installMockWorkletNode(connections);

    expect(upgradeTransientWorkletNodes(insertMap, audioCtx)).toBe(1);
    expect(upgradeTransientWorkletNodes(insertMap, audioCtx)).toBe(0);
  });

  it("accepts the realtime graph wrapper shape", async function () {
    const { audioCtx, connections } = createWorkletContext();
    const insertMap = new Map([
      [
        "insert-1",
        {
          transientWorkletReady: false,
          transientInput: audioCtx.createGain(),
          transientNode: audioCtx.createGain(),
          transientWetGain: audioCtx.createGain(),
        },
      ],
    ]);

    await ensureTransientShaperWorklet(audioCtx);
    installMockWorkletNode(connections);

    expect(upgradeTransientWorkletNodes({ inserts: insertMap }, audioCtx)).toBe(1);
  });
});
