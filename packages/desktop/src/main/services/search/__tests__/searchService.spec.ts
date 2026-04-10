import { describe, expect, it } from "vitest";
import { getDb } from "../../db";
import { createAssistantMessage, createUserMessage } from "../../chat/messageData";
import { createSession, updateSessionStateAndBrief } from "../../chat/sessionData";
import { searchAll } from "../searchService";
import { createNote } from "../../notes/noteData";
import { createTranslateRecord } from "../../translate/translateData";
import { syncKnowledgeSearchDocsByItemId } from "../searchIndex";
import { useTestDb } from "../../../../../test/helpers/testDb";

function insertKnowledgeFixture() {
  const db = getDb();
  const now = Date.now();
  const kbId = "kb-global";
  const itemId = "item-global";

  db.prepare(
    `INSERT INTO kbs (id, name, description, embeddingModel, embeddingDimension, createdAt, updatedAt)
     VALUES (?, ?, NULL, NULL, ?, ?, ?)`
  ).run(kbId, "Global Search KB", 768, now, now);

  db.prepare(
    `INSERT INTO kb_items (
      id, kbId, type, name, source, content, status,
      fileType, fileSize, fileMtime, maxDepth, error, chunkCount, lastSyncAt, createdAt, updatedAt
    ) VALUES (?, ?, 'doc', ?, ?, NULL, 'ready', NULL, NULL, NULL, NULL, NULL, 1, ?, ?, ?)`
  ).run(itemId, kbId, "Vector Search Architecture", "kb/vector.md", now, now, now);

  db.prepare(
    `INSERT INTO kb_chunks (itemId, kbId, content, chunkIndex, metadata, createdAt)
     VALUES (?, ?, ?, 0, NULL, ?)`
  ).run(itemId, kbId, "Vector search architecture relies on embeddings and reranking.", now);

  syncKnowledgeSearchDocsByItemId(itemId);
}

describe("searchService", () => {
  useTestDb("search-service");

  it("returns empty buckets for blank queries", () => {
    expect(
      searchAll({
        query: "   ",
      })
    ).toEqual({
      query: "",
      scope: "all",
      buckets: {
        messages: { total: 0, items: [] },
        sessions: { total: 0, items: [] },
        translations: { total: 0, items: [] },
        notes: { total: 0, items: [] },
        knowledge: { total: 0, items: [] },
      },
    });
  });

  it("aggregates results across chat, translations, notes, and knowledge", async () => {
    const session = createSession("__default__", "default-scenario", "Vector Planning");
    createUserMessage({
      sessionId: session.id,
      parts: [{ type: "text", text: "Let's discuss vector search architecture." }],
    });
    createAssistantMessage({
      sessionId: session.id,
      parts: [{ type: "text", text: "Vector search can use embeddings and reranking." }],
      status: "success",
    });
    updateSessionStateAndBrief(session.id, null, "- Vector search roadmap", null);

    const translation = createTranslateRecord({
      input: "vector search",
      result: JSON.stringify({
        translation: { text: "向量搜索" },
      }),
      targetLang: "zh-CN",
    });

    const note = await createNote({
      title: "Vector Search Notes",
      contentMd: "# Vector search\nEmbeddings, reranking, and recall tuning.",
    });

    insertKnowledgeFixture();

    const result = searchAll({
      query: "vector",
      scope: "all",
      limit: 10,
      offset: 0,
    });

    expect(result.buckets.messages.total).toBeGreaterThan(0);
    expect(result.buckets.sessions.total).toBeGreaterThan(0);
    expect(result.buckets.translations.items.map((item) => item.recordId)).toContain(translation.id);
    expect(result.buckets.notes.items.map((item) => item.noteId)).toContain(note.id);
    expect(result.buckets.knowledge.items.map((item) => item.itemId)).toContain("item-global");
  });

  it("honors scope-specific routing and normalizes limit/offset", async () => {
    await createNote({
      title: "Search Scope Note",
      contentMd: "This note is about retrieval scope.",
    });
    createTranslateRecord({
      input: "scope",
      result: JSON.stringify({
        translation: { text: "范围" },
      }),
      targetLang: "zh-CN",
    });

    const result = searchAll({
      query: "scope",
      scope: "notes",
      limit: 999,
      offset: -5,
    });

    expect(result.scope).toBe("notes");
    expect(result.buckets.notes.total).toBeGreaterThan(0);
    expect(result.buckets.translations).toEqual({ total: 0, items: [] });
    expect(result.buckets.messages).toEqual({ total: 0, items: [] });
    expect(result.buckets.sessions).toEqual({ total: 0, items: [] });
    expect(result.buckets.knowledge).toEqual({ total: 0, items: [] });
  });
});
