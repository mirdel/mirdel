/**
 * 消息分组工具
 * 
 * 分组规则（严格 turn 驱动）：
 * - 按 turn.createdAt 顺序遍历
 * - 每个 turn 固定输出两组：user 组 + response 组
 * - messages 仅作为内容载体，不参与轮次推断
 */

import type { MessagePublic } from '@/stores/useChatStore'
import type { Turn } from '@shared'
import { i18n } from '@/i18n'
import { extractAnswerTextFromContent, type MessageContentPart } from './messageContentUtils'

/**
 * 消息组类型
 * - user: 用户消息（单条）
 * - response: AI 回复组（可能包含多条 assistant 消息）
 */
export type MessageGroupType = 'user' | 'response'

/**
 * 消息组
 */
export interface MessageGroup {
  /** 组ID，使用第一条消息的ID */
  id: string
  
  /** 组类型 */
  type: MessageGroupType
  
  /** 组内所有消息 */
  messages: MessagePublic[]
  
  /** 主消息（用于提取时间、模型等元信息） */
  primaryMessage: MessagePublic
  
  /** 显示文本（用于预览场景，只包含最终文本） */
  displayText: string
  
  /** 是否包含工具调用细节 */
  hasToolDetails: boolean
  
  /** 关联的 user 消息 ID（response 组用于获取调试信息） */
  userMessageId?: string
  
  /** 轮次 ID（用于批量操作，如删除整个轮次）- response 组必有 */
  turnId?: string

  /** 响应组关联的 turn（优先从 turns 表获取） */
  turn?: Turn | null

  /** 关联的 user 消息对象（减少组件内二次查找） */
  userMessage?: MessagePublic

  /** 组内第一条 assistant（减少组件内重复遍历） */
  firstAssistantMessage?: MessagePublic

  /** 组内最后一条 assistant（减少组件内重复遍历） */
  lastAssistantMessage?: MessagePublic

  /** 是否为当前会话最后一个 response 组 */
  isLastResponseGroup?: boolean
}

type GroupMessagesOptions = {
  turns: Turn[] | Map<string, Turn>
}

/**
 * 将消息列表按 turns 组织为渲染组
 * 
 * @param messages 消息列表
 * @returns 消息组列表
 */
export function groupMessages(messages: MessagePublic[], options: GroupMessagesOptions): MessageGroup[] {
  const groups: MessageGroup[] = []
  const turnById = normalizeTurnMap(options.turns)
  const orderedTurns = [...turnById.values()].sort((a, b) => a.createdAt - b.createdAt)
  const messageById = new Map(messages.map((m) => [m.id, m]))
  const messagesByTurnId = new Map<string, MessagePublic[]>()

  for (const msg of messages) {
    if (!msg.turnId) {
      throw new Error(`[messageGrouper] message ${msg.id} missing turnId`)
    }
    const list = messagesByTurnId.get(msg.turnId) || []
    list.push(msg)
    messagesByTurnId.set(msg.turnId, list)
  }

  for (const turn of orderedTurns) {
    const userMessageId = turn.userMessageId || undefined
    if (!userMessageId) {
      throw new Error(`[messageGrouper] turn ${turn.id} missing userMessageId`)
    }
    const userMessage = messageById.get(userMessageId)
    if (!userMessage || userMessage.role !== 'user') {
      throw new Error(`[messageGrouper] turn ${turn.id} userMessage invalid: ${userMessageId}`)
    }

    groups.push(createUserGroup(userMessage))

    const turnMessages = [...(messagesByTurnId.get(turn.id) || [])].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    let responseMessages = turnMessages.filter((m) => m.role === 'assistant')
    if (responseMessages.length === 0) {
      responseMessages = [createVirtualAssistantMessage(turn, userMessage.sessionId)]
    }

    groups.push(createResponseGroup(responseMessages, {
      userMessageId,
      userMessage,
      turn
    }))
  }

  // 标记最后一个 response 组，减少组件层重复扫描
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i].type === 'response') {
      groups[i].isLastResponseGroup = true
      break
    }
  }
  
  return groups
}

/**
 * 创建用户消息组
 */
function createUserGroup(msg: MessagePublic): MessageGroup {
  return {
    id: msg.id,
    type: 'user',
    messages: [msg],
    primaryMessage: msg,
    displayText: extractAnswerTextFromContent(msg.parts),
    hasToolDetails: false
  }
}

/**
 * 创建 AI 回复组
 */
function createResponseGroup(
  messages: MessagePublic[],
  options?: {
    userMessageId?: string
    userMessage?: MessagePublic
    turn?: Turn | null
  }
): MessageGroup {
  const hasToolDetails = messages.some(m =>
    m.parts.some(p => p.type === 'dynamic-tool' || (typeof p.type === 'string' && p.type.startsWith('tool-')))
  )
  
  const firstAssistantMessage = messages.find((m) => m.role === 'assistant') ?? messages[0]
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant') ?? messages[messages.length - 1]
  const turnId = options?.turn?.id ?? messages.find(m => m.turnId)?.turnId
  
  return {
    id: messages[0].id,
    type: 'response',
    messages,
    primaryMessage: messages[0],
    displayText: extractFinalText(messages),
    hasToolDetails,
    userMessageId: options?.userMessageId,
    turnId,
    turn: options?.turn ?? null,
    userMessage: options?.userMessage,
    firstAssistantMessage,
    lastAssistantMessage
  }
}

function normalizeTurnMap(turns?: Turn[] | Map<string, Turn>): Map<string, Turn> {
  if (!turns) return new Map()
  if (turns instanceof Map) return turns
  return new Map(turns.map((turn) => [turn.id, turn]))
}

function createVirtualAssistantMessage(turn: Turn, sessionId: string): MessagePublic {
  const now = Date.now()
  return {
    id: `__virtual_assistant__${turn.id}`,
    sessionId,
    turnId: turn.id,
    role: 'assistant',
    parts: [],
    status: turn.status === 'awaiting_approval' ? 'pending' : (turn.status as MessagePublic['status']),
    createdAt: turn.createdAt || now,
    updatedAt: turn.updatedAt || now
  }
}

/**
 * 从 response 组中提取最终输出文本
 * 聚合所有 assistant 消息的 text 部分，忽略工具 part
 * 
 * @param messages 消息组内的所有消息
 * @returns 聚合后的文本（多段之间用空行分隔）
 */
export function extractFinalOutput(messages: MessagePublic[]): string {
  const textSegments = messages
    .filter(m => m.role === 'assistant')
    .map(m => extractAnswerTextFromContent(m.parts))
    .filter(text => text.trim())
  
  return textSegments.join('\n\n')
}

/**
 * 提取消息组的最终文本（用于预览场景）
 * 
 * 规则：
 * 1. 聚合所有 assistant 消息的 text 部分
 * 2. 如果没有文本，返回工具调用的简短描述
 * 
 * @param messages 消息组内的所有消息
 * @returns 最终显示文本
 */
function extractFinalText(messages: MessagePublic[]): string {
  // 使用聚合函数获取所有文本
  const text = extractFinalOutput(messages)
  if (text) {
    return text
  }
  
  // 如果没有文本，返回工具调用的简短描述
  const toolCallMsg = messages.find(m =>
    m.parts.some(p => p.type === 'dynamic-tool' || (typeof p.type === 'string' && p.type.startsWith('tool-')))
  )
  if (toolCallMsg) {
    const toolCallPart = toolCallMsg.parts.find(p => p.type === 'dynamic-tool' || (typeof p.type === 'string' && p.type.startsWith('tool-')))
    if (toolCallPart && 'toolName' in (toolCallPart as any)) {
      return i18n.global.t('chat.messagePreview.toolCall', { name: (toolCallPart as any).toolName })
    }
  }
  
  return ''
}

/**
 * 检查消息内容是否包含工具调用
 */
export function hasToolCall(content: MessageContentPart[]): boolean {
  return content.some(p => p.type === 'dynamic-tool' || (typeof p.type === 'string' && p.type.startsWith('tool-')))
}

/**
 * 检查消息内容是否包含工具结果
 */
export function hasToolResult(content: MessageContentPart[]): boolean {
  return content.some(p => p.type === 'dynamic-tool' && (p as any).state?.startsWith('output-'))
}
