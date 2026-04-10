import type { ProviderPublic } from "@shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLlmProviderMock,
  generateTextMock,
  getProviderApiKeyMock,
  listProvidersMock,
  testOpenAICompatibleProviderMock,
  tMainMock,
} = vi.hoisted(() => ({
  createLlmProviderMock: vi.fn(),
  generateTextMock: vi.fn(),
  getProviderApiKeyMock: vi.fn(),
  listProvidersMock: vi.fn(),
  testOpenAICompatibleProviderMock: vi.fn(),
  tMainMock: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
}));

vi.mock("ai", () => ({
  generateText: generateTextMock,
}));

vi.mock("../providerData", () => ({
  getProviderApiKey: getProviderApiKeyMock,
  listProviders: listProvidersMock,
}));

vi.mock("../llmProviderFactory", () => ({
  createLlmProvider: createLlmProviderMock,
}));

vi.mock("../openaiCompatibleHealthCheck", () => ({
  testOpenAICompatibleProvider: testOpenAICompatibleProviderMock,
}));

vi.mock("../../../i18n", () => ({
  tMain: tMainMock,
}));

import { testProvider } from "../providerHealthCheck";

function createProvider(overrides: Partial<ProviderPublic> = {}): ProviderPublic {
  return {
    id: "mock",
    name: "Mock Provider",
    type: "openai-compatible",
    baseUrl: "https://mock.test",
    enabled: true,
    isBuiltin: true,
    models: [{ id: "general", modelType: "generative" as const }],
    hasApiKey: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("providerHealthCheck", () => {
  beforeEach(() => {
    listProvidersMock.mockReturnValue([createProvider()]);
    getProviderApiKeyMock.mockReturnValue("secret-key");
    createLlmProviderMock.mockReturnValue(vi.fn((modelId: string) => ({ modelId })));
    generateTextMock.mockResolvedValue({ text: "ok" });
    testOpenAICompatibleProviderMock.mockResolvedValue({ ok: true });
  });

  it("returns not found when the provider does not exist", async () => {
    listProvidersMock.mockReturnValue([]);

    await expect(testProvider("missing")).resolves.toEqual({
      ok: false,
      error: "provider.notFoundGeneric",
    });
  });

  it("rejects invalid openai-compatible configuration before issuing network checks", async () => {
    listProvidersMock.mockReturnValue([createProvider({ baseUrl: "   " })]);

    await expect(testProvider("mock")).resolves.toEqual({
      ok: false,
      error: "provider.baseUrlMissing",
    });

    listProvidersMock.mockReturnValue([createProvider()]);
    getProviderApiKeyMock.mockReturnValue("");

    await expect(testProvider("mock")).resolves.toEqual({
      ok: false,
      error: 'provider.apiKeyMissing:{"providerId":"mock"}',
    });
    expect(testOpenAICompatibleProviderMock).not.toHaveBeenCalled();
  });

  it("returns noModels when no generative model can be selected", async () => {
    listProvidersMock.mockReturnValue([
      createProvider({
        models: [],
      }),
    ]);

    await expect(testProvider("mock")).resolves.toEqual({
      ok: false,
      error: "provider.noModels",
    });

    listProvidersMock.mockReturnValue([
      createProvider({
        models: [{ id: "embed-1", modelType: "embedding" as const }],
      }),
    ]);

    await expect(testProvider("mock")).resolves.toEqual({
      ok: false,
      error: "provider.noModels",
    });
  });

  it("delegates openai-compatible health checks to the specialized probe", async () => {
    testOpenAICompatibleProviderMock.mockResolvedValue({
      ok: false,
      error: "HTTP 401: Unauthorized",
    });

    await expect(testProvider("mock")).resolves.toEqual({
      ok: false,
      error: "HTTP 401: Unauthorized",
    });
    expect(testOpenAICompatibleProviderMock).toHaveBeenCalledWith({
      providerId: "mock",
      baseUrl: "https://mock.test",
    });
  });

  it("uses the first generative model for anthropic and returns success when generateText works", async () => {
    const providerClient = vi.fn((modelId: string) => ({ provider: "anthropic", modelId }));
    listProvidersMock.mockReturnValue([
      createProvider({
        id: "anthropic",
        type: "anthropic",
        models: [
          { id: "embed-1", modelType: "embedding" as const },
          { id: "claude-3-5", modelType: "generative" as const },
        ],
      }),
    ]);
    createLlmProviderMock.mockReturnValue(providerClient);

    await expect(testProvider("anthropic")).resolves.toEqual({ ok: true });
    expect(providerClient).toHaveBeenCalledWith("claude-3-5");
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { provider: "anthropic", modelId: "claude-3-5" },
        prompt: "hi",
        maxOutputTokens: 1,
      })
    );
  });

  it("surfaces generateText errors for non-openai providers and reports unsupported types", async () => {
    listProvidersMock.mockReturnValue([
      createProvider({
        id: "google",
        type: "google-generative-ai",
        models: [{ id: "gemini-2.5", modelType: "generative" as const }],
      }),
    ]);
    generateTextMock.mockRejectedValue(new Error("gateway unavailable"));

    await expect(testProvider("google")).resolves.toEqual({
      ok: false,
      error: "gateway unavailable",
    });

    listProvidersMock.mockReturnValue([
      createProvider({
        id: "custom",
        type: "mystery" as any,
      }),
    ]);

    await expect(testProvider("custom")).resolves.toEqual({
      ok: false,
      error: 'provider.unsupportedType:{"providerType":"mystery"}',
    });
  });

  it("returns the thrown client-construction error before any model probe starts", async () => {
    listProvidersMock.mockReturnValue([
      createProvider({
        id: "anthropic",
        type: "anthropic",
        models: [{ id: "claude-3-5", modelType: "generative" as const }],
      }),
    ]);
    createLlmProviderMock.mockImplementation(() => {
      throw new Error("invalid provider config");
    });

    await expect(testProvider("anthropic")).resolves.toEqual({
      ok: false,
      error: "invalid provider config",
    });
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});
