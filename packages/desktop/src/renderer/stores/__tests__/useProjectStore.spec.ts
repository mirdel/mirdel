import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useProjectStore } from "../useProjectStore";

function installProjectWindowMocks(
  handler: (channel: string, payload?: any) => Promise<any> | any
) {
  const ipcMock = vi.fn((channel: string, payload?: any) => handler(channel, payload));

  Object.defineProperty(window, "ipc", {
    configurable: true,
    writable: true,
    value: ipcMock,
  });

  return { ipcMock };
}

describe("useProjectStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
  });

  it("initializes from ipc and restores the last selected category", async () => {
    const projects = [
      {
        id: "project-1",
        name: "Research",
        scenarioId: "default-scenario",
        createdAt: 1,
        updatedAt: 2,
      },
    ];
    localStorage.setItem("last-selected-project", "project-1");
    installProjectWindowMocks(async (channel) => {
      if (channel === "projects:list") return projects;
      return null;
    });

    const projectStore = useProjectStore();
    await projectStore.init();

    expect(projectStore.projects).toEqual(projects);
    expect(projectStore.currentProjectId).toBe("project-1");
    expect(projectStore.currentProject).toMatchObject({ id: "project-1", name: "Research" });
    expect(projectStore.loading).toBe(false);
  });

  it("creates, updates, selects, and deletes projects through ipc", async () => {
    const createdProject = {
      id: "project-created",
      name: "Created",
      scenarioId: "default-scenario",
      createdAt: 1,
      updatedAt: 1,
    };
    const updatedProject = {
      ...createdProject,
      name: "Created Updated",
      color: "#22aa66",
      updatedAt: 2,
    };
    const { ipcMock } = installProjectWindowMocks(async (channel, payload) => {
      switch (channel) {
        case "projects:create":
          return createdProject;
        case "projects:update":
          return updatedProject;
        case "projects:delete":
          return { ok: true };
        default:
          return null;
      }
    });

    const projectStore = useProjectStore();
    const created = await projectStore.createProject({
      name: "Created",
      scenarioId: "default-scenario",
    });

    expect(created).toEqual(createdProject);
    expect(projectStore.projects[0]).toEqual(createdProject);
    expect(projectStore.currentProjectId).toBe("project-created");
    expect(localStorage.getItem("last-selected-project")).toBe("project-created");

    const updated = await projectStore.updateProject(createdProject.id, {
      name: "Created Updated",
      color: "#22aa66",
    });

    expect(updated).toEqual(updatedProject);
    expect(projectStore.projects[0]).toEqual(updatedProject);

    projectStore.selectProject("__uncategorized__");
    expect(projectStore.currentProjectId).toBe("__uncategorized__");
    expect(localStorage.getItem("last-selected-project")).toBe("__uncategorized__");

    projectStore.selectProject(createdProject.id);
    await projectStore.deleteProject(createdProject.id);

    expect(ipcMock).toHaveBeenCalledWith("projects:create", {
      name: "Created",
      scenarioId: "default-scenario",
    });
    expect(ipcMock).toHaveBeenCalledWith("projects:update", {
      id: createdProject.id,
      data: { name: "Created Updated", color: "#22aa66" },
    });
    expect(ipcMock).toHaveBeenCalledWith("projects:delete", {
      id: createdProject.id,
    });
    expect(projectStore.projects).toEqual([]);
    expect(projectStore.currentProjectId).toBe("__all__");
  });
});
