import { describe, expect, it } from "vitest";
import {
  buildVideoRetryRunInput,
  buildVideoReuseComposerState,
  normalizeVideoWorkspaceRows,
  reconcileVideoDetailSelection,
  removeWorkspaceFromState,
  resolveVideoRemovalAction,
  replaceWorkspaceGroups,
  resolveWorkspaceSelection,
  type VideoWorkspaceViewRecord,
} from "../videoWorkspaceViewModel";

describe("videoWorkspaceViewModel", () => {
  it("normalizes workspace rows with fallback name and timestamps", () => {
    const workspaces = normalizeVideoWorkspaceRows(
      [
        { id: "workspace-1", name: "  ", updatedAt: 100 },
        { id: "workspace-2", name: "Videos 2", updatedAt: 300, createdAt: 200 },
        { name: "missing-id" },
      ],
      "Videos 1",
      123
    );

    expect(workspaces.map((item) => item.id)).toEqual(["workspace-2", "workspace-1"]);
    expect(workspaces[1]?.name).toBe("Videos 1");
    expect(workspaces[1]?.createdAt).toBe(123);
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
    const workspaces: VideoWorkspaceViewRecord[] = [
      { id: "workspace-1", name: "Videos 1", createdAt: 1, updatedAt: 100, groups: [] },
      { id: "workspace-2", name: "Videos 2", createdAt: 2, updatedAt: 90, groups: [] },
      { id: "workspace-3", name: "Videos 3", createdAt: 3, updatedAt: 80, groups: [] },
    ];

    const result = removeWorkspaceFromState(workspaces, "workspace-2", "workspace-2");

    expect(result.workspaces.map((item) => item.id)).toEqual(["workspace-1", "workspace-3"]);
    expect(result.activeWorkspaceId).toBe("workspace-1");
  });

  it("replaces groups for the current workspace and preserves other workspaces", () => {
    const workspaces: VideoWorkspaceViewRecord[] = [
      { id: "workspace-1", name: "Videos 1", createdAt: 1, updatedAt: 100, groups: [] },
      { id: "workspace-2", name: "Videos 2", createdAt: 2, updatedAt: 90, groups: [] },
    ];

    const next = replaceWorkspaceGroups(workspaces, "workspace-2", [{ id: "group-1", videos: [{ id: "video-1" }] }]);

    expect(next[0]?.groups).toEqual([]);
    expect(next[1]?.groups.map((item) => item.id)).toEqual(["group-1"]);
  });

  it("clears detail selection when refreshed groups no longer contain the selected video", () => {
    expect(reconcileVideoDetailSelection(
      [{ id: "group-1", videos: [{ id: "video-1" }] }],
      "group-1",
      "video-1"
    )).toEqual({
      selectedGroupId: "group-1",
      selectedVideoId: "video-1",
      shouldClearDetail: false,
    });

    expect(reconcileVideoDetailSelection(
      [{ id: "group-1", videos: [] }],
      "group-1",
      "video-1"
    )).toEqual({
      selectedGroupId: "",
      selectedVideoId: "",
      shouldClearDetail: true,
    });
  });

  it("builds retry payloads for video reruns", () => {
    expect(buildVideoRetryRunInput("workspace-1", { id: "group-1" }, {
      prompt: "retry video",
      status: "failed",
      selectedModel: "provider::video",
      params: { duration: 5 },
    })).toEqual({
      workspaceId: "workspace-1",
      generationId: "group-1",
      selectedModel: "provider::video",
      prompt: "retry video",
      params: { duration: 5 },
    });
  });

  it("chooses the correct delete action for video results", () => {
    expect(resolveVideoRemovalAction("running", 2)).toBe("noop");
    expect(resolveVideoRemovalAction("succeeded", 1)).toBe("delete-group");
    expect(resolveVideoRemovalAction("failed", 2)).toBe("delete-asset");
  });

  it("rebuilds video composer state from the latest run", () => {
    const state = buildVideoReuseComposerState({
      prompt: "group prompt",
      selectedModel: "provider::video-group",
      params: { duration: 4 },
      runs: [
        {
          prompt: "latest prompt",
          selectedModel: "provider::video-run",
          params: {
            aspectRatio: "16:9",
            resolution: "1280x720",
            duration: 6,
            fps: 24,
            count: 3,
            seed: 99,
            negativePrompt: "low quality",
            referenceImages: [{ url: "data:image/png;base64,ref" }],
            providerOptions: { style: "cinematic" },
          },
        },
      ],
    }, (prefix) => `${prefix}-generated`, { min: 1, max: 4 });

    expect(state).toEqual({
      prompt: "latest prompt",
      modelKey: "provider::video-run",
      aspectRatio: "16:9",
      resolution: "1280x720",
      duration: 6,
      fps: 24,
      count: 3,
      seed: 99,
      negativePrompt: "low quality",
      referenceImages: [
        { id: "ref-generated", name: "", url: "data:image/png;base64,ref" },
      ],
      providerOptions: { style: "cinematic" },
    });
  });
});
