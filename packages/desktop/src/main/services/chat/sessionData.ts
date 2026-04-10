import type { ThinkingMode, WebSearchMode } from "@shared";
import { app } from "electron";
import { tMain } from "../../i18n";
import { getDb } from "../db";
import { nanoid as nanoId } from "nanoid";
import { getMessage, listMessages } from "./messageData";
import { getScenario } from "../scenarios/scenarioData";
import { getTurn } from "./turnData";
import {
  deleteSessionSearchDoc,
  syncMessageSearchDocsBySessionId,
  syncSessionSearchDoc,
} from "./chatSearchIndex";

/** 内置始终允许的目录（应用数据目录，技能等依赖），不依赖用户配置 */
export function getBuiltinWorkingDir(): string {
  return app.getPath("userData");
}

export type ChatMode = 'chat' | 'agent';
export type SessionSkillPolicy = 'auto' | 'off';
export type SessionMcpPolicy = 'auto' | 'manual' | 'off';
export type TemporarySessionType = 'session' | 'ask';
export type { WebSearchMode };

export type Session = {
  id: string;
  title: string;
  selectedModel: string;
  scenarioId: string;
  projectId: string | null;           // 项目ID（分类功能）
  rootSessionId: string | null;       // 根会话ID（顶级主会话）
  parentSessionId: string | null;     // 父会话ID（从哪个会话分叉的）
  forkFromMessageId: string | null;   // 父会话中的分叉点消息ID
  forkPointMessageId: string | null;  // 本会话中对应的消息ID
  mcpServerIds: string[];             // 会话级 MCP 服务器 ID 列表
  mcpPolicy: SessionMcpPolicy;        // MCP 策略（auto/manual/off）
  mode: ChatMode;                     // 会话模式（chat/agent）
  skillPolicy: SessionSkillPolicy;    // 技能策略（auto/off）
  webSearch: WebSearchMode;           // 网络搜索模式（builtin/native/close）
  thinking: ThinkingMode;             // 思考深度模式（auto/off/on/standard/deep/ultra）
  kbIds: string[];                    // 会话级知识库 ID 列表
  stateText?: string | null;          // 记忆系统：窗口外老消息的详细摘要
  briefText?: string | null;          // 记忆系统：全会话的精简摘要（3~6 bullet）
  stateCursorUserMessageId?: string | null; // state 摘要已处理到的 user 消息游标
  isTemporary: boolean;               // 临时会话（隐藏于会话列表，受 TTL 清理）
  temporaryType: TemporarySessionType | null; // 临时会话类型（普通临时/临时问）
  expiresAt: number | null;           // 过期时间戳（毫秒）
  contextCount?: number | null;       // 创建时固化的上下文轮数，仅影响新会话
  linkedNoteId: string | null;        // 关联的会话笔记ID
  isFavorite: boolean;                // 是否收藏（作为内置「收藏」分类）
  isArchived: boolean;                // 是否归档
  createdAt: number;
  updatedAt: number;
};

type SessionRow = {
  id: string;
  title: string;
  selectedModel: string;
  scenarioId: string;
  projectId: string | null;
  rootSessionId: string | null;
  parentSessionId: string | null;
  forkFromMessageId: string | null;
  forkPointMessageId: string | null;
  mcpServerIds: string | null;
  mcpPolicy: string | null;
  mode: string;
  skillPolicy: string | null;
  webSearch: string | null;
  thinking: string | null;
  kbIds: string | null;
  stateText?: string | null;
  briefText?: string | null;
  stateCursorUserMessageId?: string | null;
  isTemporary?: number | null;
  temporaryType?: string | null;
  expiresAt?: number | null;
  contextCount?: number | null;
  linkedNoteId?: string | null;
  isFavorite?: number | null;
  isArchived?: number | null;
  createdAt: number;
  updatedAt: number;
};

const TEMP_SESSION_TTL_MS = 6 * 60 * 60 * 1000;

function rowToSession(row: SessionRow): Session {
  const webSearch: WebSearchMode =
    row.webSearch === 'native' || row.webSearch === 'close'
      ? row.webSearch
      : (row.webSearch && row.webSearch !== 'auto' ? row.webSearch : 'builtin');
  const mcpPolicy: SessionMcpPolicy =
    row.mcpPolicy === 'off' || row.mcpPolicy === 'auto' || row.mcpPolicy === 'manual'
      ? row.mcpPolicy
      : 'manual';
  const thinking: ThinkingMode =
    row.thinking === 'off'
    || row.thinking === 'on'
    || row.thinking === 'standard'
    || row.thinking === 'deep'
    || row.thinking === 'ultra'
      ? row.thinking
      : 'auto';

  return {
    ...row,
    mcpServerIds: row.mcpServerIds ? JSON.parse(row.mcpServerIds) : [],
    mcpPolicy,
    mode: (row.mode as ChatMode) || 'chat',
    skillPolicy: row.skillPolicy === 'off' ? 'off' : 'auto',
    webSearch,
    thinking,
    kbIds: row.kbIds ? JSON.parse(row.kbIds) : [],
    stateText: row.stateText ?? null,
    briefText: row.briefText ?? null,
    stateCursorUserMessageId: row.stateCursorUserMessageId ?? null,
    isTemporary: !!row.isTemporary,
    temporaryType: row.temporaryType === 'ask' || row.temporaryType === 'session'
      ? row.temporaryType
      : null,
    expiresAt: row.expiresAt ?? null,
    contextCount: row.contextCount ?? null,
    linkedNoteId: row.linkedNoteId ?? null,
    isFavorite: !!(row.isFavorite ?? 0),
    isArchived: !!(row.isArchived ?? 0)
  };
}

/**
 * 获取所有主会话（rootSessionId = NULL）
 */
export function listMainSessions(): Session[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM sessions 
    WHERE rootSessionId IS NULL
      AND (isTemporary IS NULL OR isTemporary = 0)
    ORDER BY updatedAt DESC
  `).all() as SessionRow[];
  return rows.map(rowToSession);
}

/**
 * 获取所有会话（包括分支）
 */
export function listSessions(): Session[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM sessions
    WHERE isTemporary IS NULL OR isTemporary = 0
    ORDER BY updatedAt DESC
  `).all() as SessionRow[];
  return rows.map(rowToSession);
}

/**
 * 获取某个主会话的所有分支（不包括主会话本身）- 扁平化
 */
export function listBranches(rootSessionId: string): Session[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM sessions 
    WHERE rootSessionId = ?
      AND (isTemporary IS NULL OR isTemporary = 0)
    ORDER BY createdAt
  `).all(rootSessionId) as SessionRow[];
  return rows.map(rowToSession);
}

/**
 * 获取某个主会话的所有会话（包括主会话本身和所有分支）
 */
export function listAllSessionsInGroup(rootSessionId: string): Session[] {
  const db = getDb();
  
  // 主会话
  const main = getSession(rootSessionId);
  if (!main) return [];
  
  // 所有分支
  const branches = listBranches(rootSessionId);
  
  return [main, ...branches];
}

/**
 * 创建新会话
 */
export function createSession(
  selectedModel: string = '__default__',
  scenarioId: string = 'default-scenario',
  title: string = tMain("title.defaultNewSession"),
  projectId: string | null = null,
  mcpServerIds: string[] = [],
  mcpPolicy: SessionMcpPolicy = 'manual',
  mode: ChatMode = 'chat',
  skillPolicy: SessionSkillPolicy = 'auto',
  webSearch: WebSearchMode = 'builtin',
  thinking: ThinkingMode = 'auto',
  kbIds: string[] = [],
  isTemporary: boolean = false,
  temporaryType: TemporarySessionType | null = null
): Session {
  const db = getDb();
  const now = Date.now();
  const scenario = getScenario(scenarioId);
  const contextCount = scenario?.contextCount ?? 10;

  const session: Session = {
    id: nanoId(),
    title,
    selectedModel,
    scenarioId,
    projectId,
    rootSessionId: null,
    parentSessionId: null,
    forkFromMessageId: null,
    forkPointMessageId: null,
    mcpServerIds,
    mcpPolicy,
    mode,
    skillPolicy,
    webSearch,
    thinking,
    kbIds,
    stateCursorUserMessageId: null,
    isTemporary,
    temporaryType: isTemporary ? (temporaryType ?? 'session') : null,
    expiresAt: isTemporary ? now + TEMP_SESSION_TTL_MS : null,
    contextCount,
    linkedNoteId: null,
    isFavorite: false,
    isArchived: false,
    createdAt: now,
    updatedAt: now
  };

  db.prepare(
    `INSERT INTO sessions (
      id, title, selectedModel, scenarioId, projectId, rootSessionId, parentSessionId,
      forkFromMessageId, forkPointMessageId, mcpServerIds, mcpPolicy, mode, skillPolicy, webSearch, thinking, kbIds, isTemporary, temporaryType, expiresAt, contextCount, stateCursorUserMessageId, isFavorite, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    session.id,
    session.title,
    session.selectedModel,
    session.scenarioId,
    session.projectId,
    session.rootSessionId,
    session.parentSessionId,
    session.forkFromMessageId,
    session.forkPointMessageId,
    JSON.stringify(session.mcpServerIds),
    session.mcpPolicy,
    session.mode,
    session.skillPolicy,
    session.webSearch,
    session.thinking,
    JSON.stringify(session.kbIds),
    session.isTemporary ? 1 : 0,
    session.temporaryType,
    session.expiresAt,
    session.contextCount,
    session.stateCursorUserMessageId,
    session.isFavorite ? 1 : 0,
    session.createdAt,
    session.updatedAt
  );

  syncSessionSearchDoc(session.id);
  return session;
}

/**
 * 追溯真实的分叉来源
 * 如果分叉点消息是共享消息（从其他会话复制来的），
 * 则追溯到最原始的消息和会话
 */
function traceRealForkSource(
  parentSessionId: string,
  forkFromMessageId: string
): { realParentSessionId: string; realForkFromMessageId: string } {
  const forkMessage = getMessage(forkFromMessageId);
  if (!forkMessage) {
    throw new Error(tMain("session.forkMessageNotFound"));
  }
  
  // 如果不是共享消息，直接返回
  if (!forkMessage.isShared) {
    return {
      realParentSessionId: parentSessionId,
      realForkFromMessageId: forkFromMessageId
    };
  }
  
  // 如果是共享消息，追溯到原始消息
  let currentMessage = forkMessage;
  let depth = 0;
  const MAX_DEPTH = 100; // 防止死循环
  
  while (currentMessage.copiedFromMessageId && depth < MAX_DEPTH) {
    const originalMessage = getMessage(currentMessage.copiedFromMessageId);
    if (!originalMessage) {
      // 如果找不到原始消息，使用当前消息
      break;
    }
    currentMessage = originalMessage;
    depth++;
    
    // 如果找到了非共享消息，这就是真实的分叉来源
    if (!currentMessage.isShared) {
      break;
    }
  }
  
  // 返回真实的父会话ID（原始消息所在的会话）和原始消息ID
  return {
    realParentSessionId: currentMessage.sessionId,
    realForkFromMessageId: currentMessage.id
  };
}

function remapQuoteSourceInParts(parts: any[], idMap: Map<string, string>): any[] {
  return (parts || []).map((part) => {
    if (part?.type !== 'data-quote' || !part?.data || typeof part.data !== 'object') return part;
    const sourceMessageId = (part.data as { sourceMessageId?: string }).sourceMessageId;
    if (!sourceMessageId || !idMap.has(sourceMessageId)) return part;
    return {
      ...part,
      data: {
        ...(part.data as object),
        sourceMessageId: idMap.get(sourceMessageId),
      },
    };
  });
}

/**
 * 创建分支（复制消息到新会话）- 简化版本
 */
export function createBranch(params: {
  parentSessionId: string;  // 从哪个会话分叉
  forkFromMessageId: string;  // 分叉点消息ID
  title?: string;
}): Session {
  const db = getDb();
  const now = Date.now();
  
  const branchSession = db.transaction(() => {
    // 1. 追溯真实的分叉来源（如果是从共享消息分叉）
    const { realParentSessionId, realForkFromMessageId } = 
      traceRealForkSource(params.parentSessionId, params.forkFromMessageId);
    
    // 2. 获取真实的父会话
    const parentSession = getSession(realParentSessionId);
    if (!parentSession) {
      throw new Error(tMain("session.parentNotFound"));
    }
    if (parentSession.isTemporary) {
      throw new Error(tMain("session.temporaryBranchUnsupported"));
    }
    
    // 确定根会话ID（扁平化：所有分支都指向同一个根）
    const rootSessionId = parentSession.rootSessionId || realParentSessionId;
    
    // 3. 确定分支的 state/brief（从 messagesToCopy 的最后一个 user 消息取 checkpoint，或父 session 兜底）
    const allParentMsgs = listMessages(realParentSessionId);
    const forkIndex = allParentMsgs.findIndex((m) => m.id === realForkFromMessageId);
    if (forkIndex === -1) throw new Error(tMain("session.forkMessageNotFound"));
    const messagesToCopy = allParentMsgs.slice(0, forkIndex + 1);
    const isForkFromLastMessage = allParentMsgs.length > 0 && allParentMsgs[allParentMsgs.length - 1].id === realForkFromMessageId;
    const lastUserMsg = messagesToCopy.filter((m) => m.role === 'user').pop();
    const lastTurn = lastUserMsg?.turnId ? getTurn(lastUserMsg.turnId) : null;
    const branchStateText = lastTurn?.stateText ?? (isForkFromLastMessage ? parentSession.stateText ?? null : null);
    const branchBriefText = lastTurn?.briefText ?? (isForkFromLastMessage ? parentSession.briefText ?? null : null);
    const branchStateCursorUserMessageId = isForkFromLastMessage
      ? parentSession.stateCursorUserMessageId ?? null
      : null;
    
    // 4. 创建新会话
    const branchContextCount = parentSession.contextCount ?? getScenario(parentSession.scenarioId)?.contextCount ?? 10;
    const branchSession: Session = {
      id: nanoId(),
      title: params.title || `${parentSession.title} - ${tMain("session.branchSuffix")}`,
      selectedModel: parentSession.selectedModel,
      scenarioId: parentSession.scenarioId,
      projectId: parentSession.projectId,
      rootSessionId: rootSessionId,
      parentSessionId: realParentSessionId,
      forkFromMessageId: realForkFromMessageId,
      forkPointMessageId: null,  // 稍后填充
      mcpServerIds: parentSession.mcpServerIds,
      mcpPolicy: parentSession.mcpPolicy,
      mode: parentSession.mode,
      skillPolicy: parentSession.skillPolicy,
      webSearch: parentSession.webSearch,
      thinking: parentSession.thinking,
      kbIds: parentSession.kbIds ?? [],
      stateCursorUserMessageId: branchStateCursorUserMessageId,
      isTemporary: false,
      temporaryType: null,
      expiresAt: null,
      contextCount: branchContextCount,
      linkedNoteId: null,
      isFavorite: false,
      isArchived: false,
      createdAt: now,
      updatedAt: now
    };

    db.prepare(`
      INSERT INTO sessions (
        id, title, selectedModel, scenarioId, projectId, rootSessionId, parentSessionId,
        forkFromMessageId, forkPointMessageId, mcpServerIds, mcpPolicy, mode, skillPolicy, webSearch, thinking, kbIds, isTemporary, temporaryType, expiresAt, contextCount, stateText, briefText, stateCursorUserMessageId, isFavorite, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      branchSession.id,
      branchSession.title,
      branchSession.selectedModel,
      branchSession.scenarioId,
      branchSession.projectId,
      branchSession.rootSessionId,
      branchSession.parentSessionId,
      branchSession.forkFromMessageId,
      branchSession.forkPointMessageId,
      JSON.stringify(branchSession.mcpServerIds),
      branchSession.mcpPolicy,
      branchSession.mode,
      branchSession.skillPolicy,
      branchSession.webSearch,
      branchSession.thinking,
      JSON.stringify(branchSession.kbIds),
      0,
      null,
      null,
      branchSession.contextCount,
      branchStateText,
      branchBriefText,
      branchSession.stateCursorUserMessageId,
      0,
      branchSession.createdAt,
      branchSession.updatedAt
    );
    
    // 5. 复制消息到新会话（messagesToCopy 已在步骤 3 获取）
    const idMap = new Map<string, string>();
    
    for (const oldMsg of messagesToCopy) {
      const newMsgId = nanoId();
      
      const mappedTurnId = oldMsg.turnId ? `pending:${oldMsg.turnId}` : null;
      const remappedParts = remapQuoteSourceInParts(oldMsg.parts as any[], idMap);
      
      db.prepare(`
        INSERT INTO messages (
          id, sessionId, turnId, role, parts, status,
          copiedFromMessageId, isShared, isDeleted, deletedAt, userEdited, contextSources, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newMsgId,
        branchSession.id,
        mappedTurnId,
        oldMsg.role,
        JSON.stringify(remappedParts),
        oldMsg.status,
        oldMsg.id,  // copiedFromMessageId：记录原消息ID
        1,          // isShared：标记为共享消息
        oldMsg.isDeleted ? 1 : 0,
        oldMsg.deletedAt ?? null,
        oldMsg.userEdited ? 1 : 0,
        oldMsg.contextSources ? JSON.stringify(oldMsg.contextSources) : null,
        oldMsg.createdAt,  // 保留原时间
        oldMsg.updatedAt   // 保留原时间
      );
      
      idMap.set(oldMsg.id, newMsgId);
    }

    const turnIdMap = new Map<string, string>();
    const turnIdsToCopy = Array.from(
      new Set(messagesToCopy.map((m) => m.turnId).filter((id): id is string => !!id))
    );
    for (const oldTurnId of turnIdsToCopy) {
      const oldTurn = getTurn(oldTurnId);
      if (!oldTurn) continue;
      const newTurnId = nanoId();
      turnIdMap.set(oldTurnId, newTurnId);
      db.prepare(`
        INSERT INTO turns (
          id, sessionId, userMessageId, assistantMessageId, parentTurnId,
          triggerType, status, selectedModel, mcpServerIds, mode, webSearch, thinking, effectiveThinking, skillId,
          citationRequired, citationStartIndex, tokenUsage, stateText, briefText, error, startedAt, endedAt, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newTurnId,
        branchSession.id,
        oldTurn.userMessageId ? idMap.get(oldTurn.userMessageId) ?? null : null,
        oldTurn.assistantMessageId ? idMap.get(oldTurn.assistantMessageId) ?? null : null,
        oldTurn.parentTurnId ? turnIdMap.get(oldTurn.parentTurnId) ?? null : null,
        oldTurn.triggerType,
        oldTurn.status,
        oldTurn.selectedModel ?? "",
        oldTurn.mcpServerIds?.length ? JSON.stringify(oldTurn.mcpServerIds) : null,
        oldTurn.mode ?? null,
        oldTurn.webSearch ?? null,
        oldTurn.thinking ?? null,
        oldTurn.effectiveThinking ?? null,
        oldTurn.skillId ?? null,
        oldTurn.citationRequired ? 1 : 0,
        oldTurn.citationStartIndex ?? 0,
        oldTurn.tokenUsage ? JSON.stringify(oldTurn.tokenUsage) : null,
        oldTurn.stateText ?? null,
        oldTurn.briefText ?? null,
        oldTurn.error ?? null,
        oldTurn.startedAt,
        oldTurn.endedAt ?? null,
        oldTurn.createdAt,
        oldTurn.updatedAt
      );
    }

    for (const [oldTurnId, newTurnId] of turnIdMap.entries()) {
      db.prepare(`
        UPDATE turns
        SET parentTurnId = ?
        WHERE id = ?
      `).run(
        (() => {
          const parentId = getTurn(oldTurnId)?.parentTurnId;
          return parentId ? turnIdMap.get(parentId) ?? null : null;
        })(),
        newTurnId
      );
    }

    for (const [oldMsgId, newMsgId] of idMap.entries()) {
      const oldMsg = messagesToCopy.find((m) => m.id === oldMsgId);
      if (!oldMsg?.turnId) continue;
      const mappedTurnId = turnIdMap.get(oldMsg.turnId) ?? null;
      db.prepare(`UPDATE messages SET turnId = ? WHERE id = ?`).run(mappedTurnId, newMsgId);
    }
    
    // 6. 更新分叉点消息ID
    const forkPointNewId = idMap.get(realForkFromMessageId);
    if (forkPointNewId) {
      db.prepare(`
        UPDATE sessions 
        SET forkPointMessageId = ? 
        WHERE id = ?
      `).run(forkPointNewId, branchSession.id);
      
      branchSession.forkPointMessageId = forkPointNewId;
    }
    
    branchSession.stateText = branchStateText;
    branchSession.briefText = branchBriefText;
    return branchSession;
  })();

  syncSessionSearchDoc(branchSession.id);
  syncMessageSearchDocsBySessionId(branchSession.id);
  return branchSession;
}

/**
 * 更新会话的 updatedAt
 */
export function touchSession(sessionId: string) {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    UPDATE sessions
    SET updatedAt = ?,
        expiresAt = CASE
          WHEN isTemporary = 1 THEN ?
          ELSE expiresAt
        END
    WHERE id = ?
  `).run(now, now + TEMP_SESSION_TTL_MS, sessionId);
}

/**
 * 删除会话（手动删除关联数据）
 */
function deleteSessionCascadeInternal(db: ReturnType<typeof getDb>, sessionId: string) {
  db.prepare(`
    UPDATE sessions
    SET rootSessionId = NULL,
        parentSessionId = NULL,
        forkFromMessageId = NULL,
        forkPointMessageId = NULL
    WHERE rootSessionId = ?
  `).run(sessionId);

  db.prepare(`
    UPDATE sessions
    SET parentSessionId = NULL,
        forkFromMessageId = NULL,
        forkPointMessageId = NULL
    WHERE parentSessionId = ?
  `).run(sessionId);

  db.prepare(`
    DELETE FROM chat_debug_steps
    WHERE runId IN (
      SELECT id FROM chat_debug_runs WHERE sessionId = ?
    )
  `).run(sessionId);
  db.prepare(`DELETE FROM chat_debug_runs WHERE sessionId = ?`).run(sessionId);
  db.prepare(`DELETE FROM turns WHERE sessionId = ?`).run(sessionId);
  db.prepare(`DELETE FROM messages WHERE sessionId = ?`).run(sessionId);
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
}

export function deleteSession(sessionId: string) {
  const db = getDb();
  db.transaction(() => {
    deleteSessionCascadeInternal(db, sessionId);
  })();
  deleteSessionSearchDoc(sessionId);
}

/**
 * 清理过期临时会话（含关联 turns/messages/debug）
 */
export function cleanupExpiredTemporarySessions(now: number = Date.now()): { count: number; sessionIds: string[] } {
  const db = getDb();
  const result = db.transaction(() => {
    const expiredRows = db.prepare(`
      SELECT id FROM sessions
      WHERE isTemporary = 1
        AND expiresAt IS NOT NULL
        AND expiresAt <= ?
    `).all(now) as Array<{ id: string }>;
    const sessionIds = expiredRows.map((row) => row.id);
    for (const row of expiredRows) {
      deleteSessionCascadeInternal(db, row.id);
    }
    return { count: expiredRows.length, sessionIds };
  })();

  for (const sessionId of result.sessionIds) {
    deleteSessionSearchDoc(sessionId);
  }

  return result;
}

/**
 * 创建临时会话（落库，隐藏于会话列表）
 */
export function createTemporarySession(
  selectedModel: string = '__default__',
  scenarioId: string = 'default-scenario',
  title: string = tMain("session.defaultTemporarySession"),
  mcpServerIds: string[] = [],
  mcpPolicy: SessionMcpPolicy = 'manual',
  mode: ChatMode = 'chat',
  skillPolicy: SessionSkillPolicy = 'auto',
  webSearch: WebSearchMode = 'builtin',
  thinking: ThinkingMode = 'auto',
  kbIds: string[] = [],
  temporaryType: TemporarySessionType = 'session'
): Session {
  return createSession(
    selectedModel,
    scenarioId,
    title,
    null,
    mcpServerIds,
    mcpPolicy,
    mode,
    skillPolicy,
    webSearch,
    thinking,
    kbIds,
    true,
    temporaryType
  );
}

/**
 * 更新会话标题
 */
export function updateSessionTitle(sessionId: string, title: string) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET title = ?, updatedAt = ? WHERE id = ?`).run(
    title,
    Date.now(),
    sessionId
  );
  syncSessionSearchDoc(sessionId);
}

/**
 * 更新会话选择的模型
 */
export function updateSessionModel(sessionId: string, selectedModel: string) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET selectedModel = ?, updatedAt = ? WHERE id = ?`).run(
    selectedModel,
    Date.now(),
    sessionId
  );
}

/**
 * 更新会话的场景
 */
export function updateSessionScenario(sessionId: string, scenarioId: string) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET scenarioId = ?, updatedAt = ? WHERE id = ?`).run(
    scenarioId,
    Date.now(),
    sessionId
  );
}

/**
 * 更新会话的项目归属
 */
export function updateSessionProject(sessionId: string, projectId: string | null) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET projectId = ?, updatedAt = ? WHERE id = ?`).run(
    projectId,
    Date.now(),
    sessionId
  );
}

/**
 * 更新会话收藏状态
 */
/** 仅更新收藏状态，不修改 updatedAt，避免收藏/取消收藏改变列表排序 */
export function updateSessionFavorite(sessionId: string, isFavorite: boolean) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET isFavorite = ? WHERE id = ?`).run(
    isFavorite ? 1 : 0,
    sessionId
  );
}

/** 仅更新归档状态，不修改 updatedAt */
export function updateSessionArchive(sessionId: string, isArchived: boolean) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET isArchived = ? WHERE id = ?`).run(
    isArchived ? 1 : 0,
    sessionId
  );
}

/**
 * 移动会话到分类
 * - 主会话：连同其所有分支一起移动
 * - 分支会话：移动其分支子树，并将当前分支去分支化为主会话
 */
export function moveSessionToProject(sessionId: string, projectId: string | null): { sessionIds: string[] } {
  const db = getDb();

  return db.transaction(() => {
    if (projectId) {
      const project = db.prepare(`SELECT id FROM projects WHERE id = ?`).get(projectId) as { id: string } | undefined;
      if (!project) throw new Error(tMain("session.projectNotFound"));
    }

    const session = getSession(sessionId);
    if (!session) throw new Error(tMain("session.notFoundWithId", { sessionId }));
    if (session.isTemporary) throw new Error(tMain("session.temporaryMoveUnsupported"));

    // 主会话：主会话 + 所有 rootSessionId 指向它的分支
    if (!session.rootSessionId) {
      const rows = db
        .prepare(`
          SELECT id FROM sessions
          WHERE id = ? OR rootSessionId = ?
        `)
        .all(sessionId, sessionId) as Array<{ id: string }>;
      const sessionIds = rows.map((row) => row.id);
      if (sessionIds.length === 0) return { sessionIds: [] };

      const placeholders = sessionIds.map(() => '?').join(', ');
      db.prepare(`UPDATE sessions SET projectId = ? WHERE id IN (${placeholders})`).run(projectId, ...sessionIds);
      return { sessionIds };
    }

    // 分支会话：先找整棵 parent 子树，统一移动分类
    const subtreeRows = db
      .prepare(`
        WITH RECURSIVE subtree(id) AS (
          SELECT id FROM sessions WHERE id = ?
          UNION ALL
          SELECT s.id
          FROM sessions s
          JOIN subtree st ON s.parentSessionId = st.id
        )
        SELECT id FROM subtree
      `)
      .all(sessionId) as Array<{ id: string }>;
    const sessionIds = subtreeRows.map((row) => row.id);
    if (sessionIds.length === 0) return { sessionIds: [] };

    const placeholders = sessionIds.map(() => '?').join(', ');
    db.prepare(`UPDATE sessions SET projectId = ? WHERE id IN (${placeholders})`).run(projectId, ...sessionIds);

    // 当前分支去分支化
    db.prepare(`
      UPDATE sessions
      SET rootSessionId = NULL,
          parentSessionId = NULL,
          forkFromMessageId = NULL,
          forkPointMessageId = NULL
      WHERE id = ?
    `).run(sessionId);

    // 子树其余节点重定向到新的根（当前分支）
    const descendantIds = sessionIds.filter((id) => id !== sessionId);
    if (descendantIds.length > 0) {
      const descendantPlaceholders = descendantIds.map(() => '?').join(', ');
      db.prepare(`
        UPDATE sessions
        SET rootSessionId = ?
        WHERE id IN (${descendantPlaceholders})
      `).run(sessionId, ...descendantIds);
    }

    return { sessionIds };
  })();
}

/**
 * 更新会话的 MCP 配置
 */
export function updateSessionMcpServers(sessionId: string, mcpServerIds: string[]) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET mcpServerIds = ?, updatedAt = ? WHERE id = ?`).run(
    JSON.stringify(mcpServerIds),
    Date.now(),
    sessionId
  );
}

/**
 * 更新会话的 MCP 策略（auto/manual/off）
 */
export function updateSessionMcpPolicy(sessionId: string, mcpPolicy: SessionMcpPolicy) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET mcpPolicy = ?, updatedAt = ? WHERE id = ?`).run(
    mcpPolicy,
    Date.now(),
    sessionId
  );
}

/**
 * 更新会话的模式（chat/agent）
 */
export function updateSessionMode(sessionId: string, mode: ChatMode) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET mode = ?, updatedAt = ? WHERE id = ?`).run(
    mode,
    Date.now(),
    sessionId
  );
}

/**
 * 更新会话的技能策略（auto/off）
 */
export function updateSessionSkillPolicy(sessionId: string, skillPolicy: SessionSkillPolicy) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET skillPolicy = ?, updatedAt = ? WHERE id = ?`).run(
    skillPolicy,
    Date.now(),
    sessionId
  );
}

/**
 * 更新会话的网络搜索模式（auto/close）
 */
export function updateSessionWebSearch(sessionId: string, webSearch: WebSearchMode) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET webSearch = ?, updatedAt = ? WHERE id = ?`).run(
    webSearch,
    Date.now(),
    sessionId
  );
}

/**
 * 更新会话的思考深度模式（auto/off/on/standard/deep/ultra）
 */
export function updateSessionThinking(sessionId: string, thinking: ThinkingMode) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET thinking = ?, updatedAt = ? WHERE id = ?`).run(
    thinking,
    Date.now(),
    sessionId
  );
}

/**
 * 更新会话的知识库 ID 列表
 */
export function updateSessionKbIds(sessionId: string, kbIds: string[]) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET kbIds = ?, updatedAt = ? WHERE id = ?`).run(
    JSON.stringify(kbIds),
    Date.now(),
    sessionId
  );
}

/**
 * 更新会话的 stateText 和 briefText（记忆系统）
 */
export function updateSessionStateAndBrief(
  sessionId: string,
  stateText: string | null,
  briefText: string | null,
  stateCursorUserMessageId?: string | null
) {
  const db = getDb();
  const now = Date.now();
  if (stateCursorUserMessageId === undefined) {
    db.prepare(
      `UPDATE sessions SET stateText = ?, briefText = ?, updatedAt = ? WHERE id = ?`
    ).run(stateText ?? null, briefText ?? null, now, sessionId);
  } else {
    db.prepare(
      `UPDATE sessions SET stateText = ?, briefText = ?, stateCursorUserMessageId = ?, updatedAt = ? WHERE id = ?`
    ).run(stateText ?? null, briefText ?? null, stateCursorUserMessageId ?? null, now, sessionId);
  }
  syncSessionSearchDoc(sessionId);
}

/**
 * 获取用于 Recent Activity Digest 的会话列表
 * 排除当前会话，按 updatedAt 倒序，取最近 N 天、最多 limit 条
 */
export function listSessionsForDigest(params: {
  excludeSessionId: string;
  limit?: number;
  maxDays?: number;
}): Session[] {
  const { excludeSessionId, limit = 15, maxDays = 7 } = params;
  const db = getDb();
  const cutoffTime = Date.now() - maxDays * 24 * 60 * 60 * 1000;

  const rows = db
    .prepare(
      `SELECT * FROM sessions 
       WHERE id != ? AND updatedAt >= ? AND briefText IS NOT NULL AND briefText != ''
         AND (isTemporary IS NULL OR isTemporary = 0)
       ORDER BY updatedAt DESC 
       LIMIT ?`
    )
    .all(excludeSessionId, cutoffTime, limit) as SessionRow[];

  return rows.map(rowToSession);
}

/**
 * 获取单个会话
 */
export function getSession(sessionId: string): Session | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as SessionRow | undefined;
  return row ? rowToSession(row) : null;
}

/**
 * 更新会话关联的笔记ID
 */
export function updateSessionLinkedNote(sessionId: string, linkedNoteId: string | null) {
  const db = getDb();
  db.prepare(`UPDATE sessions SET linkedNoteId = ?, updatedAt = ? WHERE id = ?`).run(
    linkedNoteId,
    Date.now(),
    sessionId
  );
}

export function getLinkedNoteIds(): { noteId: string; sessionId: string }[] {
  const db = getDb();
  const rows = db.prepare(`SELECT id, linkedNoteId FROM sessions WHERE linkedNoteId IS NOT NULL`).all() as { id: string; linkedNoteId: string }[];
  return rows.map(r => ({ noteId: r.linkedNoteId, sessionId: r.id }));
}

/**
 * 获取会话的有效工作目录（filesystem/命令行工具路径校验用）
 * 始终包含内置目录（应用数据目录）；其余目录仅来自场景配置；不再使用主目录兜底
 */
export function getEffectiveWorkingDirs(sessionId: string): string[] {
  const builtin = getBuiltinWorkingDir();
  const session = getSession(sessionId);
  const configured = (getScenario(session?.scenarioId ?? "default-scenario")?.workingDirs ?? []) as string[];
  return configured.length > 0 ? [builtin, ...configured] : [builtin];
}
