import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  attachAssetToNoteMock,
  createNoteListMock,
  createNoteMock,
  deleteNoteListMock,
  deleteNoteMock,
  getNoteMock,
  listNoteListsMock,
  listNotesMock,
  updateNoteListMock,
  updateNoteMock,
} = vi.hoisted(() => ({
  attachAssetToNoteMock: vi.fn(),
  createNoteListMock: vi.fn(),
  createNoteMock: vi.fn(),
  deleteNoteListMock: vi.fn(),
  deleteNoteMock: vi.fn(),
  getNoteMock: vi.fn(),
  listNoteListsMock: vi.fn(),
  listNotesMock: vi.fn(),
  updateNoteListMock: vi.fn(),
  updateNoteMock: vi.fn(),
}));

vi.mock("typed-electron-ipc", () => ({
  ipcRouter: (handlers: Record<string, unknown>) => handlers,
}));

vi.mock("../../services/notes/noteData", async () => {
  const actual = await vi.importActual<typeof import("../../services/notes/noteData")>("../../services/notes/noteData");
  return {
    ...actual,
    listNoteLists: listNoteListsMock,
    createNoteList: createNoteListMock,
    updateNoteList: updateNoteListMock,
    deleteNoteList: deleteNoteListMock,
    listNotes: listNotesMock,
    getNote: getNoteMock,
    createNote: createNoteMock,
    updateNote: updateNoteMock,
    deleteNote: deleteNoteMock,
    attachAssetToNote: attachAssetToNoteMock,
  };
});

const { router } = await import("../router");

describe("router note handlers", () => {
  const list = {
    id: "list-1",
    name: "Ideas",
    icon: "i-lucide-lightbulb",
    color: "#ffaa00",
    sortOrder: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  const note = {
    id: "note-1",
    listId: "list-1",
    title: "Weekly plan",
    contentMd: "# Weekly plan\nShip the feature",
    previewText: "Weekly plan Ship the feature",
    createdAt: 1,
    updatedAt: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    listNoteListsMock.mockReturnValue([list]);
    createNoteListMock.mockReturnValue(list);
    updateNoteListMock.mockReturnValue({ ok: true });
    deleteNoteListMock.mockReturnValue({ ok: true });
    listNotesMock.mockReturnValue([note]);
    getNoteMock.mockReturnValue(note);
    createNoteMock.mockResolvedValue(note);
    updateNoteMock.mockResolvedValue({
      ...note,
      title: "Updated plan",
      updatedAt: 3,
    });
    deleteNoteMock.mockResolvedValue({ ok: true });
    attachAssetToNoteMock.mockResolvedValue({
      assetId: "asset-1",
      url: "asset://asset-1",
      mediaType: "image/png",
      name: "diagram.png",
    });
  });

  it("forwards note list and note CRUD handlers", async () => {
    await expect(router["notes:listLists"]({} as any)).resolves.toEqual([list]);

    await expect(
      router["notes:createList"]({} as any, {
        name: "Ideas",
        icon: "i-lucide-lightbulb",
        color: "#ffaa00",
      })
    ).resolves.toEqual(list);
    expect(createNoteListMock).toHaveBeenCalledWith({
      name: "Ideas",
      icon: "i-lucide-lightbulb",
      color: "#ffaa00",
    });

    await expect(
      router["notes:updateList"]({} as any, {
        listId: "list-1",
        updates: { name: "Ideas Updated" },
      })
    ).resolves.toEqual({ ok: true });
    expect(updateNoteListMock).toHaveBeenCalledWith({
      listId: "list-1",
      updates: { name: "Ideas Updated" },
    });

    await expect(
      router["notes:deleteList"]({} as any, {
        listId: "list-1",
      })
    ).resolves.toEqual({ ok: true });
    expect(deleteNoteListMock).toHaveBeenCalledWith({ listId: "list-1" });

    await expect(
      router["notes:list"]({} as any, {
        scope: "list",
        listId: "list-1",
      })
    ).resolves.toEqual([note]);
    expect(listNotesMock).toHaveBeenCalledWith({
      scope: "list",
      listId: "list-1",
    });

    await expect(
      router["notes:get"]({} as any, {
        id: "note-1",
      })
    ).resolves.toEqual(note);
    expect(getNoteMock).toHaveBeenCalledWith("note-1");

    await expect(
      router["notes:create"]({} as any, {
        listId: "list-1",
        contentMd: "# Weekly plan\nShip the feature",
      })
    ).resolves.toEqual(note);
    expect(createNoteMock).toHaveBeenCalledWith({
      listId: "list-1",
      contentMd: "# Weekly plan\nShip the feature",
    });

    await expect(
      router["notes:update"]({} as any, {
        id: "note-1",
        updates: { title: "Updated plan" },
      })
    ).resolves.toMatchObject({
      id: "note-1",
      title: "Updated plan",
    });
    expect(updateNoteMock).toHaveBeenCalledWith({
      id: "note-1",
      updates: { title: "Updated plan" },
    });

    await expect(
      router["notes:delete"]({} as any, {
        id: "note-1",
      })
    ).resolves.toEqual({ ok: true });
    expect(deleteNoteMock).toHaveBeenCalledWith({ id: "note-1" });
  });

  it("forwards note asset attachment and basic failure results", async () => {
    updateNoteListMock.mockReturnValue({
      ok: false,
      error: "list missing",
    });
    deleteNoteMock.mockResolvedValue({
      ok: false,
      error: "note missing",
    });

    await expect(
      router["notes:attachAsset"]({} as any, {
        noteId: "note-1",
        filePath: "/tmp/diagram.png",
        mediaType: "image/png",
      })
    ).resolves.toEqual({
      assetId: "asset-1",
      url: "asset://asset-1",
      mediaType: "image/png",
      name: "diagram.png",
    });
    expect(attachAssetToNoteMock).toHaveBeenCalledWith({
      noteId: "note-1",
      filePath: "/tmp/diagram.png",
      mediaType: "image/png",
    });

    await expect(
      router["notes:updateList"]({} as any, {
        listId: "missing",
        updates: { name: "Missing" },
      })
    ).resolves.toEqual({
      ok: false,
      error: "list missing",
    });

    await expect(
      router["notes:delete"]({} as any, {
        id: "missing",
      })
    ).resolves.toEqual({
      ok: false,
      error: "note missing",
    });
  });
});
