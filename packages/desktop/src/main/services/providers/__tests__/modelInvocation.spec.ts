import type { ProviderPublic } from "@shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createLlmProviderMock,
  getProviderApiKeyMock,
  listProvidersMock,
  tMainMock,
} = vi.hoisted(() => ({
  createLlmProviderMock: vi.fn(),
  getProviderApiKeyMock: vi.fn(),
  listProvidersMock: vi.fn(),
  tMainMock: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
}));

vi.mock("../../../i18n", () => ({
  tMain: tMainMock,
}));

vi.mock("../llmProviderFactory", () => ({
  createLlmProvider: createLlmProviderMock,
}));

vi.mock("../providerData", () => ({
  getProviderApiKey: getProviderApiKeyMock,
  listProviders: listProvidersMock,
}));

import { resolveModelInvocation, resolveProviderInvocation } from "../modelInvocation";

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
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("modelInvocation", () => {
  beforeEach(() => {
    createLlmProviderMock.mockReturnValue("mock-client");
    getProviderApiKeyMock.mockReturnValue("secret-key");
    listProvidersMock.mockReturnValue([createProvider()]);
  });

  it("throws when the provider does not exist", () => {
    listProvidersMock.mockReturnValue([]);

    expect(() => resolveProviderInvocation("missing")).toThrow(
      'provider.notFound:{"providerId":"missing"}'
    );
    expect(createLlmProviderMock).not.toHaveBeenCalled();
  });

  it("enforces baseUrl and api key for openai-compatible providers", () => {
    listProvidersMock.mockReturnValue([createProvider({ baseUrl: "   " })]);

    expect(() => resolveProviderInvocation("mock")).toThrow("provider.baseUrlMissing");

    listProvidersMock.mockReturnValue([createProvider()]);
    getProviderApiKeyMock.mockReturnValue("");

    expect(() => resolveProviderInvocation("mock")).toThrow(
      'provider.apiKeyMissing:{"providerId":"mock"}'
    );
    expect(createLlmProviderMock).not.toHaveBeenCalled();
  });

  it("allows missing api keys when requireApiKey is false", () => {
    getProviderApiKeyMock.mockReturnValue(null);

    const result = resolveProviderInvocation("mock", {
      requireApiKey: false,
    });

    expect(result.providerId).toBe("mock");
    expect(result.client).toBe("mock-client");
    expect(result.provider.id).toBe("mock");
    expect(result.provider).not.toHaveProperty("apiKey");
    expect(createLlmProviderMock).toHaveBeenCalledWith(
      expect.not.objectContaining({
        apiKey: expect.anything(),
      })
    );
    expect(getProviderApiKeyMock).not.toHaveBeenCalled();
  });

  it("uses the default model when the model ref is __default__", () => {
    const result = resolveModelInvocation({
      modelRef: "__default__",
      defaultModel: {
        providerId: "mock",
        modelId: "gpt-4.1",
      },
    });

    expect(result.providerId).toBe("mock");
    expect(result.modelId).toBe("gpt-4.1");
    expect(result.client).toBe("mock-client");
    expect(createLlmProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mock",
        apiKey: "secret-key",
      })
    );
  });

  it("supports alternate separators and custom invalid-model errors", () => {
    const parsed = resolveModelInvocation({
      modelRef: "mock/gpt-4.1-mini",
      separator: "/",
      requireApiKey: false,
    });

    expect(parsed.providerId).toBe("mock");
    expect(parsed.modelId).toBe("gpt-4.1-mini");

    expect(() =>
      resolveModelInvocation({
        modelRef: "broken-ref",
        invalidModelErrorKey: "notes.invalidModelFormat",
        invalidModelErrorParams: { model: "broken-ref" },
      })
    ).toThrow('notes.invalidModelFormat:{"model":"broken-ref"}');
  });
});
