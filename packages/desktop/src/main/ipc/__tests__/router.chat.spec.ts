import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserWindow } from "electron";

const {
  executeChatMock,
  executeChatWithToolApprovalMock,
  executeChatWithToolApprovalsMock,
  getLatestTurnByUserMessageIdMock,
  listMcpServersMock,
  listSkillsMock,
  routeMcpServerIdsMock,
  routeSkillMock,
  updateSessionMcpPolicyMock,
  updateSessionModeMock,
  updateSessionModelMock,
  updateSessionScenarioMock,
  updateSessionThinkingMock,
  updateSessionWebSearchMock,
  updateTurnMock,
} = vi.hoisted(() => ({
  executeChatMock: vi.fn(),
  executeChatWithToolApprovalMock: vi.fn(),
  executeChatWithToolApprovalsMock: vi.fn(),
  getLatestTurnByUserMessageIdMock: vi.fn(),
  listMcpServersMock: vi.fn(),
  listSkillsMock: vi.fn(),
  routeMcpServerIdsMock: vi.fn(),
  routeSkillMock: vi.fn(),
  updateSessionMcpPolicyMock: vi.fn(),
  updateSessionModeMock: vi.fn(),
  updateSessionModelMock: vi.fn(),
  updateSessionScenarioMock: vi.fn(),
  updateSessionThinkingMock: vi.fn(),
  updateSessionWebSearchMock: vi.fn(),
  updateTurnMock: vi.fn(),
}));

vi.mock("typed-electron-ipc", () => ({
  ipcRouter: (handlers: Record<string, unknown>) => handlers,
}));

vi.mock("../../services/chat/chatService", () => ({
  executeChat: executeChatMock,
  executeChatWithToolApproval: executeChatWithToolApprovalMock,
  executeChatWithToolApprovals: executeChatWithToolApprovalsMock,
}));

vi.mock("../../services/chat/turnData", async () => {
  const actual = await vi.importActual<typeof import("../../services/chat/turnData")>("../../services/chat/turnData");
  return {
    ...actual,
    getLatestTurnByUserMessageId: getLatestTurnByUserMessageIdMock,
    updateTurn: updateTurnMock,
  };
});

vi.mock("../../services/chat/sessionData", async () => {
  const actual = await vi.importActual<typeof import("../../services/chat/sessionData")>("../../services/chat/sessionData");
  return {
    ...actual,
    updateSessionModel: updateSessionModelMock,
    updateSessionScenario: updateSessionScenarioMock,
    updateSessionMcpPolicy: updateSessionMcpPolicyMock,
    updateSessionMode: updateSessionModeMock,
    updateSessionWebSearch: updateSessionWebSearchMock,
    updateSessionThinking: updateSessionThinkingMock,
  };
});

vi.mock("../../services/skill", async () => {
  const actual = await vi.importActual<typeof import("../../services/skill")>("../../services/skill");
  return {
    ...actual,
    listSkills: listSkillsMock,
    routeSkill: routeSkillMock,
  };
});

vi.mock("../../services/mcp/mcpData", async () => {
  const actual = await vi.importActual<typeof import("../../services/mcp/mcpData")>("../../services/mcp/mcpData");
  return {
    ...actual,
    listMcpServers: listMcpServersMock,
  };
});

vi.mock("../../services/mcp/mcpRouter", () => ({
  routeMcpServerIds: routeMcpServerIdsMock,
}));

const { router } = await import("../router");

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

async function waitUntil(assertion: () => void, options?: { timeoutMs?: number; intervalMs?: number }) {
  const timeoutMs = options?.timeoutMs ?? 1000;
  const intervalMs = options?.intervalMs ?? 10;
  const start = Date.now();

  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - start >= timeoutMs) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

describe("router chat handlers", () => {
  const browserWindowMock = {
    webContents: {
      send: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(browserWindowMock as any);

    executeChatMock.mockResolvedValue({ ok: true });
    executeChatWithToolApprovalMock.mockResolvedValue({ ok: true });
    executeChatWithToolApprovalsMock.mockResolvedValue({ ok: true });
    getLatestTurnByUserMessageIdMock.mockReturnValue({
      id: "turn-1",
    });
    listSkillsMock.mockReturnValue([]);
    listMcpServersMock.mockReturnValue([]);
    routeSkillMock.mockResolvedValue(null);
    routeMcpServerIdsMock.mockResolvedValue([]);
  });

  it("routes agent requests, persists derived turn metadata, and clears abort state", async () => {
    listSkillsMock.mockReturnValue([{ id: "skill-1" }]);
    listMcpServersMock.mockReturnValue([
      { id: "mcp-1", enabled: true },
      { id: "mcp-2", enabled: false },
    ]);
    routeSkillMock.mockResolvedValue("skill-1");
    routeMcpServerIdsMock.mockResolvedValue(["mcp-1"]);

    const result = await router["chat:send"](
      { sender: {} } as any,
      {
        sessionId: "session-1",
        userMessageId: "user-1",
        messages: [{ role: "user", parts: [{ type: "text", text: "Open repo status" }] }],
        selectedModel: "mock::general",
        mode: "agent",
        skillSelection: { mode: "auto" },
        mcpSelection: { mode: "auto" },
        citationRequired: true,
        citationStartIndex: 3,
      }
    );

    expect(result).toEqual({ ok: true });
    expect(routeSkillMock).toHaveBeenCalledWith("Open repo status");
    expect(routeMcpServerIdsMock).toHaveBeenCalledWith({
      contextForRouter: "Open repo status",
      candidates: [{ id: "mcp-1", enabled: true }],
      skillId: "skill-1",
    });
    expect(executeChatMock).toHaveBeenCalledTimes(1);

    const executeChatInput = executeChatMock.mock.calls[0]?.[0];
    expect(executeChatInput).toMatchObject({
      sessionId: "session-1",
      userMessageId: "user-1",
      selectedModel: "mock::general",
      skillId: "skill-1",
      mcpServerIds: ["mcp-1"],
      citationRequired: true,
      citationStartIndex: 3,
      window: browserWindowMock,
    });
    expect(executeChatInput.abortSignal).toBeInstanceOf(AbortSignal);

    expect(updateTurnMock).toHaveBeenCalledWith("turn-1", {
      skillId: "skill-1",
      citationRequired: true,
      citationStartIndex: 3,
    });

    await expect(router["chat:abort"]({} as any, { sessionId: "session-1" })).resolves.toEqual({ ok: true });
  });

  it("returns an explicit failure when BrowserWindow is unavailable", async () => {
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null as any);

    await expect(
      router["chat:send"](
        { sender: {} } as any,
        {
          sessionId: "session-missing-window",
          messages: [{ role: "user", parts: [{ type: "text", text: "Hello" }] }],
          selectedModel: "mock::general",
          mode: "chat",
        }
      )
    ).resolves.toEqual({
      ok: false,
      error: "BrowserWindow not available for chat:send",
    });

    await expect(
      router["chat:submitToolApproval"](
        { sender: {} } as any,
        {
          sessionId: "session-missing-window",
          approvalId: "approval-1",
          approved: true,
          toolName: "shell",
        }
      )
    ).resolves.toEqual({
      ok: false,
      error: "BrowserWindow not available",
    });
  });

  it("aborts an in-flight chat request", async () => {
    const deferred = createDeferred<{ ok: true }>();
    let seenAbortSignal: AbortSignal | undefined;

    executeChatMock.mockImplementation(async (input: { abortSignal: AbortSignal }) => {
      seenAbortSignal = input.abortSignal;
      return deferred.promise;
    });

    const sendPromise = router["chat:send"](
      { sender: {} } as any,
      {
        sessionId: "session-abort",
        messages: [{ role: "user", parts: [{ type: "text", text: "Long running" }] }],
        selectedModel: "mock::general",
        mode: "chat",
      }
    );

    await waitUntil(() => {
      expect(seenAbortSignal).toBeDefined();
    });

    expect(seenAbortSignal?.aborted).toBe(false);

    await expect(router["chat:abort"]({} as any, { sessionId: "session-abort" })).resolves.toEqual({ ok: true });
    expect(seenAbortSignal?.aborted).toBe(true);

    deferred.resolve({ ok: true });
    await expect(sendPromise).resolves.toEqual({ ok: true });
  });

  it("forwards a single tool approval with the current window and abort signal", async () => {
    const result = await router["chat:submitToolApproval"](
      { sender: {} } as any,
      {
        sessionId: "session-approval",
        approvalId: "approval-1",
        approved: false,
        reason: "Unsafe command",
        addToWhitelist: false,
        toolName: "shell",
        args: { command: "rm -rf /tmp/test" },
      }
    );

    expect(result).toEqual({ ok: true });
    expect(executeChatWithToolApprovalMock).toHaveBeenCalledTimes(1);

    const approvalInput = executeChatWithToolApprovalMock.mock.calls[0]?.[0];
    expect(approvalInput).toMatchObject({
      sessionId: "session-approval",
      approvalId: "approval-1",
      approved: false,
      reason: "Unsafe command",
      addToWhitelist: false,
      toolName: "shell",
      args: { command: "rm -rf /tmp/test" },
      window: browserWindowMock,
    });
    expect(approvalInput.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("sends an error chunk when batched tool approvals fail", async () => {
    executeChatWithToolApprovalsMock.mockRejectedValue(new Error("approval execution failed"));

    const result = await router["chat:submitToolApprovals"](
      { sender: {} } as any,
      {
        sessionId: "session-approvals-error",
        approvals: [
          {
            approvalId: "approval-1",
            approved: true,
            toolName: "shell",
            args: { command: "pwd" },
          },
        ],
      }
    );

    expect(result).toEqual({
      ok: false,
      error: "approval execution failed",
    });
    expect(browserWindowMock.webContents.send).toHaveBeenCalledWith("chat:stream", {
      sessionId: "session-approvals-error",
      messageId: "",
      chunk: {
        type: "error",
        errorText: "approval execution failed",
      },
    });
  });

  it("sends an error chunk and returns failure when executeChat throws", async () => {
    executeChatMock.mockRejectedValue(new Error("stream exploded"));

    const result = await router["chat:send"](
      { sender: {} } as any,
      {
        sessionId: "session-2",
        messages: [{ role: "user", parts: [{ type: "text", text: "Hello" }] }],
        selectedModel: "mock::general",
        mode: "chat",
      }
    );

    expect(result).toEqual({
      ok: false,
      error: "stream exploded",
    });
    expect(browserWindowMock.webContents.send).toHaveBeenCalledWith("chat:stream", {
      sessionId: "session-2",
      messageId: "",
      chunk: {
        type: "error",
        errorText: "stream exploded",
      },
    });

    await expect(router["chat:abort"]({} as any, { sessionId: "session-2" })).resolves.toEqual({ ok: true });
  });

  it("forwards core session configuration updates to the session data layer", async () => {
    await expect(
      router["sessions:updateModel"]({} as any, {
        id: "session-config",
        selectedModel: "mock::deep",
      })
    ).resolves.toEqual({ ok: true });
    expect(updateSessionModelMock).toHaveBeenCalledWith("session-config", "mock::deep");

    await expect(
      router["sessions:updateScenario"]({} as any, {
        id: "session-config",
        scenarioId: "research-scenario",
      })
    ).resolves.toEqual({ ok: true });
    expect(updateSessionScenarioMock).toHaveBeenCalledWith("session-config", "research-scenario");

    await expect(
      router["sessions:updateMcpPolicy"]({} as any, {
        id: "session-config",
        mcpPolicy: "manual",
      })
    ).resolves.toEqual({ ok: true });
    expect(updateSessionMcpPolicyMock).toHaveBeenCalledWith("session-config", "manual");

    await expect(
      router["sessions:updateMode"]({} as any, {
        id: "session-config",
        mode: "agent",
      })
    ).resolves.toEqual({ ok: true });
    expect(updateSessionModeMock).toHaveBeenCalledWith("session-config", "agent");

    await expect(
      router["sessions:updateWebSearch"]({} as any, {
        id: "session-config",
        webSearch: "native",
      })
    ).resolves.toEqual({ ok: true });
    expect(updateSessionWebSearchMock).toHaveBeenCalledWith("session-config", "native");

    await expect(
      router["sessions:updateThinking"]({} as any, {
        id: "session-config",
        thinking: "deep",
      })
    ).resolves.toEqual({ ok: true });
    expect(updateSessionThinkingMock).toHaveBeenCalledWith("session-config", "deep");
  });
});
