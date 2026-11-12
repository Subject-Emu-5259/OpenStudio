import { AI_AGENT_DEFAULT_MODEL, getAiAgentSystemPrompt } from "./aiAgentPrompt";
import { AI_AGENT_PROVIDER_OPENROUTER } from "./aiProviders";
import type { AiPlanStreamOptions } from "./aiClient";
import {
  parseAiPlanJson,
  parseConversationBrief,
  parseMemoryProposals,
} from "./aiPlanJson";
import type { AiAgentPlan, AiChatMessage, AiPlanRequest, AiProviderId } from "../types/ai"

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

// OpenRouter identifies calling apps via these headers (recommended by
// their docs for rankings/attribution). Header names are case-insensitive;
// lowercase matches the rest of this client's headers.
const OPENROUTER_REFERER = "https://openstudio.wasmer.app";
const OPENROUTER_TITLE = "OpenStudio";

/**
 * Normalizes a user-supplied OpenAI-compatible base URL. Accepts the base
 * itself (http://localhost:1234/v1), the same URL with a trailing slash,
 * or the full chat-completions URL pasted by mistake, and always returns
 * the bare base. Falls back to the official OpenAI API when blank.
 */
export function resolveOpenAiBaseUrl(baseUrl: unknown): string {
  const raw = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!raw) {
    return DEFAULT_OPENAI_BASE_URL;
  }
  if (raw.endsWith("/chat/completions")) {
    return raw.slice(0, -"/chat/completions".length) || DEFAULT_OPENAI_BASE_URL;
  }
  return raw;
}

function isCustomOpenAiBaseUrl(baseUrl: string): boolean {
  return baseUrl !== DEFAULT_OPENAI_BASE_URL;
}

function isOpenRouterRequest(provider: unknown, baseUrl: string): boolean {
  return provider === AI_AGENT_PROVIDER_OPENROUTER || baseUrl.includes("openrouter.ai");
}

function buildOpenAiHeaders(safeApiKey: string, isOpenRouter = false): Record<string, string> {
  // Local OpenAI-compatible servers often need no key at all.
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (safeApiKey) {
    headers.authorization = "Bearer " + safeApiKey;
  }
  if (isOpenRouter) {
    headers["http-referer"] = OPENROUTER_REFERER;
    headers["x-title"] = OPENROUTER_TITLE;
  }
  return headers;
}

interface OpenAiErrorResponse {
  error?: { message?: string }
}

interface OpenAiCompletionResponse extends OpenAiErrorResponse {
  choices?: Array<{ message?: { content?: string } }>
}

interface OpenAiModelResponse extends OpenAiErrorResponse {
  id?: string
}

interface ParsedAiPlan {
  message?: unknown
  operations?: unknown
  memory?: unknown
  brief?: unknown
}

function parseAiJsonContent(content: unknown): ParsedAiPlan {
  return parseAiPlanJson(content) as ParsedAiPlan;
}

// Streaming: slow providers (Optra at ~8 tokens/s) cannot finish a full
// plan inside Cloudflare's 120s proxy read timeout — the request dies
// with a 524 before the first byte arrives. With stream: true, tokens
// flow continuously, so the read timeout never fires however long the
// generation takes. The stream is accumulated into the same text the
// non-streaming path used to return, so everything downstream (JSON
// parse, repair, validation) is unchanged.
//
// onDelta receives the full accumulated text so far after every delta,
// so the UI can show the plan arriving instead of a bare spinner.
// Aborting the request's signal rejects the reader with an AbortError,
// which propagates to the caller untouched.
async function readStreamedContent(
  response: Response,
  onDelta?: (partialText: string) => void,
): Promise<string> {
  const body = response.body;
  if (!body) {
    // No stream available (should not happen in a browser): fall back
    // to the whole body as one JSON completion.
    const content = contentFromCompletionJson(await response.text());
    onDelta?.(content);
    return content;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let raw = "";
  let sawDataLine = false;
  let finished = false;
  while (!finished) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    raw += chunk;
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.startsWith("data:")) {
        sawDataLine = true;
        const data = line.slice("data:".length).trim();
        if (data === "[DONE]") {
          finished = true;
          break;
        }
        content += deltaFromEvent(data);
        onDelta?.(content);
      }
      newline = buffer.indexOf("\n");
    }
  }
  // Flush the decoder, then a trailing partial line (no newline before
  // the stream ended).
  buffer += decoder.decode();
  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    sawDataLine = true;
    const data = tail.slice("data:".length).trim();
    if (data !== "[DONE]") {
      content += deltaFromEvent(data);
      onDelta?.(content);
    }
  }
  if (sawDataLine) {
    return content;
  }
  // The server ignored stream: true and returned one JSON completion.
  const completed = contentFromCompletionJson(raw);
  onDelta?.(completed);
  return completed;
}

// One SSE event's text delta. A malformed fragment contributes nothing;
// an error event throws with the provider's message.
function deltaFromEvent(data: string): string {
  let event: {
    choices?: Array<{ delta?: { content?: string } }>
    error?: { message?: string }
  };
  try {
    event = JSON.parse(data);
  } catch {
    return "";
  }
  if (event?.error?.message) {
    throw new Error(event.error.message);
  }
  const delta = event?.choices?.[0]?.delta?.content;
  return typeof delta === "string" ? delta : "";
}

/** Extracts choices[0].message.content from a non-streaming completion body. */
function contentFromCompletionJson(text: string): string {
  try {
    const parsed = JSON.parse(text) as OpenAiCompletionResponse;
    return parsed?.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

// The user payload is the request plus compact, optional context: only
// fields that actually have content are sent, so plain requests stay lean.
function buildUserPayload({
  userMessage,
  projectSummary,
  attachments,
  producerProfile,
  projectNotes,
  conversationBrief,
  pastProjects,
}: Pick<
  AiPlanRequest,
  | "userMessage"
  | "projectSummary"
  | "attachments"
  | "producerProfile"
  | "projectNotes"
  | "conversationBrief"
  | "pastProjects"
>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    request: userMessage,
    project: projectSummary,
  };
  if (attachments && attachments.length > 0) {
    payload.attachments = attachments;
  }
  if (producerProfile && producerProfile.length > 0) {
    payload.producerProfile = producerProfile;
  }
  if (projectNotes && projectNotes.trim()) {
    payload.projectNotes = projectNotes.trim();
  }
  if (conversationBrief && conversationBrief.trim()) {
    payload.conversationBrief = conversationBrief.trim();
  }
  if (pastProjects && pastProjects.length > 0) {
    payload.pastProjects = pastProjects;
  }
  return payload;
}

export async function requestAiAgentPlan(
  {
    apiKey,
    model,
    baseUrl,
    userMessage,
    projectSummary,
    conversationHistory = [],
    provider,
    attachments,
    producerProfile,
    projectNotes,
    conversationBrief,
    pastProjects,
  }: AiPlanRequest & { provider?: AiProviderId },
  streamOptions?: AiPlanStreamOptions,
): Promise<AiAgentPlan> {
  const safeApiKey = String(apiKey || "").trim();
  const safeMessage = String(userMessage || "").trim();
  const base = resolveOpenAiBaseUrl(baseUrl);
  const isCustom = isCustomOpenAiBaseUrl(base);
  const isOpenRouter = isOpenRouterRequest(provider, base);
  const safeModel = String(model || "").trim();

  if (!safeApiKey && !isCustom) {
    throw new Error("Paste your OpenAI API key before sending a message.");
  }

  if (isOpenRouter && !safeApiKey) {
    throw new Error("Paste your OpenRouter API key before sending a message.");
  }

  if (isCustom && !safeModel) {
    throw new Error("Enter a model name for this endpoint.");
  }

  if (!safeMessage) {
    throw new Error("Write a request for the AI Agent first.");
  }

  const resolvedModel = safeModel || AI_AGENT_DEFAULT_MODEL;

  // GPT-5.5 (and other reasoning models) reject custom temperature values,
  // only the default (1) is supported. Older GPT-5.4 variants still accept it.
  const supportsTemperature = !resolvedModel.startsWith("gpt-5.5");

  // Build the full message list: system prompt, prior conversation turns,
  // then the current user request with the live project summary. This gives
  // the model context from earlier in the chat (loaded from Supabase or
  // built up during the current session).
  const historyMessages: AiChatMessage[] = (Array.isArray(conversationHistory)
    ? conversationHistory
    : []
  )
    .filter(function (msg) {
      return msg && (msg.role === "user" || msg.role === "assistant") && msg.content;
    })
    .map(function (msg) {
      return { role: msg.role, content: msg.content };
    });

  const requestBody: {
    model: string
    response_format: { type: "json_object" }
    stream: true
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
    temperature?: number
  } = {
    model: resolvedModel,
    response_format: { type: "json_object" },
    stream: true,
    messages: [
      {
        role: "system",
        content: getAiAgentSystemPrompt(),
      },
      ...historyMessages,
      {
        role: "user",
        content: JSON.stringify(
          buildUserPayload({
            userMessage: safeMessage,
            projectSummary,
            attachments,
            producerProfile,
            projectNotes,
            conversationBrief,
            pastProjects,
          }),
        ),
      },
    ],
  };

  if (supportsTemperature) {
    requestBody.temperature = 0.35;
  }

  const response = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: buildOpenAiHeaders(safeApiKey, isOpenRouter),
    body: JSON.stringify(requestBody),
    signal: streamOptions?.signal,
  });

  // The error body is plain JSON, not a stream — read it before the
  // streaming path consumes the body.
  if (!response.ok) {
    const text = await response.text().catch(function () {
      return "";
    });
    // A cancel that lands while the error body is being read must
    // still surface as an abort, not as a failed request — the text
    // read above swallows the AbortError, so check the signal here.
    if (streamOptions?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    let message = "";
    try {
      message = (JSON.parse(text) as OpenAiErrorResponse)?.error?.message || "";
    } catch {
      message = "";
    }
    throw new Error(
      message
      || (isCustom ? "AI endpoint request failed with status " : "OpenAI request failed with status ") + response.status,
    );
  }

  const content = await readStreamedContent(response, streamOptions?.onDelta);
  const parsed = parseAiJsonContent(content);

  return {
    message: String(parsed?.message || "I prepared a project edit plan."),
    operations: Array.isArray(parsed?.operations) ? parsed.operations : [],
    memory: parseMemoryProposals(parsed?.memory),
    brief: parseConversationBrief(parsed?.brief),
  };
}

export async function testOpenAiConnection({
  apiKey,
  model,
  baseUrl,
  provider,
}: Pick<AiPlanRequest, "apiKey" | "model" | "baseUrl"> & { provider?: AiProviderId }): Promise<{ model: string }> {
  const safeApiKey = String(apiKey || "").trim();
  const base = resolveOpenAiBaseUrl(baseUrl);
  const isCustom = isCustomOpenAiBaseUrl(base);
  const isOpenRouter = isOpenRouterRequest(provider, base);
  const safeModel = String(model || "").trim();

  if (!safeApiKey && !isCustom) {
    throw new Error("Paste your OpenAI API key before testing the connection.");
  }

  if (isOpenRouter && !safeApiKey) {
    throw new Error("Paste your OpenRouter API key before testing the connection.");
  }

  if (isCustom && !safeModel) {
    throw new Error("Enter a model name for this endpoint.");
  }

  const resolvedModel = safeModel || AI_AGENT_DEFAULT_MODEL;
  const headers = buildOpenAiHeaders(safeApiKey, isOpenRouter);

  const response = await fetch(
    base + "/models/" + encodeURIComponent(resolvedModel),
    {
      method: "GET",
      headers,
    },
  );

  const result = await response.json().catch(function (): OpenAiModelResponse | null {
    return null
  }) as OpenAiModelResponse | null

  if (response.ok) {
    return {
      model: result?.id || resolvedModel,
    };
  }

  // Some OpenAI-compatible servers do not implement per-model lookup but
  // do serve the model list. Accept a healthy list response as connected.
  if (isCustom && response.status === 404) {
    const listResponse = await fetch(base + "/models", {
      method: "GET",
      headers,
    });
    if (listResponse.ok) {
      return { model: resolvedModel };
    }
  }

  throw new Error(
    result?.error?.message ||
    (isCustom ? "AI endpoint connection test failed with status " : "OpenAI connection test failed with status ") + response.status,
  );
}
