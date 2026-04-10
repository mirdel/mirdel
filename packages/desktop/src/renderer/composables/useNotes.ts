import { ref, shallowRef } from "vue";
import { i18n } from "@/i18n";

export type NoteScope = "all" | "inbox" | "list";

export interface NoteList {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface Note {
  id: string;
  listId: string | null;
  title: string;
  contentMd: string;
  previewText: string;
  createdAt: number;
  updatedAt: number;
}

const noteLists = shallowRef<NoteList[]>([]);
const notes = shallowRef<Note[]>([]);
const isLoadingLists = ref(false);
const isLoadingNotes = ref(false);

function sortLists(list: NoteList[]) {
  return [...list].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt - b.createdAt;
  });
}

export function useNotes() {
  async function loadNoteLists() {
    isLoadingLists.value = true;
    try {
      noteLists.value = sortLists(await window.ipc("notes:listLists"));
      return noteLists.value;
    } finally {
      isLoadingLists.value = false;
    }
  }

  async function loadNotes(input?: { scope?: NoteScope; listId?: string }) {
    isLoadingNotes.value = true;
    try {
      notes.value = await window.ipc("notes:list", input);
      return notes.value;
    } finally {
      isLoadingNotes.value = false;
    }
  }

  async function getNote(id: string) {
    return window.ipc("notes:get", { id });
  }

  async function createNoteList(input: { name: string; icon?: string; color?: string }) {
    const list = await window.ipc("notes:createList", input);
    noteLists.value = sortLists([...noteLists.value, list]);
    return list;
  }

  async function updateNoteList(listId: string, updates: { name?: string; icon?: string; color?: string }) {
    const result = await window.ipc("notes:updateList", { listId, updates });
    if (!result.ok) {
      throw new Error(result.error || i18n.global.t("notes.error.updateListFailed"));
    }

    noteLists.value = sortLists(
      noteLists.value.map((list) =>
        list.id === listId
          ? {
              ...list,
              name: updates.name !== undefined ? updates.name : list.name,
              icon: updates.icon !== undefined ? updates.icon : list.icon,
              color: updates.color !== undefined ? updates.color : list.color,
              updatedAt: Date.now(),
            }
          : list
      )
    );
  }

  async function deleteNoteList(listId: string) {
    const result = await window.ipc("notes:deleteList", { listId });
    if (!result.ok) {
      throw new Error(result.error || i18n.global.t("notes.error.deleteListFailed"));
    }

    noteLists.value = noteLists.value.filter((list) => list.id !== listId);
    return result;
  }

  async function createNote(input?: { listId?: string | null; title?: string; contentMd?: string }) {
    const note = await window.ipc("notes:create", input || {});
    notes.value = [note, ...notes.value].sort((a, b) => b.updatedAt - a.updatedAt);
    return note;
  }

  async function updateNote(id: string, updates: Partial<Pick<Note, "title" | "contentMd" | "listId">>) {
    const note = await window.ipc("notes:update", { id, updates });
    notes.value = notes.value
      .map((item) => (item.id === id ? note : item))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return note;
  }

  async function deleteNote(id: string) {
    const result = await window.ipc("notes:delete", { id });
    if (!result.ok) {
      throw new Error(result.error || i18n.global.t("notes.error.deleteNoteFailed"));
    }

    notes.value = notes.value.filter((item) => item.id !== id);
  }

  async function attachAssetToNote(input: {
    noteId: string;
    src?: string;
    filePath?: string;
    mediaType?: string;
    name?: string;
  }) {
    return window.ipc("notes:attachAsset", input);
  }

  return {
    noteLists,
    notes,
    isLoadingLists,
    isLoadingNotes,
    loadNoteLists,
    loadNotes,
    getNote,
    createNoteList,
    updateNoteList,
    deleteNoteList,
    createNote,
    updateNote,
    deleteNote,
    attachAssetToNote,
  };
}
