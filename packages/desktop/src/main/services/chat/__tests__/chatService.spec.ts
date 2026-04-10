import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../sessionData";
import { createUserMessage, createAssistantMessage, getMessage } from "../messageData";
import { createTurn, getLatestTurnByUserMessageId, getTurn } from "../turnData";
import { executeChat, executeChatWithToolApprovals } from "../chatService";
import { useTestDb } from "../../../../../test/helpers/testDb";

const {
  aggregateMcpToolsMock,
  appendDebugRunStepsMock,
  convertToModelMessagesMock,
  createDebugRunMock,
  extractSuggestionsMock,
  finalizeDebugRunMock,
  getLatestDebugRunIdByTurnIdMock,
  resolveModelInvocationMock,
  resolveSystemPromptEnvelopeMock,
  resolveTargetResponseLocaleMock,
  streamTextMock,
  validateUIMessagesMock,
} = vi.hoisted(() => ({
  aggregateMcpToolsMock: vi.fn(),
  appendDebugRunStepsMock: vi.fn(),
  convertToModelMessagesMock: vi.fn(),
  createDebugRunMock: vi.fn(),
  extractSuggestionsMock: vi.fn(),
  finalizeDebugRunMock: vi.fn(),
  getLatestDebugRunIdByTurnIdMock: vi.fn(),
  resolveModelInvocationMock: vi.fn(),
  resolveSystemPromptEnvelopeMock: vi.fn(),
  resolveTargetResponseLocaleMock: vi.fn(),
  streamTextMock: vi.fn(),
  validateUIMessagesMock: vi.fn(),
}));

vi.mock("ai", () => ({
  streamText: streamTextMock,
  stepCountIs: vi.fn((value: number) => ({ type: "step-count", value })),
  validateUIMessages: validateUIMessagesMock,
  convertToModelMessages: convertToModelMessagesMock,
}));

vi.mock("../../providers/modelInvocation", () => ({
  resolveModelInvocation: resolveModelInvocationMock,
}));

vi.mock("../systemPrompt", () => ({
  resolveSystemPromptEnvelope: resolveSystemPromptEnvelopeMock,
}));

vi.mock("../../mcp/mcpToolsAdapter", () => ({
  aggregateMcpTools: aggregateMcpToolsMock,
}));

vi.mock("../../settings/settingsData", async () => {
  const actual = await vi.importActual<typeof import("../../settings/settingsData")>("../../settings/settingsData");
  return {
    ...actual,
    getMemorySettings: vi.fn(() => ({
      enabled: false,
      longTermEnabled: false,
    })),
    getSessionPreferences: vi.fn(() => ({
      generateSuggestions: false,
    })),
  };
});

vi.mock("../debugInfoData", async () => {
  const actual = await vi.importActual<typeof import("../debugInfoData")>("../debugInfoData");
  return {
    ...actual,
    appendDebugRunSteps: appendDebugRunStepsMock,
    createDebugRun: createDebugRunMock,
    finalizeDebugRun: finalizeDebugRunMock,
    getLatestDebugRunIdByTurnId: getLatestDebugRunIdByTurnIdMock,
  };
});

vi.mock("../memorySummaryService", () => ({
  enqueueSummaryTask: vi.fn(),
}));

vi.mock("../longTermMemoryService", () => ({
  enqueueLongTermMemoryTask: vi.fn(),
}));

vi.mock("../suggestionExtractionService", () => ({
  extractSuggestions: extractSuggestionsMock,
}));

vi.mock("../../language/responseLocale", () => ({
  resolveTargetResponseLocale: resolveTargetResponseLocaleMock,
}));

vi.mock("../../model-server", () => ({
  localModelRuntimeService: {
    ensureModelReady: vi.fn(),
  },
}));

type StreamPart = Record<string, any>;

function createMockStream(parts: StreamPart[], usage?: { inputTokens?: number; outputTokens?: number }) {
  return {
    fullStream: (async function* () {
      for (const part of parts) {
        yield part;
      }
    })(),
    usage: Promise.resolve(usage),
  };
}

describe("chatService", () => {
  useTestDb("chat-service");
  let windowMock: { webContents: { send: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    windowMock = {
      webContents: {
        send: vi.fn(),
      },
    };

    validateUIMessagesMock.mockImplementation(async ({ messages }: { messages: any[] }) => messages);
    convertToModelMessagesMock.mockImplementation(async (messages: any[]) =>
      messages.map((message) => ({
        role: message.role,
        content: message.parts,
      }))
    );
    resolveSystemPromptEnvelopeMock.mockResolvedValue({
      systemMessages: [],
      contextDataMessages: [],
    });
    resolveTargetResponseLocaleMock.mockReturnValue("en");
    resolveModelInvocationMock.mockReturnValue({
      provider: {
        id: "mock",
        type: "mock",
        name: "Mock Provider",
        baseUrl: "https://mock.test",
        models: [{ id: "general", modelType: "generative", inputModalities: ["text"] }],
      },
      client: vi.fn(() => ({ id: "mock-model" })),
    });
    aggregateMcpToolsMock.mockResolvedValue({
      tools: {},
      stats: [],
    });
    createDebugRunMock.mockReturnValue("debug-run-1");
    getLatestDebugRunIdByTurnIdMock.mockReturnValue("debug-run-1");
    aggregateMcpToolsMock.mockClear();
    appendDebugRunStepsMock.mockReset();
    finalizeDebugRunMock.mockReset();
    extractSuggestionsMock.mockReset();
    streamTextMock.mockReset();
  });

  it("streams a new assistant reply and persists the finished turn", async () => {
    const session = createSession("__default__", "default-scenario", "Chat Service Session");
    const userMessage = createUserMessage({
      sessionId: session.id,
      parts: [{ type: "text", text: "Hello" }],
    });

    streamTextMock.mockReturnValue(
      createMockStream(
        [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", text: "Hello back" },
          { type: "text-end", id: "text-1" },
        ],
        { inputTokens: 5, outputTokens: 7 }
      )
    );

    const result = await executeChat({
      sessionId: session.id,
      userMessageId: userMessage.id,
      messages: [{ role: "user", parts: [{ type: "text", text: "Hello" }] }],
      selectedModel: "mock::general",
      window: windowMock as any,
      abortSignal: new AbortController().signal,
      mode: "chat",
      webSearch: "builtin",
      thinking: "auto",
    });

    expect(result.ok).toBe(true);
    expect(result.messageId).toBeTruthy();

    const assistantMessage = getMessage(String(result.messageId));
    expect(assistantMessage?.status).toBe("success");
    expect(assistantMessage?.parts).toEqual([{ type: "text", text: "Hello back" }]);
    expect(assistantMessage?.tokenUsage).toEqual({ inputTokens: 5, outputTokens: 7 });

    const turn = getLatestTurnByUserMessageId(userMessage.id);
    expect(turn?.assistantMessageId).toBe(result.messageId);
    expect(turn?.status).toBe("success");
    expect(turn?.tokenUsage).toEqual({ inputTokens: 5, outputTokens: 7 });

    expect(windowMock.webContents.send).toHaveBeenCalledWith(
      "chat:stream",
      expect.objectContaining({
        sessionId: session.id,
        messageId: result.messageId,
        turnId: turn?.id,
        chunk: expect.objectContaining({
          type: "finish",
        }),
      })
    );
  });

  it("surfaces stream errors and persists the turn as failed", async () => {
    const session = createSession("__default__", "default-scenario", "Chat Service Error");
    const userMessage = createUserMessage({
      sessionId: session.id,
      parts: [{ type: "text", text: "Trigger error" }],
    });

    streamTextMock.mockReturnValue(
      createMockStream([
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", text: "Partial" },
        { type: "error", error: { message: "provider exploded" } },
      ])
    );

    const result = await executeChat({
      sessionId: session.id,
      userMessageId: userMessage.id,
      messages: [{ role: "user", parts: [{ type: "text", text: "Trigger error" }] }],
      selectedModel: "mock::general",
      window: windowMock as any,
      abortSignal: new AbortController().signal,
      mode: "chat",
    });

    expect(result).toMatchObject({
      ok: false,
      error: "provider exploded",
    });

    const assistantMessage = getMessage(String(result.messageId));
    expect(assistantMessage?.status).toBe("error");
    expect(assistantMessage?.parts).toEqual([{ type: "text", text: "Partial" }]);

    const turn = getLatestTurnByUserMessageId(userMessage.id);
    expect(turn?.status).toBe("error");
    expect(turn?.error).toBe("provider exploded");

    expect(windowMock.webContents.send).toHaveBeenCalledWith(
      "chat:stream",
      expect.objectContaining({
        sessionId: session.id,
        messageId: result.messageId,
        chunk: {
          type: "error",
          errorText: "provider exploded",
        },
      })
    );
  });

  it("resumes an approval-gated assistant reply and stores the tool result", async () => {
    const session = createSession("__default__", "default-scenario", "Chat Service Approval");
    const userMessage = createUserMessage({
      sessionId: session.id,
      turnId: "turn-approval",
      parts: [{ type: "text", text: "Run pwd" }],
    });
    const assistantMessage = createAssistantMessage({
      id: "assistant-approval",
      sessionId: session.id,
      turnId: "turn-approval",
      status: "streaming",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "system::run_command",
          toolCallId: "tool-approval",
          state: "approval-requested",
          input: { command: "pwd" },
          approval: { id: "approval-1" },
        } as any,
      ],
    });

    createTurn({
      id: "turn-approval",
      sessionId: session.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      triggerType: "submit",
      status: "awaiting_approval",
      selectedModel: "mock::general",
      mode: "agent",
      webSearch: "builtin",
      thinking: "auto",
      effectiveThinking: "auto",
    });

    streamTextMock.mockReturnValue(
      createMockStream(
        [
          {
            type: "tool-result",
            toolCallId: "tool-approval",
            toolName: "system::run_command",
            output: { stdout: "/workspace" },
          },
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", text: "Done" },
          { type: "text-end", id: "text-1" },
        ],
        { inputTokens: 4, outputTokens: 6 }
      )
    );

    const result = await executeChatWithToolApprovals({
      sessionId: session.id,
      approvals: [
        {
          approvalId: "approval-1",
          approved: true,
          toolName: "system::run_command",
          args: { command: "pwd" },
        },
      ],
      window: windowMock as any,
      abortSignal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      ok: true,
      messageId: assistantMessage.id,
    });

    const updatedAssistant = getMessage(assistantMessage.id);
    const toolPart = updatedAssistant?.parts.find((part: any) => part.type === "dynamic-tool") as any;
    expect(toolPart).toMatchObject({
      type: "dynamic-tool",
      toolCallId: "tool-approval",
      state: "output-available",
      output: { stdout: "/workspace" },
    });
    expect(updatedAssistant?.parts.some((part: any) => part.type === "text" && part.text === "Done")).toBe(true);
    expect(updatedAssistant?.status).toBe("success");

    const turn = getTurn("turn-approval");
    expect(turn?.status).toBe("success");
    expect(turn?.assistantMessageId).toBe(assistantMessage.id);

    expect(windowMock.webContents.send).toHaveBeenCalledWith(
      "chat:stream",
      expect.objectContaining({
        sessionId: session.id,
        messageId: assistantMessage.id,
        turnId: "turn-approval",
        chunk: {
          type: "tool-approval-responded",
          approvalId: "approval-1",
          toolCallId: "tool-approval",
          approved: true,
        },
      })
    );
  });

  it("returns waitingApproval when the stream pauses for tool approval", async () => {
    const session = createSession("__default__", "default-scenario", "Chat Service Waiting Approval");
    const userMessage = createUserMessage({
      sessionId: session.id,
      parts: [{ type: "text", text: "Run command" }],
    });

    streamTextMock.mockReturnValue(
      createMockStream([
        {
          type: "tool-call",
          toolCallId: "tool-wait",
          toolName: "system::run_command",
          input: { command: "pwd" },
        },
        {
          type: "tool-approval-request",
          approvalId: "approval-wait",
          toolCall: {
            toolCallId: "tool-wait",
            toolName: "system::run_command",
            input: { command: "pwd" },
          },
        },
      ])
    );

    const result = await executeChat({
      sessionId: session.id,
      userMessageId: userMessage.id,
      messages: [{ role: "user", parts: [{ type: "text", text: "Run command" }] }],
      selectedModel: "mock::general",
      window: windowMock as any,
      abortSignal: new AbortController().signal,
      mode: "agent",
    });

    expect(result).toMatchObject({
      ok: true,
      waitingApproval: true,
    });

    const assistantMessage = getMessage(String(result.messageId));
    const toolPart = assistantMessage?.parts.find((part: any) => part.type === "dynamic-tool") as any;
    expect(assistantMessage?.status).toBe("streaming");
    expect(toolPart).toMatchObject({
      type: "dynamic-tool",
      toolCallId: "tool-wait",
      state: "approval-requested",
      approval: { id: "approval-wait" },
    });

    const turn = getLatestTurnByUserMessageId(userMessage.id);
    expect(turn?.status).toBe("awaiting_approval");
    expect(turn?.endedAt).toBeNull();

    expect(windowMock.webContents.send).toHaveBeenCalledWith(
      "chat:stream",
      expect.objectContaining({
        sessionId: session.id,
        messageId: result.messageId,
        turnId: turn?.id,
        chunk: {
          type: "tool-approval-request",
          approvalId: "approval-wait",
          toolCallId: "tool-wait",
        },
      })
    );
  });

  it("persists an aborted stream and emits the abort event with token usage", async () => {
    const session = createSession("__default__", "default-scenario", "Chat Service Abort");
    const userMessage = createUserMessage({
      sessionId: session.id,
      parts: [{ type: "text", text: "Abort me" }],
    });

    streamTextMock.mockReturnValue(
      createMockStream(
        [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", text: "Partial answer" },
          { type: "abort" },
        ],
        { inputTokens: 2, outputTokens: 4 }
      )
    );

    const result = await executeChat({
      sessionId: session.id,
      userMessageId: userMessage.id,
      messages: [{ role: "user", parts: [{ type: "text", text: "Abort me" }] }],
      selectedModel: "mock::general",
      window: windowMock as any,
      abortSignal: new AbortController().signal,
      mode: "chat",
    });

    expect(result).toMatchObject({
      ok: true,
      aborted: true,
    });

    const assistantMessage = getMessage(String(result.messageId));
    expect(assistantMessage?.status).toBe("aborted");
    expect(assistantMessage?.parts).toEqual([{ type: "text", text: "Partial answer" }]);
    expect(assistantMessage?.tokenUsage).toEqual({ inputTokens: 2, outputTokens: 4 });

    const turn = getLatestTurnByUserMessageId(userMessage.id);
    expect(turn?.status).toBe("aborted");
    expect(turn?.tokenUsage).toEqual({ inputTokens: 2, outputTokens: 4 });

    expect(windowMock.webContents.send).toHaveBeenCalledWith(
      "chat:stream",
      expect.objectContaining({
        sessionId: session.id,
        messageId: result.messageId,
        turnId: turn?.id,
        createdMessageIds: [result.messageId],
        tokenUsage: { inputTokens: 2, outputTokens: 4 },
        chunk: {
          type: "abort",
        },
      })
    );
  });

  it("rejects unsupported input modalities before calling the model", async () => {
    const session = createSession("__default__", "default-scenario", "Chat Service Modalities");
    const userMessage = createUserMessage({
      sessionId: session.id,
      parts: [{ type: "file", mediaType: "image/png", url: "file:///tmp/image.png" } as any],
    });

    const result = await executeChat({
      sessionId: session.id,
      userMessageId: userMessage.id,
      messages: [
        {
          role: "user",
          parts: [{ type: "file", mediaType: "image/png", url: "file:///tmp/image.png" } as any],
        },
      ],
      selectedModel: "mock::general",
      window: windowMock as any,
      abortSignal: new AbortController().signal,
      mode: "chat",
    });

    expect(result).toMatchObject({
      ok: false,
    });
    expect(result.error).toContain("image");
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(windowMock.webContents.send).toHaveBeenCalledWith(
      "chat:stream",
      expect.objectContaining({
        sessionId: session.id,
        chunk: expect.objectContaining({
          type: "error",
        }),
      })
    );
  });

  it("filters chat-mode tools down to the allowlisted system tools", async () => {
    const session = createSession("__default__", "default-scenario", "Chat Service Tool Filter");
    const userMessage = createUserMessage({
      sessionId: session.id,
      parts: [{ type: "text", text: "Search and summarize" }],
    });

    aggregateMcpToolsMock.mockResolvedValue({
      tools: {
        "system::web_search": { description: "Search" },
        "system::web_scrape": { description: "Scrape" },
        "system::run_command": { description: "Run command" },
      },
      stats: [],
    });
    streamTextMock.mockReturnValue(
      createMockStream(
        [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", text: "Summary" },
          { type: "text-end", id: "text-1" },
        ],
        { inputTokens: 3, outputTokens: 4 }
      )
    );

    const result = await executeChat({
      sessionId: session.id,
      userMessageId: userMessage.id,
      messages: [{ role: "user", parts: [{ type: "text", text: "Search and summarize" }] }],
      selectedModel: "mock::general",
      window: windowMock as any,
      abortSignal: new AbortController().signal,
      mode: "chat",
      webSearch: "builtin",
    });

    expect(result.ok).toBe(true);
    expect(aggregateMcpToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serverIds: [],
        sessionId: session.id,
        webSearchProviderId: "builtin",
      })
    );
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: {
          "system::web_search": { description: "Search" },
          "system::web_scrape": { description: "Scrape" },
        },
      })
    );
  });

  it("merges native search and thinking options into the model call", async () => {
    const session = createSession("__default__", "default-scenario", "Chat Service Native Search");
    const userMessage = createUserMessage({
      sessionId: session.id,
      parts: [{ type: "text", text: "Find latest docs" }],
    });

    const googleSearchFactory = vi.fn((args?: unknown) => ({
      kind: "google-search-tool",
      args,
    }));
    const clientWithNativeTools = vi.fn(() => ({ id: "mock-model" })) as any;
    clientWithNativeTools.tools = {
      googleSearch: googleSearchFactory,
    };
    resolveModelInvocationMock.mockReturnValue({
      provider: {
        id: "mock",
        type: "google-generative-ai",
        name: "Mock Provider",
        baseUrl: "https://mock.test",
        nativeWebSearchDefaults: {
          providerOptions: { grounding: true },
        },
        models: [
          {
            id: "general",
            modelType: "generative",
            inputModalities: ["text"],
            thinking: {
              deep: { reasoningEffort: "high" },
            },
            nativeWebSearch: {
              providerOptions: { includeDomains: ["openai.com"] },
              tools: [{ mode: "dynamic" }],
              sdkNative: {
                strategy: "google_search",
                args: { dynamicRetrievalConfig: { mode: "MODE_DYNAMIC" } },
              },
            },
          },
        ],
      },
      client: clientWithNativeTools,
    });
    aggregateMcpToolsMock.mockResolvedValue({
      tools: {
        "custom::lookup": { description: "Lookup" },
      },
      stats: [],
    });
    streamTextMock.mockReturnValue(
      createMockStream(
        [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", text: "Latest docs summary" },
          { type: "text-end", id: "text-1" },
        ],
        { inputTokens: 5, outputTokens: 6 }
      )
    );

    const result = await executeChat({
      sessionId: session.id,
      userMessageId: userMessage.id,
      messages: [{ role: "user", parts: [{ type: "text", text: "Find latest docs" }] }],
      selectedModel: "mock::general",
      window: windowMock as any,
      abortSignal: new AbortController().signal,
      mode: "agent",
      mcpServerIds: ["server-1"],
      webSearch: "native",
      thinking: "deep",
    });

    expect(result.ok).toBe(true);
    expect(googleSearchFactory).toHaveBeenCalledWith({
      dynamicRetrievalConfig: { mode: "MODE_DYNAMIC" },
    });
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {
          mock: {
            includeDomains: ["openai.com"],
            __nativeWebSearchTools: [{ mode: "dynamic" }],
            reasoningEffort: "high",
          },
        },
        tools: {
          google_search: {
            kind: "google-search-tool",
            args: {
              dynamicRetrievalConfig: { mode: "MODE_DYNAMIC" },
            },
          },
          "custom::lookup": { description: "Lookup" },
        },
      })
    );
  });

  it("rejects oversized inline attachments before streaming", async () => {
    const session = createSession("__default__", "default-scenario", "Chat Service Large Attachment");
    const largeDataUrl = `data:application/octet-stream;base64,${"A".repeat(35_000_000)}`;
    resolveModelInvocationMock.mockReturnValue({
      provider: {
        id: "mock",
        type: "mock",
        name: "Mock Provider",
        baseUrl: "https://mock.test",
        models: [{ id: "general", modelType: "generative", inputModalities: ["text", "file"] }],
      },
      client: vi.fn(() => ({ id: "mock-model" })),
    });
    const userMessage = createUserMessage({
      sessionId: session.id,
      parts: [{ type: "file", mediaType: "application/octet-stream", url: largeDataUrl } as any],
    });

    const result = await executeChat({
      sessionId: session.id,
      userMessageId: userMessage.id,
      messages: [
        {
          role: "user",
          parts: [{ type: "file", mediaType: "application/octet-stream", url: largeDataUrl } as any],
        },
      ],
      selectedModel: "mock::general",
      window: windowMock as any,
      abortSignal: new AbortController().signal,
      mode: "chat",
    });

    expect(result).toMatchObject({
      ok: false,
    });
    expect(result.error).toContain("Attachment is too large");
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("falls back from native search to builtin tool routing when the model has no native search config", async () => {
    const session = createSession("__default__", "default-scenario", "Chat Service Native Fallback");
    const userMessage = createUserMessage({
      sessionId: session.id,
      parts: [{ type: "text", text: "Search fallback" }],
    });

    resolveModelInvocationMock.mockReturnValue({
      provider: {
        id: "mock",
        type: "mock",
        name: "Mock Provider",
        baseUrl: "https://mock.test",
        models: [{ id: "general", modelType: "generative", inputModalities: ["text"] }],
      },
      client: vi.fn(() => ({ id: "mock-model" })),
    });
    aggregateMcpToolsMock.mockResolvedValue({
      tools: {
        "system::web_search": { description: "Search" },
      },
      stats: [],
    });
    streamTextMock.mockReturnValue(
      createMockStream(
        [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", text: "Fallback search result" },
          { type: "text-end", id: "text-1" },
        ],
        { inputTokens: 4, outputTokens: 5 }
      )
    );

    const result = await executeChat({
      sessionId: session.id,
      userMessageId: userMessage.id,
      messages: [{ role: "user", parts: [{ type: "text", text: "Search fallback" }] }],
      selectedModel: "mock::general",
      window: windowMock as any,
      abortSignal: new AbortController().signal,
      mode: "chat",
      webSearch: "native",
    });

    expect(result.ok).toBe(true);
    expect(aggregateMcpToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        webSearchProviderId: "builtin",
      })
    );
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: {
          "system::web_search": { description: "Search" },
        },
      })
    );
    expect(streamTextMock.mock.calls[0]?.[0]?.providerOptions).toBeUndefined();
  });
});
