import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  appendVideoGenerationAssetsMock,
  createVideoGenerationRunMock,
  resolveProviderInvocationMock,
  resolveVideoProviderAdapterMock,
  updateVideoGenerationRunStatusMock,
} = vi.hoisted(() => ({
  appendVideoGenerationAssetsMock: vi.fn(),
  createVideoGenerationRunMock: vi.fn(),
  resolveProviderInvocationMock: vi.fn(),
  resolveVideoProviderAdapterMock: vi.fn(),
  updateVideoGenerationRunStatusMock: vi.fn(),
}));

vi.mock("../../providers/modelInvocation", async () => {
  const actual = await vi.importActual<typeof import("../../providers/modelInvocation")>("../../providers/modelInvocation");
  return {
    ...actual,
    resolveProviderInvocation: resolveProviderInvocationMock,
  };
});

vi.mock("../../videoWorkspaceData", async () => {
  const actual = await vi.importActual<typeof import("../../videoWorkspaceData")>("../../videoWorkspaceData");
  return {
    ...actual,
    appendVideoGenerationAssets: appendVideoGenerationAssetsMock,
    createVideoGenerationRun: createVideoGenerationRunMock,
    updateVideoGenerationRunStatus: updateVideoGenerationRunStatusMock,
  };
});

vi.mock("../adapters", async () => {
  const actual = await vi.importActual<typeof import("../adapters")>("../adapters");
  return {
    ...actual,
    resolveVideoProviderAdapter: resolveVideoProviderAdapterMock,
  };
});

const {
  VideoGenerationError,
} = await import("../adapters/errors");

const {
  abortVideoGeneration,
  runVideoGeneration,
} = await import("../videoGenerationService");

describe("videoGenerationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    resolveProviderInvocationMock.mockReturnValue({
      provider: {
        id: "mock",
        baseUrl: "https://example.com",
        models: [{
          id: "video-gen",
          modelType: "generative",
          outputModalities: ["video"],
          inputModalities: [],
          video: {
            duration: {
              enabled: true,
              options: [5, 10],
            },
          },
        }],
      },
    });
    createVideoGenerationRunMock.mockReturnValue({
      id: "run-1",
      generationId: "generation-1",
      prompt: "Animate the logo",
      status: "running",
      selectedModel: "mock::video-gen",
      params: { duration: 5 },
      createdAt: 10,
      updatedAt: 10,
      startedAt: 10,
    });
    appendVideoGenerationAssetsMock.mockResolvedValue([
      {
        id: "link-1",
        generationId: "generation-1",
        runId: "run-1",
        filePath: "/tmp/output.mp4",
        mediaType: "video/mp4",
        sortOrder: 0,
        createdAt: 11,
      },
    ]);
    resolveVideoProviderAdapterMock.mockReturnValue({
      id: "mock-video-adapter",
      run: vi.fn().mockResolvedValue({
        assets: [{
          src: "ZmFrZS12aWRlbw==",
          mediaType: "video/mp4",
        }],
      }),
    });
  });

  it("runs a video generation successfully and persists returned assets", async () => {
    await expect(runVideoGeneration({
      workspaceId: "workspace-1",
      generationId: "generation-1",
      selectedModel: "mock::video-gen",
      prompt: "Animate the logo",
      params: {
        duration: 5,
      },
    })).resolves.toEqual({
      assets: [
        expect.objectContaining({
          id: "link-1",
          filePath: "/tmp/output.mp4",
        }),
      ],
      count: 1,
      warnings: undefined,
      run: expect.objectContaining({
        id: "run-1",
        status: "succeeded",
      }),
    });

    expect(createVideoGenerationRunMock).toHaveBeenCalledWith(expect.objectContaining({
      generationId: "generation-1",
      status: "running",
    }));
    expect(appendVideoGenerationAssetsMock).toHaveBeenCalledWith({
      generationId: "generation-1",
      runId: "run-1",
      assets: [{
        src: "ZmFrZS12aWRlbw==",
        mediaType: "video/mp4",
      }],
    });
    expect(updateVideoGenerationRunStatusMock).toHaveBeenCalledWith({
      runId: "run-1",
      status: "succeeded",
      warningMessage: undefined,
    });
  });

  it("rejects invalid prompt or duration before calling the adapter", async () => {
    await expect(runVideoGeneration({
      workspaceId: "workspace-1",
      generationId: "generation-1",
      selectedModel: "mock::video-gen",
      prompt: "",
      params: {
        duration: 5,
      },
    })).rejects.toThrow();
    expect(resolveVideoProviderAdapterMock).not.toHaveBeenCalled();

    await expect(runVideoGeneration({
      workspaceId: "workspace-1",
      generationId: "generation-1",
      selectedModel: "mock::video-gen",
      prompt: "Animate the logo",
      params: {
        duration: 99,
      },
    })).rejects.toThrow();
    expect(resolveVideoProviderAdapterMock).not.toHaveBeenCalled();
  });

  it("marks runs as failed or cancelled when generation stops", async () => {
    resolveVideoProviderAdapterMock.mockReturnValueOnce({
      id: "mock-video-adapter",
      run: vi.fn().mockRejectedValue(new VideoGenerationError({
        code: "validation",
        message: "bad duration",
      })),
    });

    await expect(runVideoGeneration({
      workspaceId: "workspace-1",
      generationId: "generation-1",
      selectedModel: "mock::video-gen",
      prompt: "Animate the logo",
      params: {
        duration: 5,
      },
    })).rejects.toThrow("bad duration");
    expect(updateVideoGenerationRunStatusMock).toHaveBeenCalledWith({
      runId: "run-1",
      status: "failed",
      errorMessage: "bad duration",
    });

    resolveVideoProviderAdapterMock.mockReturnValueOnce({
      id: "mock-video-adapter",
      run: vi.fn(({ abortSignal }: { abortSignal: AbortSignal }) => new Promise((_resolve, reject) => {
        abortSignal.addEventListener("abort", () => {
          reject(new Error("aborted"));
        }, { once: true });
      })),
    });

    const promise = runVideoGeneration({
      workspaceId: "workspace-1",
      generationId: "generation-2",
      selectedModel: "mock::video-gen",
      prompt: "Animate the logo",
      params: {
        duration: 5,
      },
    });

    expect(abortVideoGeneration({ generationId: "generation-2" })).toEqual({ ok: true });
    await expect(promise).rejects.toThrow();
    expect(updateVideoGenerationRunStatusMock).toHaveBeenLastCalledWith({
      runId: "run-1",
      status: "cancelled",
      errorMessage: expect.any(String),
    });
  });
});
