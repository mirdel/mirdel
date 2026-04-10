import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appendImageGenerationAssets,
  createImageGeneration,
  createImageGenerationRun,
  createImageWorkspace,
  deleteImageAsset,
  deleteImageGeneration,
  deleteImageWorkspace,
  listImageGenerationsByWorkspace,
  listImageWorkspaces,
  renameImageWorkspace,
  updateImageGenerationRunStatus,
  updateImageWorkspaceLastComposer,
} from "../../imageWorkspaceData";
import { useTestDb } from "../../../../../test/helpers/testDb";

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5lr9sAAAAASUVORK5CYII=";

describe("imageWorkspaceData", () => {
  useTestDb("image-workspace-data");

  it("manages image workspaces and persists composer settings", () => {
    const created = createImageWorkspace({
      name: "",
      lastComposer: {
        activeTask: "edit",
        byTask: {
          edit: {
            modelKey: "mock::image-edit",
            count: 2,
          },
        },
      },
    });

    expect(created.name.length).toBeGreaterThan(0);
    expect(created.lastComposer?.activeTask).toBe("edit");
    expect(created.lastComposer?.byTask.edit.modelKey).toBe("mock::image-edit");

    expect(listImageWorkspaces()).toContainEqual(expect.objectContaining({ id: created.id }));

    renameImageWorkspace({
      workspaceId: created.id,
      name: "Image Drafts",
    });
    updateImageWorkspaceLastComposer({
      workspaceId: created.id,
      lastComposer: {
        byTask: {
          generate: {
            aspectRatio: "16:9",
            count: 3,
          },
        },
      },
    });

    expect(listImageWorkspaces()).toContainEqual(
      expect.objectContaining({
        id: created.id,
        name: "Image Drafts",
        lastComposer: expect.objectContaining({
          activeTask: "edit",
          byTask: expect.objectContaining({
            edit: expect.objectContaining({ modelKey: "mock::image-edit" }),
            generate: expect.objectContaining({ aspectRatio: "16:9", count: 3 }),
          }),
        }),
      })
    );
  });

  it("creates image generations, links output assets, and cleans them up on deletion", async () => {
    const workspace = createImageWorkspace({ name: "Images" });
    const generation = createImageGeneration({
      workspaceId: workspace.id,
      prompt: "Draw a launch poster",
      selectedModel: "mock::image-gen",
      params: {
        taskType: "generate",
        count: 1,
      },
    });
    const run = createImageGenerationRun({
      generationId: generation.id,
      prompt: generation.prompt,
      status: "running",
      selectedModel: generation.selectedModel,
      params: generation.params,
    });

    const appended = await appendImageGenerationAssets({
      generationId: generation.id,
      runId: run.id,
      assets: [{ src: PNG_DATA_URL }],
    });
    updateImageGenerationRunStatus({
      runId: run.id,
      status: "succeeded",
      warningMessage: "soft warning",
    });

    expect(appended).toHaveLength(1);
    expect(fs.existsSync(appended[0].filePath)).toBe(true);

    expect(listImageGenerationsByWorkspace({ workspaceId: workspace.id })).toEqual([
      expect.objectContaining({
        id: generation.id,
        prompt: "Draw a launch poster",
        status: "succeeded",
        warningMessage: "soft warning",
        runs: [expect.objectContaining({ id: run.id, status: "succeeded" })],
        images: [expect.objectContaining({ id: appended[0].id, runId: run.id })],
      }),
    ]);

    await expect(deleteImageAsset({ linkId: appended[0].id })).resolves.toEqual({ ok: true });
    expect(fs.existsSync(appended[0].filePath)).toBe(false);
    expect(listImageGenerationsByWorkspace({ workspaceId: workspace.id })[0]?.images).toEqual([]);

    const appendedAgain = await appendImageGenerationAssets({
      generationId: generation.id,
      runId: run.id,
      assets: [{ src: PNG_DATA_URL }],
    });
    const recreatedFilePath = appendedAgain[0].filePath;
    expect(fs.existsSync(recreatedFilePath)).toBe(true);

    await expect(deleteImageGeneration({ generationId: generation.id })).resolves.toEqual({ ok: true });
    expect(fs.existsSync(recreatedFilePath)).toBe(false);
    expect(listImageGenerationsByWorkspace({ workspaceId: workspace.id })).toEqual([]);

    await expect(deleteImageWorkspace({ workspaceId: workspace.id })).resolves.toEqual({ ok: true });
    expect(listImageWorkspaces().some((item) => item.id === workspace.id)).toBe(false);
  });

  it("returns a stable error when deleting unknown image records", async () => {
    await expect(deleteImageAsset({ linkId: "missing-link" })).resolves.toEqual({
      ok: false,
      error: "asset not found",
    });
    await expect(deleteImageGeneration({ generationId: "missing-generation" })).resolves.toEqual({
      ok: false,
      error: "generation not found",
    });
  });
});
