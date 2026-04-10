import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  appendVideoGenerationAssetsMock,
  createVideoGenerationMock,
  createVideoWorkspaceMock,
  deleteVideoAssetMock,
  deleteVideoGenerationMock,
  deleteVideoWorkspaceMock,
  listVideoGenerationsByWorkspaceMock,
  listVideoWorkspacesMock,
  renameVideoWorkspaceMock,
  runVideoGenerationMock,
  updateVideoGenerationStatusMock,
  updateVideoWorkspaceLastComposerMock,
  abortVideoGenerationMock,
} = vi.hoisted(() => ({
  appendVideoGenerationAssetsMock: vi.fn(),
  createVideoGenerationMock: vi.fn(),
  createVideoWorkspaceMock: vi.fn(),
  deleteVideoAssetMock: vi.fn(),
  deleteVideoGenerationMock: vi.fn(),
  deleteVideoWorkspaceMock: vi.fn(),
  listVideoGenerationsByWorkspaceMock: vi.fn(),
  listVideoWorkspacesMock: vi.fn(),
  renameVideoWorkspaceMock: vi.fn(),
  runVideoGenerationMock: vi.fn(),
  updateVideoGenerationStatusMock: vi.fn(),
  updateVideoWorkspaceLastComposerMock: vi.fn(),
  abortVideoGenerationMock: vi.fn(),
}));

vi.mock("typed-electron-ipc", () => ({
  ipcRouter: (handlers: Record<string, unknown>) => handlers,
}));

vi.mock("../../services/videoWorkspaceData", async () => {
  const actual = await vi.importActual<typeof import("../../services/videoWorkspaceData")>("../../services/videoWorkspaceData");
  return {
    ...actual,
    listVideoWorkspaces: listVideoWorkspacesMock,
    createVideoWorkspace: createVideoWorkspaceMock,
    renameVideoWorkspace: renameVideoWorkspaceMock,
    deleteVideoWorkspace: deleteVideoWorkspaceMock,
    updateVideoWorkspaceLastComposer: updateVideoWorkspaceLastComposerMock,
    listVideoGenerationsByWorkspace: listVideoGenerationsByWorkspaceMock,
    createVideoGeneration: createVideoGenerationMock,
    updateVideoGenerationStatus: updateVideoGenerationStatusMock,
    appendVideoGenerationAssets: appendVideoGenerationAssetsMock,
    deleteVideoGeneration: deleteVideoGenerationMock,
    deleteVideoAsset: deleteVideoAssetMock,
  };
});

vi.mock("../../services/video/videoGenerationService", async () => {
  const actual = await vi.importActual<typeof import("../../services/video/videoGenerationService")>("../../services/video/videoGenerationService");
  return {
    ...actual,
    runVideoGeneration: runVideoGenerationMock,
    abortVideoGeneration: abortVideoGenerationMock,
  };
});

const { router } = await import("../router");

describe("router video handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listVideoWorkspacesMock.mockReturnValue([{ id: "workspace-1", name: "Videos" }]);
    createVideoWorkspaceMock.mockReturnValue({ id: "workspace-1", name: "Videos" });
    renameVideoWorkspaceMock.mockReturnValue({ ok: true });
    deleteVideoWorkspaceMock.mockResolvedValue({ ok: true });
    updateVideoWorkspaceLastComposerMock.mockReturnValue({ ok: true });
    listVideoGenerationsByWorkspaceMock.mockReturnValue([{ id: "generation-1", workspaceId: "workspace-1" }]);
    createVideoGenerationMock.mockReturnValue({ id: "generation-1", workspaceId: "workspace-1" });
    updateVideoGenerationStatusMock.mockReturnValue({ ok: true, runId: "run-1" });
    appendVideoGenerationAssetsMock.mockResolvedValue([{ id: "link-1", generationId: "generation-1", runId: "run-1" }]);
    runVideoGenerationMock.mockResolvedValue({ count: 1, assets: [{ id: "link-1" }] });
    abortVideoGenerationMock.mockReturnValue({ ok: true });
    deleteVideoGenerationMock.mockResolvedValue({ ok: true });
    deleteVideoAssetMock.mockResolvedValue({ ok: true });
  });

  it("forwards video workspace and generation handlers", async () => {
    await expect(router["videoWorkspace:list"]({} as any)).resolves.toEqual([{ id: "workspace-1", name: "Videos" }]);
    await expect(router["videoWorkspace:create"]({} as any, { name: "Videos" })).resolves.toEqual({ id: "workspace-1", name: "Videos" });
    await expect(router["videoWorkspace:rename"]({} as any, { workspaceId: "workspace-1", name: "Videos 2" })).resolves.toEqual({ ok: true });
    await expect(router["videoWorkspace:updateLastComposer"]({} as any, {
      workspaceId: "workspace-1",
      lastComposer: { activeTask: "generate" },
    })).resolves.toEqual({ ok: true });
    await expect(router["videoGeneration:listByWorkspace"]({} as any, { workspaceId: "workspace-1" })).resolves.toEqual([
      { id: "generation-1", workspaceId: "workspace-1" },
    ]);
    await expect(router["videoGeneration:create"]({} as any, {
      workspaceId: "workspace-1",
      prompt: "Animate the logo",
      status: "queued",
      selectedModel: "mock::video-gen",
      params: { duration: 5 },
    })).resolves.toEqual({ id: "generation-1", workspaceId: "workspace-1" });
    await expect(router["videoGeneration:updateStatus"]({} as any, {
      generationId: "generation-1",
      status: "failed",
      errorMessage: "bad duration",
    })).resolves.toEqual({ ok: true, runId: "run-1" });
    await expect(router["videoGeneration:appendAssets"]({} as any, {
      generationId: "generation-1",
      runId: "run-1",
      assets: [{ src: "ZmFrZS12aWRlbw==", mediaType: "video/mp4" }],
    })).resolves.toEqual([{ id: "link-1", generationId: "generation-1", runId: "run-1" }]);
    await expect(router["videoGeneration:run"]({} as any, {
      workspaceId: "workspace-1",
      generationId: "generation-1",
      selectedModel: "mock::video-gen",
      prompt: "Animate the logo",
      params: { duration: 5 },
    })).resolves.toEqual({ count: 1, assets: [{ id: "link-1" }] });
    await expect(router["videoGeneration:abort"]({} as any, { generationId: "generation-1" })).resolves.toEqual({ ok: true });
    await expect(router["videoAsset:delete"]({} as any, { linkId: "link-1" })).resolves.toEqual({ ok: true });
    await expect(router["videoGeneration:delete"]({} as any, { generationId: "generation-1" })).resolves.toEqual({ ok: true });
    await expect(router["videoWorkspace:delete"]({} as any, { workspaceId: "workspace-1" })).resolves.toEqual({ ok: true });
  });
});
