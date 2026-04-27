import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  generateTextMock,
  getDefaultModelByTypeMock,
  resolveModelInvocationMock,
  tMainMock,
} = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  getDefaultModelByTypeMock: vi.fn(),
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

import { generateSearchPlan } from "../searchPlannerService";

describe("searchPlannerService", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    getDefaultModelByTypeMock.mockReset();
    resolveModelInvocationMock.mockReset();
    tMainMock.mockClear();

    getDefaultModelByTypeMock.mockReturnValue({
      providerId: "mock",
      modelId: "fast-model",
    });
    resolveModelInvocationMock.mockReturnValue({
      client: vi.fn((modelId: string) => ({ modelId })),
    });
  });

  it("rejects empty requests and missing light task models", async () => {
    await expect(
      generateSearchPlan({
        request: "   ",
      })
    ).resolves.toEqual({
      ok: false,
      error: "search.plan.failed",
    });

    getDefaultModelByTypeMock.mockReturnValue(null);

    await expect(
      generateSearchPlan({
        request: "OpenAI Responses API latest changes",
      })
    ).resolves.toEqual({
      ok: false,
      error: "search.plan.fastModelNotConfigured",
    });
  });

  it("returns normalized unique queries and planner model metadata", async () => {
    generateTextMock.mockResolvedValue({
      text: `\`\`\`json
      {"queries":[" OpenAI Responses API latest ","OpenAI Responses API latest","OpenAI Responses API docs","OpenAI Responses API migration","OpenAI Responses API pricing","OpenAI Responses API errors","OpenAI Responses API examples","ignored"]}
      \`\`\``,
    });

    await expect(
      generateSearchPlan({
        request: "帮我研究 OpenAI Responses API 最近更新",
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        queries: [
          "OpenAI Responses API latest",
          "OpenAI Responses API docs",
          "OpenAI Responses API migration",
          "OpenAI Responses API pricing",
          "OpenAI Responses API errors",
          "OpenAI Responses API examples",
        ],
        plannerModel: "mock::fast-model",
      },
    });
  });

  it("resolves explicit default model refs to the default general model", async () => {
    getDefaultModelByTypeMock.mockImplementation((type: string) => (
      type === "general"
        ? { providerId: "mock", modelId: "general-model" }
        : null
    ));
    generateTextMock.mockResolvedValue({
      text: '{"queries":["AI search default model"]}',
    });

    await expect(
      generateSearchPlan({
        request: "AI search default model",
        modelRefs: ["__default__"],
        useDefaultFallbacks: false,
      })
    ).resolves.toEqual({
      ok: true,
      data: {
        queries: ["AI search default model"],
        plannerModel: "mock::general-model",
      },
    });
    expect(resolveModelInvocationMock).toHaveBeenCalledWith({
      providerId: "mock",
      modelId: "general-model",
    });
  });

  it("returns a generic failure when generation or parsing fails", async () => {
    generateTextMock.mockResolvedValue({
      text: '{"queries":[]}',
    });

    await expect(
      generateSearchPlan({
        request: "Find recent changes",
      })
    ).resolves.toEqual({
      ok: false,
      error: "search.plan.failed",
    });

    generateTextMock.mockRejectedValue(new Error("upstream exploded"));

    await expect(
      generateSearchPlan({
        request: "Find recent changes",
      })
    ).resolves.toEqual({
      ok: false,
      error: "search.plan.failed",
    });
  });
});
