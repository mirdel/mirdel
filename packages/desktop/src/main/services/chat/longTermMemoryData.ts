/**
 * 长期记忆（用户画像）数据层
 */
import { getDb } from "../db";
import { nanoid } from "nanoid";

export interface LongTermMemoryItem {
  id: string;
  category: string;
  key: string;
  value: string;
  sessionId?: string | null;
  messageId?: string | null;
  sessionTitle?: string | null;
  createdAt: number;
  updatedAt: number;
}

const MAX_ITEMS = 20;
const MAX_VALUE_LEN = 100;

export function listLongTermMemory(): LongTermMemoryItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ltm.id, ltm.category, ltm.key, ltm.value, ltm.sessionId, ltm.messageId, ltm.createdAt, ltm.updatedAt,
              s.title as sessionTitle
       FROM long_term_memory ltm
       LEFT JOIN sessions s ON ltm.sessionId = s.id
       ORDER BY ltm.updatedAt DESC`
    )
    .all() as (LongTermMemoryItem & { sessionTitle?: string | null })[];
  return rows.map((r) => ({
    ...r,
    sessionTitle: r.sessionTitle ?? null,
  }));
}

export function getLongTermMemoryByKey(key: string): LongTermMemoryItem | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT ltm.id, ltm.category, ltm.key, ltm.value, ltm.sessionId, ltm.messageId, ltm.createdAt, ltm.updatedAt,
              s.title as sessionTitle
       FROM long_term_memory ltm
       LEFT JOIN sessions s ON ltm.sessionId = s.id
       WHERE ltm.key = ?`
    )
    .get(key) as (LongTermMemoryItem & { sessionTitle?: string | null }) | undefined;
  if (!row) return null;
  return { ...row, sessionTitle: row.sessionTitle ?? null };
}

export function addLongTermMemory(params: {
  category?: string;
  key: string;
  value: string;
  sessionId?: string | null;
  messageId?: string | null;
}): LongTermMemoryItem | null {
  const { category = "other", key, value, sessionId = null, messageId = null } = params;
  const trimmed = value.trim().slice(0, MAX_VALUE_LEN);
  if (!trimmed) return null;

  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) as c FROM long_term_memory").get() as { c: number };
  if (count.c >= MAX_ITEMS) return null;

  const id = nanoid();
  const now = Date.now();
  try {
    db.prepare(
      `INSERT INTO long_term_memory (id, category, key, value, sessionId, messageId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, category, key, trimmed, sessionId, messageId, now, now);
  } catch {
    return null; // key 冲突等
  }
  return { id, category, key, value: trimmed, sessionId, messageId, createdAt: now, updatedAt: now };
}

export function updateLongTermMemoryByKey(key: string, value: string): boolean {
  const trimmed = value.trim().slice(0, MAX_VALUE_LEN);
  if (!trimmed) return false;

  const db = getDb();
  const result = db
    .prepare(
      `UPDATE long_term_memory SET value = ?, updatedAt = ? WHERE key = ?`
    )
    .run(trimmed, Date.now(), key);
  return result.changes > 0;
}

export function removeLongTermMemoryByKey(key: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM long_term_memory WHERE key = ?").run(key);
  return result.changes > 0;
}

export function applyPatchOps(
  ops: PatchOp[],
  context?: { sessionId?: string | null; messageId?: string | null }
): void {
  const db = getDb();
  const now = Date.now();
  const sessionId = context?.sessionId ?? null;
  const messageId = context?.messageId ?? null;

  for (const op of ops) {
    try {
      if (op.op === "add" && op.item) {
        const { category = "other", key, value } = op.item;
        const trimmed = value.trim().slice(0, MAX_VALUE_LEN);
        if (!trimmed) continue;
        const count = db.prepare("SELECT COUNT(*) as c FROM long_term_memory").get() as { c: number };
        if (count.c >= MAX_ITEMS) continue; // 达上限跳过 add，但继续执行后续 remove/merge
        const id = nanoid();
        db.prepare(
          `INSERT OR IGNORE INTO long_term_memory (id, category, key, value, sessionId, messageId, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, category, key, trimmed, sessionId, messageId, now, now);
      } else if (op.op === "update" && op.key !== undefined) {
        const trimmed = (op.value ?? "").trim().slice(0, MAX_VALUE_LEN);
        if (!trimmed) continue;
        db.prepare(
          `UPDATE long_term_memory SET value = ?, updatedAt = ? WHERE key = ?`
        ).run(trimmed, now, op.key);
      } else if (op.op === "remove" && op.key !== undefined) {
        db.prepare("DELETE FROM long_term_memory WHERE key = ?").run(op.key);
      } else if (op.op === "merge" && op.intoKey !== undefined && op.fromKeys?.length) {
        const intoExists = db.prepare("SELECT 1 FROM long_term_memory WHERE key = ?").get(op.intoKey);
        if (!intoExists) continue; // intoKey 不存在则跳过，避免误删
        const trimmed = (op.value ?? "").trim().slice(0, MAX_VALUE_LEN);
        if (!trimmed) continue;
        db.prepare(
          `UPDATE long_term_memory SET value = ?, updatedAt = ? WHERE key = ?`
        ).run(trimmed, now, op.intoKey);
        for (const k of op.fromKeys) {
          if (k !== op.intoKey) db.prepare("DELETE FROM long_term_memory WHERE key = ?").run(k);
        }
      }
    } catch {
      // 静默跳过无效 op
    }
  }
}

export type PatchOp =
  | { op: "add"; item: { category?: string; key: string; value: string } }
  | { op: "update"; key: string; value: string }
  | { op: "remove"; key: string }
  | { op: "merge"; intoKey: string; fromKeys: string[]; value: string };

export { MAX_ITEMS, MAX_VALUE_LEN };
