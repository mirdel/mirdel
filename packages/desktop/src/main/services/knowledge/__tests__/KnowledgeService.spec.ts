import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { searchAll } from "../../search/searchService";
import {
  checkFileChanged,
  getFileInfo,
  processKbItem,
  scanDirectory,
  searchKnowledgeBase,
} from "../KnowledgeService";
import {
  createKbItem,
  createKnowledgeBase,
  getKbChunksByItem,
  getKbItem,
} from "../knowledgeData";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("KnowledgeService", () => {
  useTestDb("knowledge-service");
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-client-x-knowledge-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("scans supported files, ignores common build folders, and reports file changes", async () => {
    const rootFile = path.join(tempDir, "guide.md");
    const nestedDir = path.join(tempDir, "docs");
    const deepDir = path.join(nestedDir, "deep");
    const ignoredNodeModules = path.join(tempDir, "node_modules");
    const ignoredDist = path.join(tempDir, "dist");
    const unsupportedFile = path.join(tempDir, "binary.bin");

    fs.mkdirSync(deepDir, { recursive: true });
    fs.mkdirSync(ignoredNodeModules, { recursive: true });
    fs.mkdirSync(ignoredDist, { recursive: true });

    fs.writeFileSync(rootFile, "# Guide\n\nLaunch checklist");
    fs.writeFileSync(path.join(nestedDir, "notes.txt"), "Nested notes");
    fs.writeFileSync(path.join(deepDir, "too-deep.md"), "Should not be scanned at depth 2");
    fs.writeFileSync(path.join(ignoredNodeModules, "ignored.md"), "Ignored");
    fs.writeFileSync(path.join(ignoredDist, "ignored.md"), "Ignored");
    fs.writeFileSync(path.join(tempDir, ".hidden.md"), "Ignored");
    fs.writeFileSync(unsupportedFile, "raw-bytes");

    const result = await scanDirectory(tempDir, 2);

    expect(result.files.map((file) => path.relative(tempDir, file.path)).sort()).toEqual([
      "docs/notes.txt",
      "guide.md",
    ]);
    expect(result.skipped.map((file) => path.relative(tempDir, file))).toContain("binary.bin");
    expect(result.skipped.map((file) => path.relative(tempDir, file))).not.toContain(".hidden.md");

    const info = await getFileInfo(rootFile);
    expect(info).toMatchObject({
      name: "guide.md",
      fileType: "md",
    });
    expect(info?.fileSize).toBeGreaterThan(0);

    expect(await checkFileChanged(rootFile, info!.fileMtime)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 20));
    fs.writeFileSync(rootFile, "# Guide\n\nUpdated launch checklist");

    expect(await checkFileChanged(rootFile, info!.fileMtime)).toBe(true);
  });

  it("processes a file-backed knowledge item, indexes it for search, and supports vector recall", async () => {
    const filePath = path.join(tempDir, "launch-guide.txt");
    fs.writeFileSync(
      filePath,
      "Launch checklist and deployment runbook for the desktop release.\n\nRollback steps and smoke tests."
    );
    const fileStat = fs.statSync(filePath);

    const kb = createKnowledgeBase({
      name: "Release KB",
      embeddingDimension: 2,
    });
    const item = createKbItem({
      kbId: kb.id,
      type: "file",
      name: "launch-guide.txt",
      source: filePath,
      fileType: "txt",
      fileSize: fileStat.size,
      fileMtime: 0,
    });

    await processKbItem(item.id, {
      embedFn: async (texts) =>
        texts.map((text) => (text.toLowerCase().includes("launch") ? [1, 0] : [0, 1])),
    });

    const storedItem = getKbItem(item.id);
    const chunks = getKbChunksByItem(item.id);

    expect(storedItem).toMatchObject({
      id: item.id,
      status: "ready",
      chunkCount: chunks.length,
    });
    expect(storedItem?.lastSyncAt).toBeTypeOf("number");
    expect(storedItem?.fileMtime).toBeGreaterThan(0);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.content).toContain("Launch checklist");

    const knowledgeHits = searchAll({
      query: "launch checklist",
      scope: "knowledge",
    });
    expect(knowledgeHits.buckets.knowledge.items).toEqual([
      expect.objectContaining({
        kbId: kb.id,
        itemId: item.id,
        itemName: "launch-guide.txt",
      }),
    ]);

    const vectorHits = searchKnowledgeBase(kb.id, [1, 0], 3);
    expect(vectorHits).toEqual([
      expect.objectContaining({
        kbId: kb.id,
        chunkId: chunks[0]?.id,
      }),
    ]);
    expect(vectorHits[0]?.content).toContain("deployment runbook");
  });

  it("marks an item as error when extracted content is empty", async () => {
    const kb = createKnowledgeBase({
      name: "Empty KB",
      embeddingDimension: 2,
    });
    const item = createKbItem({
      kbId: kb.id,
      type: "text",
      name: "empty note",
      content: "   ",
    });

    await expect(
      processKbItem(item.id, {
        embedFn: async (texts) => texts.map(() => [0, 1]),
      })
    ).rejects.toThrow();

    const storedItem = getKbItem(item.id);
    expect(storedItem).toMatchObject({
      id: item.id,
      status: "error",
      chunkCount: 0,
    });
    expect(storedItem?.error).toBeTruthy();
    expect(getKbChunksByItem(item.id)).toEqual([]);
    expect(
      searchAll({
        query: "empty",
        scope: "knowledge",
      }).buckets.knowledge.total
    ).toBe(0);
  });
});
