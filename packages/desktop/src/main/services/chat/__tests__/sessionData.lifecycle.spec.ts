import { describe, expect, it } from "vitest";
import { getDb } from "../../db";
import { appendDebugRunSteps, createDebugRun, finalizeDebugRun } from "../debugInfoData";
import { createAssistantMessage, createUserMessage, listMessages } from "../messageData";
import {
  cleanupExpiredTemporarySessions,
  createSession,
  createTemporarySession,
  deleteSession,
  getSession,
  listMainSessions,
  listSessions,
} from "../sessionData";
import { createTurn, listTurnsBySession } from "../turnData";
import { createBranch } from "../sessionData";
import {
  createHistoricalMemoryVectorIndex,
  getHistoricalMemoryIndexStats,
  saveHistoricalMemoryChunks,
} from "../historicalMemoryData";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("sessionData lifecycle", () => {
  useTestDb("session-lifecycle");

  it("cleans up expired temporary sessions and their related rows", () => {
    const now = Date.now();
    const regularSession = createSession("__default__", "default-scenario", "Regular Session");
    const activeTempSession = createTemporarySession(
      "__default__",
      "default-scenario",
      "Active Temp",
      [],
      "auto",
      "chat",
      "auto",
      "builtin",
      "auto",
      [],
      "session"
    );
    const expiredTempSession = createTemporarySession(
      "__default__",
      "default-scenario",
      "Expired Temp",
      [],
      "off",
      "chat",
      "off",
      "close",
      "auto",
      [],
      "ask"
    );

    const db = getDb();
    db.prepare("UPDATE sessions SET expiresAt = ? WHERE id = ?").run(now + 60_000, activeTempSession.id);
    db.prepare("UPDATE sessions SET expiresAt = ? WHERE id = ?").run(now - 1_000, expiredTempSession.id);

    const userMessage = createUserMessage({
      sessionId: expiredTempSession.id,
      turnId: "turn-expired",
      parts: [{ type: "text", text: "Temporary question" }],
    });
    const assistantMessage = createAssistantMessage({
      sessionId: expiredTempSession.id,
      turnId: "turn-expired",
      parts: [{ type: "text", text: "Temporary answer" }],
      status: "success",
    });
    createTurn({
      id: "turn-expired",
      sessionId: expiredTempSession.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      triggerType: "submit",
      status: "success",
      selectedModel: "mock::general",
    });

    const runId = createDebugRun({
      sessionId: expiredTempSession.id,
      turnId: "turn-expired",
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      startTime: now,
      meta: {
        sessionId: expiredTempSession.id,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        model: "mock::general",
        provider: { id: "mock", name: "Mock", baseUrl: "https://mock.local" },
        params: {},
      } as any,
    });
    appendDebugRunSteps({
      runId,
      steps: [
        {
          index: 0,
          startTime: now,
          endTime: now + 1,
          inputMessages: [],
          outputContent: [{ type: "text", text: "Temporary answer" }],
        } as any,
      ],
      toolExecutions: [],
    });
    finalizeDebugRun({
      runId,
      status: "success",
      endTime: now + 2,
      createdMessageIds: [assistantMessage.id],
    });

    expect(listSessions().map((session) => session.id)).toEqual([regularSession.id]);
    expect(listMainSessions().map((session) => session.id)).toEqual([regularSession.id]);

    const result = cleanupExpiredTemporarySessions(now);

    expect(result).toEqual({
      count: 1,
      sessionIds: [expiredTempSession.id],
    });
    expect(getSession(expiredTempSession.id)).toBeNull();
    expect(listMessages(expiredTempSession.id)).toEqual([]);
    expect(listTurnsBySession(expiredTempSession.id)).toEqual([]);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM chat_debug_runs WHERE sessionId = ?").get(expiredTempSession.id)
    ).toEqual({ count: 0 });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM chat_debug_steps WHERE runId = ?").get(runId)
    ).toEqual({ count: 0 });

    expect(getSession(activeTempSession.id)?.isTemporary).toBe(true);
    expect(getSession(regularSession.id)?.id).toBe(regularSession.id);
  });

  it("deletes a session cascade and detaches remaining branches", () => {
    const parentSession = createSession("__default__", "default-scenario", "Parent Session");
    const userMessage = createUserMessage({
      sessionId: parentSession.id,
      turnId: "turn-parent",
      parts: [{ type: "text", text: "Parent question" }],
    });
    const assistantMessage = createAssistantMessage({
      sessionId: parentSession.id,
      turnId: "turn-parent",
      parts: [{ type: "text", text: "Parent answer" }],
      status: "success",
    });
    createTurn({
      id: "turn-parent",
      sessionId: parentSession.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      triggerType: "submit",
      status: "success",
      selectedModel: "mock::general",
    });

    const branchSession = createBranch({
      parentSessionId: parentSession.id,
      forkFromMessageId: assistantMessage.id,
    });

    const now = Date.now();
    const runId = createDebugRun({
      sessionId: parentSession.id,
      turnId: "turn-parent",
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      startTime: now,
      meta: {
        sessionId: parentSession.id,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        model: "mock::general",
        provider: { id: "mock", name: "Mock", baseUrl: "https://mock.local" },
        params: {},
      } as any,
    });
    finalizeDebugRun({
      runId,
      status: "success",
      endTime: now + 1,
      createdMessageIds: [assistantMessage.id],
    });
    createHistoricalMemoryVectorIndex(2);
    saveHistoricalMemoryChunks({
      sessionId: parentSession.id,
      sessionTitle: parentSession.title,
      turnId: "turn-parent",
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      chunks: ["Historical memory content from the parent session."],
      embeddings: [[1, 0]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });
    expect(getHistoricalMemoryIndexStats().chunkCount).toBe(1);

    deleteSession(parentSession.id);

    expect(getSession(parentSession.id)).toBeNull();
    expect(listMessages(parentSession.id)).toEqual([]);
    expect(listTurnsBySession(parentSession.id)).toEqual([]);
    expect(getHistoricalMemoryIndexStats().chunkCount).toBe(0);
    expect(
      getDb().prepare("SELECT COUNT(*) AS count FROM chat_debug_runs WHERE sessionId = ?").get(parentSession.id)
    ).toEqual({ count: 0 });

    const detachedBranch = getSession(branchSession.id);
    expect(detachedBranch).toBeTruthy();
    expect(detachedBranch?.rootSessionId).toBeNull();
    expect(detachedBranch?.parentSessionId).toBeNull();
    expect(detachedBranch?.forkFromMessageId).toBeNull();
    expect(detachedBranch?.forkPointMessageId).toBeNull();
    expect(listMessages(branchSession.id).length).toBeGreaterThan(0);
    expect(listTurnsBySession(branchSession.id).length).toBeGreaterThan(0);
  });
});
