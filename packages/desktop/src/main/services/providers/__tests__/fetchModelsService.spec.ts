import type { ProviderPublic } from "@shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  formatHttpErrorMock,
  getMock,
  getProviderApiKeyMock,
  inferModelTypeFromIdMock,
  listProvidersMock,
  tMainMock,
} = vi.hoisted(() => ({
  formatHttpErrorMock: vi.fn(),
  getMock: vi.fn(),
  getProviderApiKeyMock: vi.fn(),
  inferModelTypeFromIdMock: vi.fn((id: string) => (id.includes("embed") ? "embedding" : "generative")),
  listProvidersMock: vi.fn(),
  tMainMock: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
}));

vi.mock("../../http", () => ({
  default: {
    get: getMock,
  },
  formatHttpError: formatHttpErrorMock,
}));

vi.mock("../providerData", () => ({
  getProviderApiKey: getProviderApiKeyMock,
  listProviders: listProvidersMock,
}));

vi.mock("@shared", () => ({
  inferModelTypeFromId: inferModelTypeFromIdMock,
  loggerServiceMain: {
    withContext: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("../../../i18n", () => ({
  tMain: tMainMock,
}));

import { fetchProviderModels } from "../fetchModelsService";

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

describe("fetchModelsService", () => {
  beforeEach(() => {
    listProvidersMock.mockReturnValue([createProvider()]);
    getProviderApiKeyMock.mockReturnValue("secret-key");
    formatHttpErrorMock.mockReturnValue("HTTP 500: upstream failed");
    getMock.mockReset();
    inferModelTypeFromIdMock.mockClear();
  });

  it("rejects missing providers and invalid local configuration", async () => {
    listProvidersMock.mockReturnValue([]);
    await expect(fetchProviderModels("missing")).resolves.toEqual({
      ok: false,
      error: "provider.notFoundGeneric",
    });

    listProvidersMock.mockReturnValue([createProvider({ baseUrl: "   " })]);
    await expect(fetchProviderModels("mock")).resolves.toEqual({
      ok: false,
      error: "provider.baseUrlMissing",
    });

    listProvidersMock.mockReturnValue([createProvider({ id: "anthropic", type: "anthropic" })]);
    getProviderApiKeyMock.mockReturnValue("");
    await expect(fetchProviderModels("anthropic")).resolves.toEqual({
      ok: false,
      error: 'provider.apiKeyMissing:{"providerId":"anthropic"}',
    });
  });

  it("maps openai-compatible model payloads and allows unauthenticated fetches", async () => {
    getProviderApiKeyMock.mockReturnValue(null);
    getMock.mockResolvedValue({
      data: {
        data: [
          { id: "gpt-4.1", inputModalities: ["text", "image"], outputModalities: ["text"] },
          { id: "embed-3-large", modelType: "embedding" },
          { id: "   " },
        ],
      },
    });

    await expect(fetchProviderModels("mock")).resolves.toEqual({
      ok: true,
      models: [
        {
          id: "gpt-4.1",
          modelType: "generative",
          inputModalities: ["text", "image"],
          outputModalities: ["text"],
        },
        {
          id: "embed-3-large",
          modelType: "embedding",
          inputModalities: undefined,
          outputModalities: undefined,
        },
      ],
    });
    expect(getMock).toHaveBeenCalledWith("https://mock.test/models", {
      headers: undefined,
      timeout: 15000,
    });
  });

  it("includes bearer auth for openai-compatible providers and treats empty payloads as an empty model list", async () => {
    getProviderApiKeyMock.mockReturnValue("secret-key");
    getMock.mockResolvedValue({
      data: {
        data: [],
      },
    });

    await expect(fetchProviderModels("mock")).resolves.toEqual({
      ok: true,
      models: [],
    });
    expect(getMock).toHaveBeenCalledWith("https://mock.test/models", {
      headers: {
        Authorization: "Bearer secret-key",
      },
      timeout: 15000,
    });
  });

  it("paginates anthropic and google model endpoints", async () => {
    listProvidersMock.mockReturnValue([createProvider({ id: "anthropic", type: "anthropic" })]);
    getMock
      .mockResolvedValueOnce({
        data: {
          data: Array.from({ length: 100 }, (_, index) => ({ id: `claude-${index}` })),
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [{ id: "claude-final" }],
        },
      });

    await expect(fetchProviderModels("anthropic")).resolves.toEqual({
      ok: true,
      models: [
        ...Array.from({ length: 100 }, (_, index) => ({
          id: `claude-${index}`,
          modelType: "generative" as const,
        })),
        { id: "claude-final", modelType: "generative" as const },
      ],
    });

    listProvidersMock.mockReturnValue([
      createProvider({ id: "google", type: "google-generative-ai", baseUrl: "" }),
    ]);
    getMock
      .mockReset()
      .mockResolvedValueOnce({
        data: {
          models: [{ name: "models/gemini-2.5-pro" }],
          nextPageToken: "page-2",
        },
      })
      .mockResolvedValueOnce({
        data: {
          models: [{ name: "models/embed-1" }],
        },
      });

    await expect(fetchProviderModels("google")).resolves.toEqual({
      ok: true,
      models: [
        { id: "gemini-2.5-pro", modelType: "generative" },
        { id: "embed-1", modelType: "embedding" },
      ],
    });
  });

  it("returns formatted HTTP errors and unsupported provider failures", async () => {
    getMock.mockRejectedValue(new Error("network exploded"));

    await expect(fetchProviderModels("mock")).resolves.toEqual({
      ok: false,
      error: "HTTP 500: upstream failed",
    });
    expect(formatHttpErrorMock).toHaveBeenCalled();

    listProvidersMock.mockReturnValue([
      createProvider({
        id: "custom",
        type: "unknown" as any,
      }),
    ]);

    await expect(fetchProviderModels("custom")).resolves.toEqual({
      ok: false,
      error: 'provider.unsupportedType:{"providerType":"unknown"}',
    });
  });

  it("treats a missing upstream data envelope as an empty model list", async () => {
    getMock.mockResolvedValue({
      data: null,
    });

    await expect(fetchProviderModels("mock")).resolves.toEqual({
      ok: true,
      models: [],
    });
  });
});
