import { markdownToSearchText } from "@mirdel/markdown-to-plain";
import { loggerServiceMain } from "@shared";
import { assertSimpleSearchExtensionLoaded, getCurrentDbPath, getDb, SIMPLE_SEARCH_TOKENIZER } from "../db";

const logger = loggerServiceMain.withContext("searchIndex");

const SEARCH_META_TABLE = "search_meta";
const SEARCH_TRANSLATE_FTS_TABLE = "search_translate_fts";
const SEARCH_NOTE_FTS_TABLE = "search_note_fts";
const SEARCH_KB_CHUNK_FTS_TABLE = "search_kb_chunk_fts";
const SEARCH_INDEX_VERSION_KEY = "global_index_version";
const SEARCH_INDEX_VERSION = "3";

let initialized = false;
let initializedDbPath: string | null = null;

type SearchMetaRow = {
  value: string;
};

type SearchableTranslateRow = {
  id: string;
  input: string;
  result: string;
  targetLang: string;
};

type SearchableNoteRow = {
  id: string;
  listId: string | null;
  title: string;
  contentMd: string;
  previewText: string;
};

type SearchableKbChunkRow = {
  chunkId: number;
  itemId: string;
  kbId: string;
  itemType: string;
  itemName: string;
  itemSource: string | null;
  content: string;
};

function normalizeWhitespace(text: string) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function extractTranslatedText(resultJson: string) {
  try {
    const parsed = JSON.parse(resultJson) as {
      translation?: {
        text?: string;
      };
    };
    return normalizeWhitespace(parsed?.translation?.text || "");
  } catch {
    return "";
  }
}

function buildNoteSearchBody(row: Pick<SearchableNoteRow, "contentMd" | "previewText">) {
  const content = normalizeWhitespace(markdownToSearchText(row.contentMd || ""));
  if (content) return content;
  return normalizeWhitespace(row.previewText || "");
}

function createSearchMetaTable() {
  const db = getDb();
  db.prepare(
    `CREATE TABLE IF NOT EXISTS ${SEARCH_META_TABLE} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`
  ).run();
}

function createSearchTables() {
  const db = getDb();
  assertSimpleSearchExtensionLoaded();

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS ${SEARCH_TRANSLATE_FTS_TABLE} USING fts5(
      recordId UNINDEXED,
      targetLang UNINDEXED,
      input,
      translatedText,
      tokenize = '${SIMPLE_SEARCH_TOKENIZER}'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS ${SEARCH_NOTE_FTS_TABLE} USING fts5(
      noteId UNINDEXED,
      listId UNINDEXED,
      title,
      content,
      tokenize = '${SIMPLE_SEARCH_TOKENIZER}'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS ${SEARCH_KB_CHUNK_FTS_TABLE} USING fts5(
      chunkId UNINDEXED,
      itemId UNINDEXED,
      kbId UNINDEXED,
      itemType UNINDEXED,
      itemName,
      itemSource,
      content,
      tokenize = '${SIMPLE_SEARCH_TOKENIZER}'
    );
  `);
}

function dropSearchTables() {
  const db = getDb();
  db.exec(`
    DROP TABLE IF EXISTS ${SEARCH_TRANSLATE_FTS_TABLE};
    DROP TABLE IF EXISTS ${SEARCH_NOTE_FTS_TABLE};
    DROP TABLE IF EXISTS ${SEARCH_KB_CHUNK_FTS_TABLE};
  `);
}

function upsertMeta(key: string, value: string) {
  const db = getDb();
  db.prepare(
    `INSERT INTO ${SEARCH_META_TABLE} (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function getMeta(key: string) {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM ${SEARCH_META_TABLE} WHERE key = ?`).get(key) as SearchMetaRow | undefined;
  return row?.value ?? null;
}

function upsertTranslateSearchDocInternal(row: SearchableTranslateRow) {
  const db = getDb();
  const input = normalizeWhitespace(row.input);
  const translatedText = extractTranslatedText(row.result);

  db.prepare(`DELETE FROM ${SEARCH_TRANSLATE_FTS_TABLE} WHERE recordId = ?`).run(row.id);

  if (!input && !translatedText) {
    return;
  }

  db.prepare(
    `INSERT INTO ${SEARCH_TRANSLATE_FTS_TABLE} (recordId, targetLang, input, translatedText)
     VALUES (?, ?, ?, ?)`
  ).run(row.id, row.targetLang, input, translatedText);
}

function upsertNoteSearchDocInternal(row: SearchableNoteRow) {
  const db = getDb();
  const title = normalizeWhitespace(row.title);
  const content = buildNoteSearchBody(row);

  db.prepare(`DELETE FROM ${SEARCH_NOTE_FTS_TABLE} WHERE noteId = ?`).run(row.id);

  if (!title && !content) {
    return;
  }

  db.prepare(
    `INSERT INTO ${SEARCH_NOTE_FTS_TABLE} (noteId, listId, title, content)
     VALUES (?, ?, ?, ?)`
  ).run(row.id, row.listId, title, content);
}

function upsertKnowledgeChunkSearchDocInternal(row: SearchableKbChunkRow) {
  const db = getDb();
  const itemName = normalizeWhitespace(row.itemName);
  const itemSource = normalizeWhitespace(row.itemSource || "");
  const content = normalizeWhitespace(row.content);

  db.prepare(`DELETE FROM ${SEARCH_KB_CHUNK_FTS_TABLE} WHERE chunkId = ?`).run(row.chunkId);

  if (!itemName && !itemSource && !content) {
    return;
  }

  db.prepare(
    `INSERT INTO ${SEARCH_KB_CHUNK_FTS_TABLE} (chunkId, itemId, kbId, itemType, itemName, itemSource, content)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(row.chunkId, row.itemId, row.kbId, row.itemType, itemName, itemSource, content);
}

function rebuildSearchIndexInternal() {
  const db = getDb();

  db.prepare(`DELETE FROM ${SEARCH_TRANSLATE_FTS_TABLE}`).run();
  db.prepare(`DELETE FROM ${SEARCH_NOTE_FTS_TABLE}`).run();

  const translateRows = db.prepare(
    `SELECT id, input, result, targetLang
     FROM translate_history`
  ).all() as SearchableTranslateRow[];

  for (const row of translateRows) {
    upsertTranslateSearchDocInternal(row);
  }

  const noteRows = db.prepare(
    `SELECT id, listId, title, contentMd, previewText
     FROM notes`
  ).all() as SearchableNoteRow[];

  for (const row of noteRows) {
    upsertNoteSearchDocInternal(row);
  }

  const kbChunkRows = db.prepare(
    `SELECT
      c.id AS chunkId,
      c.itemId AS itemId,
      c.kbId AS kbId,
      i.type AS itemType,
      i.name AS itemName,
      i.source AS itemSource,
      c.content AS content
     FROM kb_chunks c
     JOIN kb_items i ON i.id = c.itemId`
  ).all() as SearchableKbChunkRow[];

  for (const row of kbChunkRows) {
    upsertKnowledgeChunkSearchDocInternal(row);
  }
}

export function ensureAppSearchReady() {
  const currentDbPath = getCurrentDbPath();
  if (initialized && initializedDbPath === currentDbPath) return;

  createSearchMetaTable();
  const currentVersion = getMeta(SEARCH_INDEX_VERSION_KEY);
  const shouldRecreateTables = currentVersion !== SEARCH_INDEX_VERSION;

  if (shouldRecreateTables) {
    dropSearchTables();
    createSearchTables();
    rebuildSearchIndexInternal();
    upsertMeta(SEARCH_INDEX_VERSION_KEY, SEARCH_INDEX_VERSION);
    logger.info("global search index rebuilt", { version: SEARCH_INDEX_VERSION, tokenizer: SIMPLE_SEARCH_TOKENIZER });
  } else {
    createSearchTables();
  }

  initialized = true;
  initializedDbPath = currentDbPath;
}

function runSearchMaintenance(task: () => void, action: string, payload: Record<string, unknown>) {
  try {
    ensureAppSearchReady();
    task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`global search ${action} failed`, { message, ...payload });
  }
}

export function syncTranslateSearchDoc(recordId: string) {
  runSearchMaintenance(() => {
    const db = getDb();
    const row = db.prepare(
      `SELECT id, input, result, targetLang
       FROM translate_history
       WHERE id = ?`
    ).get(recordId) as SearchableTranslateRow | undefined;

    if (!row) {
      db.prepare(`DELETE FROM ${SEARCH_TRANSLATE_FTS_TABLE} WHERE recordId = ?`).run(recordId);
      return;
    }

    upsertTranslateSearchDocInternal(row);
  }, "sync translate record", { recordId });
}

export function deleteTranslateSearchDoc(recordId: string) {
  runSearchMaintenance(() => {
    const db = getDb();
    db.prepare(`DELETE FROM ${SEARCH_TRANSLATE_FTS_TABLE} WHERE recordId = ?`).run(recordId);
  }, "delete translate record", { recordId });
}

export function clearTranslateSearchDocs() {
  runSearchMaintenance(() => {
    const db = getDb();
    db.prepare(`DELETE FROM ${SEARCH_TRANSLATE_FTS_TABLE}`).run();
  }, "clear translate records", {});
}

export function syncNoteSearchDoc(noteId: string) {
  runSearchMaintenance(() => {
    const db = getDb();
    const row = db.prepare(
      `SELECT id, listId, title, contentMd, previewText
       FROM notes
       WHERE id = ?`
    ).get(noteId) as SearchableNoteRow | undefined;

    if (!row) {
      db.prepare(`DELETE FROM ${SEARCH_NOTE_FTS_TABLE} WHERE noteId = ?`).run(noteId);
      return;
    }

    upsertNoteSearchDocInternal(row);
  }, "sync note", { noteId });
}

export function deleteNoteSearchDoc(noteId: string) {
  runSearchMaintenance(() => {
    const db = getDb();
    db.prepare(`DELETE FROM ${SEARCH_NOTE_FTS_TABLE} WHERE noteId = ?`).run(noteId);
  }, "delete note", { noteId });
}

export function syncKnowledgeSearchDocsByItemId(itemId: string) {
  runSearchMaintenance(() => {
    const db = getDb();
    db.prepare(`DELETE FROM ${SEARCH_KB_CHUNK_FTS_TABLE} WHERE itemId = ?`).run(itemId);

    const rows = db.prepare(
      `SELECT
        c.id AS chunkId,
        c.itemId AS itemId,
        c.kbId AS kbId,
        i.type AS itemType,
        i.name AS itemName,
        i.source AS itemSource,
        c.content AS content
       FROM kb_chunks c
       JOIN kb_items i ON i.id = c.itemId
       WHERE c.itemId = ?`
    ).all(itemId) as SearchableKbChunkRow[];

    for (const row of rows) {
      upsertKnowledgeChunkSearchDocInternal(row);
    }
  }, "sync kb item", { itemId });
}

export function deleteKnowledgeSearchDocsByItemId(itemId: string) {
  runSearchMaintenance(() => {
    const db = getDb();
    db.prepare(`DELETE FROM ${SEARCH_KB_CHUNK_FTS_TABLE} WHERE itemId = ?`).run(itemId);
  }, "delete kb item", { itemId });
}

export function deleteKnowledgeSearchDocsByKbId(kbId: string) {
  runSearchMaintenance(() => {
    const db = getDb();
    db.prepare(`DELETE FROM ${SEARCH_KB_CHUNK_FTS_TABLE} WHERE kbId = ?`).run(kbId);
  }, "delete kb", { kbId });
}

export function rebuildAppSearchIndex() {
  createSearchMetaTable();
  dropSearchTables();
  createSearchTables();
  rebuildSearchIndexInternal();
  upsertMeta(SEARCH_INDEX_VERSION_KEY, SEARCH_INDEX_VERSION);
  initialized = true;
  initializedDbPath = getCurrentDbPath();
  logger.info("global search index rebuild requested", { version: SEARCH_INDEX_VERSION, tokenizer: SIMPLE_SEARCH_TOKENIZER });
}

export function getAppSearchTableNames() {
  return {
    meta: SEARCH_META_TABLE,
    translateFts: SEARCH_TRANSLATE_FTS_TABLE,
    noteFts: SEARCH_NOTE_FTS_TABLE,
    kbChunkFts: SEARCH_KB_CHUNK_FTS_TABLE,
  };
}
