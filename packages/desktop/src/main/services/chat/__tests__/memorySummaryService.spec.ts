import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { createSession, getSession } from "../sessionData";
import { createAssistantMessage, createUserMessage } from "../messageData";
import { enqueueSummaryTask } from "../memorySummaryService";
import { createTurn, getLatestTurnByUserMessageId } from "../turnData";
import { useTestDb } from "../../../../../test/helpers/testDb";

const {
  getDefaultModelByTypeMock,
  resolveModelInvocationMock,
} = vi.hoisted(() => ({
  getDefaultModelByTypeMock: vi.fn(),
  resolveModelInvocationMock: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("../../settings/settingsData", async () => {
  const actual = await vi.importActual<typeof import("../../settings/settingsData")>("../../settings/settingsData");
  return {
    ...actual,
    getDefaultModelByType: getDefaultModelByTypeMock,
  };
});

vi.mock("../../providers/modelInvocation", () => ({
  resolveModelInvocation: resolveModelInvocationMock,
}));

function createCompletedRound(params: {
  sessionId: string;
  turnId: string;
  userMessageId: string;
  assistantMessageId: string;
  userText: string;
  assistantText: string;
}) {
  const userMessage = createUserMessage({
    id: params.userMessageId,
    sessionId: params.sessionId,
    turnId: params.turnId,
    parts: [{ type: "text", text: params.userText }],
  });
  const assistantMessage = createAssistantMessage({
    id: params.assistantMessageId,
    sessionId: params.sessionId,
    turnId: params.turnId,
    parts: [{ type: "text", text: params.assistantText }],
    status: "success",
  });

  createTurn({
    id: params.turnId,
    sessionId: params.sessionId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    triggerType: "submit",
    status: "success",
    selectedModel: "mock::general",
  });

  return { userMessage, assistantMessage };
}

async function waitForAssert(assertion: () => void, timeoutMs: number = 2000) {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

describe("memorySummaryService", () => {
  useTestDb("memory-summary-service");

  beforeEach(() => {
    getDefaultModelByTypeMock.mockImplementation((type: string) =>
      type === "fast" ? { providerId: "mock", modelId: "fast-model" } : null
    );
    resolveModelInvocationMock.mockReturnValue({
      client: vi.fn((modelId: string) => ({ modelId })),
    });
    vi.mocked(generateText).mockReset();
  });

  it("summarizes rolled-out rounds, updates session state, and checkpoints the latest turn", async () => {
    const session = createSession("__default__", "default-scenario", "Summary Session");

    const firstRound = createCompletedRound({
      sessionId: session.id,
      turnId: "turn-1",
      userMessageId: "user-1",
      assistantMessageId: "assistant-1",
      userText: "I need a release checklist.",
      assistantText: "We should define deployment steps.",
    });
    const secondRound = createCompletedRound({
      sessionId: session.id,
      turnId: "turn-2",
      userMessageId: "user-2",
      assistantMessageId: "assistant-2",
      userText: "Let's document rollback requirements.",
      assistantText: "Rollback must be rehearsed.",
    });

    vi.mocked(generateText)
      .mockResolvedValueOnce({
        text: [
          "Goal:",
          "- Ship the release checklist",
          "",
          "Decisions:",
          "- Add rollback rehearsal",
          "",
          "Constraints:",
          "- Keep it concise",
          "",
          "Open Questions:",
          "- Who owns approval?",
          "",
          "Next Steps:",
          "- Draft the final checklist",
        ].join("\n"),
      } as any)
      .mockResolvedValueOnce({
        text: "- The user is focused on preparing a release checklist",
      } as any);

    enqueueSummaryTask({
      sessionId: session.id,
      contextCount: 1,
    });

    await waitForAssert(() => {
      const updatedSession = getSession(session.id);
      expect(updatedSession?.stateText).toContain("Ship the release checklist");
      expect(updatedSession?.briefText).toContain("release checklist");
      expect(updatedSession?.stateCursorUserMessageId).toBe(firstRound.userMessage.id);
    });

    const latestTurn = getLatestTurnByUserMessageId(secondRound.userMessage.id);
    expect(latestTurn?.stateText).toContain("Ship the release checklist");
    expect(latestTurn?.briefText).toContain("release checklist");
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
  });

  it("preserves existing summaries when no model is configured or brief merge fails", async () => {
    const session = createSession("__default__", "default-scenario", "Summary Fallback");
    const { userMessage } = createCompletedRound({
      sessionId: session.id,
      turnId: "turn-fallback",
      userMessageId: "user-fallback",
      assistantMessageId: "assistant-fallback",
      userText: "We should keep this summary.",
      assistantText: "Acknowledged.",
    });

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    const sessionRowUpdate = getSession(session.id);
    expect(sessionRowUpdate).not.toBeNull();

    getDefaultModelByTypeMock.mockReturnValue(null);
    enqueueSummaryTask({
      sessionId: session.id,
      contextCount: 1,
    });

    await waitForAssert(() => {
      expect(getDefaultModelByTypeMock).toHaveBeenCalled();
      expect(vi.mocked(generateText)).not.toHaveBeenCalled();
    });

    getDefaultModelByTypeMock.mockClear();
    vi.mocked(generateText).mockReset();
    getDefaultModelByTypeMock.mockImplementation((type: string) =>
      type === "fast" ? { providerId: "mock", modelId: "fast-model" } : null
    );
    vi.mocked(generateText).mockRejectedValueOnce(new Error("brief failed"));

    enqueueSummaryTask({
      sessionId: session.id,
      contextCount: 10,
    });

    await waitForAssert(() => {
      expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1);
      const latestTurn = getLatestTurnByUserMessageId(userMessage.id);
      expect(latestTurn?.briefText ?? null).toBeNull();
    });
  });
});
