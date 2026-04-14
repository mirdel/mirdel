import crypto from "node:crypto";
import type { MessageContentPart } from "@shared";
import {
  assertSimpleSearchExtensionLoaded,
  createHistoricalMemoryVectorTable,
  dropHistoricalMemoryVectorTable,
  getDb,
  getHistoricalMemoryVectorTableName,
  historicalMemoryVectorTableExists,
  SIMPLE_SEARCH_TOKENIZER,
} from "../db";

const HISTORICAL_MEMORY_FTS_TABLE = "historical_memory_fts";

export interface HistoricalMemoryChunk {
  id: number;
  sessionId: string;
  turnId: string;
  userMessageId: string | null;
  assistantMessageId: string | null;
  chunkIndex: number;
  content: string;
  sourceHash: string;
  embeddingModel: string;
  embeddingDimension: number;
  accessCount: number;
  lastAccessedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface HistoricalMemoryCandidate extends HistoricalMemoryChunk {
  sessionTitle: string;
  sessionUpdatedAt: number;
  vectorScore?: number;
  keywordScore?: number;
  rrfScore: number;
  score: number;
}

type HistoricalMemoryChunkRow = HistoricalMemoryChunk & {
  sessionTitle?: string;
  sessionUpdatedAt?: number;
};

export function ensureHistoricalMemorySearchReady(): void {
  const db = getDb();
  assertSimpleSearchExtensionLoaded();
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS ${HISTORICAL_MEMORY_FTS_TABLE} USING fts5(
      chunkId UNINDEXED,
      sessionId UNINDEXED,
      turnId UNINDEXED,
      title,
      content,
      tokenize = '${SIMPLE_SEARCH_TOKENIZER}'
    );
  `);
}

function normalizeWhitespace(text: string): string {
  return String(text || "").replace(/[ \t\r\f\v]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function placeholderForFilePart(part: Extract<MessageContentPart, { type: "file" }>): string {
  const mediaType = String(part.mediaType || "");
  const name = typeof part.filename === "string" && part.filename.trim()
    ? part.filename.trim()
    : "";
  if (mediaType.startsWith("image/")) {
    return name ? `[图片: ${name}]` : "[图片]";
  }
  return name ? `[文件: ${name}]` : "[文件]";
}

export function serializeMessagePartsForMemoryIndex(
  parts: MessageContentPart[] | null | undefined
): string {
  const list = Array.isArray(parts) ? parts : [];
  const segments: string[] = [];

  for (const part of list) {
    if (part?.type === "text" && typeof (part as { text?: unknown }).text === "string") {
      const text = (part as { text: string }).text.trim();
      if (text) segments.push(text);
      continue;
    }

    if (part?.type === "file") {
      segments.push(placeholderForFilePart(part as Extract<MessageContentPart, { type: "file" }>));
    }
  }

  return normalizeWhitespace(segments.join("\n\n"));
}

export function hashMemoryContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function createHistoricalMemoryVectorIndex(dimension: number): void {
  createHistoricalMemoryVectorTable(dimension);
  setHistoricalMemoryMeta("vectorDimension", String(Math.max(1, Math.floor(dimension))));
}

export function resetHistoricalMemoryIndex(): void {
  const db = getDb();
  ensureHistoricalMemorySearchReady();
  db.prepare(`DELETE FROM ${HISTORICAL_MEMORY_FTS_TABLE}`).run();
  db.prepare("DELETE FROM historical_memory_chunks").run();
  db.prepare("DELETE FROM historical_memory_meta").run();
  dropHistoricalMemoryVectorTable();
}

export function deleteHistoricalMemoryByTurnId(turnId: string): void {
  const db = getDb();
  ensureHistoricalMemorySearchReady();
  const rows = db
    .prepare("SELECT id FROM historical_memory_chunks WHERE turnId = ?")
    .all(turnId) as Array<{ id: number }>;
  const ids = rows.map((row) => row.id);

  if (ids.length > 0 && historicalMemoryVectorTableExists()) {
    const tableName = getHistoricalMemoryVectorTableName();
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM "${tableName}" WHERE id IN (${placeholders})`).run(...ids);
  }

  db.prepare(`DELETE FROM ${HISTORICAL_MEMORY_FTS_TABLE} WHERE turnId = ?`).run(turnId);
  db.prepare("DELETE FROM historical_memory_chunks WHERE turnId = ?").run(turnId);
}

export function saveHistoricalMemoryChunks(input: {
  sessionId: string;
  sessionTitle: string;
  turnId: string;
  userMessageId: string | null;
  assistantMessageId: string | null;
  chunks: string[];
  embeddings: number[][];
  embeddingModel: string;
  embeddingDimension: number;
}): number[] {
  const db = getDb();
  ensureHistoricalMemorySearchReady();
  if (input.chunks.length !== input.embeddings.length) {
    throw new Error("historical memory chunks and embeddings length mismatch");
  }

  if (!historicalMemoryVectorTableExists()) {
    createHistoricalMemoryVectorIndex(input.embeddingDimension);
  }

  deleteHistoricalMemoryByTurnId(input.turnId);

  const now = Date.now();
  const ids: number[] = [];
  const insertChunk = db.prepare(`
    INSERT INTO historical_memory_chunks (
      sessionId, turnId, userMessageId, assistantMessageId, chunkIndex, content,
      sourceHash, embeddingModel, embeddingDimension, accessCount, lastAccessedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
  `);
  const insertFts = db.prepare(`
    INSERT INTO ${HISTORICAL_MEMORY_FTS_TABLE} (chunkId, sessionId, turnId, title, content)
    VALUES (?, ?, ?, ?, ?)
  `);
  const tableName = getHistoricalMemoryVectorTableName();
  const insertVector = db.prepare(`
    INSERT INTO "${tableName}" (id, embedding)
    VALUES (?, ?)
  `);

  const tx = db.transaction(() => {
    for (let index = 0; index < input.chunks.length; index += 1) {
      const content = input.chunks[index];
      const result = insertChunk.run(
        input.sessionId,
        input.turnId,
        input.userMessageId,
        input.assistantMessageId,
        index,
        content,
        hashMemoryContent(content),
        input.embeddingModel,
        input.embeddingDimension,
        now,
        now
      );
      const chunkId = Number(result.lastInsertRowid);
      ids.push(chunkId);
      insertFts.run(chunkId, input.sessionId, input.turnId, input.sessionTitle, content);
      insertVector.run(BigInt(chunkId), new Float32Array(input.embeddings[index]));
    }

    setHistoricalMemoryMeta("embeddingModel", input.embeddingModel);
    setHistoricalMemoryMeta("vectorDimension", String(input.embeddingDimension));
    setHistoricalMemoryMeta("lastIndexedAt", String(now));
  });

  tx();
  return ids;
}

export function searchHistoricalMemoryVectors(
  queryVector: number[],
  embeddingModel: string,
  limit: number
): Array<{ chunkId: number; distance: number; rank: number }> {
  if (!historicalMemoryVectorTableExists()) return [];
  const db = getDb();
  const tableName = getHistoricalMemoryVectorTableName();
  const fetchK = Math.min(Math.max(limit * 8, 40), 300);
  const rows = db.prepare(`
    SELECT v.id AS chunkId, v.distance
    FROM (
      SELECT id, distance FROM "${tableName}"
      WHERE embedding MATCH ? AND k = ?
    ) v
    JOIN historical_memory_chunks c ON c.id = v.id
    JOIN sessions s ON s.id = c.sessionId
    WHERE (s.isTemporary IS NULL OR s.isTemporary = 0)
      AND c.embeddingModel = ?
      AND c.embeddingDimension = ?
    ORDER BY v.distance ASC
    LIMIT ?
  `).all(new Float32Array(queryVector), fetchK, embeddingModel, queryVector.length, fetchK) as Array<{ chunkId: number; distance: number }>;

  return rows.map((row, index) => ({
    chunkId: row.chunkId,
    distance: row.distance,
    rank: index + 1,
  }));
}

export function searchHistoricalMemoryKeywords(
  query: string,
  limit: number
): Array<{ chunkId: number; rawScore: number; rank: number }> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const db = getDb();
  ensureHistoricalMemorySearchReady();
  const fetchK = Math.min(Math.max(limit * 8, 40), 300);

  const rows = db.prepare(`
    SELECT
      ${HISTORICAL_MEMORY_FTS_TABLE}.chunkId AS chunkId,
      bm25(${HISTORICAL_MEMORY_FTS_TABLE}, 0.0, 0.0, 6.0, 8.0) AS rawScore
    FROM ${HISTORICAL_MEMORY_FTS_TABLE}
    JOIN historical_memory_chunks c ON c.id = ${HISTORICAL_MEMORY_FTS_TABLE}.chunkId
    JOIN sessions s ON s.id = c.sessionId
    WHERE ${HISTORICAL_MEMORY_FTS_TABLE} MATCH simple_query(?)
      AND (s.isTemporary IS NULL OR s.isTemporary = 0)
    ORDER BY rawScore ASC, c.updatedAt DESC
    LIMIT ?
  `).all(trimmed, fetchK) as Array<{ chunkId: number; rawScore: number }>;

  return rows.map((row, index) => ({
    chunkId: row.chunkId,
    rawScore: row.rawScore,
    rank: index + 1,
  }));
}

export function getHistoricalMemoryChunksByIds(ids: number[]): HistoricalMemoryCandidate[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT
      c.*,
      s.title AS sessionTitle,
      s.updatedAt AS sessionUpdatedAt
    FROM historical_memory_chunks c
    JOIN sessions s ON s.id = c.sessionId
    WHERE c.id IN (${placeholders})
  `).all(...ids) as HistoricalMemoryChunkRow[];

  return rows.map((row) => ({
    ...row,
    sessionTitle: row.sessionTitle || "",
    sessionUpdatedAt: row.sessionUpdatedAt || row.updatedAt,
    rrfScore: 0,
    score: 0,
  }));
}

export function touchHistoricalMemoryChunks(ids: number[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`
    UPDATE historical_memory_chunks
    SET accessCount = accessCount + 1, lastAccessedAt = ?
    WHERE id IN (${placeholders})
  `).run(Date.now(), ...ids);
}

export function getHistoricalMemoryIndexStats(): {
  chunkCount: number;
  vectorReady: boolean;
  embeddingModel: string | null;
  vectorDimension: number | null;
  lastIndexedAt: number | null;
} {
  const db = getDb();
  const countRow = db.prepare("SELECT COUNT(*) AS count FROM historical_memory_chunks").get() as { count: number };
  const dimension = getHistoricalMemoryMeta("vectorDimension");
  const lastIndexedAt = getHistoricalMemoryMeta("lastIndexedAt");
  return {
    chunkCount: countRow.count,
    vectorReady: historicalMemoryVectorTableExists(),
    embeddingModel: getHistoricalMemoryMeta("embeddingModel"),
    vectorDimension: dimension ? Number(dimension) : null,
    lastIndexedAt: lastIndexedAt ? Number(lastIndexedAt) : null,
  };
}

function getHistoricalMemoryMeta(key: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM historical_memory_meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setHistoricalMemoryMeta(key: string, value: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO historical_memory_meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}
