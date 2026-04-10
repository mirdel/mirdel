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

async function loadUseNotes(handler: IpcHandler) {
  vi.resetModules();
  const ipcMock = installWindowIpc(handler);
  const mod = await import("../useNotes");
  const api = mod.useNotes();
  api.noteLists.value = [];
  api.notes.value = [];
  return { ...api, ipcMock };
}

describe("useNotes", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads and mutates note lists through ipc", async () => {
    const lists = [
      {
        id: "list-b",
        name: "Later",
        sortOrder: 2,
        createdAt: 2,
        updatedAt: 2,
      },
      {
        id: "list-a",
        name: "First",
        sortOrder: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const createdList = {
      id: "list-c",
      name: "Captured",
      icon: "i-lucide-inbox",
      sortOrder: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    const { loadNoteLists, createNoteList, updateNoteList, deleteNoteList, noteLists, ipcMock } = await loadUseNotes(
      async (channel, payload) => {
        switch (channel) {
          case "notes:listLists":
            return lists;
          case "notes:createList":
            return createdList;
          case "notes:updateList":
            return { ok: true };
          case "notes:deleteList":
            return { ok: true };
          default:
            return null;
        }
      }
    );

    await loadNoteLists();
    expect(noteLists.value.map((item) => item.id)).toEqual(["list-a", "list-b"]);

    await createNoteList({
      name: "Captured",
      icon: "i-lucide-inbox",
    });
    expect(noteLists.value.map((item) => item.id)).toEqual(["list-c", "list-a", "list-b"]);

    await updateNoteList("list-c", {
      name: "Captured Updated",
      color: "#22aa66",
    });
    expect(noteLists.value.find((item) => item.id === "list-c")).toMatchObject({
      name: "Captured Updated",
      color: "#22aa66",
      icon: "i-lucide-inbox",
    });

    await deleteNoteList("list-b");
    expect(noteLists.value.map((item) => item.id)).toEqual(["list-c", "list-a"]);
    expect(ipcMock).toHaveBeenCalledWith("notes:deleteList", { listId: "list-b" });
  });

  it("creates, updates, and deletes notes while keeping local order in sync", async () => {
    const initialNotes = [
      {
        id: "note-older",
        listId: null,
        title: "Older",
        contentMd: "older",
        previewText: "older",
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const createdNote = {
      id: "note-new",
      listId: "list-1",
      title: "New note",
      contentMd: "new",
      previewText: "new",
      createdAt: 2,
      updatedAt: 2,
    };
    const updatedNote = {
      ...createdNote,
      title: "New note updated",
      updatedAt: 5,
    };
    const { loadNotes, createNote, updateNote, deleteNote, notes } = await loadUseNotes(async (channel, payload) => {
      switch (channel) {
        case "notes:list":
          return initialNotes;
        case "notes:create":
          return createdNote;
        case "notes:update":
          return updatedNote;
        case "notes:delete":
          return { ok: true };
        default:
          return null;
      }
    });

    await loadNotes({ scope: "all" });
    expect(notes.value.map((item) => item.id)).toEqual(["note-older"]);

    await createNote({ listId: "list-1", title: "New note" });
    expect(notes.value.map((item) => item.id)).toEqual(["note-new", "note-older"]);

    await updateNote("note-new", { title: "New note updated" });
    expect(notes.value[0]).toMatchObject({
      id: "note-new",
      title: "New note updated",
    });

    await deleteNote("note-new");
    expect(notes.value.map((item) => item.id)).toEqual(["note-older"]);
  });

  it("surfaces basic failures when updating or deleting note lists and notes", async () => {
    const { createNoteList, updateNoteList, deleteNote } = await loadUseNotes(async (channel) => {
      switch (channel) {
        case "notes:createList":
          return {
            id: "list-1",
            name: "Ideas",
            sortOrder: 1,
            createdAt: 1,
            updatedAt: 1,
          };
        case "notes:updateList":
          return { ok: false, error: "list update failed" };
        case "notes:delete":
          return { ok: false, error: "note delete failed" };
        default:
          return null;
      }
    });

    await createNoteList({ name: "Ideas" });
    await expect(updateNoteList("list-1", { name: "Renamed" })).rejects.toThrow("list update failed");
    await expect(deleteNote("note-1")).rejects.toThrow("note delete failed");
  });
});
