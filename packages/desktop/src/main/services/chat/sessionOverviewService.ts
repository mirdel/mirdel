import { getDb } from "../db";
import { tMain } from "../../i18n";
import { Session, getSession } from "./sessionData";
import { listMessages } from "./messageData";
import type { Message } from "@shared";

function safeParseJsonArray(value: unknown): string[] {
  if (!value || typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * 会话路径信息（用于总览视图）
 */
export type SessionPathInfo = {
  sessionId: string;
  title: string;
  isMain: boolean;
  messages: Message[];  // 按顺序排列的消息（聚合后：user + 最后一条 assistant）
  parentSessionId: string | null;
  forkFromMessageId: string | null;  // 父会话中的分叉点消息ID
  forkPointMessageId: string | null;  // 本会话中的分叉点消息ID
};

/**
 * 聚合消息列表用于会话地图显示
 * 规则：
 * - user 消息 → 直接保留
 * - 两个 user 之间的所有 assistant/tool 消息 → 取最后一条 assistant 消息作为代表
 * 
 * 这与前端 MessageGroup 的复制、引用逻辑保持一致（都用 lastAssistantMessage）
 */
function aggregateMessagesForOverview(messages: Message[]): Message[] {
  const result: Message[] = [];
  let lastAssistant: Message | null = null;
  
  for (const msg of messages) {
    if (msg.role === 'user') {
      // 先把之前积累的 assistant 消息推入
      if (lastAssistant) {
        result.push(lastAssistant);
        lastAssistant = null;
      }
      // 推入 user 消息
      result.push(msg);
    } else if (msg.role === 'assistant') {
      // 更新待选的 assistant 消息（取最后一条）
      lastAssistant = msg;
    }
    // tool 消息直接忽略
  }
  
  // 处理最后积累的 assistant 消息
  if (lastAssistant) {
    result.push(lastAssistant);
  }
  
  return result;
}

/**
 * 分叉点信息
 */
export type ForkPointInfo = {
  parentSessionId: string;
  parentMessageId: string;  // 父会话中的分叉点消息ID
  childSessionId: string;
  childFirstMessageId: string;  // 子会话中分叉后的第一条消息ID（非共享）
};

/**
 * 会话总览数据
 */
export type SessionOverviewData = {
  sessions: SessionPathInfo[];
  forkPoints: ForkPointInfo[];
};

/**
 * 获取会话总览数据（包含主会话和所有分支）
 */
export function getSessionOverview(rootSessionId: string): SessionOverviewData {
  const db = getDb();
  const sessions: SessionPathInfo[] = [];
  const forkPoints: ForkPointInfo[] = [];
  
  // 1. 获取主会话
  const mainSession = getSession(rootSessionId);
  if (!mainSession) {
    throw new Error(tMain("session.notFoundWithId", { sessionId: rootSessionId }));
  }
  
  // 获取主会话的显示消息并聚合
  const mainMessages = listMessages(mainSession.id);
  const aggregatedMainMessages = aggregateMessagesForOverview(mainMessages);
  
  sessions.push({
    sessionId: mainSession.id,
    title: mainSession.title,
    isMain: true,
    messages: aggregatedMainMessages,
    parentSessionId: null,
    forkFromMessageId: null,
    forkPointMessageId: null
  });
  
  // 2. 获取所有分支（按创建时间排序）
  const branches = db.prepare(`
    SELECT * FROM sessions 
    WHERE rootSessionId = ? 
    ORDER BY createdAt ASC
  `).all(rootSessionId) as any[];
  
  for (const branchRow of branches) {
    const branch: Session = {
      id: branchRow.id,
      title: branchRow.title,
      selectedModel: branchRow.selectedModel,
      scenarioId: branchRow.scenarioId,
      projectId: branchRow.projectId ?? null,
      rootSessionId: branchRow.rootSessionId,
      parentSessionId: branchRow.parentSessionId,
      forkFromMessageId: branchRow.forkFromMessageId,
      forkPointMessageId: branchRow.forkPointMessageId,
      mcpServerIds: safeParseJsonArray(branchRow.mcpServerIds),
      mcpPolicy: branchRow.mcpPolicy ?? "manual",
      mode: branchRow.mode ?? "chat",
      skillPolicy: branchRow.skillPolicy ?? "auto",
      webSearch: branchRow.webSearch ?? "builtin",
      kbIds: safeParseJsonArray(branchRow.kbIds),
      stateText: branchRow.stateText ?? null,
      briefText: branchRow.briefText ?? null,
      isTemporary: !!branchRow.isTemporary,
      temporaryType: branchRow.temporaryType === 'ask' || branchRow.temporaryType === 'session'
        ? branchRow.temporaryType
        : null,
      expiresAt: branchRow.expiresAt ?? null,
      contextCount: branchRow.contextCount ?? null,
      linkedNoteId: branchRow.linkedNoteId ?? null,
      isFavorite: !!branchRow.isFavorite,
      isArchived: !!branchRow.isArchived,
      createdAt: branchRow.createdAt,
      updatedAt: branchRow.updatedAt
    };
    
    // 获取分支的显示消息
    const allMessages = listMessages(branch.id);
    
    // 过滤出非共享消息（分叉后的新消息）并聚合
    const nonSharedMessages = allMessages.filter(msg => !msg.isShared);
    const aggregatedMessages = aggregateMessagesForOverview(nonSharedMessages);
    
    sessions.push({
      sessionId: branch.id,
      title: branch.title,
      isMain: false,
      messages: aggregatedMessages,
      parentSessionId: branch.parentSessionId,
      forkFromMessageId: branch.forkFromMessageId,
      forkPointMessageId: branch.forkPointMessageId
    });
    
    // 记录分叉点信息
    if (branch.parentSessionId && branch.forkFromMessageId && aggregatedMessages.length > 0) {
      forkPoints.push({
        parentSessionId: branch.parentSessionId,
        parentMessageId: branch.forkFromMessageId,
        childSessionId: branch.id,
        childFirstMessageId: aggregatedMessages[0].id
      });
    }
  }
  
  return {
    sessions,
    forkPoints
  };
}
