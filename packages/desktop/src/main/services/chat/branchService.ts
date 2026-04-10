import { getDb } from "../db";
import { Session, getSession } from "./sessionData";
import { getMessage } from "./messageData";
import type { Message } from "@shared";

/**
 * 分支信息（用于分支管理UI）
 */
export type BranchInfo = {
  session: Session;
  messageCount: number;
  forkPointMessage: Message | null;   // 分叉点消息（可能已删除）
  firstNewMessage: Message | null;    // 分叉后首条消息（独有消息）
  parentSessionTitle?: string;        // 父会话标题（用于显示"从XX分叉"）
};

/**
 * 获取某个根会话的所有分支信息（包括主会话本身）
 */
export function getBranchesInfo(rootSessionId: string): BranchInfo[] {
  const db = getDb();
  const result: BranchInfo[] = [];
  
  // 1. 获取主会话
  const mainSession = getSession(rootSessionId);
  if (!mainSession) {
    return result;
  }
  
  // 主会话信息
  const mainMessageCount = db.prepare(
    `SELECT COUNT(*) as count FROM messages WHERE sessionId = ?`
  ).get(mainSession.id) as { count: number };
  
  result.push({
    session: mainSession,
    messageCount: mainMessageCount.count,
    forkPointMessage: null,
    firstNewMessage: null  // 主会话没有"分叉后首条消息"
  });
  
  // 2. 获取所有分支
  const branches = db.prepare(`
    SELECT * FROM sessions 
    WHERE rootSessionId = ? 
    ORDER BY createdAt
  `).all(rootSessionId) as Session[];
  
  for (const branch of branches) {
    // 消息数量
    const messageCount = db.prepare(
      `SELECT COUNT(*) as count FROM messages WHERE sessionId = ?`
    ).get(branch.id) as { count: number };
    
    // 分叉点消息
    let forkPointMessage: Message | null = null;
    if (branch.forkPointMessageId) {
      forkPointMessage = getMessage(branch.forkPointMessageId);
    }
    
    // 分叉后首条消息（分叉点之后的第一条非共享消息）
    let firstNewMessage: Message | null = null;
    if (branch.forkPointMessageId) {
      const forkPointMsg = getMessage(branch.forkPointMessageId);
      if (forkPointMsg) {
        // 获取分叉点之后的第一条非共享消息的 ID
        const firstNewRow = db.prepare(`
          SELECT id FROM messages 
          WHERE sessionId = ? 
            AND isShared = 0 
            AND createdAt > ?
          ORDER BY createdAt 
          LIMIT 1
        `).get(branch.id, forkPointMsg.createdAt) as { id: string } | undefined;
        
        if (firstNewRow) {
          // 使用 getMessage 获取完整消息（确保 content 等字段正确解析）
          firstNewMessage = getMessage(firstNewRow.id);
        }
      }
    }
    
    // 父会话标题
    let parentSessionTitle: string | undefined;
    if (branch.parentSessionId) {
      const parentSession = getSession(branch.parentSessionId);
      if (parentSession) {
        parentSessionTitle = parentSession.title;
      }
    }
    
    result.push({
      session: branch,
      messageCount: messageCount.count,
      forkPointMessage,
      firstNewMessage,
      parentSessionTitle
    });
  }
  
  return result;
}
