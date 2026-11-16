import { describe, it, expect, afterEach } from "vitest";
import { resetToDefaultProject, store } from "../store";
import {
  applyAiOperations,
  prepareAiOperations,
  validatePreparedAiOperations,
} from "./aiAgentOperations";

// Reproduction for the live v14 crash: applying an AI agent plan trips
// the ErrorBoundary ("Something went wrong"). The existing apply tests
// use a mock dispatch + mock state, so they never run the real reducers
// or the undo snapshot clone that applyPendingOperations does first.
// This test drives a realistic 12-op beat plan through the REAL store.

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface RawOperation {
  type: string
  payload?: Record<string, unknown>
}

interface RealDawStateShape {
  mixer: { inserts: Array<{ id: string }> }
  project: { playlistTracks: Array<{ id: string }> }
}

function buildBeatPlan(dawState: RealDawStateShape) {
  const insertId = dawState.mixer.inserts[0]?.id || "insert-1";
  const trackId = dawState.project.playlistTracks[0]?.id || "trk-1";
  return [
    { type: "set_bpm", payload: { bpm: 140 } },
    { type: "create_pattern", payload: { name: "Hook" } },
    { type: "add_channel", payload: { name: "Melody" } },
    {
      type: "assign_plugin_to_channel",
      payload: { channelId: "$new", pluginRef: "openstudio-piano", pluginName: "Piano" },
    },
    {
      type: "add_chord_progression",
      payload: {
        channelId: "$new",
        chords: [
          { start: 0, length: 16, pitches: [55, 59, 62], velocity: 95 },
          { start: 16, length: 16, pitches: [53, 57, 60], velocity: 90 },
        ],
      },
    },
    { type: "add_channel", payload: { name: "808" } },
    {
      type: "assign_sample_to_channel",
      payload: {
        channelId: "$new",
        samplePath: "/packs/TRENCH PACK Leaks (Producergrind)/Bass Shots/Translunar.wav",
        sampleName: "Translunar",
      },
    },
    { type: "set_step", payload: { channelId: "$new", stepIndex: 0, value: true } },
    { type: "set_step", payload: { channelId: "$new", stepIndex: 7, value: true } },
    {
      type: "add_playlist_pattern_clip",
      payload: { trackId, barStart: 0, barLength: 4 },
    },
    { type: "set_channel_volume", payload: { channelId: "$new", value: 0.8 } },
    {
      type: "set_fx_slot_effect",
      payload: { insertId, slotId: "slot-1", effectType: "reverb" },
    },
  ];
}

function applyPlanThroughRealStore(rawOperations: RawOperation[]) {
  const prepared = prepareAiOperations(rawOperations);
  const validated = validatePreparedAiOperations(prepared.operations, {
    dawState: store.getState().daw,
    availableSamples: [],
  });
  const result = applyAiOperations(validated, {
    dispatch: store.dispatch,
    getState: store.getState,
  });
  return { prepared, validated, result };
}

describe("AI plan apply against the real store (v14 crash repro)", function () {
  afterEach(function () {
    store.dispatch(resetToDefaultProject());
  });

  it("applies a realistic 12-op beat plan without throwing, and the daw state stays JSON-clonable", function () {
    store.dispatch(resetToDefaultProject());

    // The exact step applyPendingOperations does FIRST: snapshot the
    // daw state for undo. If this throws, every Apply crashes.
    expect(function () {
      cloneSerializable(store.getState().daw);
    }).not.toThrow();

    const plan = buildBeatPlan(store.getState().daw);
    // A throw here fails the test directly with the real error.
    const outcome = applyPlanThroughRealStore(plan);

    const failed = outcome.result.results.filter(function (r: { status: string }) {
      return r.status === "failed";
    });
    expect(failed).toEqual([]);
    expect(outcome.result.applied.length).toBe(plan.length);

    // And the post-apply state must still clone (next Apply's snapshot).
    expect(function () {
      cloneSerializable(store.getState().daw);
    }).not.toThrow();
  });

  it("applies a second plan on top of the first without throwing", function () {
    store.dispatch(resetToDefaultProject());
    applyPlanThroughRealStore(buildBeatPlan(store.getState().daw));

    const secondPlan = [
      { type: "set_bpm", payload: { bpm: 132 } },
      { type: "add_channel", payload: { name: "Counter" } },
      {
        type: "add_piano_notes",
        payload: {
          channelId: "$new",
          notes: [
            { start: 0, length: 2, pitch: 67, velocity: 100 },
            { start: 2, length: 2, pitch: 65, velocity: 95 },
            { start: 4, length: 4, pitch: 62, velocity: 90 },
          ],
        },
      },
      {
        type: "add_playlist_pattern_clip",
        payload: { barStart: 4, barLength: 4 },
      },
    ];

    expect(function () {
      cloneSerializable(store.getState().daw);
    }).not.toThrow();

    // A throw here fails the test directly with the real error.
    const outcome = applyPlanThroughRealStore(secondPlan);

    const failed = outcome.result.results.filter(function (r: { status: string }) {
      return r.status === "failed";
    });
    expect(failed).toEqual([]);

    expect(function () {
      cloneSerializable(store.getState().daw);
    }).not.toThrow();
  });
});
