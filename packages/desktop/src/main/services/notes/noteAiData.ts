import { nanoid } from "nanoid";
import type { MessageContentPart } from "@shared";
import { getDb } from "../db";
import { tMain } from "../../i18n";

export type NoteAiRole = "user" | "assistant";
export type NoteAiMessageStatus = "pending" | "streaming" | "success" | "aborted" | "error";

export type NoteAiSession = {
  id: string;
  noteId: string;
  selectedModel: string;
  contextMode: string;
  lastMessageAt: number;
  createdAt: number;
  updatedAt: number;
};

export type NoteAiMessage = {
  id: string;
  sessionId: string;
  requestId: string;
  role: NoteAiRole;
  parts: MessageContentPart[];
  status: NoteAiMessageStatus;
  error?: string | null;
  tokenUsage?: { inputTokens: number | null; outputTokens: number | null } | null;
  metaJson?: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
};

type NoteAiSessionRow = {
  id: string;
  noteId: string;
  selectedModel: string;
  contextMode: string;
  lastMessageAt: number;
  createdAt: number;
  updatedAt: number;
};

type NoteAiMessageRow = {
  id: string;
  sessionId: string;
  requestId: string;
  role: string;
  parts: string;
  status: string;
  error: string | null;
  tokenUsage: string | null;
  metaJson: string | null;
  createdAt: number;
  updatedAt: number;
};

function now() {
  return Date.now();
}

function parseJsonObject(input: string | null): Record<string, unknown> | null {
  if (!input) return null;
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseParts(input: string): MessageContentPart[] {
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? (parsed as MessageContentPart[]) : [];
  } catch {
    return [];
  }
}

function stringifyParts(parts: MessageContentPart[] | undefined) {
  return JSON.stringify(parts ?? []);
}

function parseTokenUsage(input: string | null): { inputTokens: number | null; outputTokens: number | null } | null {
  if (!input) return null;
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== "object") return null;
    const inputTokens = "inputTokens" in parsed ? Number((parsed as any).inputTokens) : null;
    const outputTokens = "outputTokens" in parsed ? Number((parsed as any).outputTokens) : null;
    return {
      inputTokens: Number.isFinite(inputTokens) ? inputTokens : null,
      outputTokens: Number.isFinite(outputTokens) ? outputTokens : null,
    };
  } catch {
    return null;
  }
}

function parseRole(role: string): NoteAiRole {
  return role === "assistant" ? "assistant" : "user";
}

function parseStatus(status: string): NoteAiMessageStatus {
  if (status === "pending" || status === "streaming" || status === "success" || status === "aborted" || status === "error") {
    return status;
  }
  return "error";
}

function rowToSession(row: NoteAiSessionRow): NoteAiSession {
  return {
    id: row.id,
    noteId: row.noteId,
    selectedModel: row.selectedModel || "",
    contextMode: row.contextMode || "full",
    lastMessageAt: Number(row.lastMessageAt) || 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToMessage(row: NoteAiMessageRow): NoteAiMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    requestId: row.requestId,
    role: parseRole(row.role),
    parts: parseParts(row.parts),
    status: parseStatus(row.status),
    error: row.error ?? null,
    tokenUsage: parseTokenUsage(row.tokenUsage),
    metaJson: parseJsonObject(row.metaJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function ensureNoteExists(noteId: string) {
  const db = getDb();
  const row = db.prepare("SELECT id FROM notes WHERE id = ?").get(noteId) as { id: string } | undefined;
  if (!row) {
    throw new Error(tMain("notes.noteNotFound"));
  }
}

export function getNoteAiSessionByNoteId(noteId: string): NoteAiSession | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM note_ai_sessions
       WHERE noteId = ?
       ORDER BY createdAt DESC
       LIMIT 1`
    )
    .get(noteId) as NoteAiSessionRow | undefined;
  return row ? rowToSession(row) : null;
}

export function getNoteAiSessionById(id: string): NoteAiSession | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM note_ai_sessions WHERE id = ? LIMIT 1")
    .get(id) as NoteAiSessionRow | undefined;
  return row ? rowToSession(row) : null;
}

export function listNoteAiSessionsByNoteId(noteId: string): NoteAiSession[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM note_ai_sessions
       WHERE noteId = ?
       ORDER BY createdAt DESC`
    )
    .all(noteId) as NoteAiSessionRow[];
  return rows.map(rowToSession);
}

export function getOrCreateNoteAiSession(noteId: string, selectedModel?: string | null, contextMode?: string | null): NoteAiSession {
  const db = getDb();
  const ts = now();
  const normalizedModel = String(selectedModel || "").trim();
  const normalizedContextMode = String(contextMode || "").trim();
  const existing = getNoteAiSessionByNoteId(noteId);
  if (existing) {
    const nextModel = normalizedModel || existing.selectedModel || "";
    const nextContextMode = normalizedContextMode || existing.contextMode || "full";
    db.prepare(
      `UPDATE note_ai_sessions
       SET selectedModel = ?, contextMode = ?, updatedAt = ?
       WHERE id = ?`
    ).run(nextModel, nextContextMode, ts, existing.id);
    return {
      ...existing,
      selectedModel: nextModel,
      contextMode: nextContextMode,
      updatedAt: ts,
    };
  }

  ensureNoteExists(noteId);
  const session: NoteAiSession = {
    id: nanoid(),
    noteId,
    selectedModel: normalizedModel,
    contextMode: normalizedContextMode || "full",
    lastMessageAt: 0,
    createdAt: ts,
    updatedAt: ts,
  };
  db.prepare(
    `INSERT INTO note_ai_sessions (id, noteId, selectedModel, contextMode, lastMessageAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(session.id, session.noteId, session.selectedModel, session.contextMode, session.lastMessageAt, session.createdAt, session.updatedAt);
  return session;
}

export function createNoteAiSession(noteId: string, selectedModel?: string | null, contextMode?: string | null): NoteAiSession {
  const db = getDb();
  const normalizedModel = String(selectedModel || "").trim();
  const normalizedContextMode = String(contextMode || "").trim();
  ensureNoteExists(noteId);
  const ts = now();
  const session: NoteAiSession = {
    id: nanoid(),
    noteId,
    selectedModel: normalizedModel,
    contextMode: normalizedContextMode || "full",
    lastMessageAt: 0,
    createdAt: ts,
    updatedAt: ts,
  };
  db.prepare(
    `INSERT INTO note_ai_sessions (id, noteId, selectedModel, contextMode, lastMessageAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(session.id, session.noteId, session.selectedModel, session.contextMode, session.lastMessageAt, session.createdAt, session.updatedAt);
  return session;
}

export function updateNoteAiSessionModel(sessionId: string, selectedModel?: string | null): void {
  const normalizedModel = String(selectedModel || "").trim();
  if (!normalizedModel) return;
  const db = getDb();
  db.prepare(
    `UPDATE note_ai_sessions
     SET selectedModel = ?, updatedAt = ?
     WHERE id = ?`
  ).run(normalizedModel, now(), sessionId);
}

export function updateNoteAiSessionContextMode(sessionId: string, contextMode: string): void {
  const normalized = String(contextMode || "").trim() || "full";
  const db = getDb();
  db.prepare(
    `UPDATE note_ai_sessions
     SET contextMode = ?, updatedAt = ?
     WHERE id = ?`
  ).run(normalized, now(), sessionId);
}

export function listNoteAiMessages(sessionId: string): NoteAiMessage[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM note_ai_messages
       WHERE sessionId = ?
       ORDER BY
         createdAt ASC,
         CASE role WHEN 'user' THEN 0 ELSE 1 END ASC,
         id ASC`
    )
    .all(sessionId) as NoteAiMessageRow[];
  return rows.map(rowToMessage);
}

export function createNoteAiMessage(input: {
  id?: string;
  sessionId: string;
  requestId: string;
  role: NoteAiRole;
  parts?: MessageContentPart[];
  status?: NoteAiMessageStatus;
  error?: string | null;
  tokenUsage?: { inputTokens: number | null; outputTokens: number | null } | null;
  metaJson?: Record<string, unknown> | null;
}): NoteAiMessage {
  const db = getDb();
  const ts = now();
  const message: NoteAiMessage = {
    id: input.id || nanoid(),
    sessionId: input.sessionId,
    requestId: String(input.requestId || "").trim(),
    role: input.role,
    parts: input.parts ?? [],
    status: input.status ?? "success",
    error: input.error ?? null,
    tokenUsage: input.tokenUsage ?? null,
    metaJson: input.metaJson ?? null,
    createdAt: ts,
    updatedAt: ts,
  };

  db.prepare(
    `INSERT INTO note_ai_messages (
      id, sessionId, requestId, role, parts, status, error, tokenUsage, metaJson, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    message.id,
    message.sessionId,
    message.requestId,
    message.role,
    stringifyParts(message.parts),
    message.status,
    message.error ?? null,
    message.tokenUsage ? JSON.stringify(message.tokenUsage) : null,
    message.metaJson ? JSON.stringify(message.metaJson) : null,
    message.createdAt,
    message.updatedAt
  );

  db.prepare(
    `UPDATE note_ai_sessions
     SET lastMessageAt = ?, updatedAt = ?
     WHERE id = ?`
  ).run(ts, ts, message.sessionId);

  return message;
}

export function getNoteAiMessage(id: string): NoteAiMessage | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM note_ai_messages WHERE id = ? LIMIT 1")
    .get(id) as NoteAiMessageRow | undefined;
  return row ? rowToMessage(row) : null;
}

export function findNoteAiMessageByRequestAndRole(
  sessionId: string,
  requestId: string,
  role: NoteAiRole
): NoteAiMessage | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM note_ai_messages
       WHERE sessionId = ? AND requestId = ? AND role = ?
       ORDER BY createdAt DESC
       LIMIT 1`
    )
    .get(sessionId, requestId, role) as NoteAiMessageRow | undefined;
  return row ? rowToMessage(row) : null;
}

export function updateNoteAiMessage(
  id: string,
  updates: {
    requestId?: string;
    parts?: MessageContentPart[];
    status?: NoteAiMessageStatus;
    error?: string | null;
    tokenUsage?: { inputTokens: number | null; outputTokens: number | null } | null;
    metaJson?: Record<string, unknown> | null;
  }
): NoteAiMessage | null {
  const db = getDb();
  const existing = getNoteAiMessage(id);
  if (!existing) return null;

  const ts = now();
  const sets: string[] = ["updatedAt = ?"];
  const values: unknown[] = [ts];

  if (updates.requestId !== undefined) {
    sets.push("requestId = ?");
    values.push(String(updates.requestId || "").trim());
  }
  if (updates.parts !== undefined) {
    sets.push("parts = ?");
    values.push(stringifyParts(updates.parts));
  }
  if (updates.status !== undefined) {
    sets.push("status = ?");
    values.push(updates.status);
  }
  if (updates.error !== undefined) {
    sets.push("error = ?");
    values.push(updates.error ?? null);
  }
  if (updates.tokenUsage !== undefined) {
    sets.push("tokenUsage = ?");
    values.push(updates.tokenUsage ? JSON.stringify(updates.tokenUsage) : null);
  }
  if (updates.metaJson !== undefined) {
    sets.push("metaJson = ?");
    values.push(updates.metaJson ? JSON.stringify(updates.metaJson) : null);
  }
  values.push(id);

  db.prepare(`UPDATE note_ai_messages SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  db.prepare(
    `UPDATE note_ai_sessions
     SET lastMessageAt = ?, updatedAt = ?
     WHERE id = ?`
  ).run(ts, ts, existing.sessionId);
  return getNoteAiMessage(id);
}
