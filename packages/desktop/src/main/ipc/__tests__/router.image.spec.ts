import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  appendImageGenerationAssetsMock,
  createImageGenerationMock,
  createImageWorkspaceMock,
  deleteImageAssetMock,
  deleteImageGenerationMock,
  deleteImageWorkspaceMock,
  listImageGenerationsByWorkspaceMock,
  listImageWorkspacesMock,
  renameImageWorkspaceMock,
  runImageGenerationMock,
  updateImageGenerationStatusMock,
  updateImageWorkspaceLastComposerMock,
  abortImageGenerationMock,
} = vi.hoisted(() => ({
  appendImageGenerationAssetsMock: vi.fn(),
  createImageGenerationMock: vi.fn(),
  createImageWorkspaceMock: vi.fn(),
  deleteImageAssetMock: vi.fn(),
  deleteImageGenerationMock: vi.fn(),
  deleteImageWorkspaceMock: vi.fn(),
  listImageGenerationsByWorkspaceMock: vi.fn(),
  listImageWorkspacesMock: vi.fn(),
  renameImageWorkspaceMock: vi.fn(),
  runImageGenerationMock: vi.fn(),
  updateImageGenerationStatusMock: vi.fn(),
  updateImageWorkspaceLastComposerMock: vi.fn(),
  abortImageGenerationMock: vi.fn(),
}));

vi.mock("typed-electron-ipc", () => ({
  ipcRouter: (handlers: Record<string, unknown>) => handlers,
}));

vi.mock("../../services/imageWorkspaceData", async () => {
  const actual = await vi.importActual<typeof import("../../services/imageWorkspaceData")>("../../services/imageWorkspaceData");
  return {
    ...actual,
    listImageWorkspaces: listImageWorkspacesMock,
    createImageWorkspace: createImageWorkspaceMock,
    renameImageWorkspace: renameImageWorkspaceMock,
    deleteImageWorkspace: deleteImageWorkspaceMock,
    updateImageWorkspaceLastComposer: updateImageWorkspaceLastComposerMock,
    listImageGenerationsByWorkspace: listImageGenerationsByWorkspaceMock,
    createImageGeneration: createImageGenerationMock,
    updateImageGenerationStatus: updateImageGenerationStatusMock,
    appendImageGenerationAssets: appendImageGenerationAssetsMock,
    deleteImageGeneration: deleteImageGenerationMock,
    deleteImageAsset: deleteImageAssetMock,
  };
});

vi.mock("../../services/image/imageGenerationService", async () => {
  const actual = await vi.importActual<typeof import("../../services/image/imageGenerationService")>("../../services/image/imageGenerationService");
  return {
    ...actual,
    runImageGeneration: runImageGenerationMock,
    abortImageGeneration: abortImageGenerationMock,
  };
});

const { router } = await import("../router");

describe("router image handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    listImageWorkspacesMock.mockReturnValue([{ id: "workspace-1", name: "Images" }]);
    createImageWorkspaceMock.mockReturnValue({ id: "workspace-1", name: "Images" });
    renameImageWorkspaceMock.mockReturnValue({ ok: true });
    deleteImageWorkspaceMock.mockResolvedValue({ ok: true });
    updateImageWorkspaceLastComposerMock.mockReturnValue({ ok: true });
    listImageGenerationsByWorkspaceMock.mockReturnValue([{ id: "generation-1", workspaceId: "workspace-1" }]);
    createImageGenerationMock.mockReturnValue({ id: "generation-1", workspaceId: "workspace-1" });
    updateImageGenerationStatusMock.mockReturnValue({ ok: true, runId: "run-1" });
    appendImageGenerationAssetsMock.mockResolvedValue([{ id: "link-1", generationId: "generation-1", runId: "run-1" }]);
    runImageGenerationMock.mockResolvedValue({ count: 1, assets: [{ id: "link-1" }] });
    abortImageGenerationMock.mockReturnValue({ ok: true });
    deleteImageGenerationMock.mockResolvedValue({ ok: true });
    deleteImageAssetMock.mockResolvedValue({ ok: true });
  });

  it("forwards image workspace and generation handlers", async () => {
    await expect(router["imageWorkspace:list"]({} as any)).resolves.toEqual([{ id: "workspace-1", name: "Images" }]);
    await expect(router["imageWorkspace:create"]({} as any, { name: "Images" })).resolves.toEqual({ id: "workspace-1", name: "Images" });
    await expect(router["imageWorkspace:rename"]({} as any, { workspaceId: "workspace-1", name: "Images 2" })).resolves.toEqual({ ok: true });
    await expect(router["imageWorkspace:updateLastComposer"]({} as any, {
      workspaceId: "workspace-1",
      lastComposer: { activeTask: "generate" },
    })).resolves.toEqual({ ok: true });
    await expect(router["imageGeneration:listByWorkspace"]({} as any, { workspaceId: "workspace-1" })).resolves.toEqual([
      { id: "generation-1", workspaceId: "workspace-1" },
    ]);
    await expect(router["imageGeneration:create"]({} as any, {
      workspaceId: "workspace-1",
      prompt: "Draw a poster",
      status: "queued",
      selectedModel: "mock::image-gen",
      params: { taskType: "generate" },
    })).resolves.toEqual({ id: "generation-1", workspaceId: "workspace-1" });
    await expect(router["imageGeneration:updateStatus"]({} as any, {
      generationId: "generation-1",
      status: "failed",
      errorMessage: "bad prompt",
    })).resolves.toEqual({ ok: true, runId: "run-1" });
    await expect(router["imageGeneration:appendAssets"]({} as any, {
      generationId: "generation-1",
      runId: "run-1",
      assets: [{ src: "data:image/png;base64,ZmFrZQ==" }],
    })).resolves.toEqual([{ id: "link-1", generationId: "generation-1", runId: "run-1" }]);
    await expect(router["imageGeneration:run"]({} as any, {
      workspaceId: "workspace-1",
      generationId: "generation-1",
      selectedModel: "mock::image-gen",
      prompt: "Draw a poster",
      params: { taskType: "generate" },
    })).resolves.toEqual({ count: 1, assets: [{ id: "link-1" }] });
    await expect(router["imageGeneration:abort"]({} as any, { generationId: "generation-1" })).resolves.toEqual({ ok: true });
    await expect(router["imageAsset:delete"]({} as any, { linkId: "link-1" })).resolves.toEqual({ ok: true });
    await expect(router["imageGeneration:delete"]({} as any, { generationId: "generation-1" })).resolves.toEqual({ ok: true });
    await expect(router["imageWorkspace:delete"]({} as any, { workspaceId: "workspace-1" })).resolves.toEqual({ ok: true });
  });
});
