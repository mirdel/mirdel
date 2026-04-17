import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useChatStore } from "../useChatStore";
import { useSettingsStore } from "../useSettingsStore";

vi.mock("ai", () => {
  class MockAbstractChat {
    state: any;
    transport: any;

    constructor(options: { state: any; transport: any }) {
      this.state = options.state;
      this.transport = options.transport;
    }

    get messages() {
      return this.state.messages;
    }

    set messages(value: any[]) {
      this.state.messages = value;
    }

    async sendMessage() {
      await this.transport.sendMessages({
        abortSignal: new AbortController().signal,
        metadata: undefined,
      });
    }

    async stop() {
      return undefined;
    }
  }

  return {
    AbstractChat: MockAbstractChat,
  };
});

type StreamHandler = (event: any) => void;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function createSessionFixture(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "session-1",
    title: "Session 1",
    selectedModel: "__default__",
    scenarioId: "default-scenario",
    projectId: null,
    rootSessionId: null,
    parentSessionId: null,
    forkFromMessageId: null,
    forkPointMessageId: null,
    mcpServerIds: [],
    mcpPolicy: "auto",
    mode: "chat",
    skillPolicy: "auto",
    webSearch: "builtin",
    thinking: "auto",
    kbIds: [],
    isTemporary: false,
    temporaryType: null,
    expiresAt: null,
    contextCount: 10,
    linkedNoteId: null,
    isFavorite: false,
    isArchived: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createTurnFixture(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "turn-1",
    sessionId: "session-1",
    userMessageId: "user-1",
    assistantMessageId: "assistant-1",
    parentTurnId: null,
    triggerType: "submit",
    status: "pending",
    selectedModel: "mock::general",
    mcpServerIds: [],
    mode: "chat",
    webSearch: "builtin",
    thinking: "auto",
    effectiveThinking: "auto",
    skillId: null,
    citationRequired: false,
    citationStartIndex: 0,
    tokenUsage: undefined,
    stateText: null,
    briefText: null,
    error: null,
    suggestions: undefined,
    startedAt: 1,
    endedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function installRendererWindowMocks(
  handler: (channel: string, payload?: any) => Promise<any> | any
) {
  const streamHandlers = new Set<StreamHandler>();
  const ipcMock = vi.fn((channel: string, payload?: any) => handler(channel, payload));

  Object.defineProperty(window, "ipc", {
    configurable: true,
    writable: true,
    value: ipcMock,
  });
  Object.defineProperty(window, "chat", {
    configurable: true,
    writable: true,
    value: {
      onStream: vi.fn((listener: StreamHandler) => {
        streamHandlers.add(listener);
        return () => streamHandlers.delete(listener);
      }),
      onTemporarySessionsDeleted: vi.fn(() => () => {}),
    },
  });

  return {
    ipcMock,
    emitStream(event: any) {
      for (const handler of streamHandlers) {
        handler(event);
      }
    },
  };
}

function setupStores() {
  setActivePinia(createPinia());

  const settingsStore = useSettingsStore();
  settingsStore.defaultModels = {
    general: { providerId: "mock", modelId: "general" },
    fast: null,
    translate: null,
    embedding: null,
    imageGenerate: null,
    imageEdit: null,
    videoGenerate: null,
  };
  settingsStore.scenarios = [
    {
      id: "default-scenario",
      name: "Default Scenario",
      selectedModel: "__default__",
      contextCount: 10,
      mcpServerIds: [],
      mcpPolicy: "auto",
      skillPolicy: "auto",
      maxToolSteps: 20,
      workingDirs: [],
      kbIds: [],
      kbRecallTopK: 5,
      kbRecallMinScore: 0.75,
      createdAt: 1,
      updatedAt: 1,
    },
  ] as any;
  settingsStore.sessionPreferences = {
    titleGenerationMode: "extract",
    generateSuggestions: true,
    showMindmap: true,
    showTokenUsage: true,
    showDebugEntry: false,
  };

  return {
    settingsStore,
    chatStore: useChatStore(),
  };
}

describe("useChatStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates a session lazily and sends the structured chat request", async () => {
    const session = createSessionFixture();
    const { chatStore } = setupStores();

    const { ipcMock } = installRendererWindowMocks(async (channel, payload) => {
      switch (channel) {
        case "sessions:create":
          return session;
        case "messages:createUser":
          return {
            id: "user-1",
            sessionId: payload.sessionId,
            turnId: payload.turnId,
            role: "user",
            parts: payload.parts,
            status: "success",
            createdAt: 2,
            updatedAt: 2,
          };
        case "kb:list":
          return [];
        case "webSearch:listProviders":
          return [];
        case "mcp:listServers":
          return [];
        case "chat:send":
          return { ok: true };
        default:
          return null;
      }
    });

    await chatStore.sendMessage([{ type: "text", text: "Hello world" } as any]);

    expect(chatStore.currentSessionId).toBe(session.id);
    expect(chatStore.messages).toHaveLength(2);
    expect(chatStore.messages[0]?.role).toBe("user");
    expect(chatStore.messages[1]?.role).toBe("assistant");
    expect(chatStore.messages[1]?.status).toBe("pending");

    const sendCall = ipcMock.mock.calls.find(([channel]) => channel === "chat:send");
    expect(sendCall).toBeTruthy();

    const sendPayload = sendCall?.[1];
    expect(sendPayload.sessionId).toBe(session.id);
    expect(sendPayload.selectedModel).toBe("mock::general");
    expect(sendPayload.messages).toHaveLength(1);
    expect(sendPayload.messages[0]?.role).toBe("user");
  });

  it("trims history by rounds and removes assistant reasoning before send", async () => {
    const session = createSessionFixture({
      id: "session-history",
      contextCount: 2,
    });
    const { chatStore } = setupStores();

    const historyMessages = [
      {
        id: "user-1",
        sessionId: session.id,
        turnId: "turn-1",
        role: "user",
        parts: [{ type: "text", text: "Question 1" }],
        status: "success",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "assistant-1",
        sessionId: session.id,
        turnId: "turn-1",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "hidden chain", state: "done" },
          { type: "text", text: "Answer 1" },
        ],
        status: "success",
        createdAt: 2,
        updatedAt: 2,
      },
      {
        id: "user-2",
        sessionId: session.id,
        turnId: "turn-2",
        role: "user",
        parts: [{ type: "text", text: "Question 2" }],
        status: "success",
        createdAt: 3,
        updatedAt: 3,
      },
      {
        id: "assistant-2",
        sessionId: session.id,
        turnId: "turn-2",
        role: "assistant",
        parts: [
          { type: "text", text: "Answer 2" },
          {
            type: "dynamic-tool",
            toolName: "system::run_command",
            toolCallId: "tool-2",
            state: "output-available",
            output: { stdout: "/workspace" },
          },
        ],
        status: "success",
        createdAt: 4,
        updatedAt: 4,
      },
      {
        id: "user-3",
        sessionId: session.id,
        turnId: "turn-3",
        role: "user",
        parts: [{ type: "text", text: "Question 3" }],
        status: "success",
        createdAt: 5,
        updatedAt: 5,
      },
      {
        id: "assistant-3",
        sessionId: session.id,
        turnId: "turn-3",
        role: "assistant",
        parts: [{ type: "text", text: "Answer 3" }],
        status: "success",
        createdAt: 6,
        updatedAt: 6,
      },
    ];

    const { ipcMock } = installRendererWindowMocks(async (channel, payload) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return historyMessages;
        case "turns:listBySession":
          return [];
        case "messages:createUser":
          return {
            id: "user-new",
            sessionId: payload.sessionId,
            turnId: payload.turnId,
            role: "user",
            parts: payload.parts,
            status: "success",
            createdAt: 7,
            updatedAt: 7,
          };
        case "kb:list":
          return [];
        case "webSearch:listProviders":
          return [];
        case "mcp:listServers":
          return [];
        case "chat:send":
          return { ok: true };
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);
    await chatStore.sendMessage([{ type: "text", text: "Current question" } as any]);

    const sendPayload = ipcMock.mock.calls.find(([channel]) => channel === "chat:send")?.[1];
    expect(sendPayload.messages).toHaveLength(5);
    expect(sendPayload.messages.map((message: any) => message.parts[0]?.text)).toEqual([
      "Question 2",
      "Answer 2",
      "Question 3",
      "Answer 3",
      "Current question",
    ]);

    const assistantRoundTwo = sendPayload.messages[1];
    expect(assistantRoundTwo.parts.some((part: any) => part.type === "reasoning")).toBe(false);
    expect(assistantRoundTwo.parts.some((part: any) => part.type === "dynamic-tool")).toBe(true);
    expect(sendPayload.messages.some((message: any) =>
      message.parts.some((part: any) => part.type === "text" && part.text === "Question 1")
    )).toBe(false);
  });

  it("opens a temp ask session and sends a chat-only request with anchor history", async () => {
    const anchorSession = createSessionFixture({
      id: "session-anchor",
      selectedModel: "mock::general",
      contextCount: 2,
    });
    const tempAskSession = createSessionFixture({
      id: "session-temp-ask",
      title: "Temp Ask",
      selectedModel: "mock::general",
      isTemporary: true,
      temporaryType: "ask",
    });
    const anchorMessages = [
      {
        id: "anchor-user-1",
        sessionId: anchorSession.id,
        turnId: "anchor-turn-1",
        role: "user",
        parts: [{ type: "text", text: "Anchor question" }],
        status: "success",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "anchor-assistant-1",
        sessionId: anchorSession.id,
        turnId: "anchor-turn-1",
        role: "assistant",
        parts: [{ type: "text", text: "Anchor answer" }],
        status: "success",
        createdAt: 2,
        updatedAt: 2,
      },
    ];
    const { chatStore } = setupStores();
    const { ipcMock } = installRendererWindowMocks(async (channel, payload) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return payload.sessionId === anchorSession.id ? anchorMessages : [];
        case "turns:listBySession":
          return [];
        case "sessions:create":
          return tempAskSession;
        case "messages:createUser":
          return {
            id: "temp-user-1",
            sessionId: payload.sessionId,
            turnId: payload.turnId,
            role: "user",
            parts: payload.parts,
            status: "success",
            createdAt: 3,
            updatedAt: 3,
          };
        case "chat:send":
          return { ok: true };
        default:
          return null;
      }
    });

    chatStore.sessions = [anchorSession as any];
    await chatStore.switchSession(anchorSession.id);
    await chatStore.openTempAsk();
    await chatStore.sendTempAsk("Quick follow-up");

    expect(chatStore.tempAskOpen).toBe(true);
    expect(chatStore.tempAskAnchorSessionId).toBe(anchorSession.id);
    expect(chatStore.tempAskSessionId).toBe(tempAskSession.id);
    expect(chatStore.tempAskMessages).toHaveLength(2);
    expect(chatStore.tempAskMessages[0]?.role).toBe("user");
    expect(chatStore.tempAskMessages[1]?.role).toBe("assistant");
    expect(chatStore.tempAskMessages[1]?.status).toBe("pending");
    expect(chatStore.isTempAskStreaming).toBe(true);

    const createCall = ipcMock.mock.calls.find(([channel]) => channel === "sessions:create");
    expect(createCall?.[1]).toMatchObject({
      selectedModel: "mock::general",
      scenarioId: "default-scenario",
      isTemporary: true,
      temporaryType: "ask",
      mcpPolicy: "off",
      skillPolicy: "off",
      webSearch: "close",
      mode: "chat",
    });

    const sendPayload = ipcMock.mock.calls.find(([channel]) => channel === "chat:send")?.[1];
    expect(sendPayload).toMatchObject({
      sessionId: tempAskSession.id,
      selectedModel: "mock::general",
      mcpSelection: { mode: "off" },
      skillSelection: { mode: "off" },
      webSearch: "close",
      mode: "chat",
      thinking: "auto",
      citationRequired: false,
      citationStartIndex: 0,
    });
    expect(sendPayload.messages.map((message: any) => message.parts[0]?.text)).toEqual([
      "Anchor question",
      "Anchor answer",
      "Quick follow-up",
    ]);
  });

  it("deletes the current session locally and detaches child session metadata", async () => {
    const parentSession = createSessionFixture({ id: "session-delete-parent" });
    const childSession = createSessionFixture({
      id: "session-delete-child",
      rootSessionId: parentSession.id,
      parentSessionId: parentSession.id,
      forkFromMessageId: "fork-source",
      forkPointMessageId: "fork-point",
    });
    const { chatStore } = setupStores();
    const { ipcMock } = installRendererWindowMocks(async (channel) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return [];
        case "turns:listBySession":
          return [];
        case "sessions:delete":
          return { ok: true };
        default:
          return null;
      }
    });

    chatStore.sessions = [parentSession as any, childSession as any];
    await chatStore.switchSession(parentSession.id);
    await chatStore.deleteSession(parentSession.id);

    expect(ipcMock).toHaveBeenCalledWith("sessions:delete", { id: parentSession.id });
    expect(chatStore.currentSessionId).toBeNull();
    expect(chatStore.isTemporarySession).toBe(false);
    expect(chatStore.sessions.map((session) => session.id)).toEqual([childSession.id]);
    expect(chatStore.sessions[0]).toMatchObject({
      id: childSession.id,
      rootSessionId: null,
      parentSessionId: null,
      forkFromMessageId: null,
      forkPointMessageId: null,
    });
    expect(chatStore.messages).toEqual([]);
  });

  it("keeps pending session configuration in sync before a session is created", async () => {
    const { chatStore, settingsStore } = setupStores();

    settingsStore.scenarios = [
      ...settingsStore.scenarios,
      {
        id: "research-scenario",
        name: "Research Scenario",
        selectedModel: "__default__",
        contextCount: 6,
        mcpServerIds: ["mcp-research"],
        mcpPolicy: "manual",
        skillPolicy: "off",
        maxToolSteps: 10,
        workingDirs: [],
        kbIds: ["kb-research"],
        kbRecallTopK: 5,
        kbRecallMinScore: 0.75,
        createdAt: 2,
        updatedAt: 2,
      },
    ] as any;

    chatStore.setScenario("research-scenario");
    chatStore.setModel("mock::deep");
    chatStore.setProject("project-pending");
    chatStore.updateSessionMcpServers(["mcp-custom"]);
    chatStore.updateSessionMcpPolicy("off");
    chatStore.updateSessionMode("agent");
    chatStore.updateSessionWebSearch("native");
    chatStore.updateSessionThinking("deep");

    expect(chatStore.pendingScenarioId).toBe("research-scenario");
    expect(chatStore.pendingModel).toBe("mock::deep");
    expect(chatStore.pendingProjectId).toBe("project-pending");
    expect(chatStore.pendingMcpServerIds).toEqual(["mcp-custom"]);
    expect(chatStore.pendingMcpPolicy).toBe("off");
    expect(chatStore.pendingSkillPolicy).toBe("off");
    expect(chatStore.pendingMode).toBe("agent");
    expect(chatStore.pendingWebSearch).toBe("native");
    expect(chatStore.pendingThinking).toBe("deep");
    expect(chatStore.sessionKbIds).toEqual(["kb-research"]);
    expect(chatStore.effectiveKbIds).toEqual(["kb-research"]);
    expect(chatStore.tempKbIds).toEqual([]);
  });

  it("persists session configuration updates through ipc and local state", async () => {
    const session = createSessionFixture({ id: "session-config" });
    const { chatStore } = setupStores();
    const { ipcMock } = installRendererWindowMocks(async (channel) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return [];
        case "turns:listBySession":
          return [];
        case "sessions:updateScenario":
        case "sessions:updateModel":
        case "sessions:updateProject":
        case "sessions:updateMcpServers":
        case "sessions:updateMcpPolicy":
        case "sessions:updateMode":
        case "sessions:updateWebSearch":
        case "sessions:updateThinking":
          return { ok: true };
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);

    chatStore.setScenario("research-scenario");
    chatStore.setModel("mock::deep");
    chatStore.setProject("project-research");
    chatStore.updateSessionMcpServers(["mcp-1", "mcp-2"]);
    chatStore.updateSessionMcpPolicy("manual");
    chatStore.updateSessionMode("agent");
    chatStore.updateSessionWebSearch("native");
    chatStore.updateSessionThinking("deep");

    expect(ipcMock).toHaveBeenCalledWith("sessions:updateScenario", { id: session.id, scenarioId: "research-scenario" });
    expect(ipcMock).toHaveBeenCalledWith("sessions:updateModel", { id: session.id, selectedModel: "mock::deep" });
    expect(ipcMock).toHaveBeenCalledWith("sessions:updateProject", { id: session.id, projectId: "project-research" });
    expect(ipcMock).toHaveBeenCalledWith("sessions:updateMcpServers", { id: session.id, mcpServerIds: ["mcp-1", "mcp-2"] });
    expect(ipcMock).toHaveBeenCalledWith("sessions:updateMcpPolicy", { id: session.id, mcpPolicy: "manual" });
    expect(ipcMock).toHaveBeenCalledWith("sessions:updateMode", { id: session.id, mode: "agent" });
    expect(ipcMock).toHaveBeenCalledWith("sessions:updateWebSearch", { id: session.id, webSearch: "native" });
    expect(ipcMock).toHaveBeenCalledWith("sessions:updateThinking", { id: session.id, thinking: "deep" });

    expect(chatStore.currentSession).toMatchObject({
      id: session.id,
      scenarioId: "research-scenario",
      selectedModel: "mock::deep",
      projectId: "project-research",
      mcpServerIds: ["mcp-1", "mcp-2"],
      mcpPolicy: "manual",
      mode: "agent",
      webSearch: "native",
      thinking: "deep",
    });
  });

  it("moves a session to another category and refreshes the session list", async () => {
    const session = createSessionFixture({ id: "session-move-project", projectId: "project-old" });
    const movedSession = createSessionFixture({ id: session.id, projectId: "project-new", updatedAt: 3 });
    const { chatStore } = setupStores();
    const { ipcMock } = installRendererWindowMocks(async (channel, payload) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return [];
        case "turns:listBySession":
          return [];
        case "sessions:moveToProject":
          return { sessionIds: [payload.id] };
        case "sessions:list":
          return [movedSession];
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);

    await expect(chatStore.moveSessionToProject(session.id, "project-new")).resolves.toBe(1);

    expect(ipcMock).toHaveBeenCalledWith("sessions:moveToProject", {
      id: session.id,
      projectId: "project-new",
    });
    expect(ipcMock).toHaveBeenCalledWith("sessions:list");
    expect(chatStore.currentSession).toMatchObject({
      id: session.id,
      projectId: "project-new",
    });
  });

  it("updates favorite and archive flags through ipc and local state", async () => {
    const session = createSessionFixture({
      id: "session-flags",
      isFavorite: false,
      isArchived: false,
    });
    const { chatStore } = setupStores();
    const { ipcMock } = installRendererWindowMocks(async (channel) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return [];
        case "turns:listBySession":
          return [];
        case "sessions:updateFavorite":
        case "sessions:updateArchive":
          return { ok: true };
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);

    await chatStore.updateSessionFavorite(session.id, true);
    await chatStore.updateSessionArchive(session.id, true);

    expect(ipcMock).toHaveBeenCalledWith("sessions:updateFavorite", {
      id: session.id,
      isFavorite: true,
    });
    expect(ipcMock).toHaveBeenCalledWith("sessions:updateArchive", {
      id: session.id,
      isArchived: true,
    });
    expect(chatStore.currentSession).toMatchObject({
      id: session.id,
      isFavorite: true,
      isArchived: true,
    });
  });

  it("applies text streaming and finish events to messages and turns", async () => {
    const session = createSessionFixture();
    const turn = createTurnFixture();
    const { chatStore } = setupStores();

    installRendererWindowMocks(async (channel, payload) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return [];
        case "turns:listBySession":
          return [turn];
        case "messages:get":
          return {
            id: payload.id,
            sessionId: session.id,
            turnId: turn.id,
            role: "assistant",
            parts: [{ type: "text", text: "Hello world" }],
            status: "success",
            createdAt: 3,
            updatedAt: 4,
          };
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);

    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-1",
      turnId: turn.id,
      chunk: { type: "text-start" } as any,
    });
    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-1",
      turnId: turn.id,
      chunk: { type: "text-delta", delta: "Hello world" } as any,
    });
    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-1",
      turnId: turn.id,
      chunk: {
        type: "finish",
        messageMetadata: {
          tokenUsage: { inputTokens: 3, outputTokens: 5 },
        },
      } as any,
    });

    expect(chatStore.messages).toHaveLength(1);
    expect(chatStore.messages[0]?.status).toBe("success");
    expect(chatStore.messages[0]?.parts[0]).toEqual({ type: "text", text: "Hello world" });
    expect(chatStore.messages[0]?.tokenUsage).toEqual({ inputTokens: 3, outputTokens: 5 });
    expect(chatStore.currentTurns[0]?.status).toBe("success");
    expect(chatStore.currentTurns[0]?.tokenUsage).toEqual({ inputTokens: 3, outputTokens: 5 });
  });

  it("reloads the whole session after finish when multiple messages were created", async () => {
    const session = createSessionFixture({ id: "session-finish-reload" });
    const turn = createTurnFixture({
      id: "turn-finish-reload",
      sessionId: session.id,
      assistantMessageId: "assistant-finish-reload",
    });
    const reloadedMessages = [
      {
        id: "assistant-finish-reload",
        sessionId: session.id,
        turnId: turn.id,
        role: "assistant",
        parts: [{ type: "text", text: "Final answer after tool" }],
        status: "success",
        createdAt: 2,
        updatedAt: 3,
      },
      {
        id: "tool-message-1",
        sessionId: session.id,
        turnId: turn.id,
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "system::run_command",
            toolCallId: "tool-1",
            state: "output-available",
            output: { stdout: "/workspace" },
          },
        ],
        status: "success",
        createdAt: 4,
        updatedAt: 4,
      },
    ];
    let displayMessagesCallCount = 0;
    const { chatStore } = setupStores();

    installRendererWindowMocks(async (channel) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          displayMessagesCallCount += 1;
          return displayMessagesCallCount === 1 ? [] : reloadedMessages;
        case "turns:listBySession":
          return [turn];
        case "messages:get":
          return null;
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);

    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-finish-reload",
      turnId: turn.id,
      chunk: { type: "text-start" } as any,
    });
    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-finish-reload",
      turnId: turn.id,
      chunk: {
        type: "finish",
        messageMetadata: {
          createdMessageIds: ["assistant-finish-reload", "tool-message-1"],
          tokenUsage: { inputTokens: 9, outputTokens: 12 },
        },
      } as any,
    });

    expect(chatStore.messages).toHaveLength(2);
    expect(chatStore.messages[0]?.id).toBe("assistant-finish-reload");
    expect(chatStore.messages[0]?.parts[0]).toEqual({ type: "text", text: "Final answer after tool" });
    expect(chatStore.messages[0]?.tokenUsage).toEqual({ inputTokens: 9, outputTokens: 12 });
    expect(chatStore.messages[1]?.id).toBe("tool-message-1");
    expect(chatStore.currentTurns[0]?.status).toBe("success");
    expect(chatStore.currentTurns[0]?.tokenUsage).toEqual({ inputTokens: 9, outputTokens: 12 });
  });

  it("tracks tool approval flow and rejection state", async () => {
    const session = createSessionFixture();
    const turn = createTurnFixture({ id: "turn-2" });
    const { chatStore } = setupStores();

    installRendererWindowMocks(async (channel) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return [];
        case "turns:listBySession":
          return [turn];
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);

    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-2",
      turnId: turn.id,
      chunk: {
        type: "tool-input-available",
        toolCallId: "tool-1",
        toolName: "shell",
        input: { command: "pwd" },
      } as any,
    });
    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-2",
      turnId: turn.id,
      chunk: {
        type: "tool-approval-request",
        toolCallId: "tool-1",
        approvalId: "approval-1",
      } as any,
    });
    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-2",
      turnId: turn.id,
      chunk: {
        type: "tool-approval-responded",
        toolCallId: "tool-1",
        approvalId: "approval-1",
        approved: false,
      } as any,
    });

    expect(chatStore.messages).toHaveLength(1);
    const toolPart = chatStore.messages[0]?.parts.find((part: any) => part.type === "dynamic-tool") as any;
    expect(toolPart?.state).toBe("output-error");
    expect(toolPart?.errorText).toContain("rejected");
    expect(chatStore.currentTurns[0]?.status).toBe("awaiting_approval");
  });

  it("submits tool approval from the current session and clears the pending flag afterwards", async () => {
    const session = createSessionFixture({ id: "session-approval-submit" });
    const turn = createTurnFixture({ id: "turn-approval-submit", sessionId: session.id });
    const approvalDeferred = createDeferred<{ ok: true }>();
    const { chatStore } = setupStores();
    const { ipcMock } = installRendererWindowMocks(async (channel, payload) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return [];
        case "turns:listBySession":
          return [turn];
        case "chat:submitToolApproval":
          return approvalDeferred.promise;
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);

    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-approval-submit",
      turnId: turn.id,
      chunk: {
        type: "tool-input-available",
        toolCallId: "tool-submit",
        toolName: "shell",
        input: { command: "pwd" },
      } as any,
    });
    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-approval-submit",
      turnId: turn.id,
      chunk: {
        type: "tool-approval-request",
        toolCallId: "tool-submit",
        approvalId: "approval-submit",
      } as any,
    });

    const submitPromise = chatStore.confirmToolExecution("tool-submit", "allow-and-whitelist");

    expect(chatStore.isSubmittingApproval).toBe(true);
    expect(chatStore.isBusy).toBe(true);

    approvalDeferred.resolve({ ok: true });
    await submitPromise;

    expect(ipcMock).toHaveBeenCalledWith("chat:submitToolApproval", {
      sessionId: session.id,
      approvalId: "approval-submit",
      approved: true,
      reason: undefined,
      addToWhitelist: true,
      toolName: "shell",
      args: { command: "pwd" },
    });
    expect(chatStore.isSubmittingApproval).toBe(false);
  });

  it("clears the submitting flag when tool approval submission fails", async () => {
    const session = createSessionFixture({ id: "session-approval-error" });
    const { chatStore } = setupStores();

    installRendererWindowMocks(async (channel) => {
      switch (channel) {
        case "chat:submitToolApproval":
          return { ok: false, error: "approval failed" };
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    chatStore.currentSessionId = session.id as any;

    await expect(
      chatStore.confirmToolExecution("tool-fallback", "reject", {
        sessionId: session.id,
        approvalId: "approval-fallback",
        toolName: "shell",
        input: { command: "rm -rf /tmp/test" },
        messageId: "assistant-fallback",
      })
    ).rejects.toThrow("approval failed");

    expect(chatStore.isSubmittingApproval).toBe(false);
  });

  it("reuses the existing turn when regenerating in overwrite mode", async () => {
    const session = createSessionFixture();
    const turn = createTurnFixture({
      id: "turn-regen",
      userMessageId: "user-regen",
      assistantMessageId: "assistant-regen",
      status: "success",
    });
    const userMessage = {
      id: "user-regen",
      sessionId: session.id,
      turnId: turn.id,
      role: "user",
      parts: [{ type: "text", text: "Original question" }],
      status: "success",
      createdAt: 1,
      updatedAt: 1,
    };
    const assistantMessage = {
      id: "assistant-regen",
      sessionId: session.id,
      turnId: turn.id,
      role: "assistant",
      parts: [{ type: "text", text: "Original answer" }],
      status: "success",
      createdAt: 2,
      updatedAt: 2,
    };

    const { chatStore } = setupStores();
    const { ipcMock } = installRendererWindowMocks(async (channel, payload) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return [userMessage, assistantMessage];
        case "turns:listBySession":
          return [turn];
        case "messages:getParentUserMessage":
          return {
            ok: true,
            parentMessage: userMessage,
          };
        case "chat:send":
          return { ok: true };
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);
    await chatStore.regenerateAndOverwrite(assistantMessage.id);

    expect(chatStore.messages[1]?.status).toBe("pending");
    expect(chatStore.messages[1]?.parts).toEqual([]);
    expect(chatStore.currentTurns[0]?.id).toBe(turn.id);
    expect(chatStore.currentTurns[0]?.status).toBe("pending");

    const sendCall = ipcMock.mock.calls.find(([channel]) => channel === "chat:send");
    expect(sendCall?.[1]?.turnId).toBe(turn.id);
    expect(sendCall?.[1]?.existingAssistantMessageId).toBe(assistantMessage.id);
    expect(sendCall?.[1]?.userMessageId).toBe(userMessage.id);
  });

  it("rebuilds the RAG prompt from parent user context sources during regenerate", async () => {
    const session = createSessionFixture({ id: "session-rag" });
    const turn = createTurnFixture({
      id: "turn-rag",
      sessionId: session.id,
      userMessageId: "user-rag",
      assistantMessageId: "assistant-rag",
      status: "success",
    });
    const userMessage = {
      id: "user-rag",
      sessionId: session.id,
      turnId: turn.id,
      role: "user",
      parts: [{ type: "text", text: "How does this work?" }],
      contextSources: [
        {
          index: 1,
          id: "S1",
          kind: "knowledge",
          source: "KB",
          title: "Doc 1",
          content: "Important knowledge snippet",
        },
      ],
      status: "success",
      createdAt: 1,
      updatedAt: 1,
    };
    const assistantMessage = {
      id: "assistant-rag",
      sessionId: session.id,
      turnId: turn.id,
      role: "assistant",
      parts: [{ type: "text", text: "Original answer" }],
      status: "success",
      createdAt: 2,
      updatedAt: 2,
    };

    const { chatStore } = setupStores();
    const { ipcMock } = installRendererWindowMocks(async (channel, payload) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return [userMessage, assistantMessage];
        case "turns:listBySession":
          return [turn];
        case "messages:getParentUserMessage":
          return {
            ok: true,
            parentMessage: userMessage,
          };
        case "chat:send":
          return { ok: true };
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);
    await chatStore.regenerateAndOverwrite(assistantMessage.id);

    const sendPayload = ipcMock.mock.calls.find(([channel]) => channel === "chat:send")?.[1];
    expect(sendPayload.citationRequired).toBe(true);
    expect(sendPayload.citationStartIndex).toBe(1);
    expect(sendPayload.messages).toHaveLength(1);
    expect(sendPayload.messages[0]?.role).toBe("user");
    expect(sendPayload.messages[0]?.parts[0]?.text).toContain("Reference materials (1):");
    expect(sendPayload.messages[0]?.parts[0]?.text).toContain("Important knowledge snippet");
    expect(sendPayload.messages[0]?.parts[0]?.text).toContain("User question:\nHow does this work?");
  });

  it("uses the style prompt as the new final user message while preserving images", async () => {
    const session = createSessionFixture({ id: "session-style" });
    const turn = createTurnFixture({
      id: "turn-style",
      sessionId: session.id,
      userMessageId: "user-style",
      assistantMessageId: "assistant-style",
      status: "success",
    });
    const userMessage = {
      id: "user-style",
      sessionId: session.id,
      turnId: turn.id,
      role: "user",
      parts: [
        { type: "text", text: "Original prompt" },
        { type: "file", mediaType: "image/png", url: "file:///tmp/original.png" },
      ],
      status: "success",
      createdAt: 1,
      updatedAt: 1,
    };
    const assistantMessage = {
      id: "assistant-style",
      sessionId: session.id,
      turnId: turn.id,
      role: "assistant",
      parts: [{ type: "text", text: "Original answer" }],
      status: "success",
      createdAt: 2,
      updatedAt: 2,
    };

    const { chatStore } = setupStores();
    const { ipcMock } = installRendererWindowMocks(async (channel) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return [userMessage, assistantMessage];
        case "turns:listBySession":
          return [turn];
        case "messages:getParentUserMessage":
          return {
            ok: true,
            parentMessage: userMessage,
          };
        case "chat:send":
          return { ok: true };
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);
    await chatStore.regenerateAndOverwrite(assistantMessage.id, {
      stylePrompt: "Rewrite this in a sharper style",
    });

    const sendPayload = ipcMock.mock.calls.find(([channel]) => channel === "chat:send")?.[1];
    expect(sendPayload.messages).toHaveLength(3);
    expect(sendPayload.messages[0]?.parts[0]?.text).toBe("Original prompt");
    expect(sendPayload.messages[1]?.parts[0]?.text).toBe("Original answer");
    expect(sendPayload.messages[2]?.role).toBe("user");
    expect(sendPayload.messages[2]?.parts[0]).toEqual({
      type: "text",
      text: "Rewrite this in a sharper style",
    });
    expect(sendPayload.messages[2]?.parts[1]).toEqual({
      type: "file",
      mediaType: "image/png",
      url: "file:///tmp/original.png",
    });
  });

  it("creates a new branch session and sends regenerate request there", async () => {
    const session = createSessionFixture({ id: "session-parent" });
    const branchSession = createSessionFixture({
      id: "session-branch",
      title: "Session Branch",
      rootSessionId: "session-parent",
      parentSessionId: "session-parent",
      forkFromMessageId: "user-branch",
      forkPointMessageId: "user-branch-copy",
    });
    const parentTurn = createTurnFixture({
      id: "turn-parent",
      sessionId: session.id,
      userMessageId: "user-branch",
      assistantMessageId: "assistant-branch",
      status: "success",
    });
    const userMessage = {
      id: "user-branch",
      sessionId: session.id,
      turnId: parentTurn.id,
      role: "user",
      parts: [{ type: "text", text: "Branch me" }],
      status: "success",
      createdAt: 1,
      updatedAt: 1,
    };
    const assistantMessage = {
      id: "assistant-branch",
      sessionId: session.id,
      turnId: parentTurn.id,
      role: "assistant",
      parts: [{ type: "text", text: "Original branch answer" }],
      status: "success",
      createdAt: 2,
      updatedAt: 2,
    };
    const branchCopiedUser = {
      id: "user-branch-copy",
      sessionId: branchSession.id,
      turnId: "turn-copied",
      role: "user",
      parts: [{ type: "text", text: "Branch me" }],
      status: "success",
      createdAt: 1,
      updatedAt: 1,
    };
    const branchCopiedTurn = createTurnFixture({
      id: "turn-copied",
      sessionId: branchSession.id,
      userMessageId: branchCopiedUser.id,
      assistantMessageId: null,
      status: "success",
    });

    const { chatStore } = setupStores();
    const { ipcMock } = installRendererWindowMocks(async (channel, payload) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return payload.sessionId === session.id
            ? [userMessage, assistantMessage]
            : [branchCopiedUser];
        case "turns:listBySession":
          return payload.sessionId === session.id
            ? [parentTurn]
            : [branchCopiedTurn];
        case "messages:getParentUserMessage":
          return {
            ok: true,
            parentMessage: userMessage,
          };
        case "sessions:createBranch":
          return branchSession;
        case "chat:send":
          return { ok: true };
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);
    await chatStore.regenerateInBranch(assistantMessage.id);

    expect(chatStore.currentSessionId).toBe(branchSession.id);
    expect(chatStore.sessions.some((item) => item.id === branchSession.id)).toBe(true);
    expect(chatStore.messages.some((message) => message.role === "assistant" && message.status === "pending")).toBe(true);

    const sendCall = ipcMock.mock.calls.findLast(([channel]) => channel === "chat:send");
    expect(sendCall?.[1]?.sessionId).toBe(branchSession.id);
    expect(sendCall?.[1]?.assistantMessageId).toBeTruthy();
    expect(sendCall?.[1]?.messages).toHaveLength(1);
    expect(sendCall?.[1]?.messages[0]?.role).toBe("user");
    expect(sendCall?.[1]?.messages[0]?.parts[0]?.text).toBe("Branch me");
  });

  it("does not create a branch when regenerating from a temporary session", async () => {
    const session = createSessionFixture({
      id: "session-temp",
      isTemporary: true,
      temporaryType: "session",
    });
    const turn = createTurnFixture({
      id: "turn-temp",
      sessionId: session.id,
      userMessageId: "user-temp",
      assistantMessageId: "assistant-temp",
      status: "success",
    });
    const userMessage = {
      id: "user-temp",
      sessionId: session.id,
      turnId: turn.id,
      role: "user",
      parts: [{ type: "text", text: "Temporary question" }],
      status: "success",
      createdAt: 1,
      updatedAt: 1,
    };
    const assistantMessage = {
      id: "assistant-temp",
      sessionId: session.id,
      turnId: turn.id,
      role: "assistant",
      parts: [{ type: "text", text: "Temporary answer" }],
      status: "success",
      createdAt: 2,
      updatedAt: 2,
    };

    const { chatStore } = setupStores();
    const { ipcMock } = installRendererWindowMocks(async (channel) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return [userMessage, assistantMessage];
        case "turns:listBySession":
          return [turn];
        case "messages:getParentUserMessage":
          return {
            ok: true,
            parentMessage: userMessage,
          };
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);
    await chatStore.regenerateInBranch(assistantMessage.id);

    expect(ipcMock.mock.calls.some(([channel]) => channel === "sessions:createBranch")).toBe(false);
    expect(ipcMock.mock.calls.some(([channel]) => channel === "chat:send")).toBe(false);
  });

  it("tracks approved tool execution through to an available output", async () => {
    const session = createSessionFixture({ id: "session-tools" });
    const turn = createTurnFixture({
      id: "turn-tools",
      sessionId: session.id,
      userMessageId: "user-tools",
      assistantMessageId: "assistant-tools",
    });
    const { chatStore } = setupStores();

    installRendererWindowMocks(async (channel) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return [];
        case "turns:listBySession":
          return [turn];
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);

    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-tools",
      turnId: turn.id,
      chunk: {
        type: "tool-input-available",
        toolCallId: "tool-approve",
        toolName: "shell",
        input: { command: "pwd" },
      } as any,
    });
    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-tools",
      turnId: turn.id,
      chunk: {
        type: "tool-approval-request",
        toolCallId: "tool-approve",
        approvalId: "approval-approve",
      } as any,
    });
    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-tools",
      turnId: turn.id,
      chunk: {
        type: "tool-approval-responded",
        toolCallId: "tool-approve",
        approvalId: "approval-approve",
        approved: true,
      } as any,
    });
    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-tools",
      turnId: turn.id,
      chunk: {
        type: "tool-execution-started",
        toolCallId: "tool-approve",
      } as any,
    });
    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-tools",
      turnId: turn.id,
      chunk: {
        type: "tool-output-available",
        toolCallId: "tool-approve",
        output: { stdout: "/tmp/workspace" },
      } as any,
    });

    expect(chatStore.messages).toHaveLength(1);
    const toolPart = chatStore.messages[0]?.parts.find((part: any) => part.type === "dynamic-tool") as any;
    expect(toolPart).toMatchObject({
      type: "dynamic-tool",
      toolName: "shell",
      toolCallId: "tool-approve",
      state: "output-available",
      output: { stdout: "/tmp/workspace" },
    });
    expect(chatStore.currentTurns[0]?.status).toBe("streaming");
    expect(chatStore.isSessionStreaming(session.id)).toBe(true);
  });

  it("marks local state as aborted before delegating abort to the main process", async () => {
    const session = createSessionFixture({ id: "session-abort" });
    const turn = createTurnFixture({
      id: "turn-abort",
      sessionId: session.id,
      assistantMessageId: "assistant-abort",
      status: "streaming",
    });
    const assistantMessage = {
      id: "assistant-abort",
      sessionId: session.id,
      turnId: turn.id,
      role: "assistant",
      parts: [
        { type: "reasoning", text: "thinking", state: "streaming" },
        {
          type: "dynamic-tool",
          toolName: "shell",
          toolCallId: "tool-abort",
          state: "approval-requested",
          input: { command: "pwd" },
          approval: { id: "approval-abort" },
        },
      ],
      status: "streaming",
      createdAt: 1,
      updatedAt: 1,
    };

    const { chatStore } = setupStores();
    const { ipcMock } = installRendererWindowMocks(async (channel) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return [assistantMessage];
        case "turns:listBySession":
          return [turn];
        case "chat:abort":
          return { ok: true };
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);
    await chatStore.abortChat(session.id);

    expect(ipcMock).toHaveBeenCalledWith("chat:abort", { sessionId: session.id });
    expect(chatStore.messages[0]?.status).toBe("aborted");
    expect((chatStore.messages[0]?.parts[0] as any)?.state).toBe("done");

    const toolPart = chatStore.messages[0]?.parts[1] as any;
    expect(toolPart.state).toBe("output-error");
    expect(toolPart.errorText.toLowerCase()).toContain("aborted");
    expect(toolPart.approval).toEqual({ id: "approval-abort" });
    expect(chatStore.currentTurns[0]?.status).toBe("aborted");
    expect(chatStore.isSessionStreaming(session.id)).toBe(false);
  });

  it("preserves the partial assistant content when a stream error arrives", async () => {
    const session = createSessionFixture({ id: "session-error" });
    const turn = createTurnFixture({
      id: "turn-error",
      sessionId: session.id,
      assistantMessageId: "assistant-error",
      status: "streaming",
    });
    const assistantMessage = {
      id: "assistant-error",
      sessionId: session.id,
      turnId: turn.id,
      role: "assistant",
      parts: [{ type: "text", text: "Partial answer" }],
      status: "streaming",
      createdAt: 1,
      updatedAt: 1,
    };

    const { chatStore } = setupStores();
    installRendererWindowMocks(async (channel) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          return [assistantMessage];
        case "turns:listBySession":
          return [turn];
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);

    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: assistantMessage.id,
      turnId: turn.id,
      tokenUsage: { inputTokens: 8, outputTokens: 13 },
      chunk: {
        type: "error",
        errorText: "upstream failed",
      } as any,
    });

    expect(chatStore.messages[0]?.status).toBe("error");
    expect(chatStore.messages[0]?.parts).toEqual([{ type: "text", text: "Partial answer" }]);
    expect(chatStore.messages[0]?.tokenUsage).toEqual({ inputTokens: 8, outputTokens: 13 });
    expect(chatStore.currentTurns[0]?.status).toBe("error");
    expect(chatStore.currentTurns[0]?.error).toBe("upstream failed");
    expect(chatStore.currentTurns[0]?.tokenUsage).toEqual({ inputTokens: 8, outputTokens: 13 });
    expect(chatStore.isSessionStreaming(session.id)).toBe(false);
  });

  it("reloads the whole session after abort when multiple messages were created", async () => {
    const session = createSessionFixture({ id: "session-abort-reload" });
    const turn = createTurnFixture({
      id: "turn-abort-reload",
      sessionId: session.id,
      assistantMessageId: "assistant-abort-reload",
      status: "streaming",
    });
    const initialMessages = [
      {
        id: "assistant-abort-reload",
        sessionId: session.id,
        turnId: turn.id,
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "system::run_command",
            toolCallId: "tool-reload",
            state: "input-streaming",
            input: { command: "pwd" },
          },
        ],
        status: "streaming",
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const reloadedMessages = [
      {
        id: "assistant-abort-reload",
        sessionId: session.id,
        turnId: turn.id,
        role: "assistant",
        parts: [{ type: "text", text: "Partial answer" }],
        status: "aborted",
        createdAt: 2,
        updatedAt: 3,
      },
      {
        id: "tool-message-abort",
        sessionId: session.id,
        turnId: turn.id,
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "system::run_command",
            toolCallId: "tool-reload",
            state: "output-available",
            output: { stdout: "/workspace" },
          },
        ],
        status: "success",
        createdAt: 4,
        updatedAt: 4,
      },
    ];
    let displayMessagesCallCount = 0;
    const { chatStore } = setupStores();

    installRendererWindowMocks(async (channel) => {
      switch (channel) {
        case "messages:getDisplayMessages":
          displayMessagesCallCount += 1;
          return displayMessagesCallCount === 1 ? initialMessages : reloadedMessages;
        case "turns:listBySession":
          return [turn];
        default:
          return null;
      }
    });

    chatStore.sessions = [session as any];
    await chatStore.switchSession(session.id);

    await chatStore.handleStreamChunk({
      sessionId: session.id,
      messageId: "assistant-abort-reload",
      turnId: turn.id,
      createdMessageIds: ["assistant-abort-reload", "tool-message-abort"],
      tokenUsage: { inputTokens: 6, outputTokens: 8 },
      chunk: { type: "abort" } as any,
    });

    expect(chatStore.messages).toHaveLength(2);
    expect(chatStore.messages[0]?.status).toBe("aborted");
    expect(chatStore.messages[0]?.parts[0]).toEqual({ type: "text", text: "Partial answer" });
    expect(chatStore.messages[0]?.tokenUsage).toEqual({ inputTokens: 6, outputTokens: 8 });
    expect(chatStore.messages[1]?.id).toBe("tool-message-abort");
    expect(chatStore.currentTurns[0]?.status).toBe("aborted");
    expect(chatStore.currentTurns[0]?.tokenUsage).toEqual({ inputTokens: 6, outputTokens: 8 });
    expect(chatStore.isSessionStreaming(session.id)).toBe(false);
  });
});
