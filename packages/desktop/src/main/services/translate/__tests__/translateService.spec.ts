import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ensureModelReadyMock,
  generateTextMock,
  getDefaultModelByTypeMock,
  resolveModelInvocationMock,
  streamObjectMock,
  tMainMock,
} = vi.hoisted(() => ({
  ensureModelReadyMock: vi.fn(),
  generateTextMock: vi.fn(),
  getDefaultModelByTypeMock: vi.fn(),
  resolveModelInvocationMock: vi.fn(),
  streamObjectMock: vi.fn(),
  tMainMock: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
}));

vi.mock("ai", () => ({
  generateText: generateTextMock,
  streamObject: streamObjectMock,
}));

vi.mock("../../settings/settingsData", () => ({
  getDefaultModelByType: getDefaultModelByTypeMock,
}));

vi.mock("../../providers/modelInvocation", () => ({
  resolveModelInvocation: resolveModelInvocationMock,
}));

vi.mock("../../model-server", () => ({
  localModelRuntimeService: {
    ensureModelReady: ensureModelReadyMock,
  },
}));

vi.mock("../../../i18n", () => ({
  tMain: tMainMock,
}));

vi.mock("@shared", () => ({
  loggerServiceMain: {
    withContext: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { translate, translateStream } from "../translateService";

describe("translateService", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    streamObjectMock.mockReset();
    getDefaultModelByTypeMock.mockReset();
    resolveModelInvocationMock.mockReset();
    ensureModelReadyMock.mockReset();
    tMainMock.mockClear();

    getDefaultModelByTypeMock.mockImplementation((type: string) => {
      if (type === "translate") return { providerId: "mock", modelId: "translate-model" };
      if (type === "general") return { providerId: "mock", modelId: "general-model" };
      return null;
    });
    resolveModelInvocationMock.mockImplementation(({ providerId, modelId }: { providerId: string; modelId: string }) => ({
      client: vi.fn((resolvedModelId: string) => ({ providerId, modelId: resolvedModelId })),
    }));
  });

  it("uses an explicit model override and parses the structured translation result", async () => {
    generateTextMock.mockResolvedValue({
      text: JSON.stringify({
        detected: { type: "term", sourceLang: "en", confidence: 0.98 },
        translation: { targetLang: "zh", text: "苹果" },
        termCard: {
          headword: "apple",
          senses: ["苹果"],
        },
      }),
    });

    const result = await translate({
      input: "apple",
      targetLang: "zh",
      model: "mock::custom-model",
    });

    expect(resolveModelInvocationMock).toHaveBeenCalledWith({
      providerId: "mock",
      modelId: "custom-model",
    });
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("professional multilingual translation"),
        messages: [{ role: "user", content: expect.stringContaining("Target language (ISO code): zh") }],
      })
    );
    expect(result).toEqual({
      detected: { type: "term", sourceLang: "en", confidence: 0.98 },
      translation: { targetLang: "zh", text: "苹果" },
      termCard: {
        headword: "apple",
        senses: ["苹果"],
      },
    });
  });

  it("falls back to the general default model and ensures local models are ready", async () => {
    getDefaultModelByTypeMock.mockImplementation((type: string) => {
      if (type === "translate") return null;
      if (type === "general") return { providerId: "local", modelId: "qwen-local" };
      return null;
    });
    generateTextMock.mockResolvedValue({
      text: JSON.stringify({
        detected: { type: "text", sourceLang: "en", confidence: 1 },
        translation: { targetLang: "fr", text: "bonjour le monde" },
      }),
    });

    const result = await translate({
      input: "hello world",
      targetLang: "fr",
    });

    expect(ensureModelReadyMock).toHaveBeenCalledWith("qwen-local");
    expect(resolveModelInvocationMock).toHaveBeenCalledWith({
      providerId: "local",
      modelId: "qwen-local",
    });
    expect(result.translation.text).toBe("bonjour le monde");
  });

  it("surfaces missing default models and parse failures as user-facing errors", async () => {
    getDefaultModelByTypeMock.mockReturnValue(null);

    await expect(
      translate({
        input: "hello",
        targetLang: "de",
      })
    ).rejects.toThrow("translate.defaultModelRequired");

    getDefaultModelByTypeMock.mockImplementation((type: string) => {
      if (type === "translate") return { providerId: "mock", modelId: "translate-model" };
      return null;
    });
    generateTextMock.mockResolvedValue({ text: "not-json" });

    await expect(
      translate({
        input: "hello",
        targetLang: "de",
      })
    ).rejects.toThrow("translate.parseFailed");
  });

  it("falls back from streaming to non-stream translation and emits progress events", async () => {
    streamObjectMock.mockImplementation(() => {
      throw new Error("stream exploded");
    });
    generateTextMock.mockResolvedValue({
      text: JSON.stringify({
        detected: { type: "text", sourceLang: "en", confidence: 1 },
        translation: { targetLang: "ja", text: "こんにちは" },
      }),
    });

    const events: Array<Record<string, unknown>> = [];
    const result = await translateStream(
      {
        input: "hello",
        targetLang: "ja",
      },
      {
        onEvent: (event) => {
          events.push(event as unknown as Record<string, unknown>);
        },
      }
    );

    expect(result.translation.text).toBe("こんにちは");
    expect(events).toEqual([
      { type: "error", error: "stream exploded" },
      { type: "partial", translationText: "こんにちは" },
      { type: "done", finishReason: "stop", aborted: undefined },
    ]);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });
});
