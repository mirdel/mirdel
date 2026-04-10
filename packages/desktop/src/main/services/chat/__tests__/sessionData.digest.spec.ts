import { describe, expect, it } from "vitest";
import { getDb } from "../../db";
import {
  createSession,
  listSessionsForDigest,
  updateSessionStateAndBrief,
} from "../sessionData";
import { useTestDb } from "../../../../../test/helpers/testDb";

function setSessionUpdatedAt(sessionId: string, updatedAt: number) {
  getDb().prepare("UPDATE sessions SET updatedAt = ? WHERE id = ?").run(updatedAt, sessionId);
}

describe("sessionData digest", () => {
  useTestDb("session-data-digest");

  it("excludes the current session, temporary sessions, blank briefs, and stale sessions", () => {
    const now = Date.now();

    const current = createSession("__default__", "default-scenario", "Current Session");
    const recentA = createSession("__default__", "default-scenario", "Recent A");
    const recentB = createSession("__default__", "default-scenario", "Recent B");
    const temporary = createSession("__default__", "default-scenario", "Temporary Session", null, [], "manual", "chat", "auto", "builtin", "auto", [], true);
    const noBrief = createSession("__default__", "default-scenario", "No Brief");
    const stale = createSession("__default__", "default-scenario", "Stale Session");

    updateSessionStateAndBrief(current.id, null, "- Current work", null);
    updateSessionStateAndBrief(recentA.id, null, "- Recent topic A", null);
    updateSessionStateAndBrief(recentB.id, null, "- Recent topic B", null);
    updateSessionStateAndBrief(temporary.id, null, "- Temporary topic", null);
    updateSessionStateAndBrief(stale.id, null, "- Old topic", null);

    setSessionUpdatedAt(recentA.id, now - 60 * 60 * 1000);
    setSessionUpdatedAt(recentB.id, now - 2 * 60 * 60 * 1000);
    setSessionUpdatedAt(temporary.id, now - 30 * 60 * 1000);
    setSessionUpdatedAt(noBrief.id, now - 10 * 60 * 1000);
    setSessionUpdatedAt(stale.id, now - 8 * 24 * 60 * 60 * 1000);

    const sessions = listSessionsForDigest({
      excludeSessionId: current.id,
    });

    expect(sessions.map((session) => session.title)).toEqual(["Recent A", "Recent B"]);
  });

  it("orders digest sessions by recency and respects the requested limit", () => {
    const now = Date.now();
    const current = createSession("__default__", "default-scenario", "Current Session");
    const first = createSession("__default__", "default-scenario", "First");
    const second = createSession("__default__", "default-scenario", "Second");
    const third = createSession("__default__", "default-scenario", "Third");

    updateSessionStateAndBrief(first.id, null, "- Topic 1", null);
    updateSessionStateAndBrief(second.id, null, "- Topic 2", null);
    updateSessionStateAndBrief(third.id, null, "- Topic 3", null);

    setSessionUpdatedAt(first.id, now - 30 * 60 * 1000);
    setSessionUpdatedAt(second.id, now - 60 * 60 * 1000);
    setSessionUpdatedAt(third.id, now - 90 * 60 * 1000);

    const sessions = listSessionsForDigest({
      excludeSessionId: current.id,
      limit: 2,
      maxDays: 1,
    });

    expect(sessions.map((session) => session.title)).toEqual(["First", "Second"]);
  });
});
