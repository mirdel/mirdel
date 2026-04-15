import { getDb } from "../db";
import { nanoid as nanoId } from "nanoid";
import type { Message, MessageContentPart, CitationSource, MessageRole, HistoricalMemoryRecall } from "@shared";
import {
  deleteMessageSearchDoc,
  deleteMessageSearchDocsByTurnId,
  syncMessageSearchDoc,
} from "./chatSearchIndex";
import {
  deleteHistoricalMemoryByMessageId,
  deleteHistoricalMemoryByTurnId,
} from "./historicalMemoryData";
import { tMain } from "../../i18n";

export type MessageStatus = "pending" | "streaming" | "success" | "aborted" | "error";

type MessageRow = {
  id: string;
  sessionId: string;
  turnId: string | null;
  role: string;
  parts: string;
  status: string;
  copiedFromMessageId: string | null;
  isShared: number;
  isDeleted: number;
  deletedAt: number | null;
  userEdited: number;
  tokenUsage: string | null;  // JSON 字符串：{ inputTokens, outputTokens }
  contextSources: string | null;  // JSON 字符串：CitationSource[]，仅 user 消息且本回合有 KB 时
  historicalMemory: string | null; // JSON 字符串：HistoricalMemoryRecall，仅 assistant 消息
  createdAt: number;
  updatedAt: number;
};

function parseParts(json: string): MessageContentPart[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed as MessageContentPart[];
    }
    // 防御：如果不是数组，包装成单个 text
    return [{ type: "text", text: String(json) }];
  } catch {
    // 解析失败，退化为单个 text
    return [{ type: "text", text: String(json) }];
  }
}

function stringifyParts(parts: MessageContentPart[]): string {
  return JSON.stringify(parts ?? []);
}

type TokenUsage = { inputTokens: number | null; outputTokens: number | null };

function parseTokenUsage(json: string | null): TokenUsage | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as TokenUsage;
  } catch {
    return undefined;
  }
}

function parseContextSources(json: string | null): CitationSource[] | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as CitationSource[]) : undefined;
  } catch {
    return undefined;
  }
}

function parseHistoricalMemory(json: string | null): HistoricalMemoryRecall | undefined {
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json) as HistoricalMemoryRecall;
    return parsed && Array.isArray(parsed.hits) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stringifyTokenUsage(tokenUsage: TokenUsage | undefined): string | null {
  if (!tokenUsage) return null;
  return JSON.stringify(tokenUsage);
}

function deleteHistoricalMemoryByTurnIds(turnIds: Array<string | null | undefined>): void {
  for (const turnId of new Set(turnIds.filter((value): value is string => !!value))) {
    deleteHistoricalMemoryByTurnId(turnId);
  }
}

/**
 * 获取会话的所有消息，按 createdAt ASC 排序
 */
export function listMessages(sessionId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM messages WHERE sessionId = ? ORDER BY createdAt ASC`)
    .all(sessionId) as MessageRow[];

  return rows.map((r) => ({
    id: r.id,
    sessionId: r.sessionId,
    turnId: r.turnId ?? undefined,
    role: r.role as MessageRole,
    parts: parseParts(r.parts),
    status: r.status as MessageStatus,
    copiedFromMessageId: r.copiedFromMessageId ?? undefined,
    isShared: r.isShared === 1,
    isDeleted: r.isDeleted === 1,
    deletedAt: r.deletedAt ?? undefined,
    userEdited: r.userEdited === 1,
    tokenUsage: parseTokenUsage(r.tokenUsage),
    contextSources: parseContextSources(r.contextSources ?? null),
    historicalMemory: parseHistoricalMemory(r.historicalMemory ?? null),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * 创建用户消息
 */
export function createUserMessage(params: {
  sessionId: string;
  turnId?: string;
  parts: MessageContentPart[];
  contextSources?: CitationSource[];
}): Message {
  const db = getDb();
  const now = Date.now();
  const messageId = nanoId();
  
  const message: Message = {
    id: messageId,
    sessionId: params.sessionId,
    turnId: params.turnId,
    role: "user",
    parts: params.parts,
    status: "success",
    contextSources: params.contextSources,
    createdAt: now,
    updatedAt: now
  };

  db.prepare(
    `INSERT INTO messages (
      id, sessionId, turnId, role, parts, status,
      copiedFromMessageId, isShared, isDeleted, deletedAt, userEdited, contextSources, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    message.id,
    message.sessionId,
    message.turnId ?? null,
    message.role,
    stringifyParts(message.parts),
    message.status,
    null,  // copiedFromMessageId
    0,     // isShared
    0,     // isDeleted
    null,  // deletedAt
    0,     // userEdited
    params.contextSources ? JSON.stringify(params.contextSources) : null,
    message.createdAt,
    message.updatedAt
  );

  syncMessageSearchDoc(message.id);
  return message;
}

/**
 * 创建助手消息
 */
export function createAssistantMessage(params: {
  id?: string;  // 可选的外部 ID（前端生成）
  sessionId: string;
  turnId?: string;
  parts?: MessageContentPart[];
  status?: MessageStatus;
}): Message {
  const db = getDb();
  const now = Date.now();
  const messageId = params.id || nanoId();  // 🆕 优先使用传入的 ID
  
  const message: Message = {
    id: messageId,
    sessionId: params.sessionId,
    turnId: params.turnId,
    role: "assistant",
    parts: params.parts ?? [{ type: "text", text: "" }],
    status: params.status || "pending",
    createdAt: now,
    updatedAt: now
  };

  db.prepare(
    `INSERT INTO messages (
      id, sessionId, turnId, role, parts, status,
      copiedFromMessageId, isShared, isDeleted, deletedAt, userEdited, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    message.id,
    message.sessionId,
    message.turnId ?? null,
    message.role,
    stringifyParts(message.parts),
    message.status,
    null,  // copiedFromMessageId
    0,     // isShared
    0,     // isDeleted
    null,  // deletedAt
    0,     // userEdited
    message.createdAt,
    message.updatedAt
  );

  if (message.status === "success" || message.status === "aborted") {
    syncMessageSearchDoc(message.id);
  }
  return message;
}

/**
 * 获取单条消息
 */
export function getMessage(id: string): Message | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM messages WHERE id = ?`)
    .get(id) as MessageRow | undefined;

  if (!row) return null;

  return {
    id: row.id,
    sessionId: row.sessionId,
    turnId: row.turnId ?? undefined,
    role: row.role as MessageRole,
    parts: parseParts(row.parts),
    status: row.status as MessageStatus,
    copiedFromMessageId: row.copiedFromMessageId ?? undefined,
    isShared: row.isShared === 1,
    isDeleted: row.isDeleted === 1,
    deletedAt: row.deletedAt ?? undefined,
    userEdited: row.userEdited === 1,
    tokenUsage: parseTokenUsage(row.tokenUsage),
    contextSources: parseContextSources(row.contextSources ?? null),
    historicalMemory: parseHistoricalMemory(row.historicalMemory ?? null),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 更新消息内容和状态
 */
export function updateMessage(
  id: string,
  updates: { 
    parts?: MessageContentPart[];
    status?: MessageStatus; 
    isDeleted?: boolean;
    deletedAt?: number | null;
    userEdited?: boolean;
    turnId?: string | null;
    tokenUsage?: { inputTokens: number | null; outputTokens: number | null };
    contextSources?: CitationSource[];
    historicalMemory?: HistoricalMemoryRecall;
  }
) {
  const db = getDb();
  const shouldConsiderSearchSync =
    updates.parts !== undefined ||
    updates.status !== undefined ||
    updates.isDeleted !== undefined ||
    updates.deletedAt !== undefined ||
    updates.turnId !== undefined;
  const previous = shouldConsiderSearchSync ? getMessage(id) : null;
  const now = Date.now();

  const sets: string[] = ["updatedAt = ?"];
  const values: any[] = [now];

  if (updates.parts !== undefined) {
    sets.push("parts = ?");
    values.push(stringifyParts(updates.parts));
  }

  if (updates.status !== undefined) {
    sets.push("status = ?");
    values.push(updates.status);
  }

  if (updates.isDeleted !== undefined) {
    sets.push("isDeleted = ?");
    values.push(updates.isDeleted ? 1 : 0);
  }

  if (updates.deletedAt !== undefined) {
    sets.push("deletedAt = ?");
    values.push(updates.deletedAt);
  }

  if (updates.userEdited !== undefined) {
    sets.push("userEdited = ?");
    values.push(updates.userEdited ? 1 : 0);
  }

  if (updates.turnId !== undefined) {
    sets.push("turnId = ?");
    values.push(updates.turnId ?? null);
  }

  if (updates.tokenUsage !== undefined) {
    sets.push("tokenUsage = ?");
    values.push(stringifyTokenUsage(updates.tokenUsage));
  }

  if (updates.contextSources !== undefined) {
    sets.push("contextSources = ?");
    values.push(updates.contextSources?.length ? JSON.stringify(updates.contextSources) : null);
  }

  if (updates.historicalMemory !== undefined) {
    sets.push("historicalMemory = ?");
    values.push(updates.historicalMemory?.hits?.length ? JSON.stringify(updates.historicalMemory) : null);
  }

  values.push(id);

  db.prepare(`UPDATE messages SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values
  );

  if (!shouldConsiderSearchSync) {
    return;
  }

  const nextStatus = updates.status ?? previous?.status;
  const shouldSyncNow =
    updates.isDeleted !== undefined ||
    updates.deletedAt !== undefined ||
    nextStatus === "success" ||
    nextStatus === "aborted" ||
    (updates.parts !== undefined && (previous?.status === "success" || previous?.status === "aborted"));

  if (shouldSyncNow) {
    syncMessageSearchDoc(id);
  }

  if (
    (updates.parts !== undefined ||
      updates.status !== undefined ||
      updates.isDeleted !== undefined ||
      updates.deletedAt !== undefined ||
      updates.turnId !== undefined)
  ) {
    deleteHistoricalMemoryByTurnIds([previous?.turnId, updates.turnId]);
  }
}

/**
 * 软删除消息（标记为已删除，清空内容）
 */
export function deleteMessage(id: string) {
  const db = getDb();
  deleteHistoricalMemoryByMessageId(id);
  
  const now = Date.now();
  // 清空内容时使用 JSON 格式的空数组
  const emptyContent = stringifyParts([]);
  db.prepare(`
    UPDATE messages 
    SET isDeleted = 1, 
        parts = ?, 
        deletedAt = ?
    WHERE id = ?
  `).run(emptyContent, now, id);

  deleteMessageSearchDoc(id);
}

/**
 * 获取某条消息的"父"user消息（用于重新生成）
 * 通过遍历找到前一条 user 消息
 */
export function getParentUserMessage(messageId: string): Message | null {
  const message = getMessage(messageId);
  if (!message) return null;
  
  const allMessages = listMessages(message.sessionId);
  const index = allMessages.findIndex(m => m.id === messageId);
  
  // 往前找第一条 user 消息（不按 isDeleted 过滤，需取序列中实际的前一条）
  for (let i = index - 1; i >= 0; i--) {
    if (allMessages[i].role === 'user') {
      return allMessages[i];
    }
  }
  
  return null;
}

/**
 * 获取上下文消息（用于 AI 对话）
 * 过滤成功且未删除的消息，并限制数量
 */
export function getContextMessages(
  sessionId: string,
  limit: number
): Message[] {
  const allMessages = listMessages(sessionId);
  
  // 过滤：只取已完成（success/aborted）的消息，且未被删除
  const successMessages = allMessages
    .filter(m => (m.status === 'success' || m.status === 'aborted') && !m.isDeleted);
  
  // 取最近的 N 条
  return successMessages.slice(-limit);
}

/**
 * 根据 toolCallId 获取工具调用结果
 * 用于 system:recall_tool_output 工具
 */
export function getToolResultByCallId(
  sessionId: string,
  toolCallId: string
): { output: unknown; toolName: string; _meta?: any } | null {
  const messages = listMessages(sessionId);
  
  for (const msg of messages) {
    if (msg.role === 'assistant') {
      for (const part of msg.parts as any[]) {
        if (
          part?.type === 'dynamic-tool' &&
          part.toolCallId === toolCallId &&
          (part.state === 'output-available' || part.state === 'output-error' || part.state === 'output-denied')
        ) {
          if (part.state === 'output-available') {
            return {
              output: part.output,
              toolName: part.toolName,
              _meta: part.callProviderMetadata
            };
          }
          return {
            output: {
              isError: true,
              error:
                part.errorText ||
                (part.state === 'output-denied'
                  ? tMain("common.toolExecutionDenied")
                  : tMain("common.toolExecutionFailed"))
            },
            toolName: part.toolName,
            _meta: part.callProviderMetadata
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * 按 turnId 获取消息组
 */
export function getMessagesByTurnId(turnId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM messages WHERE turnId = ? ORDER BY createdAt ASC`)
    .all(turnId) as MessageRow[];

  return rows.map((r) => ({
    id: r.id,
    sessionId: r.sessionId,
    turnId: r.turnId ?? undefined,
    role: r.role as MessageRole,
    parts: parseParts(r.parts),
    status: r.status as MessageStatus,
    copiedFromMessageId: r.copiedFromMessageId ?? undefined,
    isShared: r.isShared === 1,
    isDeleted: r.isDeleted === 1,
    deletedAt: r.deletedAt ?? undefined,
    userEdited: r.userEdited === 1,
    tokenUsage: parseTokenUsage(r.tokenUsage),
    contextSources: parseContextSources(r.contextSources ?? null),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * 软删除整个消息组（按 turnId）
 */
export function deleteMessagesByTurnId(turnId: string) {
  const db = getDb();
  deleteHistoricalMemoryByTurnId(turnId);
  const now = Date.now();
  const emptyContent = stringifyParts([]);
  
  db.prepare(`
    UPDATE messages 
    SET isDeleted = 1, 
        parts = ?, 
        deletedAt = ?
    WHERE turnId = ?
  `).run(emptyContent, now, turnId);

  deleteMessageSearchDocsByTurnId(turnId);
}
