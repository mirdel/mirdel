import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { app, nativeImage } from "electron";
import { markdownToPlain } from "@mirdel/markdown-to-plain";
import { getDb } from "../db";
import { tMain } from "../../i18n";
import { deleteNoteSearchDoc, syncNoteSearchDoc } from "../search/searchIndex";

const NOTE_OWNER_TYPE = "note";
const NOTE_INLINE_ASSET_ROLE = "inline-image";

export type NoteList = {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type Note = {
  id: string;
  listId: string | null;
  title: string;
  contentMd: string;
  previewText: string;
  createdAt: number;
  updatedAt: number;
};

export type NoteScope = "all" | "inbox" | "list";

type NoteListRow = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

type NoteRow = {
  id: string;
  listId: string | null;
  title: string;
  contentMd: string;
  previewText: string;
  createdAt: number;
  updatedAt: number;
};

type AssetInput = {
  src?: string;
  filePath?: string;
  mediaType?: string;
};

type PersistedAsset = {
  filePath: string;
  mediaType: string;
  size: number;
  wroteNewFile: boolean;
};

type RemovedAsset = {
  assetId: string;
  filePath: string;
};

function now() {
  return Date.now();
}

function uuidV7() {
  const bytes = randomBytes(16);
  const ts = BigInt(Date.now());

  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);

  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getAssetDir() {
  return path.join(app.getPath("userData"), "assets");
}

function isPathInside(parent: string, target: string) {
  const relative = path.relative(parent, target);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function extFromMediaType(mediaType: string) {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/gif") return "gif";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/svg+xml") return "svg";
  return "bin";
}

function inferMediaTypeFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function parseDataUrl(input: string): { mediaType: string; bytes: Buffer } | null {
  const match = input.match(/^data:([^,]*?),(.*)$/i);
  if (!match) return null;

  const meta = match[1] || "";
  const payload = match[2] || "";
  const isBase64 = /;base64/i.test(meta);
  const mediaTypeToken = meta
    .split(";")
    .map((token) => token.trim())
    .find((token) => token.length > 0 && token.includes("/"));
  const mediaType = mediaTypeToken || "application/octet-stream";

  if (isBase64) {
    return { mediaType, bytes: Buffer.from(payload, "base64") };
  }

  try {
    return { mediaType, bytes: Buffer.from(decodeURIComponent(payload), "utf8") };
  } catch {
    return { mediaType, bytes: Buffer.from(payload, "utf8") };
  }
}

function getImageDimensions(filePath: string, mediaType: string): { width?: number; height?: number } {
  if (!mediaType.startsWith("image/")) return {};

  try {
    const img = nativeImage.createFromPath(filePath);
    const size = img.getSize();
    if (!size || size.width <= 0 || size.height <= 0) return {};
    return { width: size.width, height: size.height };
  } catch {
    return {};
  }
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function validateListIdOrNull(listId: string | null): string | null {
  if (!listId) return null;
  const db = getDb();
  const row = db.prepare("SELECT id FROM note_lists WHERE id = ?").get(listId) as { id: string } | undefined;
  if (!row) {
    throw new Error(tMain("notes.listNotFound"));
  }
  return listId;
}

async function persistAssetToStore(input: AssetInput & { assetId: string }): Promise<PersistedAsset | null> {
  const assetRoot = path.resolve(getAssetDir());

  const existingPath = typeof input.filePath === "string" ? input.filePath.trim() : "";
  if (existingPath) {
    const abs = path.resolve(existingPath);

    if (isPathInside(assetRoot, abs) && (await fileExists(abs))) {
      const stat = await fs.stat(abs);
      return {
        filePath: abs,
        mediaType: input.mediaType || inferMediaTypeFromPath(abs),
        size: Number(stat.size) || 0,
        wroteNewFile: false,
      };
    }

    if (await fileExists(abs)) {
      const bytes = await fs.readFile(abs);
      const mediaType = input.mediaType || inferMediaTypeFromPath(abs);
      const ext = extFromMediaType(mediaType);
      const target = path.join(assetRoot, `${input.assetId}.${ext}`);
      await fs.mkdir(assetRoot, { recursive: true });
      await fs.writeFile(target, bytes);
      return {
        filePath: target,
        mediaType,
        size: bytes.length,
        wroteNewFile: true,
      };
    }
  }

  const src = typeof input.src === "string" ? input.src : "";
  if (!src) return null;

  let mediaType = input.mediaType || "application/octet-stream";
  let bytes: Buffer | null = null;

  const parsed = parseDataUrl(src);
  if (parsed) {
    mediaType = parsed.mediaType;
    bytes = parsed.bytes;
  } else if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src);
    const arr = await res.arrayBuffer();
    bytes = Buffer.from(arr);
    mediaType = res.headers.get("content-type") || mediaType;
  } else if (/^[A-Za-z0-9+/=\s]+$/.test(src)) {
    bytes = Buffer.from(src.replace(/\s+/g, ""), "base64");
  } else {
    return null;
  }

  const ext = extFromMediaType(mediaType);
  const target = path.join(assetRoot, `${input.assetId}.${ext}`);
  await fs.mkdir(assetRoot, { recursive: true });
  await fs.writeFile(target, bytes);
  return { filePath: target, mediaType, size: bytes.length, wroteNewFile: true };
}

async function cleanupOrphanAsset(assetId: string, filePath?: string) {
  const db = getDb();
  const ref = db.prepare("SELECT id FROM asset_links WHERE assetId = ? LIMIT 1").get(assetId) as { id: string } | undefined;
  if (ref) return;

  const assetRow = db.prepare("SELECT filePath FROM assets WHERE id = ?").get(assetId) as { filePath: string } | undefined;
  db.prepare("DELETE FROM assets WHERE id = ?").run(assetId);

  const targetPath = filePath || assetRow?.filePath;
  if (!targetPath) return;

  try {
    await fs.unlink(targetPath);
  } catch {
    // ignore
  }
}

function rowToNoteList(row: NoteListRow): NoteList {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon || undefined,
    color: row.color || undefined,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToNote(row: NoteRow): Note {
  const normalizedContentMd = normalizeMarkdownArtifacts(row.contentMd);
  return {
    id: row.id,
    listId: row.listId,
    title: row.title,
    contentMd: normalizedContentMd,
    previewText: row.previewText,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeMarkdownArtifacts(contentMd: string) {
  const text = String(contentMd || "");
  if (!text) return "";

  return text
    // Empty table cells serialized as "&nbsp;" should stay empty after reload.
    .replace(/\|\s*(?:&nbsp;|&#160;|&#xa0;)\s*(?=\|)/gi, "| ")
    // Empty task list items should not render literal "&nbsp;".
    .replace(/^(\s*[-+*]\s+\[(?: |x|X)\]\s+)(?:&nbsp;|&#160;|&#xa0;)\s*$/gim, "$1");
}

function buildPreviewText(contentMd: string) {
  const plain = markdownToPlain(contentMd);
  if (!plain) return "";
  return plain.slice(0, 160);
}

function deriveTitleFromMarkdown(contentMd: string) {
  const lines = markdownToPlain(contentMd, { preserveLineBreaks: true }).split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    return line.slice(0, 120);
  }

  return "";
}

function normalizeTitle(input: string | undefined, contentMd: string) {
  const trimmed = (input || "").trim();
  if (trimmed) return trimmed.slice(0, 120);

  const derived = deriveTitleFromMarkdown(contentMd);
  if (derived) return derived;
  return tMain("content.untitledNote");
}

function extractAssetIdsFromMarkdown(contentMd: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const regex = /asset:\/\/([0-9a-zA-Z-]+)/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(contentMd)) != null) {
    const assetId = (match[1] || "").trim();
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    result.push(assetId);
  }

  return result;
}

function getMaxCustomListSortOrder() {
  const db = getDb();
  const row = db.prepare("SELECT MAX(sortOrder) AS maxSort FROM note_lists").get() as { maxSort: number | null };
  return row.maxSort ?? 0;
}

function syncNoteAssetLinksInTx(noteId: string, contentMd: string, ts: number): RemovedAsset[] {
  const db = getDb();
  const desiredAssetIds = extractAssetIdsFromMarkdown(contentMd);

  const existingRows = db
    .prepare(
      `SELECT id, assetId
       FROM asset_links
       WHERE ownerType = ? AND ownerId = ? AND role = ?
       ORDER BY sortOrder ASC, createdAt ASC`
    )
    .all(NOTE_OWNER_TYPE, noteId, NOTE_INLINE_ASSET_ROLE) as Array<{ id: string; assetId: string }>;

  const existingMap = new Map<string, { id: string; assetId: string }>();
  for (const row of existingRows) {
    if (!existingMap.has(row.assetId)) {
      existingMap.set(row.assetId, row);
    }
  }

  for (let i = 0; i < desiredAssetIds.length; i += 1) {
    const assetId = desiredAssetIds[i];
    const existed = existingMap.get(assetId);
    if (existed) {
      db.prepare("UPDATE asset_links SET sortOrder = ? WHERE id = ?").run(i, existed.id);
      continue;
    }

    const assetExists = db.prepare("SELECT id FROM assets WHERE id = ? LIMIT 1").get(assetId) as { id: string } | undefined;
    if (!assetExists) continue;

    db.prepare(
      `INSERT INTO asset_links (id, assetId, ownerType, ownerId, role, sortOrder, createdAt, metaJson)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(uuidV7(), assetId, NOTE_OWNER_TYPE, noteId, NOTE_INLINE_ASSET_ROLE, i, ts, null);
  }

  const desiredSet = new Set(desiredAssetIds);
  const removed: RemovedAsset[] = [];

  for (const row of existingRows) {
    if (desiredSet.has(row.assetId)) continue;

    db.prepare("DELETE FROM asset_links WHERE id = ?").run(row.id);

    const assetRow = db
      .prepare("SELECT filePath FROM assets WHERE id = ?")
      .get(row.assetId) as { filePath: string } | undefined;
    if (!assetRow) continue;

    removed.push({ assetId: row.assetId, filePath: assetRow.filePath });
  }

  return removed;
}

async function cleanupRemovedAssets(rows: RemovedAsset[]) {
  const dedup = new Map<string, string>();
  for (const row of rows) {
    if (!row.assetId) continue;
    if (!dedup.has(row.assetId)) {
      dedup.set(row.assetId, row.filePath);
    }
  }

  for (const [assetId, filePath] of dedup.entries()) {
    await cleanupOrphanAsset(assetId, filePath);
  }
}

export function listNoteLists(): NoteList[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, icon, color, sortOrder, createdAt, updatedAt
       FROM note_lists
       ORDER BY sortOrder ASC, createdAt ASC`
    )
    .all() as NoteListRow[];

  return rows.map(rowToNoteList);
}

export function createNoteList(input: { name: string; icon?: string; color?: string }): NoteList {
  const name = (input.name || "").trim();
  if (!name) {
    throw new Error(tMain("notes.listNameRequired"));
  }

  const ts = now();
  const id = nanoid();
  const sortOrder = getMaxCustomListSortOrder() + 1;
  const icon = (input.icon || "").trim() || null;
  const color = (input.color || "").trim() || null;
  const db = getDb();

  db.prepare(
    `INSERT INTO note_lists (id, name, icon, color, sortOrder, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, icon, color, sortOrder, ts, ts);

  return {
    id,
    name,
    icon: icon || undefined,
    color: color || undefined,
    sortOrder,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function updateNoteList(input: {
  listId: string;
  updates: {
    name?: string;
    icon?: string;
    color?: string;
  };
}) {
  const db = getDb();
  const current = db
    .prepare("SELECT id, name, icon, color FROM note_lists WHERE id = ?")
    .get(input.listId) as { id: string; name: string; icon: string | null; color: string | null } | undefined;

  if (!current) {
    return { ok: false as const, error: tMain("notes.listNotFound") };
  }

  const nextName =
    input.updates.name !== undefined
      ? input.updates.name.trim()
      : current.name;
  const nextIcon =
    input.updates.icon !== undefined
      ? (input.updates.icon.trim() || null)
      : current.icon;
  const nextColor =
    input.updates.color !== undefined
      ? (input.updates.color.trim() || null)
      : current.color;

  if (!nextName) {
    return { ok: false as const, error: tMain("notes.listNameRequired") };
  }

  db.prepare("UPDATE note_lists SET name = ?, icon = ?, color = ?, updatedAt = ? WHERE id = ?").run(
    nextName,
    nextIcon,
    nextColor,
    now(),
    input.listId
  );

  return { ok: true as const };
}

export function deleteNoteList(input: { listId: string }) {
  const db = getDb();

  const result = db.transaction((listId: string) => {
    const target = db.prepare("SELECT id FROM note_lists WHERE id = ?").get(listId) as { id: string } | undefined;
    if (!target) {
      return { ok: false as const, error: tMain("notes.listNotFound") };
    }

    db.prepare("UPDATE notes SET listId = NULL, updatedAt = ? WHERE listId = ?").run(now(), listId);
    db.prepare("DELETE FROM note_lists WHERE id = ?").run(listId);

    return { ok: true as const };
  })(input.listId);

  return result;
}

export function listNotes(input?: { scope?: NoteScope; listId?: string }): Note[] {
  const scope = input?.scope || "all";
  const db = getDb();

  if (scope === "inbox") {
    const rows = db
      .prepare(
        `SELECT id, listId, title, contentMd, previewText, createdAt, updatedAt
         FROM notes
         WHERE listId IS NULL
         ORDER BY updatedAt DESC, createdAt DESC`
      )
      .all() as NoteRow[];
    return rows.map(rowToNote);
  }

  if (scope === "list") {
    if (!input?.listId) return [];
    const rows = db
      .prepare(
        `SELECT id, listId, title, contentMd, previewText, createdAt, updatedAt
         FROM notes
         WHERE listId = ?
         ORDER BY updatedAt DESC, createdAt DESC`
      )
      .all(input.listId) as NoteRow[];
    return rows.map(rowToNote);
  }

  const rows = db
    .prepare(
      `SELECT id, listId, title, contentMd, previewText, createdAt, updatedAt
       FROM notes
       ORDER BY updatedAt DESC, createdAt DESC`
    )
    .all() as NoteRow[];
  return rows.map(rowToNote);
}

export function getNote(id: string): Note | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT id, listId, title, contentMd, previewText, createdAt, updatedAt FROM notes WHERE id = ?")
    .get(id) as NoteRow | undefined;
  if (!row) return undefined;
  return rowToNote(row);
}

export async function createNote(input: { listId?: string | null; title?: string; contentMd?: string }): Promise<Note> {
  const listId = validateListIdOrNull((input.listId ?? null) as string | null);
  const contentMd = normalizeMarkdownArtifacts(input.contentMd || "");
  const title = normalizeTitle(input.title, contentMd);
  const previewText = buildPreviewText(contentMd);
  const ts = now();
  const id = nanoid();
  const db = getDb();

  const removedAssets = db.transaction(() => {
    db.prepare(
      `INSERT INTO notes (id, listId, title, contentMd, previewText, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, listId, title, contentMd, previewText, ts, ts);

    return syncNoteAssetLinksInTx(id, contentMd, ts);
  })();

  await cleanupRemovedAssets(removedAssets);
  syncNoteSearchDoc(id);

  return {
    id,
    listId,
    title,
    contentMd,
    previewText,
    createdAt: ts,
    updatedAt: ts,
  };
}

export async function updateNote(input: {
  id: string;
  updates: Partial<Pick<Note, "title" | "contentMd" | "listId">>;
}): Promise<Note> {
  const current = getNote(input.id);
  if (!current) {
    throw new Error(tMain("notes.noteNotFound"));
  }

  const nextContentMd = input.updates.contentMd ?? current.contentMd;
  const normalizedNextContentMd = normalizeMarkdownArtifacts(nextContentMd);
  const nextListId =
    input.updates.listId !== undefined
      ? validateListIdOrNull(input.updates.listId)
      : current.listId;
  const nextTitle =
    input.updates.title !== undefined
      ? normalizeTitle(input.updates.title, normalizedNextContentMd)
      : current.title;
  const nextPreview = buildPreviewText(normalizedNextContentMd);

  const changed =
    normalizedNextContentMd !== current.contentMd ||
    nextListId !== current.listId ||
    nextTitle !== current.title ||
    nextPreview !== current.previewText;

  if (!changed) {
    return current;
  }

  const ts = now();
  const db = getDb();

  const removedAssets = db.transaction(() => {
    db.prepare(
      `UPDATE notes
       SET listId = ?, title = ?, contentMd = ?, previewText = ?, updatedAt = ?
       WHERE id = ?`
    ).run(nextListId, nextTitle, normalizedNextContentMd, nextPreview, ts, input.id);

    return syncNoteAssetLinksInTx(input.id, normalizedNextContentMd, ts);
  })();

  await cleanupRemovedAssets(removedAssets);
  syncNoteSearchDoc(input.id);

  return {
    id: input.id,
    listId: nextListId,
    title: nextTitle,
    contentMd: normalizedNextContentMd,
    previewText: nextPreview,
    createdAt: current.createdAt,
    updatedAt: ts,
  };
}

export async function deleteNote(input: { id: string }) {
  const db = getDb();

  const removedAssets = db.transaction((noteId: string) => {
    const note = db.prepare("SELECT id FROM notes WHERE id = ?").get(noteId) as { id: string } | undefined;
    if (!note) {
      return undefined;
    }

    const assets = db
      .prepare(
        `SELECT DISTINCT l.assetId AS assetId, a.filePath AS filePath
         FROM asset_links l
         JOIN assets a ON a.id = l.assetId
         WHERE l.ownerType = ? AND l.ownerId = ? AND l.role = ?`
      )
      .all(NOTE_OWNER_TYPE, noteId, NOTE_INLINE_ASSET_ROLE) as RemovedAsset[];

    db.prepare("DELETE FROM asset_links WHERE ownerType = ? AND ownerId = ?").run(NOTE_OWNER_TYPE, noteId);
    db.prepare("UPDATE sessions SET linkedNoteId = NULL WHERE linkedNoteId = ?").run(noteId);
    db.prepare("DELETE FROM notes WHERE id = ?").run(noteId);

    return assets;
  })(input.id);

  if (!removedAssets) {
    return { ok: false, error: tMain("notes.noteNotFound") };
  }

  await cleanupRemovedAssets(removedAssets);
  deleteNoteSearchDoc(input.id);
  return { ok: true };
}

export async function attachAssetToNote(input: {
  noteId: string;
  src?: string;
  filePath?: string;
  mediaType?: string;
  name?: string;
}) {
  const db = getDb();
  const note = db.prepare("SELECT id FROM notes WHERE id = ?").get(input.noteId) as { id: string } | undefined;

  if (!note) {
    throw new Error(tMain("notes.noteNotFound"));
  }

  const draftAssetId = uuidV7();
  const persisted = await persistAssetToStore({ ...input, assetId: draftAssetId });
  if (!persisted) {
    throw new Error(tMain("notes.imageSaveFailed"));
  }

  const existingAsset = db
    .prepare("SELECT id, mediaType, size, width, height, createdAt FROM assets WHERE filePath = ?")
    .get(persisted.filePath) as {
    id: string;
    mediaType: string | null;
    size: number | null;
    width: number | null;
    height: number | null;
    createdAt: number;
  } | undefined;

  const createdAt = now();
  const effectiveAssetId = existingAsset?.id || draftAssetId;
  const dims = existingAsset
    ? { width: existingAsset.width ?? undefined, height: existingAsset.height ?? undefined }
    : getImageDimensions(persisted.filePath, persisted.mediaType);

  const commitTx = db.transaction(() => {
    if (!existingAsset) {
      db.prepare(
        `INSERT INTO assets (id, filePath, mediaType, size, width, height, sha256, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`
      ).run(
        effectiveAssetId,
        persisted.filePath,
        persisted.mediaType,
        persisted.size,
        dims.width ?? null,
        dims.height ?? null,
        createdAt,
        createdAt
      );
    }

    const existedLink = db
      .prepare(
        `SELECT id FROM asset_links
         WHERE ownerType = ? AND ownerId = ? AND role = ? AND assetId = ?
         LIMIT 1`
      )
      .get(NOTE_OWNER_TYPE, input.noteId, NOTE_INLINE_ASSET_ROLE, effectiveAssetId) as { id: string } | undefined;

    if (!existedLink) {
      const countRow = db
        .prepare(
          `SELECT COUNT(1) AS c
           FROM asset_links
           WHERE ownerType = ? AND ownerId = ? AND role = ?`
        )
        .get(NOTE_OWNER_TYPE, input.noteId, NOTE_INLINE_ASSET_ROLE) as { c: number };

      db.prepare(
        `INSERT INTO asset_links (id, assetId, ownerType, ownerId, role, sortOrder, createdAt, metaJson)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        uuidV7(),
        effectiveAssetId,
        NOTE_OWNER_TYPE,
        input.noteId,
        NOTE_INLINE_ASSET_ROLE,
        countRow.c || 0,
        createdAt,
        null
      );
    }

    db.prepare("UPDATE notes SET updatedAt = ? WHERE id = ?").run(now(), input.noteId);
  });

  try {
    commitTx();
  } catch (error) {
    if (persisted.wroteNewFile) {
      try {
        await fs.unlink(persisted.filePath);
      } catch {
        // ignore
      }
    }
    throw error;
  }

  const displayName = (input.name || "").trim() || path.basename(input.filePath || "") || "image";

  return {
    assetId: effectiveAssetId,
    url: `asset://${effectiveAssetId}`,
    mediaType: existingAsset?.mediaType || persisted.mediaType,
    width: dims.width,
    height: dims.height,
    name: displayName,
  };
}

export function getAssetFileById(assetId: string): { id: string; filePath: string; mediaType?: string } | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT id, filePath, mediaType FROM assets WHERE id = ?")
    .get(assetId) as { id: string; filePath: string; mediaType: string | null } | undefined;

  if (!row) return undefined;
  return {
    id: row.id,
    filePath: row.filePath,
    mediaType: row.mediaType || undefined,
  };
}
