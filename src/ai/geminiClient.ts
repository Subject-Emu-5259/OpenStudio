import { getAiAgentSystemPrompt } from "./aiAgentPrompt";
import { getAiProviderConfig, AI_AGENT_PROVIDER_GEMINI } from "./aiProviders";
import type { AiPlanStreamOptions } from "./aiClient";
import {
  parseAiPlanJson,
  parseConversationBrief,
  parseMemoryProposals,
} from "./aiPlanJson"
import type { AiAgentPlan, AiPlanRequest } from "../types/ai"

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiErrorResponse {
  error?: { message?: string }
}

interface GeminiGenerateResponse extends GeminiErrorResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

interface ParsedAiPlan {
  message?: unknown
  operations?: unknown
  memory?: unknown
  brief?: unknown
}

interface GeminiContent {
  role: "user" | "model"
  parts: Array<{ text: string }>
}

function parseAiJsonContent(content: unknown): ParsedAiPlan {
  return parseAiPlanJson(content) as ParsedAiPlan
}

// Same compact, optional-context rule as the OpenAI client: only fields
// with content are sent, so plain requests stay lean.
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

function buildGeminiContents({
  userMessage,
  projectSummary,
  conversationHistory,
  attachments,
  producerProfile,
  projectNotes,
  conversationBrief,
  pastProjects,
}: Pick<
  AiPlanRequest,
  | "userMessage"
  | "projectSummary"
  | "conversationHistory"
  | "attachments"
  | "producerProfile"
  | "projectNotes"
  | "conversationBrief"
  | "pastProjects"
>): GeminiContent[] {
  const historyContents: GeminiContent[] = (Array.isArray(conversationHistory)
    ? conversationHistory
    : []
  )
    .filter(function (msg) {
      return msg && (msg.role === "user" || msg.role === "assistant") && msg.content;
    })
    .map(function (msg) {
      return {
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: String(msg.content) }],
      };
    });

  return historyContents.concat({
    role: "user",
    parts: [
      {
        text: JSON.stringify(
          buildUserPayload({
            userMessage,
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
  });
}

function makeGeminiGenerateUrl(model: string, apiKey: string): string {
  return (
    GEMINI_API_BASE_URL +
    "/" +
    encodeURIComponent(model) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey)
  );
}

export async function requestGeminiAgentPlan(
  {
    apiKey,
    model,
    userMessage,
    projectSummary,
    conversationHistory = [],
    attachments,
    producerProfile,
    projectNotes,
    conversationBrief,
    pastProjects,
  }: AiPlanRequest,
  streamOptions?: AiPlanStreamOptions,
): Promise<AiAgentPlan> {
  const provider = getAiProviderConfig(AI_AGENT_PROVIDER_GEMINI);
  const safeApiKey = String(apiKey || "").trim();
  const safeMessage = String(userMessage || "").trim();
  const safeModel = String(model || provider.defaultModel).trim() || provider.defaultModel;

  if (!safeApiKey) {
    throw new Error("Paste your Gemini API key before sending a message.");
  }

  if (!safeMessage) {
    throw new Error("Write a request for the AI Agent first.");
  }

  const response = await fetch(makeGeminiGenerateUrl(safeModel, safeApiKey), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    signal: streamOptions?.signal,
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: getAiAgentSystemPrompt() }],
      },
      contents: buildGeminiContents({
        userMessage: safeMessage,
        projectSummary,
        conversationHistory,
        attachments,
        producerProfile,
        projectNotes,
        conversationBrief,
        pastProjects,
      }),
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  const result = await response.json().catch(function (): GeminiGenerateResponse | null {
    return null
  }) as GeminiGenerateResponse | null

  if (!response.ok) {
    // Same cancel-during-read rule as the OpenAI client: a signal
    // that fired while the body was being read is an abort, not a
    // failed request.
    if (streamOptions?.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    throw new Error(
      result?.error?.message ||
      "Gemini request failed with status " + response.status,
    );
  }

  const content = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  // Gemini is non-streaming, so there is only one "delta": the whole
  // plan text, delivered at once. Firing it keeps the controller's
  // streaming interface uniform across providers.
  streamOptions?.onDelta?.(content || "");
  const parsed = parseAiJsonContent(content);

  return {
    message: String(parsed?.message || "I prepared a project edit plan."),
    operations: Array.isArray(parsed?.operations) ? parsed.operations : [],
    memory: parseMemoryProposals(parsed?.memory),
    brief: parseConversationBrief(parsed?.brief),
  };
}

export async function testGeminiConnection({
  apiKey,
  model,
}: Pick<AiPlanRequest, "apiKey" | "model">): Promise<{ model: string }> {
  const provider = getAiProviderConfig(AI_AGENT_PROVIDER_GEMINI);
  const safeApiKey = String(apiKey || "").trim();
  const safeModel = String(model || provider.defaultModel).trim() || provider.defaultModel;

  if (!safeApiKey) {
    throw new Error("Paste your Gemini API key before testing the connection.");
  }

  const response = await fetch(makeGeminiGenerateUrl(safeModel, safeApiKey), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: "Return {\"ok\":true} as JSON." }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });

  const result = await response.json().catch(function (): GeminiErrorResponse | null {
    return null
  }) as GeminiErrorResponse | null

  if (!response.ok) {
    throw new Error(
      result?.error?.message ||
      "Gemini connection test failed with status " + response.status,
    );
  }

  return { model: safeModel };
}
