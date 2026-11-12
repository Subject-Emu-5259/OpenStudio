import type { AiProviderConfig, AiProviderId } from "../types/ai"

export const AI_AGENT_PROVIDER_OPENAI: AiProviderId = "openai"
export const AI_AGENT_PROVIDER_GEMINI: AiProviderId = "gemini"
export const AI_AGENT_PROVIDER_OPENAI_COMPATIBLE: AiProviderId = "openai-compatible"
export const AI_AGENT_PROVIDER_OPENROUTER: AiProviderId = "openrouter"
export const AI_AGENT_DEFAULT_PROVIDER = AI_AGENT_PROVIDER_OPENAI;

export const AI_AGENT_PROVIDERS: readonly AiProviderConfig[] = [
  {
    id: AI_AGENT_PROVIDER_OPENAI,
    label: "OpenAI",
    defaultModel: "gpt-5.5",
    keyStorage: "openstudio.ai.keys.openai",
    modelStorage: "openstudio.ai.models.openai",
    keyPlaceholder: "sk-...",
    models: [
      { value: "gpt-5.5", label: "GPT-5.5" },
      { value: "gpt-5.4", label: "GPT-5.4" },
      { value: "gpt-5.4-mini", label: "GPT-5.4 mini" },
    ],
  },
  {
    id: AI_AGENT_PROVIDER_GEMINI,
    label: "Gemini",
    defaultModel: "gemini-3.5-flash",
    keyStorage: "openstudio.ai.keys.gemini",
    modelStorage: "openstudio.ai.models.gemini",
    keyPlaceholder: "AIza...",
    models: [
      { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
      { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
      { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
      { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
    ],
  },
  {
    id: AI_AGENT_PROVIDER_OPENAI_COMPATIBLE,
    label: "OpenAI Compatible",
    defaultModel: "",
    keyStorage: "openstudio.ai.keys.openai-compatible",
    modelStorage: "openstudio.ai.models.openai-compatible",
    endpointStorage: "openstudio.ai.endpoints.openai-compatible",
    keyPlaceholder: "API key (optional for local servers)",
    endpointPlaceholder: "http://localhost:1234/v1",
    // No fixed model list: any model the endpoint serves can be typed in.
    models: [],
  },
  {
    id: AI_AGENT_PROVIDER_OPENROUTER,
    label: "OpenRouter",
    defaultModel: "",
    keyStorage: "openstudio.ai.keys.openrouter",
    modelStorage: "openstudio.ai.models.openrouter",
    endpointStorage: "openstudio.ai.endpoints.openrouter",
    keyPlaceholder: "sk-or-... (OpenRouter API key)",
    endpointPlaceholder: "https://openrouter.ai/api/v1",
    // Preset to OpenRouter's OpenAI-compatible endpoint; the field stays
    // editable. A key is required (unlike local compatible servers).
    defaultEndpoint: "https://openrouter.ai/api/v1",
    // No fixed model list: any OpenRouter model id can be typed in
    // (for example anthropic/claude-sonnet-4 or a :free model).
    models: [],
  },
];

export function getAiProviderConfig(providerId: unknown): AiProviderConfig {
  const safeProviderId = String(providerId || "").trim();
  return AI_AGENT_PROVIDERS.find(function (provider) {
    return provider.id === safeProviderId;
  }) || AI_AGENT_PROVIDERS[0];
}

export function getAiProviderModel(providerId: unknown, model: unknown): string {
  const provider = getAiProviderConfig(providerId);
  const safeModel = String(model || "").trim();
  // Providers with no fixed model list accept any model name as typed.
  if (provider.models.length === 0) {
    return safeModel;
  }
  const hasModel = provider.models.some(function (item) {
    return item.value === safeModel;
  });
  return hasModel ? safeModel : provider.defaultModel;
}
