import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appendVideoGenerationAssets,
  createVideoGeneration,
  createVideoGenerationRun,
  createVideoWorkspace,
  deleteVideoAsset,
  deleteVideoGeneration,
  deleteVideoWorkspace,
  listVideoGenerationsByWorkspace,
  listVideoWorkspaces,
  renameVideoWorkspace,
  updateVideoGenerationRunStatus,
  updateVideoWorkspaceLastComposer,
} from "../../videoWorkspaceData";
import { useTestDb } from "../../../../../test/helpers/testDb";

const VIDEO_BASE64 = Buffer.from("fake-video-payload").toString("base64");

describe("videoWorkspaceData", () => {
  useTestDb("video-workspace-data");

  it("manages video workspaces and persists last composer settings", () => {
    const created = createVideoWorkspace({
      name: "",
      lastComposer: {
        byTask: {
          generate: {
            modelKey: "mock::video-gen",
            duration: 5,
          },
        },
      },
    });

    expect(created.name.length).toBeGreaterThan(0);
    expect(created.lastComposer?.byTask.generate.modelKey).toBe("mock::video-gen");

    renameVideoWorkspace({
      workspaceId: created.id,
      name: "Video Drafts",
    });
    updateVideoWorkspaceLastComposer({
      workspaceId: created.id,
      lastComposer: {
        byTask: {
          generate: {
            resolution: "1080p",
            count: 2,
          },
        },
      },
    });

    expect(listVideoWorkspaces()).toContainEqual(
      expect.objectContaining({
        id: created.id,
        name: "Video Drafts",
        lastComposer: expect.objectContaining({
          byTask: expect.objectContaining({
            generate: expect.objectContaining({
              modelKey: "mock::video-gen",
              duration: 5,
              resolution: "1080p",
              count: 2,
            }),
          }),
        }),
      })
    );
  });

  it("creates video generations, links output assets, and removes files when records are deleted", async () => {
    const workspace = createVideoWorkspace({ name: "Videos" });
    const generation = createVideoGeneration({
      workspaceId: workspace.id,
      prompt: "Animate the product logo",
      selectedModel: "mock::video-gen",
      params: {
        duration: 5,
        count: 1,
      },
    });
    const run = createVideoGenerationRun({
      generationId: generation.id,
      prompt: generation.prompt,
      status: "running",
      selectedModel: generation.selectedModel,
      params: generation.params,
    });

    const appended = await appendVideoGenerationAssets({
      generationId: generation.id,
      runId: run.id,
      assets: [{
        src: VIDEO_BASE64,
        mediaType: "video/mp4",
      }],
    });
    updateVideoGenerationRunStatus({
      runId: run.id,
      status: "succeeded",
    });

    expect(appended).toHaveLength(1);
    expect(fs.existsSync(appended[0].filePath)).toBe(true);

    expect(listVideoGenerationsByWorkspace({ workspaceId: workspace.id })).toEqual([
      expect.objectContaining({
        id: generation.id,
        prompt: "Animate the product logo",
        status: "succeeded",
        runs: [expect.objectContaining({ id: run.id, status: "succeeded" })],
        videos: [expect.objectContaining({ id: appended[0].id, runId: run.id })],
      }),
    ]);

    await expect(deleteVideoAsset({ linkId: appended[0].id })).resolves.toEqual({ ok: true });
    expect(fs.existsSync(appended[0].filePath)).toBe(false);

    const appendedAgain = await appendVideoGenerationAssets({
      generationId: generation.id,
      runId: run.id,
      assets: [{
        src: VIDEO_BASE64,
        mediaType: "video/mp4",
      }],
    });
    expect(fs.existsSync(appendedAgain[0].filePath)).toBe(true);

    await expect(deleteVideoGeneration({ generationId: generation.id })).resolves.toEqual({ ok: true });
    expect(fs.existsSync(appendedAgain[0].filePath)).toBe(false);
    expect(listVideoGenerationsByWorkspace({ workspaceId: workspace.id })).toEqual([]);

    await expect(deleteVideoWorkspace({ workspaceId: workspace.id })).resolves.toEqual({ ok: true });
    expect(listVideoWorkspaces().some((item) => item.id === workspace.id)).toBe(false);
  });

  it("returns a stable error when deleting unknown video records", async () => {
    await expect(deleteVideoAsset({ linkId: "missing-link" })).resolves.toEqual({
      ok: false,
      error: "asset not found",
    });
    await expect(deleteVideoGeneration({ generationId: "missing-generation" })).resolves.toEqual({
      ok: false,
      error: "generation not found",
    });
  });
});
