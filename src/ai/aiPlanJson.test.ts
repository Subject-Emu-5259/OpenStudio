import { describe, expect, it } from "vitest";
import {
  parseAiPlanJson,
  parseConversationBrief,
  parseMemoryProposals,
} from "./aiPlanJson";

describe("parseAiPlanJson", function () {
  it("parses clean JSON unchanged", function () {
    expect(
      parseAiPlanJson('{"message": "hi", "operations": []}'),
    ).toEqual({ message: "hi", operations: [] });
  });

  it("parses a fenced JSON block", function () {
    expect(
      parseAiPlanJson(
        '```json\n{"message": "hi", "operations": []}\n```',
      ),
    ).toEqual({ message: "hi", operations: [] });
  });

  it("parses JSON wrapped in prose", function () {
    expect(
      parseAiPlanJson(
        'Sure! Here is your plan:\n{"message": "hi", "operations": []}\nHope that helps!',
      ),
    ).toEqual({ message: "hi", operations: [] });
  });

  it("repairs trailing commas", function () {
    expect(
      parseAiPlanJson('{"message": "hi", "operations": [],}'),
    ).toEqual({ message: "hi", operations: [] });
    expect(
      parseAiPlanJson('{"operations": [{"type": "x",},],}'),
    ).toEqual({ operations: [{ type: "x" }] });
  });

  it("takes the first of two JSON objects", function () {
    expect(
      parseAiPlanJson(
        '{"message": "first", "operations": []} some note {"message": "second"}',
      ),
    ).toEqual({ message: "first", operations: [] });
  });

  it("does not trip on braces inside strings", function () {
    expect(
      parseAiPlanJson('Intro {"message": "a } brace { inside", "operations": []}'),
    ).toEqual({ message: "a } brace { inside", operations: [] });
  });

  it("throws the friendly error on garbage", function () {
    expect(function () {
      parseAiPlanJson("just some words, no json here");
    }).toThrow("AI response was not valid JSON.");
  });

  it("throws the friendly error on truncated JSON", function () {
    expect(function () {
      parseAiPlanJson('{"message": "hi", "operations": [');
    }).toThrow("AI response was not valid JSON.");
  });

  it("returns an empty plan for an empty response instead of throwing", function () {
    expect(parseAiPlanJson("   ")).toEqual({});
    expect(parseAiPlanJson("")).toEqual({});
  });

  it("keeps optional memory and brief fields when present", function () {
    expect(
      parseAiPlanJson(
        '{"message": "hi", "operations": [], "memory": ["likes 808s"], "brief": "Trap session."}',
      ),
    ).toEqual({
      message: "hi",
      operations: [],
      memory: ["likes 808s"],
      brief: "Trap session.",
    });
  });
});

describe("parseMemoryProposals", function () {
  it("keeps only non-empty strings, capped at 10", function () {
    expect(parseMemoryProposals([" likes 808s ", "", null, 42])).toEqual([
      "likes 808s",
      "42",
    ]);
    expect(
      parseMemoryProposals(
        Array.from({ length: 12 }, function (_, index) {
          return "fact " + index;
        }),
      ),
    ).toHaveLength(10);
  });

  it("returns [] for anything that is not an array", function () {
    expect(parseMemoryProposals("likes 808s")).toEqual([]);
    expect(parseMemoryProposals(null)).toEqual([]);
    expect(parseMemoryProposals(undefined)).toEqual([]);
  });
});

describe("parseConversationBrief", function () {
  it("trims and caps the brief", function () {
    expect(parseConversationBrief("  Trap session.  ")).toBe("Trap session.");
    expect(parseConversationBrief("x".repeat(1500))).toHaveLength(1000);
  });

  it("returns blank for missing or blank input", function () {
    expect(parseConversationBrief("")).toBe("");
    expect(parseConversationBrief(null)).toBe("");
    expect(parseConversationBrief(undefined)).toBe("");
  });
});
