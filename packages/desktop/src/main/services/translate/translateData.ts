/**
 * 翻译历史数据层
 */
import { nanoid } from "nanoid";
import { getDb } from "../db";
import { clearTranslateSearchDocs, deleteTranslateSearchDoc, syncTranslateSearchDoc } from "../search/searchIndex";

export type TranslateRecord = {
  id: string;
  input: string;
  result: string;
  targetLang: string;
  createdAt: number;
};

export function createTranslateRecord(params: {
  input: string;
  result: string;
  targetLang: string;
}): TranslateRecord {
  const db = getDb();
  const id = nanoid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO translate_history (id, input, result, targetLang, createdAt) VALUES (?, ?, ?, ?, ?)`
  ).run(id, params.input, params.result, params.targetLang, now);
  syncTranslateSearchDoc(id);
  return {
    id,
    input: params.input,
    result: params.result,
    targetLang: params.targetLang,
    createdAt: now,
  };
}

export function listTranslateHistory(params?: { limit?: number }): TranslateRecord[] {
  const db = getDb();
  const limit = params?.limit ?? 10000;
  const rows = db
    .prepare(
      `SELECT id, input, result, targetLang, createdAt FROM translate_history ORDER BY createdAt DESC LIMIT ?`
    )
    .all(limit) as TranslateRecord[];
  return rows;
}

export function getTranslateRecord(id: string): TranslateRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, input, result, targetLang, createdAt FROM translate_history WHERE id = ?`
    )
    .get(id) as TranslateRecord | undefined;
  return row ?? null;
}

export function deleteTranslateRecord(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM translate_history WHERE id = ?`).run(id);
  deleteTranslateSearchDoc(id);
}

export function clearTranslateHistory(): void {
  const db = getDb();
  db.prepare(`DELETE FROM translate_history`).run();
  clearTranslateSearchDocs();
}
