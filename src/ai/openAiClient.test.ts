import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAiAgentPlan, testOpenAiConnection } from "./openAiClient";
import type { AiProjectSummary } from "../types/ai";

interface OpenAiRequestBody {
  temperature?: number
  stream?: boolean
  messages: Array<{ role: string; content: string }>
}

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function createProjectSummary<T extends Record<string, unknown>>(
  summary: T,
): T & AiProjectSummary {
  return summary as T & AiProjectSummary;
}

function getSentBody(call: Parameters<typeof fetch> | undefined): OpenAiRequestBody {
  const body = call?.[1]?.body;
  if (typeof body !== "string") {
    throw new Error("Expected a JSON request body.");
  }
  return JSON.parse(body) as OpenAiRequestBody;
}

describe("openAiClient", function () {
  afterEach(function () {
    vi.restoreAllMocks();
  });

  it("parses JSON chat completion responses", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "Plan ready",
                operations: [{ type: "create_pattern", payload: {} }],
              }),
            },
          },
        ],
      }),
    );

    const result = await requestAiAgentPlan({
      apiKey: "sk-test",
      model: "gpt-5.5",
      userMessage: "create pattern",
      projectSummary: createProjectSummary({ patterns: [] }),
    });

    expect(result.message).toBe("Plan ready");
    expect(result.operations).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // GPT-5.5 must not send temperature (only default 1 is supported)
    const sentBody = getSentBody(fetchMock.mock.calls[0]);
    expect(sentBody).not.toHaveProperty("temperature");
  });

  it("sends temperature for models that support it", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ message: "ok", operations: [] }),
            },
          },
        ],
      }),
    );

    await requestAiAgentPlan({
      apiKey: "sk-test",
      model: "gpt-5.4",
      userMessage: "hi",
      projectSummary: createProjectSummary({}),
    });

    const sentBody = getSentBody(fetchMock.mock.calls[0]);
    expect(sentBody.temperature).toBe(0.35);
  });

  it("sends stream: true and accumulates a streamed SSE response", async function () {
    const plan = JSON.stringify({
      message: "Streamed plan",
      operations: [{ type: "set_bpm", payload: { bpm: 140 } }],
    });
    // The plan JSON split across two SSE data events, then [DONE].
    const sse =
      "data: "
      + JSON.stringify({ choices: [{ delta: { content: plan.slice(0, 20) } }] })
      + "\n\n"
      + "data: "
      + JSON.stringify({ choices: [{ delta: { content: plan.slice(20) } }] })
      + "\n\n"
      + "data: [DONE]\n\n";
    // Enqueue in tiny pieces so lines split across reads.
    const stream = new ReadableStream({
      start: function (controller) {
        const encoder = new TextEncoder();
        for (let i = 0; i < sse.length; i += 7) {
          controller.enqueue(encoder.encode(sse.slice(i, i + 7)));
        }
        controller.close();
      },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const result = await requestAiAgentPlan({
      apiKey: "k",
      model: "optra-coder",
      baseUrl: "https://api.optracloud.com/v1",
      userMessage: "set the BPM to 140",
      projectSummary: createProjectSummary({ patterns: [] }),
    });

    expect(result.message).toBe("Streamed plan");
    expect(result.operations).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sentBody = getSentBody(fetchMock.mock.calls[0]);
    expect(sentBody.stream).toBe(true);
  });

  it("reports growing partial text through onDelta during a stream", async function () {
    const plan = JSON.stringify({
      message: "Streamed plan",
      operations: [{ type: "set_bpm", payload: { bpm: 140 } }],
    });
    const parts = [plan.slice(0, 10), plan.slice(10, 25), plan.slice(25)];
    const sse = parts
      .map(function (part) {
        return (
          "data: "
          + JSON.stringify({ choices: [{ delta: { content: part } }] })
          + "\n\n"
        );
      })
      .join("")
      + "data: [DONE]\n\n";
    const stream = new ReadableStream({
      start: function (controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const seen: string[] = [];
    const result = await requestAiAgentPlan(
      {
        apiKey: "k",
        model: "optra-coder",
        baseUrl: "https://api.optracloud.com/v1",
        userMessage: "set the BPM to 140",
        projectSummary: createProjectSummary({ patterns: [] }),
      },
      {
        onDelta: function (partial) {
          seen.push(partial);
        },
      },
    );

    expect(result.message).toBe("Streamed plan");
    expect(result.operations).toHaveLength(1);
    // Each delta reports the full text so far, growing to the whole plan.
    expect(seen).toHaveLength(parts.length);
    expect(seen[0]).toBe(parts[0]);
    expect(seen[1]).toBe(parts[0] + parts[1]);
    expect(seen[seen.length - 1]).toBe(plan);
  });

  it("passes the abort signal to fetch and rejects with AbortError when cancelled", async function () {
    const controller = new AbortController();
    // A stream that yields one chunk and then hangs: the abort must end it.
    const stream = new ReadableStream({
      start: function (streamController) {
        const encoder = new TextEncoder();
        const sse =
          "data: "
          + JSON.stringify({ choices: [{ delta: { content: '{"message": "hi"' } }] })
          + "\n\n";
        streamController.enqueue(encoder.encode(sse));
        // When the user cancels, fail the stream so the reader's pending
        // read rejects with the AbortError (what a real fetch does when
        // its signal fires mid-stream).
        controller.signal.addEventListener("abort", function () {
          streamController.error(
            new DOMException("The operation was aborted.", "AbortError"),
          );
        });
      },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const seen: string[] = [];
    const pending = requestAiAgentPlan(
      {
        apiKey: "k",
        model: "optra-coder",
        baseUrl: "https://api.optracloud.com/v1",
        userMessage: "set the BPM to 140",
        projectSummary: createProjectSummary({ patterns: [] }),
      },
      {
        signal: controller.signal,
        onDelta: function (partial) {
          seen.push(partial);
        },
      },
    );
    // Let the first chunk arrive, then cancel mid-stream.
    await new Promise(function (resolve) {
      setTimeout(resolve, 10);
    });
    controller.abort();
    let caught: unknown;
    try {
      await pending;
    } catch (error) {
      caught = error;
    }
    expect((caught as { name?: string })?.name).toBe("AbortError");
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
    // The first chunk arrived before the cancel.
    expect(seen).toEqual(['{"message": "hi"']);
  });

  it("tests model access through the models endpoint", async function () {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({ id: "gpt-5.5" }),
    );

    const result = await testOpenAiConnection({
      apiKey: "sk-test",
      model: "gpt-5.5",
    });

    expect(result.model).toBe("gpt-5.5");
  });

  it("includes conversation history in the messages array", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ message: "ok", operations: [] }),
            },
          },
        ],
      }),
    );

    await requestAiAgentPlan({
      apiKey: "sk-test",
      model: "gpt-5.4",
      userMessage: "add a snare",
      projectSummary: createProjectSummary({}),
      conversationHistory: [
        { role: "user", content: "create a trap beat" },
        { role: "assistant", content: "I created a pattern with kick and hats." },
      ],
    });

    const sentBody = getSentBody(fetchMock.mock.calls[0]);
    expect(sentBody.messages).toHaveLength(4);
    expect(sentBody.messages[0]?.role).toBe("system");
    expect(sentBody.messages[1]).toEqual({
      role: "user",
      content: "create a trap beat",
    });
    expect(sentBody.messages[2]?.role).toBe("assistant");
    expect(sentBody.messages[3]?.role).toBe("user");
  });

  it("works without conversation history (empty array default)", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ message: "ok", operations: [] }),
            },
          },
        ],
      }),
    );

    await requestAiAgentPlan({
      apiKey: "sk-test",
      model: "gpt-5.4",
      userMessage: "hi",
      projectSummary: createProjectSummary({}),
    });

    const sentBody = getSentBody(fetchMock.mock.calls[0]);
    expect(sentBody.messages).toHaveLength(2);
    expect(sentBody.messages[0]?.role).toBe("system");
    expect(sentBody.messages[1]?.role).toBe("user");
  });

  it("filters out system-role messages from conversation history", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ message: "ok", operations: [] }),
            },
          },
        ],
      }),
    );

    await requestAiAgentPlan({
      apiKey: "sk-test",
      model: "gpt-5.4",
      userMessage: "hi",
      projectSummary: createProjectSummary({}),
      conversationHistory: [
        { role: "user", content: "create a beat" },
        { role: "system", content: "Applied 2 operations." },
      ],
    });

    const sentBody = getSentBody(fetchMock.mock.calls[0]);
    // system prompt + 1 history (user only) + current user message = 3
    expect(sentBody.messages).toHaveLength(3);
    expect(sentBody.messages[1]).toEqual({
      role: "user",
      content: "create a beat",
    });
  });

  it("posts to a custom OpenAI-compatible endpoint without requiring a key", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ message: "ok", operations: [] }),
            },
          },
        ],
      }),
    );

    await requestAiAgentPlan({
      apiKey: "",
      model: "llama-3.1-8b",
      baseUrl: "http://localhost:1234/v1",
      userMessage: "hi",
      projectSummary: createProjectSummary({}),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:1234/v1/chat/completions",
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("authorization");
  });

  it("normalizes a custom base URL with trailing slash or full chat URL", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ message: "ok", operations: [] }),
            },
          },
        ],
      }),
    );

    await requestAiAgentPlan({
      apiKey: "key",
      model: "mistral-7b",
      baseUrl: "http://localhost:1234/v1/chat/completions/",
      userMessage: "hi",
      projectSummary: createProjectSummary({}),
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:1234/v1/chat/completions",
    );
  });

  it("requires a model name for custom endpoints", async function () {
    await expect(
      requestAiAgentPlan({
        apiKey: "",
        model: "",
        baseUrl: "http://localhost:1234/v1",
        userMessage: "hi",
        projectSummary: createProjectSummary({}),
      }),
    ).rejects.toThrow("Enter a model name for this endpoint.");
  });

  it("falls back to the model list when a custom endpoint lacks per-model lookup", async function () {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 }),
      )
      .mockResolvedValueOnce(createJsonResponse({ data: [{ id: "llama-3.1-8b" }] }));

    const result = await testOpenAiConnection({
      apiKey: "",
      model: "llama-3.1-8b",
      baseUrl: "http://localhost:1234/v1",
    });

    expect(result.model).toBe("llama-3.1-8b");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://localhost:1234/v1/models");
  });
});

describe("openAiClient with OpenRouter", function () {
  afterEach(function () {
    vi.restoreAllMocks();
  });

  it("requires an API key for OpenRouter plan requests", async function () {
    await expect(
      requestAiAgentPlan({
        provider: "openrouter",
        apiKey: "",
        model: "anthropic/claude-sonnet-4",
        baseUrl: "https://openrouter.ai/api/v1",
        userMessage: "hi",
        projectSummary: createProjectSummary({}),
      }),
    ).rejects.toThrow("Paste your OpenRouter API key before sending a message.");
  });

  it("sends OpenRouter referral headers on plan requests", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ message: "ok", operations: [] }),
            },
          },
        ],
      }),
    );

    await requestAiAgentPlan({
      provider: "openrouter",
      apiKey: "sk-or-test",
      model: "anthropic/claude-sonnet-4",
      baseUrl: "https://openrouter.ai/api/v1",
      userMessage: "hi",
      projectSummary: createProjectSummary({}),
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-or-test");
    expect(headers["http-referer"]).toBe("https://openstudio.wasmer.app");
    expect(headers["x-title"]).toBe("OpenStudio");
  });

  it("requires an API key for OpenRouter connection tests", async function () {
    await expect(
      testOpenAiConnection({
        provider: "openrouter",
        apiKey: "",
        model: "anthropic/claude-sonnet-4",
        baseUrl: "https://openrouter.ai/api/v1",
      }),
    ).rejects.toThrow("Paste your OpenRouter API key before testing the connection.");
  });
});

describe("openAiClient attachments and memory payload", function () {
  afterEach(function () {
    vi.restoreAllMocks();
  });

  it("includes attachments, profile, notes, brief, and past projects when provided", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "Using your loop.",
                operations: [],
                memory: ["likes SHOOTER drums"],
                brief: "Trap session in C minor.",
              }),
            },
          },
        ],
      }),
    );

    const result = await requestAiAgentPlan({
      apiKey: "test-key",
      model: "gpt-5.5",
      userMessage: "use this loop",
      projectSummary: createProjectSummary({ patterns: [] }),
      attachments: [
        { name: "loop.wav", kind: "audio", samplePath: "blob:test/1" },
      ],
      producerProfile: ["likes SHOOTER drums"],
      projectNotes: "Dark trap, 140 BPM",
      conversationBrief: "Earlier session.",
      pastProjects: ["Crown"],
    });

    expect(result.message).toBe("Using your loop.");
    expect(result.operations).toEqual([]);
    expect(result.memory).toEqual(["likes SHOOTER drums"]);
    expect(result.brief).toBe("Trap session in C minor.");

    const sentBody = getSentBody(fetchMock.mock.calls[0]);
    const userContent = JSON.parse(
      sentBody.messages[sentBody.messages.length - 1]?.content || "{}",
    );
    expect(userContent.attachments).toEqual([
      { name: "loop.wav", kind: "audio", samplePath: "blob:test/1" },
    ]);
    expect(userContent.producerProfile).toEqual(["likes SHOOTER drums"]);
    expect(userContent.projectNotes).toBe("Dark trap, 140 BPM");
    expect(userContent.conversationBrief).toBe("Earlier session.");
    expect(userContent.pastProjects).toEqual(["Crown"]);
  });

  it("omits empty optional context from the payload", async function () {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ message: "hi", operations: [] }),
            },
          },
        ],
      }),
    );

    await requestAiAgentPlan({
      apiKey: "test-key",
      model: "gpt-5.5",
      userMessage: "hi",
      projectSummary: createProjectSummary({ patterns: [] }),
    });

    const sentBody = getSentBody(fetchMock.mock.calls[0]);
    const userContent = JSON.parse(
      sentBody.messages[sentBody.messages.length - 1]?.content || "{}",
    );
    expect(userContent).not.toHaveProperty("attachments");
    expect(userContent).not.toHaveProperty("producerProfile");
    expect(userContent).not.toHaveProperty("projectNotes");
    expect(userContent).not.toHaveProperty("conversationBrief");
    expect(userContent).not.toHaveProperty("pastProjects");
  });
});
