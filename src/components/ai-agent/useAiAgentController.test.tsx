import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { userReducer } from "../../store/userSlice";
import { useAiAgentController } from "./useAiAgentController";
import type { AiProjectSummary } from "../../types/ai";

// The send path is tested end to end through the real plan client and
// the real repair loop, with only the surroundings mocked: the sample
// index, the project summary, the cloud APIs, the attachment store,
// and the Redux store module (the hook only uses loadProjectFromFile
// for undo). fetch is spied on per test so the SSE stream can hang
// (cancel test) or complete (success test).
vi.mock("../../ai/aiSampleIndex", function () {
  return {
    loadAiSampleIndex: vi.fn(async function () {
      return [];
    }),
    searchAiSamples: vi.fn(function () {
      return [];
    }),
  };
});

vi.mock("../../ai/aiProjectSummary", function () {
  return {
    buildAiProjectSummary: vi.fn(function () {
      return {};
    }),
  };
});

vi.mock("../../lib/aiConversationsApi", function () {
  return {
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    fetchConversations: vi.fn(async function () {
      return [];
    }),
    loadConversation: vi.fn(async function () {
      return null;
    }),
    updateConversation: vi.fn(),
  };
});

vi.mock("../../lib/projectApi", function () {
  return {
    fetchProjects: vi.fn(async function () {
      return [];
    }),
  };
});

vi.mock("../../ai/aiAttachmentStore", function () {
  return {
    AiAttachmentStore: class AiAttachmentStore {
      async getAll(): Promise<unknown[]> {
        return [];
      }

      async put(): Promise<void> {
        return;
      }

      async remove(): Promise<void> {
        return;
      }
    },
  };
});

vi.mock("../../store", function () {
  return {
    loadProjectFromFile: vi.fn(),
  };
});

function createWrapper() {
  const store = configureStore({
    reducer: {
      user: userReducer,
      daw: function (state: Record<string, unknown> = {}) {
        return state;
      },
    },
    preloadedState: {
      user: { currentUser: null, isLoading: false, error: null },
      daw: {},
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

function createSseResponse(body: string): Response {
  return new Response(
    new ReadableStream({
      start: function (controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    },
  );
}

function sseEvent(content: string): string {
  return (
    "data: "
    + JSON.stringify({ choices: [{ delta: { content } }] })
    + "\n\n"
  );
}

describe("useAiAgentController streaming", function () {
  beforeEach(function () {
    window.localStorage.clear();
  });

  afterEach(function () {
    vi.restoreAllMocks();
  });

  it("shows partial text and op count while streaming, then resets on cancel", async function () {
    // A stream that yields one chunk and then hangs: the cancel must
    // end it. The abort listener fails the stream the way a real fetch
    // does when its signal fires mid-stream.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async function (_url, init) {
        const signal = (init as { signal?: AbortSignal } | undefined)?.signal;
        return new Response(
          new ReadableStream({
            start: function (streamController) {
              streamController.enqueue(
                new TextEncoder().encode(
                  sseEvent('{"message": "ok", "operations": [{"type": "set_bpm"'),
                ),
              );
              signal?.addEventListener("abort", function () {
                streamController.error(
                  new DOMException("The operation was aborted.", "AbortError"),
                );
              });
            },
          }),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        );
      },
    );

    const { result } = renderHook(
      function () {
        return useAiAgentController();
      },
      { wrapper: createWrapper() },
    );

    act(function () {
      result.current.setApiKey("sk-test");
      result.current.setInput("set the BPM to 140");
    });
    act(function () {
      void result.current.sendMessage();
    });

    // The first chunk arrived: partial text and the op count are live.
    await waitFor(function () {
      expect(result.current.isSending).toBe(true);
      expect(result.current.streamingText).toContain('"type": "set_bpm"');
    });
    expect(result.current.streamingStartedAt).toBeTypeOf("number");
    expect(result.current.streamingOpCount).toBe(1);

    act(function () {
      result.current.cancelSend();
    });

    await waitFor(function () {
      expect(result.current.isSending).toBe(false);
    });
    expect(result.current.streamingText).toBe("");
    expect(result.current.streamingStartedAt).toBeNull();
    expect(result.current.streamingOpCount).toBe(0);
    // A cancel is not a failure: no error banner, no "could not
    // prepare a plan" reply — just a note that the send stopped.
    expect(result.current.error).toBe("");
    expect(result.current.messages).toEqual([
      { role: "user", content: "set the BPM to 140" },
      { role: "system", content: "Request cancelled." },
    ]);
  });

  it("clears streaming state when a send completes", async function () {
    const plan = JSON.stringify({
      message: "Plan ready",
      operations: [{ type: "set_bpm", payload: { bpm: 140 } }],
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createSseResponse(sseEvent(plan) + "data: [DONE]\n\n"),
    );

    const { result } = renderHook(
      function () {
        return useAiAgentController();
      },
      { wrapper: createWrapper() },
    );

    act(function () {
      result.current.setApiKey("sk-test");
      result.current.setInput("set the BPM to 140");
    });
    act(function () {
      void result.current.sendMessage();
    });

    await waitFor(function () {
      expect(result.current.isSending).toBe(false);
      expect(result.current.pendingOperations).toHaveLength(1);
    });
    expect(result.current.streamingText).toBe("");
    expect(result.current.streamingStartedAt).toBeNull();
    expect(result.current.streamingOpCount).toBe(0);
    expect(result.current.pendingOperations[0]?.type).toBe("set_bpm");
    expect(result.current.messages).toEqual([
      { role: "user", content: "set the BPM to 140" },
      { role: "assistant", content: "Plan ready" },
    ]);
  });
});
