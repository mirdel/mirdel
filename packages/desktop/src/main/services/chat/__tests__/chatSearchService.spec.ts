import { describe, expect, it } from "vitest";
import { getDb } from "../../db";
import { createAssistantMessage, createUserMessage, updateMessage } from "../messageData";
import { searchChat } from "../chatSearchService";
import { createSession, updateSessionStateAndBrief } from "../sessionData";
import { useTestDb } from "../../../../../test/helpers/testDb";

function createTemporarySession(title: string) {
  return createSession(
    "__default__",
    "default-scenario",
    title,
    null,
    [],
    "manual",
    "chat",
    "auto",
    "builtin",
    "auto",
    [],
    true,
    "session"
  );
}

describe("chatSearchService", () => {
  useTestDb("chat-search-service");

  it("returns empty buckets for a blank query", () => {
    const result = searchChat({
      query: "   ",
      scope: "all",
    });

    expect(result.query).toBe("");
    expect(result.scope).toBe("all");
    expect(result.buckets.messages).toEqual({ total: 0, items: [] });
    expect(result.buckets.sessions).toEqual({ total: 0, items: [] });
  });

  it("aggregates message and session hits while excluding temporary, deleted, and pending content", () => {
    const activeSession = createSession("__default__", "default-scenario", "Budget planning");
    updateSessionStateAndBrief(activeSession.id, "Budget roadmap", "Quarterly budget review");

    const matchedMessage = createUserMessage({
      sessionId: activeSession.id,
      turnId: "turn-budget-1",
      parts: [{ type: "text", text: "We need a budget forecast for launch." }],
    });

    const deletedMessage = createUserMessage({
      sessionId: activeSession.id,
      turnId: "turn-budget-2",
      parts: [{ type: "text", text: "Budget details that should disappear." }],
    });
    updateMessage(deletedMessage.id, {
      isDeleted: true,
      deletedAt: Date.now(),
    });

    createAssistantMessage({
      sessionId: activeSession.id,
      turnId: "turn-budget-3",
      parts: [{ type: "text", text: "Budget draft still streaming." }],
      status: "pending",
    });

    const temporarySession = createTemporarySession("Budget temp");
    createUserMessage({
      sessionId: temporarySession.id,
      turnId: "turn-budget-temp",
      parts: [{ type: "text", text: "Budget scratchpad that should stay hidden." }],
    });

    const result = searchChat({
      query: "  budget  ",
      scope: "all",
    });

    expect(result.query).toBe("budget");
    expect(result.buckets.messages.total).toBe(1);
    expect(result.buckets.messages.items).toEqual([
      expect.objectContaining({
        type: "message",
        messageId: matchedMessage.id,
        sessionId: activeSession.id,
        role: "user",
      }),
    ]);
    expect(result.buckets.messages.items[0]?.snippet.toLowerCase()).toContain("budget");

    expect(result.buckets.sessions.total).toBe(1);
    expect(result.buckets.sessions.items).toEqual([
      expect.objectContaining({
        type: "session",
        sessionId: activeSession.id,
        title: "Budget planning",
        matchedMessageCount: 1,
        topMessageHits: [
          expect.objectContaining({
            messageId: matchedMessage.id,
          }),
        ],
      }),
    ]);
    expect(result.buckets.sessions.items[0]?.titleHighlight.toLowerCase()).toContain("budget");
  });

  it("filters message hits by session and time range", () => {
    const sessionA = createSession("__default__", "default-scenario", "Comet Alpha");
    const sessionB = createSession("__default__", "default-scenario", "Comet Beta");

    const recentMessage = createUserMessage({
      sessionId: sessionA.id,
      turnId: "turn-comet-recent",
      parts: [{ type: "text", text: "Comet migration is ready." }],
    });
    const oldMessage = createUserMessage({
      sessionId: sessionA.id,
      turnId: "turn-comet-old",
      parts: [{ type: "text", text: "Comet legacy cleanup is pending." }],
    });
    createUserMessage({
      sessionId: sessionB.id,
      turnId: "turn-comet-other",
      parts: [{ type: "text", text: "Comet data from another session." }],
    });

    getDb()
      .prepare(`UPDATE messages SET createdAt = ? WHERE id = ?`)
      .run(Date.now() - 10 * 24 * 60 * 60 * 1000, oldMessage.id);

    const result = searchChat({
      query: "comet",
      scope: "messages",
      sessionId: sessionA.id,
      messageTimeRange: "3d",
    });

    expect(result.scope).toBe("messages");
    expect(result.buckets.messages.total).toBe(1);
    expect(result.buckets.messages.items).toEqual([
      expect.objectContaining({
        messageId: recentMessage.id,
        sessionId: sessionA.id,
      }),
    ]);
    expect(result.buckets.sessions).toEqual({ total: 0, items: [] });
  });
});
