import { getDb } from "../../db";
import { ensureAppSearchReady, getAppSearchTableNames } from "../searchIndex";

type RawTranslateHitRow = {
  recordId: string;
  targetLang: string;
  createdAt: number;
  inputSnippet: string | null;
  translationSnippet: string | null;
  rawScore: number;
};

export type TranslateSearchHit = {
  type: "translation";
  recordId: string;
  targetLang: string;
  createdAt: number;
  inputSnippet: string;
  translationSnippet: string;
  score: number;
};

export type TranslateSearchInput = {
  query: string;
  limit: number;
  offset: number;
};

function cleanSnippet(value: string | null | undefined) {
  return String(value || "").trim();
}

function getTotal(query: string) {
  const db = getDb();
  const { translateFts } = getAppSearchTableNames();
  const row = db.prepare(
    `SELECT COUNT(*) AS count
     FROM ${translateFts}
     WHERE ${translateFts} MATCH simple_query(?)`
  ).get(query) as { count: number } | undefined;

  return row?.count ?? 0;
}

export function searchTranslateAdapter(input: TranslateSearchInput) {
  ensureAppSearchReady();

  const db = getDb();
  const { translateFts } = getAppSearchTableNames();
  const rows = db.prepare(
    `SELECT
      t.id AS recordId,
      t.targetLang AS targetLang,
      t.createdAt AS createdAt,
      simple_snippet(${translateFts}, 2, '[[', ']]', '...', 18) AS inputSnippet,
      simple_snippet(${translateFts}, 3, '[[', ']]', '...', 18) AS translationSnippet,
      bm25(${translateFts}, 0.0, 0.0, 6.0, 4.0) AS rawScore
     FROM ${translateFts}
     JOIN translate_history t ON t.id = ${translateFts}.recordId
     WHERE ${translateFts} MATCH simple_query(?)
     ORDER BY rawScore ASC, t.createdAt DESC
     LIMIT ? OFFSET ?`
  ).all(input.query, input.limit, input.offset) as RawTranslateHitRow[];

  return {
    total: getTotal(input.query),
    items: rows.map((row) => ({
      type: "translation" as const,
      recordId: row.recordId,
      targetLang: row.targetLang,
      createdAt: row.createdAt,
      inputSnippet: cleanSnippet(row.inputSnippet),
      translationSnippet: cleanSnippet(row.translationSnippet),
      score: row.rawScore,
    })),
  };
}
