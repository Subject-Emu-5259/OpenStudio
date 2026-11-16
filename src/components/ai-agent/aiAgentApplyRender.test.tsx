import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { resetToDefaultProject, store } from "../../store";
import {
  applyAiOperations,
  prepareAiOperations,
  validatePreparedAiOperations,
} from "../../ai/aiAgentOperations";
import { ChannelRackWindow } from "../ChannelRackWindow";
import { PlaylistWindow } from "../PlaylistWindow";
import { MixerWindow } from "../MixerWindow";
import { PianoRollWindow } from "../PianoRollWindow";
import { PatternListWindow } from "../PatternListWindow";

// Render-level repro for the live v14 crash: applying an AI agent plan
// trips the ErrorBoundary. The store-level test passes, so the crash
// must be in a window re-rendering with the post-plan state. Render
// every plan-affected window against the real store after applying
// both a clean plan and a "warned" plan (bad values the validator only
// warns about — Apply still applies them).

// Audio fetches never succeed in this harness; fail fast so the
// playlist warmup path runs its failure branch deterministically.
vi.stubGlobal("fetch", vi.fn(async function () {
  throw new Error("fetch disabled in test");
}));

const WINDOWS = [
  ["ChannelRack", ChannelRackWindow],
  ["Playlist", PlaylistWindow],
  ["Mixer", MixerWindow],
  ["PianoRoll", PianoRollWindow],
  ["PatternList", PatternListWindow],
];

function applyPlan(rawOperations: Array<{ type: string; payload?: Record<string, unknown> }>) {
  const prepared = prepareAiOperations(rawOperations);
  const validated = validatePreparedAiOperations(prepared.operations, {
    dawState: store.getState().daw,
    availableSamples: [],
  });
  return applyAiOperations(validated, {
    dispatch: store.dispatch,
    getState: store.getState,
  });
}

function renderAllWindows() {
  for (const [, WindowComponent] of WINDOWS) {
    const { unmount } = render(
      <Provider store={store}>
        <WindowComponent />
      </Provider>,
    );
    expect(document.body.textContent || "").not.toContain("Something went wrong");
    unmount();
  }
}

describe("AI plan apply renders every window (v14 crash repro)", function () {
  beforeEach(function () {
    store.dispatch(resetToDefaultProject());
  });

  afterEach(function () {
    store.dispatch(resetToDefaultProject());
  });

  it("renders all windows after a clean 12-op beat plan", function () {
    const dawState = store.getState().daw;
    const insertId = dawState.mixer.inserts[0]?.id || "insert-1";
    const trackId = dawState.project.playlistTracks[0]?.id || "trk-1";

    const result = applyPlan([
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
    ]);

    expect(result.results.filter(function (r) { return r.status === "failed"; })).toEqual([]);
    renderAllWindows();
  });

  it("renders all windows after a warned plan with bad values", function () {
    const dawState = store.getState().daw;
    const trackId = dawState.project.playlistTracks[0]?.id || "trk-1";

    const result = applyPlan([
      { type: "add_channel", payload: { name: "Ghost" } },
      {
        type: "assign_plugin_to_channel",
        payload: { channelId: "$new", pluginRef: "not-a-real-plugin", pluginName: "Ghost Synth" },
      },
      {
        type: "assign_sample_to_channel",
        payload: {
          channelId: "$new",
          samplePath: "/packs/nowhere/missing-loop.wav",
          sampleName: "missing-loop",
        },
      },
      {
        type: "add_playlist_pattern_clip",
        payload: { patternId: "pat-does-not-exist", trackId, barStart: 0, barLength: 2 },
      },
      {
        type: "add_playlist_audio_clip",
        payload: {
          samplePath: "/packs/nowhere/missing-audio.wav",
          clipName: "missing-audio",
          trackId,
          barStart: 2,
          barLength: 2,
        },
      },
      {
        type: "add_sample_as_channel",
        payload: {
          samplePath: "/packs/nowhere/missing-as-channel.wav",
          clipName: "missing-as-channel",
          trackId,
          barStart: 4,
          barLength: 2,
        },
      },
      { type: "add_mixer_track", payload: {} },
      { type: "set_insert_fader", payload: { insertId: "insert-nope", value: 0.5 } },
      {
        type: "set_fx_slot_effect",
        payload: { insertId: "insert-nope", slotId: "slot-1", effectType: "reverb" },
      },
      {
        type: "set_fx_reverb_param",
        payload: { insertId: "insert-nope", slotId: "slot-1", param: "decay", value: 0.7 },
      },
      {
        type: "set_fx_graphic_eq_band_gain",
        payload: { insertId: "insert-nope", slotId: "slot-1", bandIndex: 3, gainDb: 4 },
      },
      { type: "set_channel_mixer_insert", payload: { channelId: "$new", insertId: "insert-nope" } },
      { type: "rename_pattern", payload: { name: "Renamed" } },
      { type: "set_pattern_length", payload: { lengthSteps: 64 } },
      { type: "set_channel_input_mode", payload: { channelId: "$new", mode: "piano" } },
    ]);

    // The point is the render, not the per-op outcomes — but record them.
    expect(result.results.length).toBe(15);
    renderAllWindows();
  });
});
