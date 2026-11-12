import { describe, expect, it } from "vitest";
import {
  AI_AGENT_PROVIDERS,
  getAiProviderConfig,
  getAiProviderModel,
} from "./aiProviders";

describe("openrouter provider", function () {
  it("is listed with the OpenRouter preset endpoint", function () {
    const config = getAiProviderConfig("openrouter");
    expect(config.label).toBe("OpenRouter");
    expect(config.defaultEndpoint).toBe("https://openrouter.ai/api/v1");
    expect(config.endpointStorage).toBe("openstudio.ai.endpoints.openrouter");
    expect(config.keyStorage).toBe("openstudio.ai.keys.openrouter");
  });

  it("accepts any model id as typed (free-text models)", function () {
    expect(getAiProviderModel("openrouter", "anthropic/claude-sonnet-4")).toBe("anthropic/claude-sonnet-4");
    expect(getAiProviderModel("openrouter", "")).toBe("");
  });

  it("falls back to the default provider for unknown ids", function () {
    expect(getAiProviderConfig("neuralai").id).toBe("openai");
  });

  it("keeps the provider order", function () {
    expect(AI_AGENT_PROVIDERS.map(function (provider) {
      return provider.id;
    })).toEqual(["openai", "gemini", "openai-compatible", "openrouter"]);
  });
});
