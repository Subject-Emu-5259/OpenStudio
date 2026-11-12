import { describe, expect, it, vi } from "vitest";
import {
  buildRepairMessage,
  requestPlanWithRepair,
} from "./aiPlanRepair";
import type { AiAgentPlan } from "../types/ai";

function createPlan(operations: AiAgentPlan["operations"]): AiAgentPlan {
  return { message: "plan", operations };
}

describe("buildRepairMessage", function () {
  it("lists rejected operations with their reasons and payloads", function () {
    const message = buildRepairMessage(
      [{ index: 0, reason: "Unsupported operation type: bogus_type" }],
      [{ type: "bogus_type", payload: { bpm: 120 } }],
    );
    expect(message).toContain("bogus_type");
    expect(message).toContain("Unsupported operation type");
    expect(message).toContain('"bpm":120');
  });
});

describe("requestPlanWithRepair", function () {
  it("repairs once and keeps the better result", async function () {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        createPlan([{ type: "bogus_type", payload: {} }]),
      )
      .mockResolvedValueOnce(
        createPlan([{ type: "set_bpm", payload: { bpm: 120 } }]),
      );
    const result = await requestPlanWithRepair({
      request,
      userMessage: "make it faster",
      dawState: {},
      availableSamples: [],
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.repaired).toBe(true);
    expect(result.rejected).toHaveLength(0);
    expect(result.validatedOperations).toHaveLength(1);
    expect(result.validatedOperations[0].type).toBe("set_bpm");
    // The repair message names the rejected operation.
    expect(String(request.mock.calls[1][0])).toContain("bogus_type");
  });

  it("keeps the first result when the repair is worse", async function () {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        createPlan([{ type: "bogus_type", payload: {} }]),
      )
      .mockResolvedValueOnce(
        createPlan([
          { type: "bogus_type", payload: {} },
          { type: "also_bogus", payload: {} },
        ]),
      );
    const result = await requestPlanWithRepair({
      request,
      userMessage: "make it faster",
      dawState: {},
      availableSamples: [],
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.repaired).toBe(false);
    expect(result.rejected).toHaveLength(1);
  });

  it("does not retry when nothing is rejected", async function () {
    const request = vi.fn().mockResolvedValueOnce(
      createPlan([{ type: "set_bpm", payload: { bpm: 120 } }]),
    );
    const result = await requestPlanWithRepair({
      request,
      userMessage: "make it faster",
      dawState: {},
      availableSamples: [],
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.repaired).toBe(false);
    expect(result.rejected).toHaveLength(0);
  });

  it("keeps the first result when the repair call throws", async function () {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        createPlan([{ type: "bogus_type", payload: {} }]),
      )
      .mockRejectedValueOnce(new Error("network down"));
    const result = await requestPlanWithRepair({
      request,
      userMessage: "make it faster",
      dawState: {},
      availableSamples: [],
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.repaired).toBe(false);
    expect(result.rejected).toHaveLength(1);
  });

  it("resets the partial text before the repair retry", async function () {
    const events: string[] = [];
    const onDelta = vi.fn(function (partial: string) {
      events.push(partial === "" ? "reset" : "delta:" + partial);
    });
    const request = vi
      .fn()
      .mockImplementationOnce(async function () {
        events.push("request-1");
        return createPlan([{ type: "bogus_type", payload: {} }]);
      })
      .mockImplementationOnce(async function () {
        events.push("request-2");
        return createPlan([{ type: "set_bpm", payload: { bpm: 120 } }]);
      });
    const result = await requestPlanWithRepair({
      request,
      userMessage: "make it faster",
      dawState: {},
      availableSamples: [],
      streamOptions: { onDelta },
    });
    expect(result.repaired).toBe(true);
    // The retry is a fresh stream: the reset fires between the two
    // requests, so the UI never splices two plans together.
    expect(events).toEqual(["request-1", "reset", "request-2"]);
    expect(onDelta).toHaveBeenCalledWith("");
  });

  it("rethrows a cancel during the repair retry instead of keeping the first result", async function () {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        createPlan([{ type: "bogus_type", payload: {} }]),
      )
      .mockRejectedValueOnce(
        new DOMException("The operation was aborted.", "AbortError"),
      );
    let caught: unknown;
    try {
      await requestPlanWithRepair({
        request,
        userMessage: "make it faster",
        dawState: {},
        availableSamples: [],
      });
    } catch (error) {
      caught = error;
    }
    // A swallowed cancel would stage the first plan as if nothing
    // happened; the abort must reach the caller.
    expect((caught as { name?: string })?.name).toBe("AbortError");
  });
});
