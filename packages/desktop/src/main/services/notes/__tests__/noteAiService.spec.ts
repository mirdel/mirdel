import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  convertToModelMessagesMock,
  ensureModelReadyMock,
  getDefaultModelByTypeMock,
  resolveModelInvocationMock,
  stepCountIsMock,
  streamTextMock,
  tMainMock,
  toolMock,
  validateUIMessagesMock,
} = vi.hoisted(() => ({
  convertToModelMessagesMock: vi.fn(),
  ensureModelReadyMock: vi.fn(),
  getDefaultModelByTypeMock: vi.fn(),
  resolveModelInvocationMock: vi.fn(),
  stepCountIsMock: vi.fn((value: number) => ({ type: "step-count", value })),
  streamTextMock: vi.fn(),
  tMainMock: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
  toolMock: vi.fn((config: unknown) => config),
  validateUIMessagesMock: vi.fn(),
}));

vi.mock("ai", () => ({
  convertToModelMessages: convertToModelMessagesMock,
  stepCountIs: stepCountIsMock,
  streamText: streamTextMock,
  tool: toolMock,
  validateUIMessages: validateUIMessagesMock,
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

import { assistNoteWriting } from "../noteAiService";

function createMockStream(
  parts: Array<Record<string, unknown>>,
  usage: { inputTokens?: number | null; outputTokens?: number | null } = { inputTokens: 4, outputTokens: 9 }
) {
  return {
    fullStream: (async function* () {
      for (const part of parts) {
        yield part;
      }
    })(),
    usage: Promise.resolve(usage),
  };
}

describe("noteAiService", () => {
  beforeEach(() => {
    convertToModelMessagesMock.mockReset();
    ensureModelReadyMock.mockReset();
    getDefaultModelByTypeMock.mockReset();
    resolveModelInvocationMock.mockReset();
    stepCountIsMock.mockClear();
    streamTextMock.mockReset();
    tMainMock.mockClear();
    toolMock.mockClear();
    validateUIMessagesMock.mockReset();

    getDefaultModelByTypeMock.mockImplementation((type: string) => {
      if (type === "general") return { providerId: "mock", modelId: "general-model" };
      if (type === "fast") return { providerId: "mock", modelId: "fast-model" };
      return null;
    });
    resolveModelInvocationMock.mockImplementation(({ providerId, modelId }: { providerId: string; modelId: string }) => ({
      client: vi.fn((resolvedModelId: string) => ({ providerId, modelId: resolvedModelId })),
    }));
    validateUIMessagesMock.mockImplementation(async ({ messages }: { messages: any[] }) => messages);
    convertToModelMessagesMock.mockImplementation(async (messages: any[]) =>
      messages.map((message) => ({
        role: message.role,
        content: message.parts,
      }))
    );
  });

  it("rejects empty prompts before attempting any model call", async () => {
    const result = await assistNoteWriting({
      noteContentMd: "# Note",
      userPrompt: "   ",
    });

    expect(result).toEqual({
      ok: false,
      error: "notes.emptyPrompt",
    });
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("falls back to the fast default model and streams a concise text reply", async () => {
    getDefaultModelByTypeMock.mockImplementation((type: string) => {
      if (type === "general") return null;
      if (type === "fast") return { providerId: "mock", modelId: "fast-model" };
      return null;
    });
    streamTextMock.mockReturnValue(
      createMockStream([
        { type: "text-delta", text: "Polished " },
        { type: "text-delta", text: "draft." },
        { type: "finish", finishReason: "stop" },
      ])
    );

    const events: Array<Record<string, unknown>> = [];
    const result = await assistNoteWriting(
      {
        noteContentMd: "# Note\nOriginal draft",
        userPrompt: "Polish this paragraph",
      },
      {
        onEvent: (event) => {
          events.push(event as unknown as Record<string, unknown>);
        },
      }
    );

    expect(resolveModelInvocationMock).toHaveBeenCalledWith({
      providerId: "mock",
      modelId: "fast-model",
    });
    expect(result).toEqual({
      ok: true,
      model: "mock::fast-model",
      contextMode: "auto",
      text: "Polished draft.",
      toolCalls: [],
      tokenUsage: { inputTokens: 4, outputTokens: 9 },
    });
    expect(events).toEqual([
      { type: "text-delta", delta: "Polished " },
      { type: "text-delta", delta: "draft." },
      { type: "done", finishReason: "stop" },
    ]);
  });

  it("throws a user-facing error when the explicit model format is invalid", async () => {
    await expect(
      assistNoteWriting({
        noteContentMd: "# Note",
        userPrompt: "Rewrite this",
        model: "broken::",
      })
    ).rejects.toThrow('notes.invalidModelFormat:{"model":"broken::"}');
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("ensures local models are ready and captures successful tool proposals", async () => {
    streamTextMock.mockReturnValue(
      createMockStream([
        {
          type: "tool-call",
          toolCallId: "tool-1",
          toolName: "note_patch_document",
          input: {
            edits: [
              {
                startLine: 1,
                startCol: 1,
                endLine: 1,
                endCol: 6,
                expectedText: "Title",
                newText: "Heading",
              },
            ],
          },
        },
        {
          type: "tool-result",
          toolCallId: "tool-1",
          toolName: "note_patch_document",
          output: {
            ok: true,
            proposal: {
              mode: "document_patch",
              edits: [
                {
                  startLine: 1,
                  startCol: 1,
                  endLine: 1,
                  endCol: 6,
                  expectedText: "Title",
                  newText: "Heading",
                },
              ],
            },
          },
        },
        { type: "finish", finishReason: "stop" },
      ])
    );

    const result = await assistNoteWriting({
      noteContentMd: "Title\nBody",
      userPrompt: "Convert the title into a heading",
      contextMode: "full",
      model: "local::qwen-note",
    });

    expect(ensureModelReadyMock).toHaveBeenCalledWith("qwen-note");
    expect(resolveModelInvocationMock).toHaveBeenCalledWith({
      providerId: "local",
      modelId: "qwen-note",
    });
    expect(result).toEqual({
      ok: true,
      model: "local::qwen-note",
      contextMode: "full",
      text: "",
      toolCalls: [
        {
          toolCallId: "tool-1",
          toolName: "note_patch_document",
          status: "success",
          proposal: {
            mode: "document_patch",
            edits: [
              {
                startLine: 1,
                startCol: 1,
                endLine: 1,
                endCol: 6,
                expectedText: "Title",
                newText: "Heading",
              },
            ],
          },
        },
      ],
      tokenUsage: { inputTokens: 4, outputTokens: 9 },
    });
  });
});
