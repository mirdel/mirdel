import { getDb } from "../../db";
import { tMain } from "../../../i18n";
import { ensureAppSearchReady, getAppSearchTableNames } from "../searchIndex";

type RawNoteHitRow = {
  noteId: string;
  listId: string | null;
  title: string;
  updatedAt: number;
  listName: string | null;
  titleHighlight: string | null;
  snippet: string | null;
  rawScore: number;
};

export type NoteSearchHit = {
  type: "note";
  noteId: string;
  listId: string | null;
  listName: string;
  title: string;
  titleHighlight: string;
  snippet: string;
  updatedAt: number;
  score: number;
};

export type NoteSearchInput = {
  query: string;
  limit: number;
  offset: number;
};

function cleanSnippet(value: string | null | undefined) {
  return String(value || "").trim();
}

function getTotal(query: string) {
  const db = getDb();
  const { noteFts } = getAppSearchTableNames();
  const row = db.prepare(
    `SELECT COUNT(*) AS count
     FROM ${noteFts}
     WHERE ${noteFts} MATCH simple_query(?)`
  ).get(query) as { count: number } | undefined;

  return row?.count ?? 0;
}

export function searchNoteAdapter(input: NoteSearchInput) {
  ensureAppSearchReady();

  const db = getDb();
  const { noteFts } = getAppSearchTableNames();
  const rows = db.prepare(
    `SELECT
      n.id AS noteId,
      n.listId AS listId,
      n.title AS title,
      n.updatedAt AS updatedAt,
      l.name AS listName,
      simple_highlight(${noteFts}, 2, '[[', ']]') AS titleHighlight,
      simple_snippet(${noteFts}, 3, '[[', ']]', '...', 20) AS snippet,
      bm25(${noteFts}, 0.0, 0.0, 10.0, 4.0) AS rawScore
     FROM ${noteFts}
     JOIN notes n ON n.id = ${noteFts}.noteId
     LEFT JOIN note_lists l ON l.id = n.listId
     WHERE ${noteFts} MATCH simple_query(?)
     ORDER BY rawScore ASC, n.updatedAt DESC
     LIMIT ? OFFSET ?`
  ).all(input.query, input.limit, input.offset) as RawNoteHitRow[];

  return {
    total: getTotal(input.query),
    items: rows.map((row) => ({
      type: "note" as const,
      noteId: row.noteId,
      listId: row.listId,
      listName: row.listName || tMain("content.inbox"),
      title: row.title,
      titleHighlight: cleanSnippet(row.titleHighlight) || row.title,
      snippet: cleanSnippet(row.snippet),
      updatedAt: row.updatedAt,
      score: row.rawScore,
    })),
  };
}
