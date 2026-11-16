import { describe, it, expect } from "vitest";
import { mixerReducers } from "./mixer";

function createMixerState(inserts = []) {
  return {
    mixer: {
      inserts,
      selectedInsertId: inserts[0]?.id || null,
    },
  };
}

function makeInsert(id) {
  return {
    id,
    name: "Insert " + id,
    isMaster: false,
    active: true,
    pan: 0,
    stereoSeparation: 0,
    fader: 1,
    meter: 0,
    meterSpectrum: [],
    meterWaveform: [],
    maximizerReduction: 0,
    maximizerOutputDb: -96,
    maximizerStereoMeter: {},
    routesTo: ["master"],
    fxSlots: Array.from({ length: 10 }, (_, i) => ({
      id: `slot-${i + 1}`,
      name: `Slot ${i + 1}`,
      enabled: false,
      effectType: "none",
      params: null,
    })),
  };
}

describe("mixerReducers", () => {
  describe("selectInsert", () => {
    it("sets selected insert", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.selectInsert(state, { payload: "insert-1" });
      expect(state.mixer.selectedInsertId).toBe("insert-1");
    });
  });

  describe("addMixerTrack", () => {
    it("adds a new insert with incremented number", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.addMixerTrack(state);
      expect(state.mixer.inserts.length).toBe(2);
      expect(state.mixer.inserts[1].id).toBe("insert-2");
      expect(state.mixer.inserts[1].fxSlots.length).toBe(10);
      expect(state.mixer.selectedInsertId).toBe("insert-2");
    });

    it("creates insert-1 when list is empty", () => {
      const state = createMixerState([]);
      mixerReducers.addMixerTrack(state);
      expect(state.mixer.inserts[0].id).toBe("insert-1");
    });
  });

  describe("setInsertActive", () => {
    it("toggles insert active state", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertActive(state, { payload: { insertId: "insert-1", value: false } });
      expect(state.mixer.inserts[0].active).toBe(false);
    });

    it("ignores missing insert", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertActive(state, { payload: { insertId: "missing", value: false } });
      expect(state.mixer.inserts[0].active).toBe(true);
    });
  });

  describe("setInsertPan", () => {
    it("sets pan within [-1, 1]", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertPan(state, { payload: { insertId: "insert-1", value: 0.5 } });
      expect(state.mixer.inserts[0].pan).toBe(0.5);
    });

    it("clamps pan to [-1, 1]", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertPan(state, { payload: { insertId: "insert-1", value: 2 } });
      expect(state.mixer.inserts[0].pan).toBe(1);
    });
  });

  describe("setInsertStereo", () => {
    it("sets stereo separation", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertStereo(state, { payload: { insertId: "insert-1", value: -0.5 } });
      expect(state.mixer.inserts[0].stereoSeparation).toBe(-0.5);
    });
  });

  describe("setInsertFader", () => {
    it("sets fader within [0, 1.25]", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertFader(state, { payload: { insertId: "insert-1", value: 0.8 } });
      expect(state.mixer.inserts[0].fader).toBe(0.8);
    });

    it("clamps fader to max 1.25", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertFader(state, { payload: { insertId: "insert-1", value: 2 } });
      expect(state.mixer.inserts[0].fader).toBe(1.25);
    });
  });

  describe("toggleFxSlot", () => {
    it("does nothing for empty slot", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.toggleFxSlot(state, { payload: { insertId: "insert-1", slotId: "slot-1" } });
      expect(state.mixer.inserts[0].fxSlots[0].enabled).toBe(false);
    });

    it("toggles enabled for loaded effect", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      state.mixer.inserts[0].fxSlots[0].effectType = "graphic-eq";
      mixerReducers.toggleFxSlot(state, { payload: { insertId: "insert-1", slotId: "slot-1" } });
      expect(state.mixer.inserts[0].fxSlots[0].enabled).toBe(true);
      mixerReducers.toggleFxSlot(state, { payload: { insertId: "insert-1", slotId: "slot-1" } });
      expect(state.mixer.inserts[0].fxSlots[0].enabled).toBe(false);
    });
  });

  describe("setFxSlotEffectType", () => {
    it("sets effect type and name for Graphic EQ", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "graphic-eq" },
      });
      expect(state.mixer.inserts[0].fxSlots[0].effectType).toBe("graphic-eq");
      expect(state.mixer.inserts[0].fxSlots[0].name).toBe("Graphic EQ");
    });

    it("clears effect when type is none", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      state.mixer.inserts[0].fxSlots[0].effectType = "reverb";
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "none" },
      });
      expect(state.mixer.inserts[0].fxSlots[0].effectType).toBe("none");
      expect(state.mixer.inserts[0].fxSlots[0].enabled).toBe(false);
    });

    it("sets effect type and name for Compressor with default params", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "compressor" },
      });
      expect(state.mixer.inserts[0].fxSlots[0].effectType).toBe("compressor");
      expect(state.mixer.inserts[0].fxSlots[0].name).toBe("Compressor");
      expect(state.mixer.inserts[0].fxSlots[0].params.thresholdDb).toBe(-24);
      expect(state.mixer.inserts[0].fxSlots[0].params.ratio).toBe(4);
      expect(state.mixer.inserts[0].fxSlots[0].params.mix).toBe(1);
    });

    it("sets effect type and name for Saturation with default params", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "saturation" },
      });
      expect(state.mixer.inserts[0].fxSlots[0].effectType).toBe("saturation");
      expect(state.mixer.inserts[0].fxSlots[0].name).toBe("Saturation");
      expect(state.mixer.inserts[0].fxSlots[0].params.drive).toBe(0.3);
      expect(state.mixer.inserts[0].fxSlots[0].params.mode).toBe("soft");
      expect(state.mixer.inserts[0].fxSlots[0].params.mix).toBe(1);
    });

    it("sets effect type and name for Filter with default params", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "filter" },
      });
      expect(state.mixer.inserts[0].fxSlots[0].effectType).toBe("filter");
      expect(state.mixer.inserts[0].fxSlots[0].name).toBe("Filter");
      expect(state.mixer.inserts[0].fxSlots[0].params.cutoffHz).toBe(18000);
      expect(state.mixer.inserts[0].fxSlots[0].params.mode).toBe("lowpass");
      expect(state.mixer.inserts[0].fxSlots[0].params.mix).toBe(1);
    });

    it("sets effect type and name for Delay with default params", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "delay" },
      });
      expect(state.mixer.inserts[0].fxSlots[0].effectType).toBe("delay");
      expect(state.mixer.inserts[0].fxSlots[0].name).toBe("Delay");
      expect(state.mixer.inserts[0].fxSlots[0].params.timeMs).toBe(320);
      expect(state.mixer.inserts[0].fxSlots[0].params.feedback).toBe(0.35);
      expect(state.mixer.inserts[0].fxSlots[0].params.mix).toBe(0.25);
    });

    it("sets effect type and name for Chorus with default params", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "chorus" },
      });
      expect(state.mixer.inserts[0].fxSlots[0].effectType).toBe("chorus");
      expect(state.mixer.inserts[0].fxSlots[0].name).toBe("Chorus");
      expect(state.mixer.inserts[0].fxSlots[0].params.rateHz).toBe(0.8);
      expect(state.mixer.inserts[0].fxSlots[0].params.delayMs).toBe(15);
      expect(state.mixer.inserts[0].fxSlots[0].params.mix).toBe(0.35);
    });

    it("sets effect type and name for Transient Shaper with default params", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "transient" },
      });
      expect(state.mixer.inserts[0].fxSlots[0].effectType).toBe("transient");
      expect(state.mixer.inserts[0].fxSlots[0].name).toBe("Transient Shaper");
      expect(state.mixer.inserts[0].fxSlots[0].params.attack).toBe(0);
      expect(state.mixer.inserts[0].fxSlots[0].params.sustain).toBe(0);
      expect(state.mixer.inserts[0].fxSlots[0].params.mix).toBe(1);
    });
  });

  describe("setFxSlotCompressorParam", () => {
    function compressorState() {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "compressor" },
      });
      return state;
    }

    it("sets compressor params", () => {
      const state = compressorState();
      mixerReducers.setFxSlotCompressorParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "thresholdDb", value: -18 },
      });
      mixerReducers.setFxSlotCompressorParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "ratio", value: 8 },
      });
      mixerReducers.setFxSlotCompressorParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "mix", value: 0.5 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.thresholdDb).toBe(-18);
      expect(state.mixer.inserts[0].fxSlots[0].params.ratio).toBe(8);
      expect(state.mixer.inserts[0].fxSlots[0].params.mix).toBe(0.5);
    });

    it("clamps compressor params to their ranges", () => {
      const state = compressorState();
      mixerReducers.setFxSlotCompressorParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "thresholdDb", value: -99 },
      });
      mixerReducers.setFxSlotCompressorParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "ratio", value: 99 },
      });
      mixerReducers.setFxSlotCompressorParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "attackSec", value: 0 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.thresholdDb).toBe(-60);
      expect(state.mixer.inserts[0].fxSlots[0].params.ratio).toBe(20);
      expect(state.mixer.inserts[0].fxSlots[0].params.attackSec).toBe(0.0005);
    });

    it("ignores unknown params and non-compressor slots", () => {
      const state = compressorState();
      mixerReducers.setFxSlotCompressorParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "bogus", value: 5 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.bogus).toBeUndefined();
      expect(state.mixer.inserts[0].fxSlots[0].params.thresholdDb).toBe(-24);
      mixerReducers.setFxSlotCompressorParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-2", param: "thresholdDb", value: -10 },
      });
      expect(state.mixer.inserts[0].fxSlots[1].params).toBeNull();
    });
  });

  describe("setFxSlotSaturationParam", () => {
    function saturationState() {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "saturation" },
      });
      return state;
    }

    it("sets saturation params", () => {
      const state = saturationState();
      mixerReducers.setFxSlotSaturationParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "drive", value: 0.6 },
      });
      mixerReducers.setFxSlotSaturationParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "mode", value: "hard" },
      });
      mixerReducers.setFxSlotSaturationParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "outputDb", value: -3 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.drive).toBe(0.6);
      expect(state.mixer.inserts[0].fxSlots[0].params.mode).toBe("hard");
      expect(state.mixer.inserts[0].fxSlots[0].params.outputDb).toBe(-3);
    });

    it("clamps saturation params to their ranges", () => {
      const state = saturationState();
      mixerReducers.setFxSlotSaturationParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "drive", value: 2 },
      });
      mixerReducers.setFxSlotSaturationParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "tone", value: -1 },
      });
      mixerReducers.setFxSlotSaturationParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "outputDb", value: 99 },
      });
      mixerReducers.setFxSlotSaturationParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "mode", value: "bogus" },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.drive).toBe(1);
      expect(state.mixer.inserts[0].fxSlots[0].params.tone).toBe(0);
      expect(state.mixer.inserts[0].fxSlots[0].params.outputDb).toBe(12);
      expect(state.mixer.inserts[0].fxSlots[0].params.mode).toBe("soft");
    });

    it("ignores unknown params and non-saturation slots", () => {
      const state = saturationState();
      mixerReducers.setFxSlotSaturationParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "bogus", value: 5 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.bogus).toBeUndefined();
      expect(state.mixer.inserts[0].fxSlots[0].params.drive).toBe(0.3);
      mixerReducers.setFxSlotSaturationParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-2", param: "drive", value: 0.9 },
      });
      expect(state.mixer.inserts[0].fxSlots[1].params).toBeNull();
    });
  });

  describe("setFxSlotFilterParam", () => {
    function filterState() {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "filter" },
      });
      return state;
    }

    it("sets filter params", () => {
      const state = filterState();
      mixerReducers.setFxSlotFilterParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "cutoffHz", value: 800 },
      });
      mixerReducers.setFxSlotFilterParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "mode", value: "highpass" },
      });
      mixerReducers.setFxSlotFilterParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "resonance", value: 4.5 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.cutoffHz).toBe(800);
      expect(state.mixer.inserts[0].fxSlots[0].params.mode).toBe("highpass");
      expect(state.mixer.inserts[0].fxSlots[0].params.resonance).toBe(4.5);
    });

    it("clamps filter params to their ranges", () => {
      const state = filterState();
      mixerReducers.setFxSlotFilterParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "cutoffHz", value: 5 },
      });
      mixerReducers.setFxSlotFilterParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "resonance", value: 99 },
      });
      mixerReducers.setFxSlotFilterParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "mode", value: "peaking" },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.cutoffHz).toBe(20);
      expect(state.mixer.inserts[0].fxSlots[0].params.resonance).toBe(20);
      expect(state.mixer.inserts[0].fxSlots[0].params.mode).toBe("lowpass");
    });

    it("ignores unknown params and non-filter slots", () => {
      const state = filterState();
      mixerReducers.setFxSlotFilterParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "bogus", value: 5 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.bogus).toBeUndefined();
      expect(state.mixer.inserts[0].fxSlots[0].params.cutoffHz).toBe(18000);
      mixerReducers.setFxSlotFilterParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-2", param: "cutoffHz", value: 500 },
      });
      expect(state.mixer.inserts[0].fxSlots[1].params).toBeNull();
    });
  });

  describe("setFxSlotDelayParam", () => {
    function delayState() {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "delay" },
      });
      return state;
    }

    it("sets delay params", () => {
      const state = delayState();
      mixerReducers.setFxSlotDelayParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "timeMs", value: 480 },
      });
      mixerReducers.setFxSlotDelayParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "feedback", value: 0.6 },
      });
      mixerReducers.setFxSlotDelayParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "hiCutHz", value: 12000 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.timeMs).toBe(480);
      expect(state.mixer.inserts[0].fxSlots[0].params.feedback).toBe(0.6);
      expect(state.mixer.inserts[0].fxSlots[0].params.hiCutHz).toBe(12000);
    });

    it("clamps delay params to their ranges", () => {
      const state = delayState();
      mixerReducers.setFxSlotDelayParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "timeMs", value: 5000 },
      });
      mixerReducers.setFxSlotDelayParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "feedback", value: 1.5 },
      });
      mixerReducers.setFxSlotDelayParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "hiCutHz", value: 500 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.timeMs).toBe(2000);
      expect(state.mixer.inserts[0].fxSlots[0].params.feedback).toBe(0.85);
      expect(state.mixer.inserts[0].fxSlots[0].params.hiCutHz).toBe(1200);
    });

    it("ignores unknown params and non-delay slots", () => {
      const state = delayState();
      mixerReducers.setFxSlotDelayParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "bogus", value: 5 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.bogus).toBeUndefined();
      expect(state.mixer.inserts[0].fxSlots[0].params.timeMs).toBe(320);
      mixerReducers.setFxSlotDelayParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-2", param: "timeMs", value: 500 },
      });
      expect(state.mixer.inserts[0].fxSlots[1].params).toBeNull();
    });
  });

  describe("setFxSlotChorusParam", () => {
    function chorusState() {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "chorus" },
      });
      return state;
    }

    it("sets chorus params", () => {
      const state = chorusState();
      mixerReducers.setFxSlotChorusParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "rateHz", value: 1.5 },
      });
      mixerReducers.setFxSlotChorusParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "depth", value: 0.7 },
      });
      mixerReducers.setFxSlotChorusParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "delayMs", value: 22 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.rateHz).toBe(1.5);
      expect(state.mixer.inserts[0].fxSlots[0].params.depth).toBe(0.7);
      expect(state.mixer.inserts[0].fxSlots[0].params.delayMs).toBe(22);
    });

    it("clamps chorus params to their ranges", () => {
      const state = chorusState();
      mixerReducers.setFxSlotChorusParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "rateHz", value: 99 },
      });
      mixerReducers.setFxSlotChorusParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "depth", value: 2 },
      });
      mixerReducers.setFxSlotChorusParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "delayMs", value: 1 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.rateHz).toBe(8);
      expect(state.mixer.inserts[0].fxSlots[0].params.depth).toBe(1);
      expect(state.mixer.inserts[0].fxSlots[0].params.delayMs).toBe(5);
    });

    it("ignores unknown params and non-chorus slots", () => {
      const state = chorusState();
      mixerReducers.setFxSlotChorusParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "bogus", value: 5 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.bogus).toBeUndefined();
      expect(state.mixer.inserts[0].fxSlots[0].params.rateHz).toBe(0.8);
      mixerReducers.setFxSlotChorusParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-2", param: "rateHz", value: 2 },
      });
      expect(state.mixer.inserts[0].fxSlots[1].params).toBeNull();
    });
  });

  describe("setFxSlotTransientParam", () => {
    function transientState() {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setFxSlotEffectType(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", effectType: "transient" },
      });
      return state;
    }

    it("sets transient params", () => {
      const state = transientState();
      mixerReducers.setFxSlotTransientParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "attack", value: 0.6 },
      });
      mixerReducers.setFxSlotTransientParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "sustain", value: -0.4 },
      });
      mixerReducers.setFxSlotTransientParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "mix", value: 0.5 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.attack).toBe(0.6);
      expect(state.mixer.inserts[0].fxSlots[0].params.sustain).toBe(-0.4);
      expect(state.mixer.inserts[0].fxSlots[0].params.mix).toBe(0.5);
    });

    it("clamps transient params to their ranges", () => {
      const state = transientState();
      mixerReducers.setFxSlotTransientParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "attack", value: 5 },
      });
      mixerReducers.setFxSlotTransientParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "sustain", value: -5 },
      });
      mixerReducers.setFxSlotTransientParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "mix", value: 2 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.attack).toBe(1);
      expect(state.mixer.inserts[0].fxSlots[0].params.sustain).toBe(-1);
      expect(state.mixer.inserts[0].fxSlots[0].params.mix).toBe(1);
    });

    it("ignores unknown params and non-transient slots", () => {
      const state = transientState();
      mixerReducers.setFxSlotTransientParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-1", param: "bogus", value: 5 },
      });
      expect(state.mixer.inserts[0].fxSlots[0].params.bogus).toBeUndefined();
      expect(state.mixer.inserts[0].fxSlots[0].params.attack).toBe(0);
      mixerReducers.setFxSlotTransientParam(state, {
        payload: { insertId: "insert-1", slotId: "slot-2", param: "attack", value: 0.5 },
      });
      expect(state.mixer.inserts[0].fxSlots[1].params).toBeNull();
    });
  });

  describe("setInsertMeter", () => {
    it("sets meter value clamped to [0, 1]", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertMeter(state, { payload: { insertId: "insert-1", meter: 1.5 } });
      expect(state.mixer.inserts[0].meter).toBe(1);
    });

    it("updates spectrum and waveform arrays", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertMeter(state, {
        payload: { insertId: "insert-1", meter: 0.5, spectrum: [0.2, 1.5], waveform: [-1.2, 0.8] },
      });
      expect(state.mixer.inserts[0].meterSpectrum).toEqual([0.2, 1]);
      expect(state.mixer.inserts[0].meterWaveform).toEqual([-1, 0.8]);
    });

    it("clamps maximizerReduction", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertMeter(state, {
        payload: { insertId: "insert-1", meter: 0, maximizerReduction: 50 },
      });
      expect(state.mixer.inserts[0].maximizerReduction).toBe(36);
    });

    it("clamps compressorReduction", () => {
      const state = createMixerState([makeInsert("insert-1")]);
      mixerReducers.setInsertMeter(state, {
        payload: { insertId: "insert-1", meter: 0, compressorReduction: 50 },
      });
      expect(state.mixer.inserts[0].compressorReduction).toBe(36);
      mixerReducers.setInsertMeter(state, {
        payload: { insertId: "insert-1", meter: 0, compressorReduction: -5 },
      });
      expect(state.mixer.inserts[0].compressorReduction).toBe(0);
    });
  });
});
