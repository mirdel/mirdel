import { describe, expect, it } from "vitest";
import { createAssistantMessage, createUserMessage, updateMessage } from "../messageData";
import { searchChat } from "../chatSearchService";
import {
  createSession,
  deleteSession,
  updateSessionStateAndBrief,
  updateSessionTitle,
} from "../sessionData";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("chatSearchIndex", () => {
  useTestDb("chat-search-index");

  it("updates message search visibility when a message becomes searchable and later gets deleted", () => {
    const session = createSession("__default__", "default-scenario", "Release Session");
    const assistantMessage = createAssistantMessage({
      sessionId: session.id,
      turnId: "turn-release-1",
      parts: [{ type: "text", text: "Draft the launch checklist." }],
      status: "pending",
    });

    expect(
      searchChat({
        query: "launch",
        scope: "messages",
      }).buckets.messages.total
    ).toBe(0);

    updateMessage(assistantMessage.id, {
      status: "success",
    });

    const searchableResult = searchChat({
      query: "launch",
      scope: "messages",
    });
    expect(searchableResult.buckets.messages.items).toEqual([
      expect.objectContaining({
        messageId: assistantMessage.id,
        sessionId: session.id,
        role: "assistant",
      }),
    ]);

    updateMessage(assistantMessage.id, {
      isDeleted: true,
      deletedAt: Date.now(),
    });

    expect(
      searchChat({
        query: "launch",
        scope: "messages",
      }).buckets.messages.total
    ).toBe(0);
  });

  it("updates session search results after summary and title changes, then removes them on session delete", () => {
    const session = createSession("__default__", "default-scenario", "Project Notes");
    const userMessage = createUserMessage({
      sessionId: session.id,
      turnId: "turn-project-1",
      parts: [{ type: "text", text: "The beta checklist needs review." }],
    });

    const beforeDigest = searchChat({
      query: "beta",
      scope: "all",
    });
    expect(beforeDigest.buckets.sessions.items).toEqual([
      expect.objectContaining({
        sessionId: session.id,
        summarySnippet: "",
        matchedMessageCount: 1,
      }),
    ]);

    updateSessionStateAndBrief(session.id, null, "- Beta release planning", null);

    const withDigest = searchChat({
      query: "beta",
      scope: "all",
    });
    expect(withDigest.buckets.sessions.items).toEqual([
      expect.objectContaining({
        sessionId: session.id,
        summarySnippet: expect.stringContaining("Beta"),
      }),
    ]);
    expect(withDigest.buckets.messages.items).toEqual([
      expect.objectContaining({
        messageId: userMessage.id,
      }),
    ]);

    updateSessionTitle(session.id, "Beta Project Notes");

    const renamed = searchChat({
      query: "beta project",
      scope: "sessions",
    });
    expect(renamed.buckets.sessions.items).toEqual([
      expect.objectContaining({
        sessionId: session.id,
        title: "Beta Project Notes",
      }),
    ]);

    deleteSession(session.id);

    const afterDelete = searchChat({
      query: "beta",
      scope: "all",
    });
    expect(afterDelete.buckets.sessions.total).toBe(0);
    expect(afterDelete.buckets.messages.total).toBe(0);
  });
});
