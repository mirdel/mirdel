import { getDb } from "../../db";
import { ensureAppSearchReady, getAppSearchTableNames } from "../searchIndex";

type RawKnowledgeHitRow = {
  itemId: string;
  kbId: string;
  kbName: string;
  itemType: string;
  itemName: string;
  itemSource: string | null;
  chunkId: number;
  itemNameHighlight: string | null;
  snippet: string | null;
  rawScore: number;
};

export type KnowledgeSearchHit = {
  type: "knowledge";
  kbId: string;
  kbName: string;
  itemId: string;
  itemType: string;
  itemName: string;
  itemNameHighlight: string;
  itemSource: string;
  score: number;
  matchedChunkCount: number;
  topChunkHits: Array<{
    chunkId: number;
    snippet: string;
    score: number;
  }>;
};

export type KnowledgeSearchInput = {
  query: string;
  limit: number;
  offset: number;
};

function cleanSnippet(value: string | null | undefined) {
  return String(value || "").trim();
}

function getTotal(query: string) {
  const db = getDb();
  const { kbChunkFts } = getAppSearchTableNames();
  const row = db.prepare(
    `SELECT COUNT(DISTINCT itemId) AS count
     FROM ${kbChunkFts}
     WHERE ${kbChunkFts} MATCH simple_query(?)`
  ).get(query) as { count: number } | undefined;

  return row?.count ?? 0;
}

export function searchKnowledgeAdapter(input: KnowledgeSearchInput) {
  ensureAppSearchReady();

  const db = getDb();
  const { kbChunkFts } = getAppSearchTableNames();
  const fetchLimit = Math.max(input.limit * 6, 60);

  const rows = db.prepare(
    `SELECT
      i.id AS itemId,
      i.kbId AS kbId,
      k.name AS kbName,
      i.type AS itemType,
      i.name AS itemName,
      i.source AS itemSource,
      c.id AS chunkId,
      simple_highlight(${kbChunkFts}, 4, '[[', ']]') AS itemNameHighlight,
      simple_snippet(${kbChunkFts}, 6, '[[', ']]', '...', 18) AS snippet,
      bm25(${kbChunkFts}, 0.0, 0.0, 0.0, 0.0, 8.0, 3.0, 5.0) AS rawScore
     FROM ${kbChunkFts}
     JOIN kb_chunks c ON c.id = ${kbChunkFts}.chunkId
     JOIN kb_items i ON i.id = c.itemId
     JOIN kbs k ON k.id = i.kbId
     WHERE ${kbChunkFts} MATCH simple_query(?)
       AND i.status = 'ready'
     ORDER BY rawScore ASC, i.updatedAt DESC, c.chunkIndex ASC
     LIMIT ? OFFSET 0`
  ).all(input.query, fetchLimit) as RawKnowledgeHitRow[];

  const aggregated = new Map<string, KnowledgeSearchHit>();

  for (const row of rows) {
    const existing = aggregated.get(row.itemId);
    if (!existing) {
      aggregated.set(row.itemId, {
        type: "knowledge",
        kbId: row.kbId,
        kbName: row.kbName,
        itemId: row.itemId,
        itemType: row.itemType,
        itemName: row.itemName,
        itemNameHighlight: cleanSnippet(row.itemNameHighlight) || row.itemName,
        itemSource: row.itemSource || "",
        score: row.rawScore,
        matchedChunkCount: 1,
        topChunkHits: [
          {
            chunkId: row.chunkId,
            snippet: cleanSnippet(row.snippet),
            score: row.rawScore,
          },
        ],
      });
      continue;
    }

    existing.matchedChunkCount += 1;
    if (row.rawScore < existing.score) {
      existing.score = row.rawScore;
    }
    if (existing.topChunkHits.length < 3) {
      existing.topChunkHits.push({
        chunkId: row.chunkId,
        snippet: cleanSnippet(row.snippet),
        score: row.rawScore,
      });
    }
  }

  const items = Array.from(aggregated.values())
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.itemName.localeCompare(b.itemName);
    })
    .slice(input.offset, input.offset + input.limit);

  return {
    total: getTotal(input.query),
    items,
  };
}
