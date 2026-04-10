import { describe, expect, it } from "vitest";
import { getDb } from "../../db";
import {
  createSession,
  getSession,
  listAllSessionsInGroup,
  listBranches,
  listMainSessions,
  updateSessionArchive,
  updateSessionFavorite,
} from "../sessionData";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("sessionData listing and flags", () => {
  useTestDb("session-listing");

  it("lists main sessions by recency while excluding temporary sessions and exposing branch groups", () => {
    const mainOld = createSession("__default__", "default-scenario", "Main Old");
    const mainNew = createSession("__default__", "default-scenario", "Main New");
    const branchA = createSession("__default__", "default-scenario", "Branch A");
    const branchB = createSession("__default__", "default-scenario", "Branch B");
    const tempSession = createSession("__default__", "default-scenario", "Temp");

    const db = getDb();
    db.prepare("UPDATE sessions SET updatedAt = ? WHERE id = ?").run(100, mainOld.id);
    db.prepare("UPDATE sessions SET updatedAt = ? WHERE id = ?").run(300, mainNew.id);
    db.prepare(`
      UPDATE sessions
      SET rootSessionId = ?, parentSessionId = ?, forkFromMessageId = ?, forkPointMessageId = ?, updatedAt = ?
      WHERE id = ?
    `).run(mainNew.id, mainNew.id, "fork-a", "fork-point-a", 200, branchA.id);
    db.prepare(`
      UPDATE sessions
      SET rootSessionId = ?, parentSessionId = ?, forkFromMessageId = ?, forkPointMessageId = ?, updatedAt = ?
      WHERE id = ?
    `).run(mainNew.id, branchA.id, "fork-b", "fork-point-b", 250, branchB.id);
    db.prepare("UPDATE sessions SET isTemporary = 1, temporaryType = 'session' WHERE id = ?").run(tempSession.id);

    expect(listMainSessions().map((session) => session.id)).toEqual([mainNew.id, mainOld.id]);
    expect(listBranches(mainNew.id).map((session) => session.id)).toEqual([branchA.id, branchB.id]);
    expect(listAllSessionsInGroup(mainNew.id).map((session) => session.id)).toEqual([
      mainNew.id,
      branchA.id,
      branchB.id,
    ]);
  });

  it("updates favorite and archive flags without changing session recency", () => {
    const session = createSession("__default__", "default-scenario", "Flags");
    const before = getSession(session.id);

    updateSessionFavorite(session.id, true);
    updateSessionArchive(session.id, true);

    const updated = getSession(session.id);
    expect(updated).toMatchObject({
      id: session.id,
      isFavorite: true,
      isArchived: true,
    });
    expect(updated?.updatedAt).toBe(before?.updatedAt);
  });
});
