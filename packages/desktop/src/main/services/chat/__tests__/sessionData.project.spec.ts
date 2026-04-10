import { describe, expect, it } from "vitest";
import { getDb } from "../../db";
import { createProject } from "../projectData";
import {
  createSession,
  createTemporarySession,
  getSession,
  moveSessionToProject,
  updateSessionProject,
} from "../sessionData";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("sessionData project assignment", () => {
  useTestDb("session-project");

  it("updates the assigned project for a session", () => {
    const sourceProject = createProject({
      name: "Inbox",
      scenarioId: "default-scenario",
    });
    const targetProject = createProject({
      name: "Research",
      scenarioId: "default-scenario",
    });
    const session = createSession("__default__", "default-scenario", "Project Move", sourceProject.id);
    const before = getSession(session.id);

    updateSessionProject(session.id, targetProject.id);

    const updated = getSession(session.id);
    expect(updated?.projectId).toBe(targetProject.id);
    expect(updated?.updatedAt ?? 0).toBeGreaterThanOrEqual(before?.updatedAt ?? 0);
  });

  it("moves a main session together with all sessions in its branch group", () => {
    const sourceProject = createProject({
      name: "Inbox",
      scenarioId: "default-scenario",
    });
    const targetProject = createProject({
      name: "Research",
      scenarioId: "default-scenario",
    });
    const mainSession = createSession("__default__", "default-scenario", "Main", sourceProject.id);
    const branchSession = createSession("__default__", "default-scenario", "Branch", sourceProject.id);
    const nestedBranch = createSession("__default__", "default-scenario", "Nested Branch", sourceProject.id);
    const unrelatedSession = createSession("__default__", "default-scenario", "Other", sourceProject.id);

    const db = getDb();
    db.prepare(`
      UPDATE sessions
      SET rootSessionId = ?, parentSessionId = ?, forkFromMessageId = ?, forkPointMessageId = ?
      WHERE id = ?
    `).run(mainSession.id, mainSession.id, "fork-main", "fork-point-main", branchSession.id);
    db.prepare(`
      UPDATE sessions
      SET rootSessionId = ?, parentSessionId = ?, forkFromMessageId = ?, forkPointMessageId = ?
      WHERE id = ?
    `).run(mainSession.id, branchSession.id, "fork-child", "fork-point-child", nestedBranch.id);

    const result = moveSessionToProject(mainSession.id, targetProject.id);

    expect(new Set(result.sessionIds)).toEqual(new Set([mainSession.id, branchSession.id, nestedBranch.id]));
    expect(getSession(mainSession.id)?.projectId).toBe(targetProject.id);
    expect(getSession(branchSession.id)).toMatchObject({
      projectId: targetProject.id,
      rootSessionId: mainSession.id,
      parentSessionId: mainSession.id,
    });
    expect(getSession(nestedBranch.id)).toMatchObject({
      projectId: targetProject.id,
      rootSessionId: mainSession.id,
      parentSessionId: branchSession.id,
    });
    expect(getSession(unrelatedSession.id)?.projectId).toBe(sourceProject.id);
  });

  it("moves a branch subtree and detaches the moved branch into a new main session", () => {
    const sourceProject = createProject({
      name: "Inbox",
      scenarioId: "default-scenario",
    });
    const targetProject = createProject({
      name: "Research",
      scenarioId: "default-scenario",
    });
    const mainSession = createSession("__default__", "default-scenario", "Main", sourceProject.id);
    const branchSession = createSession("__default__", "default-scenario", "Branch", sourceProject.id);
    const childBranch = createSession("__default__", "default-scenario", "Child Branch", sourceProject.id);
    const siblingBranch = createSession("__default__", "default-scenario", "Sibling Branch", sourceProject.id);

    const db = getDb();
    db.prepare(`
      UPDATE sessions
      SET rootSessionId = ?, parentSessionId = ?, forkFromMessageId = ?, forkPointMessageId = ?
      WHERE id = ?
    `).run(mainSession.id, mainSession.id, "fork-branch", "fork-point-branch", branchSession.id);
    db.prepare(`
      UPDATE sessions
      SET rootSessionId = ?, parentSessionId = ?, forkFromMessageId = ?, forkPointMessageId = ?
      WHERE id = ?
    `).run(mainSession.id, branchSession.id, "fork-child", "fork-point-child", childBranch.id);
    db.prepare(`
      UPDATE sessions
      SET rootSessionId = ?, parentSessionId = ?, forkFromMessageId = ?, forkPointMessageId = ?
      WHERE id = ?
    `).run(mainSession.id, mainSession.id, "fork-sibling", "fork-point-sibling", siblingBranch.id);

    const result = moveSessionToProject(branchSession.id, targetProject.id);

    expect(new Set(result.sessionIds)).toEqual(new Set([branchSession.id, childBranch.id]));
    expect(getSession(mainSession.id)?.projectId).toBe(sourceProject.id);
    expect(getSession(siblingBranch.id)).toMatchObject({
      projectId: sourceProject.id,
      rootSessionId: mainSession.id,
      parentSessionId: mainSession.id,
    });
    expect(getSession(branchSession.id)).toMatchObject({
      projectId: targetProject.id,
      rootSessionId: null,
      parentSessionId: null,
      forkFromMessageId: null,
      forkPointMessageId: null,
    });
    expect(getSession(childBranch.id)).toMatchObject({
      projectId: targetProject.id,
      rootSessionId: branchSession.id,
      parentSessionId: branchSession.id,
    });
  });

  it("rejects moving a temporary session or an unknown project", () => {
    const session = createSession("__default__", "default-scenario", "Regular");
    const temporarySession = createTemporarySession(
      "__default__",
      "default-scenario",
      "Temporary",
      [],
      "auto",
      "chat",
      "auto",
      "builtin",
      "auto",
      [],
      "session"
    );

    expect(() => moveSessionToProject(session.id, "missing-project")).toThrow();
    expect(() => moveSessionToProject(temporarySession.id, null)).toThrow();
  });
});
