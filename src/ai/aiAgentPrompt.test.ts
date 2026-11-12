import { describe, expect, it } from "vitest";
import {
  AI_AGENT_OPERATION_TYPES,
  getAiAgentSystemPrompt,
} from "./aiAgentPrompt";

describe("getAiAgentSystemPrompt", function () {
  it("teaches full production: arrangement, mix, and master — not just notes", function () {
    const prompt = getAiAgentSystemPrompt();
    expect(prompt).toContain("FULL PRODUCTION");
    expect(prompt).toContain("LOW INTRO");
    expect(prompt).toContain("LOW OUTRO");
    expect(prompt).toContain("set_channel_volume");
    expect(prompt).toContain("set_channel_pan");
    expect(prompt).toContain("isMaster");
    expect(prompt).toContain("maximizer");
    expect(prompt).toContain("graphic EQ");
  });

  it("distinguishes playable instruments from mixer effects", function () {
    const prompt = getAiAgentSystemPrompt();
    expect(prompt).toContain("availableInstruments");
    expect(prompt).toContain("availableEffects");
    expect(prompt).toContain("assign_plugin_to_channel");
    expect(prompt).toContain("set_fx_slot_effect");
  });

  it("keeps reverb off the master insert", function () {
    const prompt = getAiAgentSystemPrompt();
    expect(prompt).toContain("NOT ON THE MASTER");
  });

  it("teaches pack loops as song material with BPM and key matching", function () {
    const prompt = getAiAgentSystemPrompt();
    expect(prompt).toContain("PACK LOOPS");
    expect(prompt).toContain("add_playlist_audio_clip");
    expect(prompt).toContain("set_bpm to the loop's BPM");
    expect(prompt).toContain("never claim to retune a sample");
    expect(prompt).toContain("name the packs you used");
  });

  it("teaches attached files, conversation mode, and memory", function () {
    const prompt = getAiAgentSystemPrompt();
    expect(prompt).toContain("ATTACHED FILES");
    expect(prompt).toContain("Attachments");
    expect(prompt).toContain("Never claim to run VST or AU plugin files");
    expect(prompt).toContain("CONVERSATION MODE");
    expect(prompt).toContain("empty operations array");
    expect(prompt).toContain("ONE clarifying question");
    expect(prompt).toContain("MEMORY");
    expect(prompt).toContain('"memory"');
    expect(prompt).toContain('"brief"');
  });

  it("still returns the JSON shape and the full operation list", function () {
    const prompt = getAiAgentSystemPrompt();
    expect(prompt).toContain('{"message": string, "operations"');
    expect(AI_AGENT_OPERATION_TYPES).toContain("set_fx_slot_effect");
    expect(AI_AGENT_OPERATION_TYPES).toContain("set_fx_reverb_param");
    expect(AI_AGENT_OPERATION_TYPES).toContain("set_fx_maximizer_param");
    expect(AI_AGENT_OPERATION_TYPES).toContain("set_fx_graphic_eq_band_gain");
    expect(AI_AGENT_OPERATION_TYPES).toContain("set_insert_fader");
    expect(AI_AGENT_OPERATION_TYPES).toContain("assign_plugin_to_channel");
  });
});
