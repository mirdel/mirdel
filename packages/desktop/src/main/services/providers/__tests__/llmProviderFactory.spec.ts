import type { ProviderPublic } from "@shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createAnthropicMock,
  createGoogleGenerativeAIMock,
  createOpenAICompatibleMock,
  getAiDevToolsEnabledMock,
  tMainMock,
  wrapLanguageModelMock,
} = vi.hoisted(() => ({
  createAnthropicMock: vi.fn(),
  createGoogleGenerativeAIMock: vi.fn(),
  createOpenAICompatibleMock: vi.fn(),
  getAiDevToolsEnabledMock: vi.fn(),
  tMainMock: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
  wrapLanguageModelMock: vi.fn(),
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: createOpenAICompatibleMock,
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: createAnthropicMock,
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: createGoogleGenerativeAIMock,
}));

vi.mock("ai", () => ({
  wrapLanguageModel: wrapLanguageModelMock,
}));

vi.mock("../../settings/settingsData", () => ({
  getAiDevToolsEnabled: getAiDevToolsEnabledMock,
}));

vi.mock("../../network/proxyRuntime", () => ({
  proxyAwareFetch: "proxy-aware-fetch",
}));

vi.mock("../../../i18n", () => ({
  tMain: tMainMock,
}));

import { createLlmProvider, getEmbeddingModel, NATIVE_WEB_SEARCH_TOOLS_BODY_KEY } from "../llmProviderFactory";

function createProvider(overrides: Partial<ProviderPublic> = {}): ProviderPublic {
  return {
    id: "mock",
    name: "Mock Provider",
    type: "openai-compatible",
    baseUrl: "https://mock.test",
    enabled: true,
    isBuiltin: true,
    models: [],
    hasApiKey: true,
    apiKey: "secret-key",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("llmProviderFactory", () => {
  beforeEach(() => {
    createOpenAICompatibleMock.mockReturnValue(Object.assign(vi.fn(), { imageModel: vi.fn() }));
    createAnthropicMock.mockReturnValue(vi.fn());
    createGoogleGenerativeAIMock.mockReturnValue(vi.fn());
    getAiDevToolsEnabledMock.mockReturnValue(false);
    wrapLanguageModelMock.mockImplementation(({ model }) => model);
  });

  it("creates openai-compatible providers with transformed native search tools", () => {
    createLlmProvider(
      createProvider({
        customHeaders: {
          "X-Test": "1",
        },
      })
    );

    const config = createOpenAICompatibleMock.mock.calls[0]?.[0];
    expect(config).toEqual(
      expect.objectContaining({
        name: "mock",
        apiKey: "secret-key",
        baseURL: "https://mock.test",
        headers: { "X-Test": "1" },
        fetch: "proxy-aware-fetch",
        includeUsage: true,
      })
    );

    expect(
      config.transformRequestBody({
        [NATIVE_WEB_SEARCH_TOOLS_BODY_KEY]: [
          { type: "web_search_preview", search_context_size: "medium" },
          null,
          "invalid",
        ],
        tools: [{ type: "function", function: { name: "calc" } }],
      })
    ).toEqual({
      tools: [
        { type: "web_search_preview", search_context_size: "medium" },
        { type: "function", function: { name: "calc" } },
      ],
    });
  });

  it("creates anthropic and google providers with normalized base urls and headers", () => {
    createLlmProvider(
      createProvider({
        id: "anthropic",
        type: "anthropic",
        baseUrl: "",
        customHeaders: undefined,
      })
    );
    createLlmProvider(
      createProvider({
        id: "google",
        type: "google-generative-ai",
        baseUrl: "",
        customHeaders: undefined,
      })
    );

    expect(createAnthropicMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "secret-key",
        baseURL: undefined,
        headers: undefined,
        fetch: "proxy-aware-fetch",
      })
    );
    expect(createGoogleGenerativeAIMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "secret-key",
        baseURL: undefined,
        headers: undefined,
        fetch: "proxy-aware-fetch",
      })
    );
  });

  it("selects embedding adapters in priority order and rejects unsupported providers", () => {
    expect(
      getEmbeddingModel(
        {
          textEmbeddingModel: vi.fn((modelId: string) => ({ kind: "text", modelId })),
        } as any,
        "embed-text"
      )
    ).toEqual({ kind: "text", modelId: "embed-text" });

    expect(
      getEmbeddingModel(
        {
          embeddingModel: vi.fn((modelId: string) => ({ kind: "embeddingModel", modelId })),
        } as any,
        "embed-model"
      )
    ).toEqual({ kind: "embeddingModel", modelId: "embed-model" });

    expect(
      getEmbeddingModel(
        {
          embedding: vi.fn((modelId: string) => ({ kind: "embedding", modelId })),
        } as any,
        "embed"
      )
    ).toEqual({ kind: "embedding", modelId: "embed" });

    expect(() => getEmbeddingModel({} as any, "missing")).toThrow("embedding.providerUnsupported");
    expect(() =>
      createLlmProvider(
        createProvider({
          type: "unknown" as any,
        })
      )
    ).toThrow('provider.unsupportedType:{"providerType":"unknown"}');
  });
});
