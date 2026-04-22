import { nanoid as nanoId } from "nanoid";
import { getDb } from "../db";
import type { ChatMode, WebSearchMode } from "./sessionData";
import type { Turn, TurnStatus } from "@shared";
import type { ThinkingMode, ToolApprovalMode } from "@shared";

type TurnRow = {
  id: string;
  sessionId: string;
  userMessageId: string | null;
  assistantMessageId: string | null;
  parentTurnId: string | null;
  triggerType: string;
  status: string;
  selectedModel: string;
  mcpServerIds: string | null;
  mode: string | null;
  toolApprovalMode: string | null;
  webSearch: string | null;
  thinking: string | null;
  effectiveThinking: string | null;
  skillId: string | null;
  citationRequired: number;
  citationStartIndex: number;
  tokenUsage: string | null;
  stateText: string | null;
  briefText: string | null;
  error: string | null;
  suggestions: string | null;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type MessageRefRow = {
  id: string;
  role: string;
  turnId: string | null;
};

function buildMessageRefMap(sessionId: string): Map<string, MessageRefRow> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, role, turnId
    FROM messages
    WHERE sessionId = ?
  `).all(sessionId) as MessageRefRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

function isTurnMessageRefConsistent(
  turn: Turn,
  messageRefs: Map<string, MessageRefRow>
): boolean {
  const userMessageId = turn.userMessageId ?? null;
  const assistantMessageId = turn.assistantMessageId ?? null;
  if (!userMessageId || !assistantMessageId) {
    return false;
  }
  const userRef = messageRefs.get(userMessageId);
  const assistantRef = messageRefs.get(assistantMessageId);
  if (!userRef || !assistantRef) {
    return false;
  }
  if (userRef.role !== "user" || assistantRef.role !== "assistant") {
    return false;
  }
  return userRef.turnId === turn.id && assistantRef.turnId === turn.id;
}

function normalizeThinkingMode(value: string | null): ThinkingMode | undefined {
  if (
    value === "auto"
    || value === "off"
    || value === "on"
    || value === "standard"
    || value === "deep"
    || value === "ultra"
  ) {
    return value;
  }
  return undefined;
}

function normalizeToolApprovalMode(value: string | null): ToolApprovalMode | undefined {
  return value === "auto" ? "auto" : value === "default" ? "default" : undefined;
}

function parseTurn(row: TurnRow): Turn {
  return {
    id: row.id,
    sessionId: row.sessionId,
    userMessageId: row.userMessageId,
    assistantMessageId: row.assistantMessageId,
    parentTurnId: row.parentTurnId,
    triggerType: row.triggerType as Turn["triggerType"],
    status: row.status as TurnStatus,
    selectedModel: row.selectedModel,
    mcpServerIds: row.mcpServerIds ? JSON.parse(row.mcpServerIds) : undefined,
    mode: row.mode as ChatMode | undefined,
    toolApprovalMode: normalizeToolApprovalMode(row.toolApprovalMode),
    webSearch: row.webSearch as WebSearchMode | undefined,
    thinking: normalizeThinkingMode(row.thinking),
    effectiveThinking: normalizeThinkingMode(row.effectiveThinking),
    skillId: row.skillId,
    citationRequired: row.citationRequired === 1,
    citationStartIndex: row.citationStartIndex,
    tokenUsage: row.tokenUsage ? JSON.parse(row.tokenUsage) : undefined,
    stateText: row.stateText ?? null,
    briefText: row.briefText ?? null,
    error: row.error,
    suggestions: row.suggestions ? JSON.parse(row.suggestions) : undefined,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createTurn(params: {
  id?: string;
  sessionId: string;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  parentTurnId?: string | null;
  triggerType: Turn["triggerType"];
  status?: TurnStatus;
  selectedModel: string;
  mcpServerIds?: string[];
  mode?: ChatMode;
  toolApprovalMode?: ToolApprovalMode;
  webSearch?: WebSearchMode;
  thinking?: ThinkingMode;
  effectiveThinking?: ThinkingMode;
  skillId?: string | null;
  citationRequired?: boolean;
  citationStartIndex?: number;
}): Turn {
  const db = getDb();
  const now = Date.now();
  const turn: Turn = {
    id: params.id || nanoId(),
    sessionId: params.sessionId,
    userMessageId: params.userMessageId ?? null,
    assistantMessageId: params.assistantMessageId ?? null,
    parentTurnId: params.parentTurnId ?? null,
    triggerType: params.triggerType,
    status: params.status ?? "pending",
    selectedModel: params.selectedModel,
    mcpServerIds: params.mcpServerIds,
    mode: params.mode,
    toolApprovalMode: params.toolApprovalMode,
    webSearch: params.webSearch,
    thinking: params.thinking,
    effectiveThinking: params.effectiveThinking,
    skillId: params.skillId ?? null,
    citationRequired: params.citationRequired ?? false,
    citationStartIndex: params.citationStartIndex ?? 0,
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(`
    INSERT INTO turns (
      id, sessionId, userMessageId, assistantMessageId, parentTurnId,
      triggerType, status, selectedModel, mcpServerIds, mode, toolApprovalMode, webSearch, thinking, effectiveThinking, skillId,
      citationRequired, citationStartIndex, tokenUsage, stateText, briefText, error, startedAt, endedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    turn.id,
    turn.sessionId,
    turn.userMessageId ?? null,
    turn.assistantMessageId ?? null,
    turn.parentTurnId ?? null,
    turn.triggerType,
    turn.status,
    turn.selectedModel ?? "",
    turn.mcpServerIds?.length ? JSON.stringify(turn.mcpServerIds) : null,
    turn.mode ?? null,
    turn.toolApprovalMode ?? null,
    turn.webSearch ?? null,
    turn.thinking ?? null,
    turn.effectiveThinking ?? null,
    turn.skillId ?? null,
    turn.citationRequired ? 1 : 0,
    turn.citationStartIndex ?? 0,
    null,
    null,
    null,
    null,
    turn.startedAt,
    null,
    turn.createdAt,
    turn.updatedAt
  );

  return turn;
}

export function getTurn(id: string): Turn | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM turns WHERE id = ?`).get(id) as TurnRow | undefined;
  return row ? parseTurn(row) : null;
}

export function getLatestTurnBySession(sessionId: string): Turn | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM turns WHERE sessionId = ? ORDER BY createdAt DESC LIMIT 1`).get(sessionId) as TurnRow | undefined;
  return row ? parseTurn(row) : null;
}

export function listTurnsBySession(sessionId: string): Turn[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM turns WHERE sessionId = ? ORDER BY createdAt ASC`).all(sessionId) as TurnRow[];
  const parsed = rows.map(parseTurn);
  const messageRefs = buildMessageRefMap(sessionId);
  return parsed.filter((turn) => isTurnMessageRefConsistent(turn, messageRefs));
}

export function getLatestTurnByAssistantMessageId(assistantMessageId: string): Turn | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT t.* FROM turns t
    INNER JOIN messages m ON m.id = t.assistantMessageId
    WHERE t.assistantMessageId = ?
      AND m.role = 'assistant'
      AND m.turnId = t.id
    ORDER BY t.createdAt DESC
    LIMIT 1
  `).get(assistantMessageId) as TurnRow | undefined;
  return row ? parseTurn(row) : null;
}

export function getLatestTurnByUserMessageId(userMessageId: string): Turn | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT t.* FROM turns t
    INNER JOIN messages m ON m.id = t.userMessageId
    WHERE t.userMessageId = ?
      AND m.role = 'user'
      AND m.turnId = t.id
    ORDER BY t.createdAt DESC
    LIMIT 1
  `).get(userMessageId) as TurnRow | undefined;
  return row ? parseTurn(row) : null;
}

export function updateTurn(
  id: string,
  updates: {
    userMessageId?: string | null;
    assistantMessageId?: string | null;
    parentTurnId?: string | null;
    selectedModel?: string;
    mcpServerIds?: string[] | null;
    mode?: ChatMode;
    toolApprovalMode?: ToolApprovalMode;
    webSearch?: WebSearchMode;
    status?: TurnStatus;
    tokenUsage?: { inputTokens: number | null; outputTokens: number | null } | null;
    stateText?: string | null;
    briefText?: string | null;
    error?: string | null;
    endedAt?: number | null;
    thinking?: ThinkingMode;
    effectiveThinking?: ThinkingMode;
    skillId?: string | null;
    citationRequired?: boolean;
    citationStartIndex?: number;
    suggestions?: string[];
  }
) {
  const db = getDb();
  const now = Date.now();
  const sets: string[] = ["updatedAt = ?"];
  const values: any[] = [now];

  if (updates.userMessageId !== undefined) {
    sets.push("userMessageId = ?");
    values.push(updates.userMessageId ?? null);
  }
  if (updates.assistantMessageId !== undefined) {
    sets.push("assistantMessageId = ?");
    values.push(updates.assistantMessageId ?? null);
  }
  if (updates.parentTurnId !== undefined) {
    sets.push("parentTurnId = ?");
    values.push(updates.parentTurnId ?? null);
  }
  if (updates.selectedModel !== undefined) {
    sets.push("selectedModel = ?");
    values.push(updates.selectedModel);
  }
  if (updates.mcpServerIds !== undefined) {
    sets.push("mcpServerIds = ?");
    values.push(updates.mcpServerIds?.length ? JSON.stringify(updates.mcpServerIds) : null);
  }
  if (updates.mode !== undefined) {
    sets.push("mode = ?");
    values.push(updates.mode ?? null);
  }
  if (updates.toolApprovalMode !== undefined) {
    sets.push("toolApprovalMode = ?");
    values.push(updates.toolApprovalMode ?? null);
  }
  if (updates.webSearch !== undefined) {
    sets.push("webSearch = ?");
    values.push(updates.webSearch ?? null);
  }
  if (updates.status !== undefined) {
    sets.push("status = ?");
    values.push(updates.status);
  }
  if (updates.tokenUsage !== undefined) {
    sets.push("tokenUsage = ?");
    values.push(updates.tokenUsage ? JSON.stringify(updates.tokenUsage) : null);
  }
  if (updates.stateText !== undefined) {
    sets.push("stateText = ?");
    values.push(updates.stateText ?? null);
  }
  if (updates.briefText !== undefined) {
    sets.push("briefText = ?");
    values.push(updates.briefText ?? null);
  }
  if (updates.error !== undefined) {
    sets.push("error = ?");
    values.push(updates.error ?? null);
  }
  if (updates.endedAt !== undefined) {
    sets.push("endedAt = ?");
    values.push(updates.endedAt ?? null);
  }
  if (updates.thinking !== undefined) {
    sets.push("thinking = ?");
    values.push(updates.thinking ?? null);
  }
  if (updates.effectiveThinking !== undefined) {
    sets.push("effectiveThinking = ?");
    values.push(updates.effectiveThinking ?? null);
  }
  if (updates.skillId !== undefined) {
    sets.push("skillId = ?");
    values.push(updates.skillId ?? null);
  }
  if (updates.citationRequired !== undefined) {
    sets.push("citationRequired = ?");
    values.push(updates.citationRequired ? 1 : 0);
  }
  if (updates.citationStartIndex !== undefined) {
    sets.push("citationStartIndex = ?");
    values.push(updates.citationStartIndex);
  }
  if (updates.suggestions !== undefined) {
    sets.push("suggestions = ?");
    values.push(updates.suggestions?.length ? JSON.stringify(updates.suggestions) : null);
  }

  values.push(id);
  db.prepare(`UPDATE turns SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}
