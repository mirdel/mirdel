import { describe, expect, it } from "vitest";
import { getDb } from "../../db";
import { createNote, updateNote, deleteNote } from "../../notes/noteData";
import { createTranslateRecord, deleteTranslateRecord } from "../../translate/translateData";
import {
  deleteKnowledgeSearchDocsByItemId,
  getAppSearchTableNames,
  syncKnowledgeSearchDocsByItemId,
} from "../searchIndex";
import { searchKnowledgeAdapter } from "../adapters/knowledgeSearchAdapter";
import { searchNoteAdapter } from "../adapters/noteSearchAdapter";
import { searchTranslateAdapter } from "../adapters/translateSearchAdapter";
import { useTestDb } from "../../../../../test/helpers/testDb";

function insertKnowledgeFixture(input: {
  kbId?: string;
  kbName?: string;
  itemId?: string;
  itemName: string;
  itemSource?: string;
  chunkContent: string;
}) {
  const db = getDb();
  const now = Date.now();
  const kbId = input.kbId ?? "kb-1";
  const itemId = input.itemId ?? "item-1";

  db.prepare(
    `INSERT INTO kbs (id, name, description, embeddingModel, embeddingDimension, createdAt, updatedAt)
     VALUES (?, ?, NULL, NULL, ?, ?, ?)`
  ).run(kbId, input.kbName ?? "Knowledge Base", 768, now, now);

  db.prepare(
    `INSERT INTO kb_items (
      id, kbId, type, name, source, content, status,
      fileType, fileSize, fileMtime, maxDepth, error, chunkCount, lastSyncAt, createdAt, updatedAt
    ) VALUES (?, ?, 'doc', ?, ?, NULL, 'ready', NULL, NULL, NULL, NULL, NULL, 1, ?, ?, ?)`
  ).run(itemId, kbId, input.itemName, input.itemSource ?? null, now, now, now);

  const result = db.prepare(
    `INSERT INTO kb_chunks (itemId, kbId, content, chunkIndex, metadata, createdAt)
     VALUES (?, ?, ?, 0, NULL, ?)`
  ).run(itemId, kbId, input.chunkContent, now);

  return { kbId, itemId, chunkId: Number(result.lastInsertRowid) };
}

describe("searchIndex", () => {
  const testDb = useTestDb("search-index");

  it("syncs translation and note search docs through create, update, and delete", async () => {
    const record = createTranslateRecord({
      input: "Vector database",
      result: JSON.stringify({
        translation: { text: "向量数据库" },
      }),
      targetLang: "zh-CN",
    });
    const note = await createNote({
      title: "Vector Notes",
      contentMd: "# Vector search\nThis note explains vector indexing.",
    });

    expect(
      searchTranslateAdapter({
        query: "向量",
        limit: 10,
        offset: 0,
      }).items.map((item) => item.recordId)
    ).toContain(record.id);

    expect(
      searchNoteAdapter({
        query: "indexing",
        limit: 10,
        offset: 0,
      }).items.map((item) => item.noteId)
    ).toContain(note.id);

    await updateNote({
      id: note.id,
      updates: {
        contentMd: "# Search\nThis note now focuses on retrieval ranking.",
      },
    });

    expect(
      searchNoteAdapter({
        query: "retrieval",
        limit: 10,
        offset: 0,
      }).items.map((item) => item.noteId)
    ).toContain(note.id);

    deleteTranslateRecord(record.id);
    await deleteNote({ id: note.id });

    expect(
      searchTranslateAdapter({
        query: "向量",
        limit: 10,
        offset: 0,
      }).items
    ).toHaveLength(0);
    expect(
      searchNoteAdapter({
        query: "retrieval",
        limit: 10,
        offset: 0,
      }).items
    ).toHaveLength(0);
  });

  it("syncs and deletes knowledge docs, then reinitializes correctly after switching databases", () => {
    const first = insertKnowledgeFixture({
      itemName: "Vector Search Guide",
      itemSource: "docs/vector-search.md",
      chunkContent: "Vector retrieval uses chunk embeddings and reranking.",
    });
    syncKnowledgeSearchDocsByItemId(first.itemId);

    const firstSearch = searchKnowledgeAdapter({
      query: "reranking",
      limit: 10,
      offset: 0,
    });
    expect(firstSearch.items).toHaveLength(1);
    expect(firstSearch.items[0]).toMatchObject({
      itemId: first.itemId,
      kbId: first.kbId,
      itemName: "Vector Search Guide",
    });

    deleteKnowledgeSearchDocsByItemId(first.itemId);
    expect(
      searchKnowledgeAdapter({
        query: "reranking",
        limit: 10,
        offset: 0,
      }).items
    ).toHaveLength(0);

    testDb.recreate("search-index-second");

    const secondRecord = createTranslateRecord({
      input: "Sparse retrieval",
      result: JSON.stringify({
        translation: { text: "稀疏检索" },
      }),
      targetLang: "zh-CN",
    });

    const secondSearch = searchTranslateAdapter({
      query: "稀疏",
      limit: 10,
      offset: 0,
    });
    expect(secondSearch.items.map((item) => item.recordId)).toEqual([secondRecord.id]);

    const tables = getAppSearchTableNames();
    const row = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM ${tables.translateFts}`)
      .get() as { count: number };
    expect(row.count).toBe(1);
  });
});
