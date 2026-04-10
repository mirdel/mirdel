import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createProjectMock,
  deleteProjectMock,
  getProjectMock,
  getProjectSessionCountMock,
  getUncategorizedSessionCountMock,
  listAllSessionsInGroupMock,
  listBranchesMock,
  listMainSessionsMock,
  listProjectsMock,
  moveSessionToProjectMock,
  updateProjectMock,
  updateSessionArchiveMock,
  updateSessionFavoriteMock,
  updateSessionProjectMock,
} = vi.hoisted(() => ({
  createProjectMock: vi.fn(),
  deleteProjectMock: vi.fn(),
  getProjectMock: vi.fn(),
  getProjectSessionCountMock: vi.fn(),
  getUncategorizedSessionCountMock: vi.fn(),
  listAllSessionsInGroupMock: vi.fn(),
  listBranchesMock: vi.fn(),
  listMainSessionsMock: vi.fn(),
  listProjectsMock: vi.fn(),
  moveSessionToProjectMock: vi.fn(),
  updateProjectMock: vi.fn(),
  updateSessionArchiveMock: vi.fn(),
  updateSessionFavoriteMock: vi.fn(),
  updateSessionProjectMock: vi.fn(),
}));

vi.mock("typed-electron-ipc", () => ({
  ipcRouter: (handlers: Record<string, unknown>) => handlers,
}));

vi.mock("../../services/chat/projectData", async () => {
  const actual = await vi.importActual<typeof import("../../services/chat/projectData")>("../../services/chat/projectData");
  return {
    ...actual,
    listProjects: listProjectsMock,
    createProject: createProjectMock,
    getProject: getProjectMock,
    updateProject: updateProjectMock,
    deleteProject: deleteProjectMock,
    getProjectSessionCount: getProjectSessionCountMock,
    getUncategorizedSessionCount: getUncategorizedSessionCountMock,
  };
});

vi.mock("../../services/chat/sessionData", async () => {
  const actual = await vi.importActual<typeof import("../../services/chat/sessionData")>("../../services/chat/sessionData");
  return {
    ...actual,
    listMainSessions: listMainSessionsMock,
    listBranches: listBranchesMock,
    listAllSessionsInGroup: listAllSessionsInGroupMock,
    updateSessionProject: updateSessionProjectMock,
    updateSessionFavorite: updateSessionFavoriteMock,
    updateSessionArchive: updateSessionArchiveMock,
    moveSessionToProject: moveSessionToProjectMock,
  };
});

const { router } = await import("../router");

describe("router project handlers", () => {
  const project = {
    id: "project-1",
    name: "Research",
    description: "Long-running chats",
    scenarioId: "default-scenario",
    createdAt: 1,
    updatedAt: 1,
  };
  const mainSession = {
    id: "session-main",
    title: "Main",
    rootSessionId: null,
    parentSessionId: null,
    projectId: "project-1",
    isFavorite: false,
    isArchived: false,
    updatedAt: 2,
  };
  const branchSession = {
    id: "session-branch",
    title: "Branch",
    rootSessionId: "session-main",
    parentSessionId: "session-main",
    projectId: "project-1",
    isFavorite: false,
    isArchived: false,
    updatedAt: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    listProjectsMock.mockReturnValue([project]);
    createProjectMock.mockReturnValue(project);
    getProjectMock.mockReturnValue(project);
    listMainSessionsMock.mockReturnValue([mainSession]);
    listBranchesMock.mockReturnValue([branchSession]);
    listAllSessionsInGroupMock.mockReturnValue([mainSession, branchSession]);
    updateProjectMock.mockReturnValue({
      ...project,
      name: "Research Updated",
    });
    getProjectSessionCountMock.mockReturnValue(3);
    getUncategorizedSessionCountMock.mockReturnValue(5);
    moveSessionToProjectMock.mockReturnValue({
      sessionIds: ["session-1", "branch-1"],
    });
  });

  it("forwards project CRUD and count handlers", async () => {
    await expect(router["projects:list"]({} as any)).resolves.toEqual([project]);

    await expect(
      router["projects:create"]({} as any, {
        name: "Research",
        description: "Long-running chats",
        scenarioId: "default-scenario",
      })
    ).resolves.toEqual(project);
    expect(createProjectMock).toHaveBeenCalledWith({
      name: "Research",
      description: "Long-running chats",
      scenarioId: "default-scenario",
    });

    await expect(
      router["projects:get"]({} as any, {
        id: "project-1",
      })
    ).resolves.toEqual(project);
    expect(getProjectMock).toHaveBeenCalledWith("project-1");

    await expect(
      router["projects:update"]({} as any, {
        id: "project-1",
        data: { name: "Research Updated" },
      })
    ).resolves.toEqual({
      ...project,
      name: "Research Updated",
    });
    expect(updateProjectMock).toHaveBeenCalledWith("project-1", { name: "Research Updated" });

    await expect(
      router["projects:delete"]({} as any, {
        id: "project-1",
      })
    ).resolves.toEqual({ ok: true });
    expect(deleteProjectMock).toHaveBeenCalledWith("project-1");

    await expect(
      router["projects:getSessionCount"]({} as any, {
        projectId: "project-1",
      })
    ).resolves.toBe(3);
    expect(getProjectSessionCountMock).toHaveBeenCalledWith("project-1");

    await expect(router["projects:getUncategorizedCount"]({} as any)).resolves.toBe(5);
    expect(getUncategorizedSessionCountMock).toHaveBeenCalledTimes(1);
  });

  it("forwards session category updates and moves", async () => {
    await expect(
      router["sessions:updateProject"]({} as any, {
        id: "session-1",
        projectId: "project-1",
      })
    ).resolves.toEqual({ ok: true });
    expect(updateSessionProjectMock).toHaveBeenCalledWith("session-1", "project-1");

    await expect(
      router["sessions:moveToProject"]({} as any, {
        id: "session-1",
        projectId: null,
      })
    ).resolves.toEqual({
      sessionIds: ["session-1", "branch-1"],
    });
    expect(moveSessionToProjectMock).toHaveBeenCalledWith("session-1", null);
  });

  it("forwards session list and flag handlers", async () => {
    await expect(router["sessions:listMain"]({} as any)).resolves.toEqual([mainSession]);
    expect(listMainSessionsMock).toHaveBeenCalledTimes(1);

    await expect(
      router["sessions:listBranches"]({} as any, {
        mainSessionId: "session-main",
      })
    ).resolves.toEqual([branchSession]);
    expect(listBranchesMock).toHaveBeenCalledWith("session-main");

    await expect(
      router["sessions:listGroup"]({} as any, {
        mainSessionId: "session-main",
      })
    ).resolves.toEqual([mainSession, branchSession]);
    expect(listAllSessionsInGroupMock).toHaveBeenCalledWith("session-main");

    await expect(
      router["sessions:updateFavorite"]({} as any, {
        id: "session-main",
        isFavorite: true,
      })
    ).resolves.toEqual({ ok: true });
    expect(updateSessionFavoriteMock).toHaveBeenCalledWith("session-main", true);

    await expect(
      router["sessions:updateArchive"]({} as any, {
        id: "session-main",
        isArchived: true,
      })
    ).resolves.toEqual({ ok: true });
    expect(updateSessionArchiveMock).toHaveBeenCalledWith("session-main", true);
  });
});
