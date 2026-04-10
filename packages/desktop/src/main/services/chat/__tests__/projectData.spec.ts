import { describe, expect, it } from "vitest";
import { getDb } from "../../db";
import {
  createProject,
  deleteProject,
  getProject,
  getProjectSessionCount,
  getUncategorizedSessionCount,
  listProjects,
  updateProject,
} from "../projectData";
import { createSession, createTemporarySession, getSession } from "../sessionData";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("projectData", () => {
  useTestDb("project-data");

  it("creates, lists, gets, and updates projects", () => {
    const firstProject = createProject({
      name: "Inbox",
      description: "Default category",
      scenarioId: "default-scenario",
      color: "#111111",
      icon: "inbox",
    });
    const secondProject = createProject({
      name: "Research",
      scenarioId: "default-scenario",
    });

    const loadedFirst = getProject(firstProject.id);
    expect(loadedFirst).toMatchObject({
      id: firstProject.id,
      name: "Inbox",
      description: "Default category",
      scenarioId: "default-scenario",
      color: "#111111",
      icon: "inbox",
    });

    const updatedProject = updateProject(secondProject.id, {
      name: "Research Updated",
      description: "Long-running tasks",
      color: "#22aa66",
      icon: "folder-search",
    });

    expect(updatedProject).toMatchObject({
      id: secondProject.id,
      name: "Research Updated",
      description: "Long-running tasks",
      color: "#22aa66",
      icon: "folder-search",
    });
    expect(listProjects().map((project) => project.id)).toEqual(
      expect.arrayContaining([firstProject.id, secondProject.id])
    );
  });

  it("moves sessions back to uncategorized when deleting a project and excludes temporary sessions from counts", () => {
    const project = createProject({
      name: "Research",
      scenarioId: "default-scenario",
    });
    const regularInProject = createSession("__default__", "default-scenario", "Research Chat", project.id);
    const regularUncategorized = createSession("__default__", "default-scenario", "Inbox Chat");
    const temporarySession = createTemporarySession(
      "__default__",
      "default-scenario",
      "Temporary Research",
      [],
      "auto",
      "chat",
      "auto",
      "builtin",
      "auto",
      [],
      "session"
    );

    getDb().prepare("UPDATE sessions SET projectId = ? WHERE id = ?").run(project.id, temporarySession.id);

    expect(getProjectSessionCount(project.id)).toBe(1);
    expect(getUncategorizedSessionCount()).toBe(1);

    deleteProject(project.id);

    expect(getProject(project.id)).toBeNull();
    expect(getSession(regularInProject.id)?.projectId).toBeNull();
    expect(getSession(temporarySession.id)?.projectId).toBeNull();
    expect(getSession(regularUncategorized.id)?.projectId).toBeNull();
    expect(getUncategorizedSessionCount()).toBe(2);
  });
});
