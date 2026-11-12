import {
  requestAiAgentPlan as requestOpenAiAgentPlan,
  testOpenAiConnection,
} from "./openAiClient";
import { requestGeminiAgentPlan, testGeminiConnection } from "./geminiClient";
import {
  AI_AGENT_PROVIDER_GEMINI,
  getAiProviderConfig,
} from "./aiProviders";
import type { AiAgentPlan, AiPlanRequest, AiProviderId } from "../types/ai"

// Options for watching (and stopping) a plan request while it runs.
// Slow providers stream for minutes; without these the user stares at
// a spinner with no idea whether anything is happening.
export interface AiPlanStreamOptions {
  // Called with the full accumulated plan text so far, each time new
  // content arrives. Streaming providers call it repeatedly; the
  // non-streaming Gemini path calls it once with the complete text.
  // A repair retry restarts the stream, so the callback receives ""
  // first to clear the previous attempt's partial text.
  onDelta?: (partialText: string) => void
  // AbortSignal for the in-flight request. Aborting rejects the plan
  // request with an AbortError (see isAbortError); callers treat that
  // as a user cancel, not a failure.
  signal?: AbortSignal
}

// fetch (and the SSE reader) reject with a DOMException named
// "AbortError" when the signal fires. Name-checking is the portable
// test — the error class differs between browsers, Node, and jsdom.
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && (error as { name?: unknown }).name === "AbortError"
  );
}

export async function requestAiAgentPlan(
  {
    provider,
    ...params
  }: AiPlanRequest & { provider?: AiProviderId },
  streamOptions?: AiPlanStreamOptions,
): Promise<AiAgentPlan> {
  const config = getAiProviderConfig(provider);
  if (config.id === AI_AGENT_PROVIDER_GEMINI) {
    return requestGeminiAgentPlan(params, streamOptions);
  }
  return requestOpenAiAgentPlan(
    {
      ...params,
      provider: config.id,
    },
    streamOptions,
  );
}

export async function testAiConnection({
  provider,
  ...params
}: Pick<AiPlanRequest, "apiKey" | "model" | "baseUrl"> & { provider?: AiProviderId }): Promise<{ model: string }> {
  const config = getAiProviderConfig(provider);
  if (config.id === AI_AGENT_PROVIDER_GEMINI) {
    return testGeminiConnection(params);
  }
  return testOpenAiConnection({
    ...params,
    provider: config.id,
  });
}
