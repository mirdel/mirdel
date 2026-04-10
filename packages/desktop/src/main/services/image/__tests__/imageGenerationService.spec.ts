import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  appendImageGenerationAssetsMock,
  createImageGenerationRunMock,
  resolveImageProviderAdapterMock,
  resolveProviderInvocationMock,
  updateImageGenerationRunStatusMock,
} = vi.hoisted(() => ({
  appendImageGenerationAssetsMock: vi.fn(),
  createImageGenerationRunMock: vi.fn(),
  resolveImageProviderAdapterMock: vi.fn(),
  resolveProviderInvocationMock: vi.fn(),
  updateImageGenerationRunStatusMock: vi.fn(),
}));

vi.mock("../../providers/modelInvocation", async () => {
  const actual = await vi.importActual<typeof import("../../providers/modelInvocation")>("../../providers/modelInvocation");
  return {
    ...actual,
    resolveProviderInvocation: resolveProviderInvocationMock,
  };
});

vi.mock("../../imageWorkspaceData", async () => {
  const actual = await vi.importActual<typeof import("../../imageWorkspaceData")>("../../imageWorkspaceData");
  return {
    ...actual,
    appendImageGenerationAssets: appendImageGenerationAssetsMock,
    createImageGenerationRun: createImageGenerationRunMock,
    updateImageGenerationRunStatus: updateImageGenerationRunStatusMock,
  };
});

vi.mock("../adapters", async () => {
  const actual = await vi.importActual<typeof import("../adapters")>("../adapters");
  return {
    ...actual,
    resolveImageProviderAdapter: resolveImageProviderAdapterMock,
  };
});

const {
  ImageGenerationError,
} = await import("../adapters/errors");

const {
  abortImageGeneration,
  runImageGeneration,
} = await import("../imageGenerationService");

describe("imageGenerationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    resolveProviderInvocationMock.mockReturnValue({
      provider: {
        id: "mock",
        baseUrl: "https://example.com",
        models: [{
          id: "image-gen",
          modelType: "generative",
          outputModalities: ["image"],
          inputModalities: [],
          imageTasks: ["text_to_image"],
        }],
      },
    });
    createImageGenerationRunMock.mockReturnValue({
      id: "run-1",
      generationId: "generation-1",
      prompt: "Draw a poster",
      status: "running",
      selectedModel: "mock::image-gen",
      params: { count: 1 },
      createdAt: 10,
      updatedAt: 10,
      startedAt: 10,
    });
    appendImageGenerationAssetsMock.mockResolvedValue([
      {
        id: "link-1",
        assetId: "asset-1",
        generationId: "generation-1",
        runId: "run-1",
        filePath: "/tmp/output.png",
        mediaType: "image/png",
        sortOrder: 0,
        createdAt: 11,
      },
    ]);
    resolveImageProviderAdapterMock.mockReturnValue({
      id: "mock-image-adapter",
      run: vi.fn().mockResolvedValue({
        assets: [{
          src: "data:image/png;base64,ZmFrZQ==",
          mediaType: "image/png",
        }],
        warnings: ["soft warning"],
      }),
    });
  });

  it("runs an image generation successfully and persists returned assets", async () => {
    await expect(runImageGeneration({
      workspaceId: "workspace-1",
      generationId: "generation-1",
      selectedModel: "mock::image-gen",
      prompt: "Draw a poster",
      params: {
        taskType: "generate",
        count: 1,
      },
    })).resolves.toEqual({
      assets: [
        expect.objectContaining({
          id: "link-1",
          filePath: "/tmp/output.png",
        }),
      ],
      count: 1,
      warnings: ["soft warning"],
      run: expect.objectContaining({
        id: "run-1",
        status: "succeeded",
      }),
    });

    expect(createImageGenerationRunMock).toHaveBeenCalledWith(expect.objectContaining({
      generationId: "generation-1",
      status: "running",
    }));
    expect(appendImageGenerationAssetsMock).toHaveBeenCalledWith({
      generationId: "generation-1",
      runId: "run-1",
      assets: [{
        src: "data:image/png;base64,ZmFrZQ==",
        mediaType: "image/png",
      }],
    });
    expect(updateImageGenerationRunStatusMock).toHaveBeenCalledWith({
      runId: "run-1",
      status: "succeeded",
      warningMessage: "soft warning",
    });
  });

  it("marks runs as failed when the adapter throws a user-facing generation error", async () => {
    resolveImageProviderAdapterMock.mockReturnValue({
      id: "mock-image-adapter",
      run: vi.fn().mockRejectedValue(new ImageGenerationError({
        code: "validation",
        message: "bad prompt",
      })),
    });

    await expect(runImageGeneration({
      workspaceId: "workspace-1",
      generationId: "generation-1",
      selectedModel: "mock::image-gen",
      prompt: "Draw a poster",
      params: {
        taskType: "generate",
      },
    })).rejects.toThrow("bad prompt");

    expect(updateImageGenerationRunStatusMock).toHaveBeenCalledWith({
      runId: "run-1",
      status: "failed",
      errorMessage: "bad prompt",
    });
  });

  it("aborts an in-flight image generation and reports missing tasks afterwards", async () => {
    resolveImageProviderAdapterMock.mockReturnValue({
      id: "mock-image-adapter",
      run: vi.fn(({ abortSignal }: { abortSignal: AbortSignal }) => new Promise((_resolve, reject) => {
        abortSignal.addEventListener("abort", () => {
          reject(new Error("aborted"));
        }, { once: true });
      })),
    });

    const promise = runImageGeneration({
      workspaceId: "workspace-1",
      generationId: "generation-1",
      selectedModel: "mock::image-gen",
      prompt: "Draw a poster",
      params: {
        taskType: "generate",
      },
    });

    expect(abortImageGeneration({ generationId: "generation-1" })).toEqual({ ok: true });
    await expect(promise).rejects.toThrow();
    expect(updateImageGenerationRunStatusMock).toHaveBeenCalledWith({
      runId: "run-1",
      status: "cancelled",
      errorMessage: expect.any(String),
    });
    expect(abortImageGeneration({ generationId: "generation-1" })).toEqual({
      ok: false,
      error: expect.any(String),
    });
  });
});
