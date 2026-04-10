import { beforeEach, describe, expect, it, vi } from "vitest";

type IpcHandler = (channel: string, payload?: any) => Promise<any> | any;

function installWindowIpc(handler: IpcHandler) {
  const ipcMock = vi.fn((channel: string, payload?: any) => handler(channel, payload));

  Object.defineProperty(window, "ipc", {
    configurable: true,
    writable: true,
    value: ipcMock,
  });

  return ipcMock;
}

async function loadUseKnowledge(handler: IpcHandler) {
  vi.resetModules();
  const ipcMock = installWindowIpc(handler);
  const mod = await import("../useKnowledge");
  const api = mod.useKnowledge();

  api.knowledgeBases.value = [];
  api.currentKbId.value = null;
  api.currentKbItems.value = [];

  return { ...api, ipcMock };
}

describe("useKnowledge", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads knowledge bases, selects the current knowledge base, and annotates file changes", async () => {
    const kb = {
      id: "kb-1",
      name: "Docs",
      embeddingModel: "__default__",
      embeddingDimension: 768,
      createdAt: 1,
      updatedAt: 1,
    };
    const fileItem = {
      id: "item-file",
      kbId: "kb-1",
      type: "file",
      name: "guide.md",
      source: "/tmp/guide.md",
      status: "ready",
      fileMtime: 10,
      chunkCount: 1,
      createdAt: 1,
      updatedAt: 1,
    };
    const textItem = {
      id: "item-text",
      kbId: "kb-1",
      type: "text",
      name: "Launch guide",
      content: "hello",
      status: "ready",
      chunkCount: 1,
      createdAt: 2,
      updatedAt: 2,
    };

    const { loadKnowledgeBases, selectKb, knowledgeBases, currentKb, currentKbItems, itemsByType, ipcMock } = await loadUseKnowledge(
      async (channel, payload) => {
        switch (channel) {
          case "kb:list":
            return [kb];
          case "kb:listItems":
            expect(payload).toEqual({ kbId: "kb-1" });
            return [fileItem, textItem];
          case "kb:checkFileChanged":
            expect(payload).toEqual({
              filePath: "/tmp/guide.md",
              recordedMtime: 10,
            });
            return true;
          default:
            return null;
        }
      }
    );

    await loadKnowledgeBases();
    await selectKb("kb-1");

    expect(knowledgeBases.value).toEqual([kb]);
    expect(currentKb.value?.id).toBe("kb-1");
    expect(currentKbItems.value).toEqual([
      expect.objectContaining({ id: "item-file", hasChanged: true }),
      expect.objectContaining({ id: "item-text" }),
    ]);
    expect(itemsByType.value.file.map((item) => item.id)).toEqual(["item-file"]);
    expect(itemsByType.value.text.map((item) => item.id)).toEqual(["item-text"]);
    expect(ipcMock).toHaveBeenCalledWith("kb:list");
  });

  it("creates, updates, migrates, and deletes knowledge bases while keeping local state in sync", async () => {
    const existingKb = {
      id: "kb-existing",
      name: "Existing",
      embeddingModel: "__default__",
      embeddingDimension: 768,
      createdAt: 1,
      updatedAt: 1,
    };
    const createdKb = {
      id: "kb-new",
      name: "New KB",
      description: "docs",
      embeddingModel: "mock/embedding",
      embeddingDimension: 1024,
      createdAt: 2,
      updatedAt: 2,
    };

    const { loadKnowledgeBases, createKb, updateKb, migrateKb, deleteKb, selectKb, knowledgeBases, currentKbId, currentKbItems } = await loadUseKnowledge(
      async (channel, payload) => {
        switch (channel) {
          case "kb:list":
            return [existingKb];
          case "kb:create":
            return createdKb;
          case "kb:update":
            expect(payload).toEqual({
              id: "kb-new",
              updates: { name: "Renamed KB" },
            });
            return { ok: true };
          case "kb:migrate":
            expect(payload).toEqual({
              id: "kb-new",
              updates: {
                embeddingModel: "mock/embedding-v2",
                embeddingDimension: 1536,
              },
            });
            return { ok: true };
          case "kb:delete":
            expect(payload).toEqual({ id: "kb-new" });
            return { ok: true };
          case "kb:listItems":
            return [];
          default:
            return null;
        }
      }
    );

    await loadKnowledgeBases();
    const kb = await createKb({
      name: "New KB",
      description: "docs",
      embeddingModel: "mock/embedding",
      embeddingDimension: 1024,
    });
    expect(kb.id).toBe("kb-new");
    expect(knowledgeBases.value.map((item) => item.id)).toEqual(["kb-new", "kb-existing"]);

    await updateKb("kb-new", { name: "Renamed KB" });
    expect(knowledgeBases.value.find((item) => item.id === "kb-new")).toMatchObject({
      name: "Renamed KB",
      description: "docs",
    });

    await migrateKb("kb-new", {
      embeddingModel: "mock/embedding-v2",
      embeddingDimension: 1536,
    });
    expect(knowledgeBases.value.find((item) => item.id === "kb-new")).toMatchObject({
      embeddingModel: "mock/embedding-v2",
      embeddingDimension: 1536,
    });

    await selectKb("kb-new");
    currentKbItems.value = [{ id: "item-1" } as any];
    await deleteKb("kb-new");
    expect(currentKbId.value).toBeNull();
    expect(currentKbItems.value).toEqual([]);
    expect(knowledgeBases.value.map((item) => item.id)).toEqual(["kb-existing"]);
  });

  it("adds and processes knowledge items, supports dialog helpers, and surfaces process failures", async () => {
    const createdTextItem = {
      id: "item-text",
      kbId: "kb-1",
      type: "text",
      name: "Doc",
      content: "body",
      status: "pending",
      chunkCount: 0,
      createdAt: 1,
      updatedAt: 1,
    };
    const processedTextItem = {
      ...createdTextItem,
      status: "ready",
      chunkCount: 3,
      updatedAt: 2,
    };
    const createdFileItem = {
      id: "item-file",
      kbId: "kb-1",
      type: "file",
      name: "guide.md",
      source: "/tmp/guide.md",
      fileType: "md",
      fileSize: 123,
      fileMtime: 99,
      status: "pending",
      chunkCount: 0,
      createdAt: 3,
      updatedAt: 3,
    };
    const createdDirItem = {
      id: "item-dir",
      kbId: "kb-1",
      type: "directory",
      name: "repo",
      source: "/tmp/repo",
      maxDepth: 2,
      status: "pending",
      chunkCount: 0,
      createdAt: 4,
      updatedAt: 4,
    };
    const createdUrlItem = {
      id: "item-url",
      kbId: "kb-1",
      type: "url",
      name: "https://example.com",
      source: "https://example.com",
      status: "pending",
      chunkCount: 0,
      createdAt: 5,
      updatedAt: 5,
    };
    const searchResult = [{ itemId: "item-text", score: 0.9 }];

    const { addTextItem, addFileItem, addDirectoryItem, addUrlItem, processItem, deleteItem, selectFile, selectDirectory, scanDirectory, search, currentKbItems, ipcMock } = await loadUseKnowledge(
      async (channel, payload) => {
        switch (channel) {
          case "kb:createItem":
            if (payload.type === "text") return createdTextItem;
            if (payload.type === "file") return createdFileItem;
            if (payload.type === "directory") return createdDirItem;
            return createdUrlItem;
          case "kb:getFileInfo":
            return {
              name: "guide.md",
              fileType: "md",
              fileSize: 123,
              fileMtime: 99,
            };
          case "kb:processItem":
            if (payload.itemId === "item-file") {
              return { ok: false, error: "process failed" };
            }
            return { ok: true };
          case "kb:getItem":
            return processedTextItem;
          case "kb:deleteItem":
            return { ok: true };
          case "dialog:selectFile":
            return {
              canceled: false,
              filePaths: ["/tmp/guide.md"],
            };
          case "dialog:selectDirectory":
            return {
              canceled: false,
              filePath: "/tmp/repo",
            };
          case "kb:scanDirectory":
            return {
              files: [{ path: "/tmp/repo/readme.md", name: "readme.md", fileType: "md", fileSize: 1, fileMtime: 1 }],
              skipped: [],
            };
          case "kb:search":
            return {
              ok: true,
              results: searchResult,
            };
          default:
            return null;
        }
      }
    );

    const textItem = await addTextItem("kb-1", { name: "Doc", content: "body" });
    const fileItem = await addFileItem("kb-1", "/tmp/guide.md");
    const dirItem = await addDirectoryItem("kb-1", "/tmp/repo", 2);
    const urlItem = await addUrlItem("kb-1", "https://example.com");

    expect(currentKbItems.value.map((item) => item.id)).toEqual([
      "item-url",
      "item-dir",
      "item-file",
      "item-text",
    ]);
    expect(textItem.id).toBe("item-text");
    expect(fileItem.id).toBe("item-file");
    expect(dirItem.name).toBe("repo");
    expect(urlItem.id).toBe("item-url");

    await processItem("item-text", "kb-1");
    expect(currentKbItems.value.find((item) => item.id === "item-text")).toMatchObject({
      status: "ready",
      chunkCount: 3,
      hasChanged: false,
    });

    await expect(processItem("item-file", "kb-1")).rejects.toThrow("process failed");
    expect(currentKbItems.value.find((item) => item.id === "item-file")).toMatchObject({
      status: "error",
      error: "process failed",
    });

    await deleteItem("item-dir");
    expect(currentKbItems.value.map((item) => item.id)).toEqual(["item-url", "item-file", "item-text"]);

    await expect(selectFile({ title: "Pick file", multiSelections: true })).resolves.toEqual(["/tmp/guide.md"]);
    await expect(selectDirectory("Pick directory")).resolves.toBe("/tmp/repo");
    await expect(scanDirectory("/tmp/repo", 3)).resolves.toEqual({
      files: [{ path: "/tmp/repo/readme.md", name: "readme.md", fileType: "md", fileSize: 1, fileMtime: 1 }],
      skipped: [],
    });
    await expect(search("vector", ["kb-1"], 5)).resolves.toEqual(searchResult);
    expect(ipcMock).toHaveBeenCalledWith("kb:search", { query: "vector", kbIds: ["kb-1"], topK: 5 });
  });
});
