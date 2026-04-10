import { describe, expect, it } from "vitest";
import { searchAll } from "../../search/searchService";
import {
  createNote,
  createNoteList,
  deleteNote,
  deleteNoteList,
  getNote,
  listNoteLists,
  listNotes,
  updateNote,
  updateNoteList,
} from "../noteData";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("noteData", () => {
  useTestDb("note-data");

  it("creates, lists, updates, and deletes note lists while moving deleted-list notes back to inbox", async () => {
    const ideas = createNoteList({
      name: "Ideas",
      icon: "i-lucide-lightbulb",
      color: "#ffaa00",
    });
    const drafts = createNoteList({
      name: "Drafts",
      icon: "i-lucide-file-text",
    });

    const scopedNote = await createNote({
      listId: ideas.id,
      contentMd: "# Launch plan\nWrite the release notes",
    });
    await createNote({
      listId: drafts.id,
      title: "Draft",
      contentMd: "Polish the landing page copy",
    });

    expect(listNoteLists().map((item) => item.name)).toEqual(["Ideas", "Drafts"]);
    expect(listNotes({ scope: "list", listId: ideas.id }).map((item) => item.id)).toEqual([scopedNote.id]);
    expect(listNotes({ scope: "inbox" })).toEqual([]);

    expect(
      updateNoteList({
        listId: ideas.id,
        updates: {
          name: "Product Ideas",
          color: "#22aa66",
        },
      })
    ).toEqual({ ok: true });

    const updatedIdeas = listNoteLists().find((item) => item.id === ideas.id);
    expect(updatedIdeas).toMatchObject({
      name: "Product Ideas",
      color: "#22aa66",
      icon: "i-lucide-lightbulb",
    });

    expect(deleteNoteList({ listId: ideas.id })).toEqual({ ok: true });
    expect(listNoteLists().map((item) => item.id)).toEqual([drafts.id]);
    expect(getNote(scopedNote.id)).toMatchObject({
      id: scopedNote.id,
      listId: null,
    });
    expect(listNotes({ scope: "inbox" }).map((item) => item.id)).toContain(scopedNote.id);
    expect(deleteNoteList({ listId: ideas.id })).toEqual({
      ok: false,
      error: expect.any(String),
    });
  });

  it("creates, updates, and deletes notes while keeping note search results in sync", async () => {
    const list = createNoteList({ name: "Inbox+" });
    const note = await createNote({
      listId: list.id,
      contentMd: "# Weekly plan\nShip the feature today",
    });

    expect(note.title).toBe("Weekly plan");
    expect(note.previewText).toContain("Ship the feature today");
    expect(searchAll({ query: "feature today", scope: "notes" }).buckets.notes.total).toBe(1);

    const updated = await updateNote({
      id: note.id,
      updates: {
        title: "",
        contentMd: "# Updated brief\nShip the feature tomorrow",
        listId: null,
      },
    });

    expect(updated).toMatchObject({
      id: note.id,
      title: "Updated brief",
      listId: null,
    });
    expect(searchAll({ query: "feature today", scope: "notes" }).buckets.notes.total).toBe(0);
    expect(searchAll({ query: "feature tomorrow", scope: "notes" }).buckets.notes.total).toBe(1);

    expect(await deleteNote({ id: note.id })).toEqual({ ok: true });
    expect(getNote(note.id)).toBeUndefined();
    expect(searchAll({ query: "feature tomorrow", scope: "notes" }).buckets.notes.total).toBe(0);
    expect(await deleteNote({ id: note.id })).toEqual({
      ok: false,
      error: expect.any(String),
    });
  });
});
