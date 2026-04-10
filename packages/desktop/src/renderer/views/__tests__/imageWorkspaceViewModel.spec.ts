import { describe, expect, it } from "vitest";
import {
  appendCreatedImageGroup,
  buildImageReuseComposerState,
  buildImageRetryRunInput,
  clearImageSelectionAfterRemoval,
  normalizeImageWorkspaceRows,
  removeWorkspaceFromState,
  resolveImageRemovalAction,
  resolveWorkspaceSelection,
  type ImageWorkspaceViewRecord,
} from "../imageWorkspaceViewModel";

describe("imageWorkspaceViewModel", () => {
  it("normalizes workspace rows and sorts them by recency", () => {
    const workspaces = normalizeImageWorkspaceRows([
      { id: "workspace-1", name: "Images 1", updatedAt: 100 },
      { id: "workspace-2", name: "Images 2", updatedAt: 300 },
      { id: "", name: "invalid", updatedAt: 999 },
      { id: "workspace-3", updatedAt: 200 },
    ]);

    expect(workspaces.map((item) => item.id)).toEqual(["workspace-2", "workspace-1"]);
    expect(workspaces[0]?.groups).toEqual([]);
  });

  it("resolves the active workspace from route, current selection, then fallback", () => {
    const workspaces = [
      { id: "workspace-1" },
      { id: "workspace-2" },
    ];

    expect(resolveWorkspaceSelection(workspaces, "workspace-2", "workspace-1")).toBe("workspace-2");
    expect(resolveWorkspaceSelection(workspaces, "missing", "workspace-1")).toBe("workspace-1");
    expect(resolveWorkspaceSelection(workspaces, "", "missing")).toBe("workspace-1");
  });

  it("removes a workspace and falls back to the previous available workspace", () => {
    const workspaces: ImageWorkspaceViewRecord[] = [
      { id: "workspace-1", name: "Images 1", updatedAt: 100, groups: [] },
      { id: "workspace-2", name: "Images 2", updatedAt: 90, groups: [] },
      { id: "workspace-3", name: "Images 3", updatedAt: 80, groups: [] },
    ];

    const result = removeWorkspaceFromState(workspaces, "workspace-2", "workspace-2");

    expect(result.workspaces.map((item) => item.id)).toEqual(["workspace-1", "workspace-3"]);
    expect(result.activeWorkspaceId).toBe("workspace-1");
  });

  it("appends a created generation to the active workspace and keeps others unchanged", () => {
    const workspaces: ImageWorkspaceViewRecord[] = [
      { id: "workspace-1", name: "Images 1", updatedAt: 100, groups: [] },
      { id: "workspace-2", name: "Images 2", updatedAt: 90, groups: [] },
    ];

    const next = appendCreatedImageGroup(
      workspaces,
      "workspace-2",
      {
        id: "group-1",
        prompt: "draw",
        createdAt: 200,
        status: "queued",
        params: {},
        images: [],
        selectedModel: "provider::model",
        runs: [],
      },
      200,
      { activeTask: "generate" }
    );

    expect(next[0]?.groups).toHaveLength(0);
    expect(next[1]?.groups.map((item) => item.id)).toEqual(["group-1"]);
    expect(next[1]?.updatedAt).toBe(200);
  });

  it("clears detail selection when the selected image is removed", () => {
    expect(clearImageSelectionAfterRemoval("group-1", "image-1", "group-1", "image-1")).toEqual({
      selectedGroupId: "",
      selectedImageId: "",
    });

    expect(clearImageSelectionAfterRemoval("group-1", "image-1", "group-2", "image-1")).toEqual({
      selectedGroupId: "group-1",
      selectedImageId: "image-1",
    });
  });

  it("builds retry input only for failed or cancelled runs", () => {
    expect(buildImageRetryRunInput("workspace-1", "group-1", {
      id: "run-1",
      prompt: "retry me",
      status: "failed",
      selectedModel: "provider::image",
      params: { size: "1024x1024" },
    })).toEqual({
      workspaceId: "workspace-1",
      groupId: "group-1",
      prompt: "retry me",
      selectedModel: "provider::image",
      params: { size: "1024x1024" },
      replaceFailedRunId: "run-1",
    });

    expect(buildImageRetryRunInput("workspace-1", "group-1", {
      id: "run-2",
      prompt: "skip me",
      status: "running",
      selectedModel: "provider::image",
      params: {},
    })).toBeNull();
  });

  it("chooses the correct delete action for image results", () => {
    expect(resolveImageRemovalAction("running", 2)).toBe("noop");
    expect(resolveImageRemovalAction("succeeded", 1)).toBe("delete-group");
    expect(resolveImageRemovalAction("failed", 3)).toBe("delete-asset");
  });

  it("rebuilds composer state from a historical image generation", () => {
    const state = buildImageReuseComposerState({
      id: "group-1",
      prompt: "make poster",
      params: {
        taskType: "edit",
        modelKey: "provider::image-edit",
        aspectRatio: "16:9",
        size: "1536x1024",
        quality: "high",
        count: 2,
        seed: 42,
        negativePrompt: "blurry",
        promptExtend: true,
        watermark: true,
        editFunction: "description_edit",
        providerOptions: { quality: "ultra" },
        referenceImages: [{ url: "data:image/png;base64,abc" }],
        maskImage: { url: "data:image/png;base64,mask" },
      },
    }, (prefix) => `${prefix}-generated`);

    expect(state.activeTask).toBe("edit");
    expect(state.composer.modelKey).toBe("provider::image-edit");
    expect(state.composer.referenceImages).toEqual([
      { id: "ref-generated", name: "", url: "data:image/png;base64,abc" },
    ]);
    expect(state.composer.maskImage).toEqual({
      id: "mask-generated",
      name: "",
      url: "data:image/png;base64,mask",
    });
    expect(state.selection).toEqual({
      selectedGroupId: "group-1",
      selectedImageId: "",
    });
  });
});
