import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  generateTextMock,
  getDefaultModelByTypeMock,
  getLocaleInstructionLabelMock,
  resolveModelInvocationMock,
  resolveTargetResponseLocaleMock,
  tMainMock,
} = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  getDefaultModelByTypeMock: vi.fn(),
  getLocaleInstructionLabelMock: vi.fn(),
  resolveModelInvocationMock: vi.fn(),
  resolveTargetResponseLocaleMock: vi.fn(),
  tMainMock: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
}));

vi.mock("ai", () => ({
  generateText: generateTextMock,
}));

vi.mock("../../settings/settingsData", () => ({
  getDefaultModelByType: getDefaultModelByTypeMock,
}));

vi.mock("../../providers/modelInvocation", () => ({
  resolveModelInvocation: resolveModelInvocationMock,
}));

vi.mock("../../language/responseLocale", () => ({
  getLocaleInstructionLabel: getLocaleInstructionLabelMock,
  resolveTargetResponseLocale: resolveTargetResponseLocaleMock,
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

import { fallbackTitleFromFirstMessage, generateSessionTitleByFastModel } from "../titleService";

describe("titleService", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    getDefaultModelByTypeMock.mockReset();
    getLocaleInstructionLabelMock.mockReset();
    resolveModelInvocationMock.mockReset();
    resolveTargetResponseLocaleMock.mockReset();
    tMainMock.mockClear();

    getDefaultModelByTypeMock.mockReturnValue({
      providerId: "mock",
      modelId: "fast-model",
    });
    getLocaleInstructionLabelMock.mockReturnValue("English");
    resolveTargetResponseLocaleMock.mockReturnValue("en");
    resolveModelInvocationMock.mockReturnValue({
      provider: { id: "mock", type: "openai-compatible" },
      client: vi.fn((modelId: string) => ({ modelId })),
    });
  });

  it("builds fallback titles for text, blank input, and image-only prompts", () => {
    expect(
      fallbackTitleFromFirstMessage([{ type: "text", text: "   Build me a release checklist   " }] as any, 12)
    ).toBe("Build me a r");

    expect(fallbackTitleFromFirstMessage([] as any)).toBe("title.defaultNewSession");

    expect(
      fallbackTitleFromFirstMessage(
        [
          {
            type: "file",
            mediaType: "image/png",
            url: "file:///tmp/a.png",
          },
        ] as any
      )
    ).toBe("title.defaultImageSingle");

    expect(
      fallbackTitleFromFirstMessage(
        [
          { type: "text", text: "Please describe the image content." },
          {
            type: "file",
            mediaType: "image/jpeg",
            url: "file:///tmp/a.jpg",
          },
          {
            type: "file",
            mediaType: "image/jpeg",
            url: "file:///tmp/b.jpg",
          },
        ] as any
      )
    ).toBe('title.defaultImageMultiple:{"count":2}');
  });

  it("generates and cleans a model title using the fast model", async () => {
    generateTextMock.mockResolvedValue({
      text: 'Release Plan\nMore explanation',
    });

    const result = await generateSessionTitleByFastModel({
      parts: [{ type: "text", text: "Help me draft a release plan" }] as any,
    });

    expect(resolveModelInvocationMock).toHaveBeenCalledWith({
      providerId: "mock",
      modelId: "fast-model",
    });
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("Help me draft a release plan"),
          }),
        ]),
        providerOptions: {
          mock: { think: { type: "disable" } },
        },
      })
    );
    expect(result).toEqual({ ok: true, title: "Release Plan" });
  });

  it("returns user-facing errors when no fast model is configured or the model output is invalid", async () => {
    getDefaultModelByTypeMock.mockReturnValue(null);

    await expect(
      generateSessionTitleByFastModel({
        parts: [{ type: "text", text: "No model configured" }] as any,
      })
    ).resolves.toEqual({
      ok: false,
      error: "title.fastModelNotConfigured",
    });

    getDefaultModelByTypeMock.mockReturnValue({
      providerId: "mock",
      modelId: "fast-model",
    });
    generateTextMock.mockResolvedValue({
      text: "   ",
    });

    await expect(
      generateSessionTitleByFastModel({
        parts: [{ type: "text", text: "Invalid output" }] as any,
      })
    ).resolves.toEqual({
      ok: false,
      error: "title.invalidResult",
    });
  });
});
