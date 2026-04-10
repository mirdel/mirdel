import { describe, expect, it } from "vitest";
import {
  buildProjectSessionStats,
  buildSessionTree,
  isSessionInCategory,
} from "../sessionCategoryViewModel";

function createSession(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "session-1",
    rootSessionId: null,
    parentSessionId: null,
    projectId: null,
    isTemporary: false,
    isFavorite: false,
    isArchived: false,
    updatedAt: 1,
    ...overrides,
  };
}

describe("sessionCategoryViewModel", () => {
  it("matches category membership rules used by the session list", () => {
    expect(isSessionInCategory("project-1", "__all__")).toBe(true);
    expect(isSessionInCategory(null, "__uncategorized__")).toBe(true);
    expect(isSessionInCategory("project-1", "__uncategorized__")).toBe(false);
    expect(isSessionInCategory("project-1", "__starred__")).toBe(true);
    expect(isSessionInCategory("project-1", "project-1")).toBe(true);
    expect(isSessionInCategory("project-2", "project-1")).toBe(false);
  });

  it("builds session trees for category, starred, and archived views", () => {
    const sessions = [
      createSession({ id: "main-a", projectId: "project-a", updatedAt: 10 }),
      createSession({ id: "main-b", projectId: null, isFavorite: true, updatedAt: 20 }),
      createSession({ id: "main-c", projectId: "project-c", isArchived: true, updatedAt: 30 }),
      createSession({
        id: "branch-b1",
        rootSessionId: "main-b",
        parentSessionId: "main-b",
        projectId: null,
        updatedAt: 40,
      }),
      createSession({
        id: "branch-b2",
        rootSessionId: "main-b",
        parentSessionId: "main-b",
        projectId: "project-x",
        updatedAt: 50,
      }),
      createSession({
        id: "branch-c1",
        rootSessionId: "main-c",
        parentSessionId: "main-c",
        projectId: "project-c",
        isArchived: true,
        updatedAt: 60,
      }),
      createSession({
        id: "temp",
        isTemporary: true,
        updatedAt: 999,
      }),
    ];

    expect(buildSessionTree(sessions as any, "__all__").map((session) => session.id)).toEqual(["main-b", "main-a"]);
    expect(buildSessionTree(sessions as any, "__uncategorized__").map((session) => session.id)).toEqual(["main-b"]);
    expect(buildSessionTree(sessions as any, "__starred__")).toEqual([
      expect.objectContaining({
        id: "main-b",
        branches: [
          expect.objectContaining({ id: "branch-b2" }),
          expect.objectContaining({ id: "branch-b1" }),
        ],
      }),
    ]);
    expect(buildSessionTree(sessions as any, "__archived__")).toEqual([
      expect.objectContaining({
        id: "main-c",
        branches: [expect.objectContaining({ id: "branch-c1" })],
      }),
    ]);
  });

  it("builds project panel counts from active and archived sessions", () => {
    const sessions = [
      createSession({ id: "main-a", projectId: "project-a", updatedAt: 10 }),
      createSession({ id: "main-b", projectId: null, isFavorite: true, updatedAt: 20 }),
      createSession({
        id: "branch-b1",
        rootSessionId: "main-b",
        parentSessionId: "main-b",
        projectId: null,
        updatedAt: 30,
      }),
      createSession({ id: "main-c", projectId: "project-c", isArchived: true, updatedAt: 40 }),
      createSession({
        id: "branch-c1",
        rootSessionId: "main-c",
        parentSessionId: "main-c",
        projectId: "project-c",
        isArchived: true,
        updatedAt: 50,
      }),
      createSession({
        id: "temp",
        projectId: "project-a",
        isTemporary: true,
        updatedAt: 60,
      }),
    ];

    const stats = buildProjectSessionStats(sessions as any);

    expect(stats.activeSessions.map((session) => session.id)).toEqual(["main-a", "main-b", "branch-b1"]);
    expect(stats.sessionCountByProjectId.get("project-a")).toBe(1);
    expect(stats.sessionCountByProjectId.get(null)).toBe(2);
    expect(stats.sessionCountByProjectId.has("project-c")).toBe(false);
    expect(stats.favoriteCount).toBe(1);
    expect(stats.archivedCount).toBe(1);
  });
});
