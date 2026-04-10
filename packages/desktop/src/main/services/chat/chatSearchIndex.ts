import { markdownToSearchText } from "@mirdel/markdown-to-plain";
import type { MessageContentPart } from "@shared";
import { loggerServiceMain } from "@shared";
import { assertSimpleSearchExtensionLoaded, getCurrentDbPath, getDb, SIMPLE_SEARCH_TOKENIZER } from "../db";

const logger = loggerServiceMain.withContext("chatSearchIndex");

const SEARCH_META_TABLE = "search_meta";
const SEARCH_MESSAGE_FTS_TABLE = "search_message_fts";
const SEARCH_SESSION_FTS_TABLE = "search_session_fts";
const SEARCH_INDEX_VERSION_KEY = "chat_index_version";
const SEARCH_INDEX_VERSION = "3";

let initialized = false;
let initializedDbPath: string | null = null;

type SearchMetaRow = {
  value: string;
};

type SearchableMessageRow = {
  id: string;
  sessionId: string;
  role: string;
  parts: string;
  status: string;
  isDeleted: number;
  isTemporary: number | null;
};

type SearchableSessionRow = {
  id: string;
  rootSessionId: string | null;
  title: string;
  stateText: string | null;
  briefText: string | null;
  isTemporary: number | null;
};

function parseParts(json: string): MessageContentPart[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as MessageContentPart[]) : [];
  } catch {
    return [];
  }
}

function normalizeWhitespace(text: string) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function extractTextParts(parts: MessageContentPart[]) {
  return (parts || [])
    .filter((part): part is { type: "text"; text: string } => {
      return part?.type === "text" && typeof (part as { text?: unknown }).text === "string";
    })
    .map((part) => markdownToSearchText(part.text));
}

export function extractSearchableTextFromParts(parts: MessageContentPart[]) {
  return normalizeWhitespace(extractTextParts(parts).join("\n"));
}

function buildSessionSummary(row: Pick<SearchableSessionRow, "stateText" | "briefText">) {
  return normalizeWhitespace([row.briefText, row.stateText].filter(Boolean).join("\n"));
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
    CREATE VIRTUAL TABLE IF NOT EXISTS ${SEARCH_MESSAGE_FTS_TABLE} USING fts5(
      messageId UNINDEXED,
      sessionId UNINDEXED,
      role UNINDEXED,
      text,
      tokenize = '${SIMPLE_SEARCH_TOKENIZER}'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS ${SEARCH_SESSION_FTS_TABLE} USING fts5(
      sessionId UNINDEXED,
      rootSessionId UNINDEXED,
      title,
      summary,
      tokenize = '${SIMPLE_SEARCH_TOKENIZER}'
    );
  `);
}

function dropSearchTables() {
  const db = getDb();
  db.exec(`
    DROP TABLE IF EXISTS ${SEARCH_MESSAGE_FTS_TABLE};
    DROP TABLE IF EXISTS ${SEARCH_SESSION_FTS_TABLE};
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

function upsertMessageSearchDocInternal(row: SearchableMessageRow) {
  const db = getDb();
  const parts = parseParts(row.parts);
  const text = extractSearchableTextFromParts(parts);

  db.prepare(`DELETE FROM ${SEARCH_MESSAGE_FTS_TABLE} WHERE messageId = ?`).run(row.id);

  if (!text || row.isDeleted === 1 || row.isTemporary === 1) {
    return;
  }

  if (row.status !== "success" && row.status !== "aborted") {
    return;
  }

  db.prepare(
    `INSERT INTO ${SEARCH_MESSAGE_FTS_TABLE} (messageId, sessionId, role, text)
     VALUES (?, ?, ?, ?)`
  ).run(row.id, row.sessionId, row.role, text);
}

function upsertSessionSearchDocInternal(row: SearchableSessionRow) {
  const db = getDb();
  const title = normalizeWhitespace(row.title);
  const summary = buildSessionSummary(row);

  db.prepare(`DELETE FROM ${SEARCH_SESSION_FTS_TABLE} WHERE sessionId = ?`).run(row.id);

  if (!title || row.isTemporary === 1) {
    return;
  }

  db.prepare(
    `INSERT INTO ${SEARCH_SESSION_FTS_TABLE} (sessionId, rootSessionId, title, summary)
     VALUES (?, ?, ?, ?)`
  ).run(row.id, row.rootSessionId, title, summary);
}

function rebuildChatSearchIndexInternal() {
  const db = getDb();

  db.prepare(`DELETE FROM ${SEARCH_MESSAGE_FTS_TABLE}`).run();
  db.prepare(`DELETE FROM ${SEARCH_SESSION_FTS_TABLE}`).run();

  const sessionRows = db.prepare(
    `SELECT id, rootSessionId, title, stateText, briefText, isTemporary
     FROM sessions`
  ).all() as SearchableSessionRow[];

  for (const row of sessionRows) {
    upsertSessionSearchDocInternal(row);
  }

  const messageRows = db.prepare(
    `SELECT m.id, m.sessionId, m.role, m.parts, m.status, m.isDeleted, s.isTemporary
     FROM messages m
     LEFT JOIN sessions s ON s.id = m.sessionId`
  ).all() as SearchableMessageRow[];

  for (const row of messageRows) {
    upsertMessageSearchDocInternal(row);
  }
}

export function ensureChatSearchReady() {
  const currentDbPath = getCurrentDbPath();
  if (initialized && initializedDbPath === currentDbPath) return;

  createSearchMetaTable();
  const currentVersion = getMeta(SEARCH_INDEX_VERSION_KEY);
  const shouldRecreateTables = currentVersion !== SEARCH_INDEX_VERSION;

  if (shouldRecreateTables) {
    dropSearchTables();
    createSearchTables();
    rebuildChatSearchIndexInternal();
    upsertMeta(SEARCH_INDEX_VERSION_KEY, SEARCH_INDEX_VERSION);
    logger.info("chat search index rebuilt", { version: SEARCH_INDEX_VERSION, tokenizer: SIMPLE_SEARCH_TOKENIZER });
  } else {
    createSearchTables();
  }

  initialized = true;
  initializedDbPath = currentDbPath;
}

function runSearchMaintenance(task: () => void, action: string, payload: Record<string, unknown>) {
  try {
    ensureChatSearchReady();
    task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`chat search ${action} failed`, { message, ...payload });
  }
}

export function syncMessageSearchDoc(messageId: string) {
  runSearchMaintenance(() => {
    const db = getDb();
    const row = db.prepare(
      `SELECT m.id, m.sessionId, m.role, m.parts, m.status, m.isDeleted, s.isTemporary
       FROM messages m
       LEFT JOIN sessions s ON s.id = m.sessionId
       WHERE m.id = ?`
    ).get(messageId) as SearchableMessageRow | undefined;

    if (!row) {
      db.prepare(`DELETE FROM ${SEARCH_MESSAGE_FTS_TABLE} WHERE messageId = ?`).run(messageId);
      return;
    }

    upsertMessageSearchDocInternal(row);
  }, "sync message", { messageId });
}

export function deleteMessageSearchDoc(messageId: string) {
  runSearchMaintenance(() => {
    const db = getDb();
    db.prepare(`DELETE FROM ${SEARCH_MESSAGE_FTS_TABLE} WHERE messageId = ?`).run(messageId);
  }, "delete message", { messageId });
}

export function deleteMessageSearchDocsByTurnId(turnId: string) {
  runSearchMaintenance(() => {
    const db = getDb();
    db.prepare(
      `DELETE FROM ${SEARCH_MESSAGE_FTS_TABLE}
       WHERE messageId IN (
         SELECT id FROM messages WHERE turnId = ?
       )`
    ).run(turnId);
  }, "delete messages by turn", { turnId });
}

export function deleteMessageSearchDocsBySessionId(sessionId: string) {
  runSearchMaintenance(() => {
    const db = getDb();
    db.prepare(`DELETE FROM ${SEARCH_MESSAGE_FTS_TABLE} WHERE sessionId = ?`).run(sessionId);
  }, "delete messages by session", { sessionId });
}

export function syncMessageSearchDocsBySessionId(sessionId: string) {
  runSearchMaintenance(() => {
    const db = getDb();
    const rows = db.prepare(
      `SELECT m.id, m.sessionId, m.role, m.parts, m.status, m.isDeleted, s.isTemporary
       FROM messages m
       LEFT JOIN sessions s ON s.id = m.sessionId
       WHERE m.sessionId = ?`
    ).all(sessionId) as SearchableMessageRow[];

    db.prepare(`DELETE FROM ${SEARCH_MESSAGE_FTS_TABLE} WHERE sessionId = ?`).run(sessionId);
    for (const row of rows) {
      upsertMessageSearchDocInternal(row);
    }
  }, "sync messages by session", { sessionId });
}

export function syncSessionSearchDoc(sessionId: string) {
  runSearchMaintenance(() => {
    const db = getDb();
    const row = db.prepare(
      `SELECT id, rootSessionId, title, stateText, briefText, isTemporary
       FROM sessions
       WHERE id = ?`
    ).get(sessionId) as SearchableSessionRow | undefined;

    if (!row) {
      db.prepare(`DELETE FROM ${SEARCH_SESSION_FTS_TABLE} WHERE sessionId = ?`).run(sessionId);
      return;
    }

    upsertSessionSearchDocInternal(row);
  }, "sync session", { sessionId });
}

export function deleteSessionSearchDoc(sessionId: string) {
  runSearchMaintenance(() => {
    const db = getDb();
    db.prepare(`DELETE FROM ${SEARCH_SESSION_FTS_TABLE} WHERE sessionId = ?`).run(sessionId);
    db.prepare(`DELETE FROM ${SEARCH_MESSAGE_FTS_TABLE} WHERE sessionId = ?`).run(sessionId);
  }, "delete session", { sessionId });
}

export function deleteSessionSearchDocs(sessionIds: string[]) {
  if (!sessionIds.length) return;

  runSearchMaintenance(() => {
    const db = getDb();
    const placeholders = sessionIds.map(() => "?").join(", ");
    db.prepare(`DELETE FROM ${SEARCH_SESSION_FTS_TABLE} WHERE sessionId IN (${placeholders})`).run(...sessionIds);
    db.prepare(`DELETE FROM ${SEARCH_MESSAGE_FTS_TABLE} WHERE sessionId IN (${placeholders})`).run(...sessionIds);
  }, "delete sessions", { count: sessionIds.length });
}

export function rebuildChatSearchIndex() {
  createSearchMetaTable();
  dropSearchTables();
  createSearchTables();
  rebuildChatSearchIndexInternal();
  upsertMeta(SEARCH_INDEX_VERSION_KEY, SEARCH_INDEX_VERSION);
  initialized = true;
  logger.info("chat search index rebuild requested", { version: SEARCH_INDEX_VERSION, tokenizer: SIMPLE_SEARCH_TOKENIZER });
}

export function getChatSearchTableNames() {
  return {
    meta: SEARCH_META_TABLE,
    messageFts: SEARCH_MESSAGE_FTS_TABLE,
    sessionFts: SEARCH_SESSION_FTS_TABLE,
  };
}
