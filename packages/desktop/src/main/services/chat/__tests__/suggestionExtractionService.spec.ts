import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  generateTextMock,
  getDefaultModelByTypeMock,
  getLocaleInstructionLabelMock,
  resolveModelInvocationMock,
  tMainMock,
} = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  getDefaultModelByTypeMock: vi.fn(),
  getLocaleInstructionLabelMock: vi.fn(),
  resolveModelInvocationMock: vi.fn(),
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

import { extractSuggestions } from "../suggestionExtractionService";

describe("suggestionExtractionService", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    getDefaultModelByTypeMock.mockReset();
    getLocaleInstructionLabelMock.mockReset();
    resolveModelInvocationMock.mockReset();
    tMainMock.mockClear();

    getDefaultModelByTypeMock.mockReturnValue({
      providerId: "mock",
      modelId: "fast-model",
    });
    getLocaleInstructionLabelMock.mockReturnValue("Chinese");
    resolveModelInvocationMock.mockReturnValue({
      client: vi.fn((modelId: string) => ({ modelId })),
    });
  });

  it("skips extraction for very short replies", async () => {
    await expect(
      extractSuggestions({
        assistantText: "short",
        targetLocale: "zh-CN",
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        needSuggestion: false,
        suggestions: [],
      },
    });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("returns a user-facing error when no fast model is configured", async () => {
    getDefaultModelByTypeMock.mockReturnValue(null);

    await expect(
      extractSuggestions({
        assistantText: "This reply compares three options and several trade-offs.",
        targetLocale: "zh-CN",
      })
    ).resolves.toEqual({
      ok: false,
      error: "suggestion.fastModelNotConfigured",
    });
  });

  it("normalizes model suggestions and drops extras when suggestions are disabled", async () => {
    generateTextMock.mockResolvedValue({
      text: '```json {"needSuggestion": true, "suggestions": ["继续比较成本", "继续比较成本", "给我实施步骤", ""]} ```',
    });

    await expect(
      extractSuggestions({
        assistantText: "这里有多种方案、成本差异和实施步骤。",
        targetLocale: "zh-CN",
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        needSuggestion: true,
        suggestions: ["继续比较成本", "继续比较成本", "给我实施步骤"],
      },
    });

    generateTextMock.mockResolvedValue({
      text: '{"needSuggestion": false, "suggestions": ["不该保留"]}',
    });

    await expect(
      extractSuggestions({
        assistantText: "这是一个直接答案，没有太多可扩展点。",
        targetLocale: "zh-CN",
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        needSuggestion: false,
        suggestions: [],
      },
    });
  });

  it("falls back to no suggestions when model output cannot be parsed", async () => {
    generateTextMock.mockResolvedValue({
      text: "not-json",
    });

    await expect(
      extractSuggestions({
        assistantText: "这段回复包含很多细节，本来可以继续追问。",
        targetLocale: "zh-CN",
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        needSuggestion: false,
        suggestions: [],
      },
    });
  });
});
