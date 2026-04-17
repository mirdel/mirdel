import { getDb } from "../db";
import { nanoid as nanoId } from "nanoid";
import { tMain } from "../../i18n";

export type PromptLibraryEntry = {
  id: string;
  title: string;
  description: string;
  content: string;
  tags: string[];
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
};

type PromptLibraryRow = {
  id: string;
  title: string;
  description: string | null;
  content: string;
  tags: string;
  favorite: number;
  createdAt: number;
  updatedAt: number;
};

function parseTags(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

function rowToEntry(row: PromptLibraryRow): PromptLibraryEntry {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    content: row.content ?? "",
    tags: parseTags(row.tags),
    favorite: row.favorite === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const s = String(t).trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * 收藏优先，其次按更新时间降序
 */
export function listPromptLibraryEntries(): PromptLibraryEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM prompt_library_entries
       ORDER BY favorite DESC, updatedAt DESC`
    )
    .all() as PromptLibraryRow[];
  return rows.map(rowToEntry);
}

export function getPromptLibraryEntry(id: string): PromptLibraryEntry | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM prompt_library_entries WHERE id = ?`)
    .get(id) as PromptLibraryRow | undefined;
  return row ? rowToEntry(row) : null;
}

export function createPromptLibraryEntry(input?: {
  title?: string;
  description?: string;
  content?: string;
  tags?: string[];
}): PromptLibraryEntry {
  const db = getDb();
  const now = Date.now();
  const id = nanoId();
  const title = (input?.title ?? "").trim();
  const description = (input?.description ?? "").trim();
  const content = (input?.content ?? "").trim();
  if (!title) {
    throw new Error(tMain("promptLibrary.titleRequired"));
  }
  if (!content) {
    throw new Error(tMain("promptLibrary.contentRequired"));
  }
  const tagsJson = JSON.stringify(normalizeTags(input?.tags));

  db.prepare(
    `INSERT INTO prompt_library_entries (
      id, title, description, content, tags, favorite, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(id, title, description || null, content, tagsJson, now, now);

  return getPromptLibraryEntry(id)!;
}

export function updatePromptLibraryEntry(
  id: string,
  input: Partial<{
    title: string;
    description: string;
    content: string;
    tags: string[];
    favorite: boolean;
  }>
): PromptLibraryEntry {
  const db = getDb();
  const now = Date.now();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.title !== undefined) {
    const nextTitle = String(input.title).trim();
    if (!nextTitle) {
      throw new Error(tMain("promptLibrary.titleRequired"));
    }
    fields.push("title = ?");
    values.push(nextTitle);
  }
  if (input.description !== undefined) {
    fields.push("description = ?");
    values.push(String(input.description).trim() || null);
  }
  if (input.content !== undefined) {
    const nextContent = String(input.content).trim();
    if (!nextContent) {
      throw new Error(tMain("promptLibrary.contentRequired"));
    }
    fields.push("content = ?");
    values.push(nextContent);
  }
  if (input.tags !== undefined) {
    fields.push("tags = ?");
    values.push(JSON.stringify(normalizeTags(input.tags)));
  }
  if (input.favorite !== undefined) {
    fields.push("favorite = ?");
    values.push(input.favorite ? 1 : 0);
  }

  fields.push("updatedAt = ?");
  values.push(now);
  values.push(id);

  const result = db
    .prepare(`UPDATE prompt_library_entries SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);
  if (result.changes === 0) {
    throw new Error("Prompt library entry not found");
  }

  return getPromptLibraryEntry(id)!;
}

export function deletePromptLibraryEntry(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM prompt_library_entries WHERE id = ?`).run(id);
}
