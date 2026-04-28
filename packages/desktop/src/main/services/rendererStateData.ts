import { getDb } from "./db";

export type RendererStateEntry = {
  key: string;
  value: unknown;
  updatedAt: number;
};

type RendererStateRow = {
  key: string;
  valueJson: string;
  updatedAt: number;
};

function normalizeKey(key: string): string {
  const normalized = key.trim();
  if (!normalized) {
    throw new Error("renderer state key is required");
  }
  return normalized;
}

function parseValue(row: RendererStateRow): RendererStateEntry {
  try {
    return {
      key: row.key,
      value: JSON.parse(row.valueJson),
      updatedAt: row.updatedAt,
    };
  } catch {
    return {
      key: row.key,
      value: null,
      updatedAt: row.updatedAt,
    };
  }
}

export function getRendererStateSnapshot(): Record<string, unknown> {
  const db = getDb();
  const rows = db
    .prepare("SELECT key, valueJson, updatedAt FROM renderer_state")
    .all() as RendererStateRow[];
  const snapshot: Record<string, unknown> = {};
  for (const row of rows) {
    snapshot[row.key] = parseValue(row).value;
  }
  return snapshot;
}

export function getRendererStateValue(key: string): RendererStateEntry | null {
  const db = getDb();
  const row = db
    .prepare("SELECT key, valueJson, updatedAt FROM renderer_state WHERE key = ?")
    .get(normalizeKey(key)) as RendererStateRow | undefined;
  return row ? parseValue(row) : null;
}

export function setRendererStateValue(key: string, value: unknown): RendererStateEntry {
  const normalizedKey = normalizeKey(key);
  const updatedAt = Date.now();
  const valueJson = JSON.stringify(value) ?? "null";
  const db = getDb();
  db.prepare(
    `
      INSERT INTO renderer_state (key, valueJson, updatedAt)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        valueJson = excluded.valueJson,
        updatedAt = excluded.updatedAt
    `
  ).run(normalizedKey, valueJson, updatedAt);
  return { key: normalizedKey, value, updatedAt };
}

export function removeRendererStateValue(key: string): { key: string; removed: boolean } {
  const normalizedKey = normalizeKey(key);
  const db = getDb();
  const result = db.prepare("DELETE FROM renderer_state WHERE key = ?").run(normalizedKey);
  return { key: normalizedKey, removed: result.changes > 0 };
}
