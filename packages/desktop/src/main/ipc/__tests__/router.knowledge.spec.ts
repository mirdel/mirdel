import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createKnowledgeBaseMock,
  createKbItemMock,
  createKbVectorTableMock,
  deleteKbItemMock,
  deleteKnowledgeBaseMock,
  getKbItemMock,
  getKnowledgeBaseMock,
  getDefaultModelByTypeMock,
  kbVectorTableExistsMock,
  listKbItemsMock,
  listKnowledgeBasesMock,
  processKbItemMock,
  resolveModelInvocationMock,
  updateKbItemMock,
  updateKnowledgeBaseMock,
} = vi.hoisted(() => ({
  createKnowledgeBaseMock: vi.fn(),
  createKbItemMock: vi.fn(),
  createKbVectorTableMock: vi.fn(),
  deleteKbItemMock: vi.fn(),
  deleteKnowledgeBaseMock: vi.fn(),
  getKbItemMock: vi.fn(),
  getKnowledgeBaseMock: vi.fn(),
  getDefaultModelByTypeMock: vi.fn(),
  kbVectorTableExistsMock: vi.fn(),
  listKbItemsMock: vi.fn(),
  listKnowledgeBasesMock: vi.fn(),
  processKbItemMock: vi.fn(),
  resolveModelInvocationMock: vi.fn(),
  updateKbItemMock: vi.fn(),
  updateKnowledgeBaseMock: vi.fn(),
}));

vi.mock("typed-electron-ipc", () => ({
  ipcRouter: (handlers: Record<string, unknown>) => handlers,
}));

vi.mock("../../services/knowledge/knowledgeData", async () => {
  const actual = await vi.importActual<typeof import("../../services/knowledge/knowledgeData")>("../../services/knowledge/knowledgeData");
  return {
    ...actual,
    listKnowledgeBases: listKnowledgeBasesMock,
    getKnowledgeBase: getKnowledgeBaseMock,
    createKnowledgeBase: createKnowledgeBaseMock,
    updateKnowledgeBase: updateKnowledgeBaseMock,
    deleteKnowledgeBase: deleteKnowledgeBaseMock,
    listKbItems: listKbItemsMock,
    getKbItem: getKbItemMock,
    createKbItem: createKbItemMock,
    updateKbItem: updateKbItemMock,
    deleteKbItem: deleteKbItemMock,
  };
});

vi.mock("../../services/knowledge/KnowledgeService", async () => {
  const actual = await vi.importActual<typeof import("../../services/knowledge/KnowledgeService")>("../../services/knowledge/KnowledgeService");
  return {
    ...actual,
    processKbItem: processKbItemMock,
  };
});

vi.mock("../../services/settings/settingsData", async () => {
  const actual = await vi.importActual<typeof import("../../services/settings/settingsData")>("../../services/settings/settingsData");
  return {
    ...actual,
    getDefaultModelByType: getDefaultModelByTypeMock,
  };
});

vi.mock("../../services/providers/modelInvocation", async () => {
  const actual = await vi.importActual<typeof import("../../services/providers/modelInvocation")>("../../services/providers/modelInvocation");
  return {
    ...actual,
    resolveModelInvocation: resolveModelInvocationMock,
  };
});

vi.mock("../../services/db", async () => {
  const actual = await vi.importActual<typeof import("../../services/db")>("../../services/db");
  return {
    ...actual,
    kbVectorTableExists: kbVectorTableExistsMock,
    createKbVectorTable: createKbVectorTableMock,
  };
});

const { router } = await import("../router");

describe("router knowledge handlers", () => {
  const kb = {
    id: "kb-1",
    name: "Release KB",
    embeddingModel: "__default__",
    embeddingDimension: 2,
    createdAt: 1,
    updatedAt: 1,
  };
  const item = {
    id: "item-1",
    kbId: "kb-1",
    type: "text",
    name: "launch guide",
    content: "Launch checklist",
    status: "pending",
    chunkCount: 0,
    createdAt: 1,
    updatedAt: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    listKnowledgeBasesMock.mockReturnValue([kb]);
    getKnowledgeBaseMock.mockReturnValue(kb);
    createKnowledgeBaseMock.mockReturnValue(kb);
    listKbItemsMock.mockReturnValue([item]);
    getKbItemMock.mockReturnValue(item);
    createKbItemMock.mockReturnValue(item);
    kbVectorTableExistsMock.mockReturnValue(false);
    processKbItemMock.mockResolvedValue(undefined);
    getDefaultModelByTypeMock.mockReturnValue({
      providerId: "mock",
      modelId: "embedding",
    });
    resolveModelInvocationMock.mockReturnValue({
      providerId: "mock",
      modelId: "embedding",
      client: {},
    });
  });

  it("forwards knowledge base and item CRUD handlers", async () => {
    await expect(router["kb:list"]({} as any)).resolves.toEqual([kb]);
    await expect(router["kb:get"]({} as any, { id: "kb-1" })).resolves.toEqual(kb);
    await expect(
      router["kb:create"]({} as any, {
        name: "Release KB",
        embeddingDimension: 2,
      })
    ).resolves.toEqual(kb);
    expect(createKnowledgeBaseMock).toHaveBeenCalledWith({
      name: "Release KB",
      embeddingDimension: 2,
    });

    await expect(
      router["kb:update"]({} as any, {
        id: "kb-1",
        updates: { name: "Release KB Updated" },
      })
    ).resolves.toEqual({ ok: true });
    expect(updateKnowledgeBaseMock).toHaveBeenCalledWith("kb-1", { name: "Release KB Updated" });

    await expect(
      router["kb:listItems"]({} as any, { kbId: "kb-1" })
    ).resolves.toEqual([item]);
    expect(listKbItemsMock).toHaveBeenCalledWith("kb-1");

    await expect(
      router["kb:createItem"]({} as any, {
        kbId: "kb-1",
        type: "text",
        name: "launch guide",
        content: "Launch checklist",
      })
    ).resolves.toEqual(item);
    expect(createKbItemMock).toHaveBeenCalledWith({
      kbId: "kb-1",
      type: "text",
      name: "launch guide",
      content: "Launch checklist",
    });

    await expect(
      router["kb:deleteItem"]({} as any, { id: "item-1" })
    ).resolves.toEqual({ ok: true });
    expect(deleteKbItemMock).toHaveBeenCalledWith("item-1");

    await expect(
      router["kb:delete"]({} as any, { id: "kb-1" })
    ).resolves.toEqual({ ok: true });
    expect(deleteKnowledgeBaseMock).toHaveBeenCalledWith("kb-1");
  });

  it("processes kb items and text updates through the main knowledge handlers", async () => {
    await expect(
      router["kb:processItem"]({} as any, { itemId: "item-1", kbId: "kb-1" })
    ).resolves.toEqual({ ok: true });
    expect(kbVectorTableExistsMock).toHaveBeenCalledWith("kb-1");
    expect(createKbVectorTableMock).toHaveBeenCalledWith("kb-1", 2);
    expect(processKbItemMock).toHaveBeenCalledTimes(1);

    getKbItemMock.mockReturnValueOnce(item).mockReturnValueOnce({
      ...item,
      name: "launch guide updated",
      content: "Updated launch checklist",
      status: "ready",
    });

    await expect(
      router["kb:updateTextItemAndProcess"]({} as any, {
        itemId: "item-1",
        name: "launch guide updated",
        content: "Updated launch checklist",
      })
    ).resolves.toEqual({
      ok: true,
      item: expect.objectContaining({
        id: "item-1",
        name: "launch guide updated",
        content: "Updated launch checklist",
      }),
    });
    expect(updateKbItemMock).toHaveBeenCalledWith("item-1", {
      name: "launch guide updated",
      content: "Updated launch checklist",
      status: "pending",
      chunkCount: 0,
    });
  });

  it("returns basic failures when the kb or item is missing", async () => {
    getKnowledgeBaseMock.mockReturnValue(undefined);

    await expect(
      router["kb:processItem"]({} as any, { itemId: "item-1", kbId: "missing-kb" })
    ).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.any(String),
      })
    );

    getKbItemMock.mockReturnValue(undefined);
    await expect(
      router["kb:updateTextItemAndProcess"]({} as any, {
        itemId: "missing-item",
        name: "x",
        content: "y",
      })
    ).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.any(String),
      })
    );
  });
});
