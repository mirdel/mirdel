import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import { nanoid } from 'nanoid'
import { loggerServiceRenderer, type MessageContentPart, type MessageQuote, type MessageRole, type AppUIMessage, type ChatMode, type WebSearchMode, type ThinkingMode, type CitationSource, type Turn } from '@shared'
import { AbstractChat, type ChatState, type ChatTransport, type UIDataTypes, type UIMessageChunk } from 'ai'
import { useSettingsStore } from './useSettingsStore'
import { useMyToast } from '@/composables/useMyToast'
import { i18n } from '@/i18n'
import emitter from '@/utils/emitter'
import { parseMessageContent, extractAnswerTextFromContent, extractImagesFromContent, extractNoteContextFromContent, serializeMessageContent, AUTO_GENERATED_IMAGE_PROMPT, upsertQuotePart, upsertKbPart } from '@/utils/messageContentUtils'

const logger = loggerServiceRenderer.withContext('useChatStore')

function stripCitationMarkersForModel(text: string): string {
  if (!text) return text

  return text
    .replace(/\[(?:S)?\d+\]\(cite:\d+\)/gi, '')
    .replace(/\[S\d+\]/gi, '')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
}

function stripCitationMarkersFromParts(parts: MessageContentPart[]): MessageContentPart[] {
  return (parts || []).map((part) => {
    if (part.type === 'text' && typeof part.text === 'string') {
      return {
        ...part,
        text: stripCitationMarkersForModel(part.text)
      } as MessageContentPart
    }
    if (part.type === 'reasoning' && typeof (part as any).text === 'string') {
      return {
        ...part,
        text: stripCitationMarkersForModel((part as any).text)
      } as MessageContentPart
    }
    return part
  })
}

function sanitizeValueForModelContext(value: unknown): unknown {
  if (typeof value === 'string') {
    return stripCitationMarkersForModel(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValueForModelContext(item))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== 'sources')
    .map(([key, item]) => [key, sanitizeValueForModelContext(item)] as const)

  return Object.fromEntries(entries)
}

function summarizeDynamicToolPartForModel(part: MessageContentPart): MessageContentPart {
  if (part.type !== 'dynamic-tool' || part.state !== 'output-available') return part
  const threshold = 500
  const output = part.output
  const outputText = typeof output === 'string'
    ? output
    : output === null || output === undefined
      ? ''
      : (() => {
          try {
            return JSON.stringify(output, null, 2)
          } catch {
            return String(output)
          }
        })()

  if (outputText.length <= threshold) return part

  return {
    ...part,
    output: {
      _summarized: true,
      text: `[${part.toolName} output omitted, ${outputText.length} chars total, toolCallId: "${part.toolCallId}"]`
    }
  } as MessageContentPart
}

function sanitizeDynamicToolPartForModel(part: MessageContentPart): MessageContentPart {
  const summarized = summarizeDynamicToolPartForModel(part)
  if (summarized.type !== 'dynamic-tool') return summarized

  const nextPart: Record<string, unknown> = { ...summarized }
  if ('input' in nextPart) {
    nextPart.input = sanitizeValueForModelContext(nextPart.input)
  }
  if ('output' in nextPart) {
    nextPart.output = sanitizeValueForModelContext(nextPart.output)
  }
  if (typeof nextPart.errorText === 'string') {
    nextPart.errorText = stripCitationMarkersForModel(nextPart.errorText)
  }

  return nextPart as MessageContentPart
}

function stripDynamicToolApproval(part: Record<string, any>): Record<string, any> {
  if (part.state === 'approval-requested') return part
  const { approval: _approval, ...rest } = part
  return rest
}

/**
 * 特殊值：表示使用默认模型
 */
export const DEFAULT_MODEL_PLACEHOLDER = '__default__'

/**
 * 特殊值：表示使用场景配置的模型
 */
export const SCENARIO_MODEL_PLACEHOLDER = '__scenario__'

export type SessionSkillPolicy = 'auto' | 'off'
export type SkillSelectionMode = SessionSkillPolicy | 'manual'
export type SessionMcpPolicy = 'auto' | 'manual' | 'off'

export type SkillSelectionPayload = {
  mode: SkillSelectionMode
  skillId?: string | null
}

export type McpSelectionPayload = {
  mode: SessionMcpPolicy
  serverIds?: string[]
}

export type SessionPublic = { 
  id: string
  title: string
  selectedModel: string
  scenarioId: string
  projectId?: string | null          // 项目ID（分类功能）
  rootSessionId: string | null       // 根会话ID（扁平化）
  parentSessionId: string | null     // 父会话ID
  forkFromMessageId: string | null   // 父会话中的分叉点消息ID
  forkPointMessageId: string | null  // 本会话中对应的消息ID
  mcpServerIds: string[]             // 会话级 MCP 服务器配置
  mcpPolicy: SessionMcpPolicy         // MCP 策略（auto/manual/off）
  mode: ChatMode                     // 会话模式（chat/agent）
  skillPolicy: SessionSkillPolicy    // 技能策略（auto/off）
  webSearch?: WebSearchMode          // 网络搜索模式（auto/close）
  thinking?: ThinkingMode            // 思考深度（auto/off/on/standard/deep/ultra）
  kbIds?: string[]                   // 会话级知识库 ID 列表
  isTemporary?: boolean              // 临时会话（隐藏于会话列表）
  temporaryType?: 'session' | 'ask' | null
  expiresAt?: number | null          // 临时会话过期时间
  contextCount?: number | null       // 创建时固化的上下文轮数
  linkedNoteId?: string | null       // 关联的会话笔记ID
  isFavorite?: boolean               // 是否收藏
  isArchived?: boolean               // 是否归档
  createdAt?: number
  updatedAt?: number
}

export type MessagePublic = {
  id: string
  sessionId: string
  turnId?: string
  role: MessageRole
  parts: MessageContentPart[]
  status?: 'pending' | 'streaming' | 'success' | 'aborted' | 'error'
  copiedFromMessageId?: string  // 消息溯源
  isShared?: boolean            // 是否共享消息
  isDeleted?: boolean
  deletedAt?: number
  userEdited?: boolean          // 是否被用户手动编辑过
  tokenUsage?: { inputTokens: number | null; outputTokens: number | null }  // Token 消耗统计
  contextSources?: import('@shared').CitationSource[]  // 知识库召回来源（仅 user 消息）
  historicalMemory?: import('@shared').HistoricalMemoryRecall
  createdAt?: number
  updatedAt?: number
}

type StreamChunkMetadata = {
  createdMessageIds?: string[]
  tokenUsage?: { inputTokens: number | null; outputTokens: number | null }
}

// Renderer 接收到的真实流事件：AI SDK UI chunk + 会话上下文
export type StreamEvent = {
  sessionId: string
  messageId: string
  turnId?: string
  createdMessageIds?: string[]
  tokenUsage?: { inputTokens: number | null; outputTokens: number | null }
  chunk: UIMessageChunk<StreamChunkMetadata, UIDataTypes>
}

type GenerationRequestPayload = {
  sessionId: string
  turnId?: string
  assistantMessageId?: string
  existingAssistantMessageId?: string
  userMessageId: string
  messages: Array<Pick<AppUIMessage, 'role' | 'parts'>>
  selectedModel: string
  mcpServerIds: string[]
  mcpSelection?: McpSelectionPayload
  mode: ChatMode
  webSearch?: WebSearchMode
  thinking?: ThinkingMode
  skillSelection?: SkillSelectionPayload
  scenarioId?: string
  citationRequired?: boolean
  citationStartIndex?: number
}

type PendingScrollTarget = {
  sessionId: string
  messageId: string
}

class RendererApprovalChat extends AbstractChat<AppUIMessage> {}

export const useChatStore = defineStore('chat', () => {
  const settingsStore = useSettingsStore()
  const toast = useMyToast()
  const COMPLETED_UNREAD_STORAGE_KEY = 'chat:completed-unread-session-ids:v1'

  function isCompletedMessageStatus(status?: MessagePublic['status']): boolean {
    return status === 'success' || status === 'aborted'
  }

  function findLastIndexCompat<T>(arr: T[], predicate: (value: T, index: number) => boolean): number {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (predicate(arr[i], i)) return i
    }
    return -1
  }
  
  // ===== State =====
  const sessions = ref<SessionPublic[]>([])
  const sessionById = computed(() => {
    const map = new Map<string, SessionPublic>()
    for (const s of sessions.value) map.set(s.id, s)
    return map
  })
  const currentSessionId = ref<string | null>(null)
  const pendingScrollTarget = ref<PendingScrollTarget | null>(null)
  
  // 按会话缓存消息，支持多会话同时流式
  const messagesCache = ref<Map<string, MessagePublic[]>>(new Map())
  const turnSuggestionsMap = ref<Map<string, string[]>>(new Map())  // turnId -> 追问建议
  const turnsBySessionCache = ref<Map<string, Turn[]>>(new Map())
  const turnsByIdCache = ref<Map<string, Turn>>(new Map())
  
  // 当前会话的消息（computed，保持接口兼容）
  const messages = computed(() => {
    if (!currentSessionId.value) return []
    return messagesCache.value.get(currentSessionId.value) || []
  })

  const currentTurns = computed(() => {
    if (!currentSessionId.value) return []
    return turnsBySessionCache.value.get(currentSessionId.value) || []
  })
  
  // 记录哪些会话正在流式输出
  const streamingSessions = ref<Set<string>>(new Set())
  const completedUnreadSessionIds = ref<Set<string>>(loadCompletedUnreadSessionIds())
  
  // 当前会话是否在流式（computed，保持接口兼容）
  const isStreaming = computed(() => {
    return currentSessionId.value 
      ? streamingSessions.value.has(currentSessionId.value)
      : false
  })

  /**
   * 获取某轮对话的追问建议。仅最后一轮对话且有建议时才返回。
   * 优先使用流式收到的 turnSuggestionsMap，否则从 turn.suggestions 读取持久化数据。
   */
  function getSuggestions(turnId: string, sessionId?: string): string[] {
    if (!settingsStore.sessionPreferences.generateSuggestions) return []
    const sid = sessionId ?? currentSessionId.value
    if (!sid || !turnId) return []
    const turns = turnsBySessionCache.value.get(sid) || []
    const lastTurn = turns[turns.length - 1]
    if (!lastTurn || lastTurn.id !== turnId) return []
    // 重生进行中（pending/streaming/awaiting_approval）不显示旧建议
    if (lastTurn.status === 'pending' || lastTurn.status === 'streaming' || lastTurn.status === 'awaiting_approval') {
      return []
    }
    const fromMap = turnSuggestionsMap.value.get(turnId) || []
    if (fromMap.length > 0) return fromMap
    return lastTurn.suggestions || []
  }

  function hasPendingApprovalInMessages(sessionId: string): boolean {
    const source = messagesCache.value.get(sessionId) || []
    return source.some((msg) =>
      msg.role === 'assistant' &&
      msg.parts?.some((part: any) =>
        part?.type === 'dynamic-tool' && part?.state === 'approval-requested' && !!part?.approval?.id
      )
    )
  }

  function hasRunningToolInMessages(sessionId: string): boolean {
    const source = messagesCache.value.get(sessionId) || []
    return source.some((msg) =>
      msg.role === 'assistant' &&
      msg.parts?.some((part: any) =>
        part?.type === 'dynamic-tool' &&
        (part?.state === 'input-streaming' || part?.state === 'approval-responded')
      )
    )
  }

  const isAwaitingApproval = computed(() => {
    if (!currentSessionId.value) return false
    const sessionId = currentSessionId.value
    return hasPendingApprovalInMessages(sessionId)
  })
  
  // 临时问是否在流式
  const isTempAskStreaming = computed(() =>
    !!tempAskSessionId.value && streamingSessions.value.has(tempAskSessionId.value)
  )
  
  // 新会话的临时状态
  const pendingScenarioId = ref<string>('default-scenario')
  const pendingModel = ref<string>(SCENARIO_MODEL_PLACEHOLDER)
  const pendingProjectId = ref<string | null>(null)
  const pendingMcpServerIds = ref<string[]>([])  // 新会话的 MCP 配置
  const pendingMcpPolicy = ref<SessionMcpPolicy>('auto')  // 新会话的 MCP 策略
  const pendingMode = ref<ChatMode>('chat')  // 新会话的模式，默认 Chat
  const pendingSkillPolicy = ref<SessionSkillPolicy>('auto')  // 新会话的技能策略（auto/off）
  const pendingWebSearch = ref<WebSearchMode>('builtin')  // 新会话的网络搜索模式，默认内置搜索
  const pendingThinking = ref<ThinkingMode>('auto')  // 新会话的思考深度模式，默认自动
  const pendingManualSkillId = ref<string | null>(null)  // 新会话预选的技能 ID（一次性消费）
  
  // 临时会话状态（实际会落库，通过 session.isTemporary 标记）
  const isTemporarySession = ref(false)
  
  // 临时问状态（落库到临时会话）
  const tempAskOpen = ref(false)
  const tempAskAnchorSessionId = ref<string | null>(null)
  const tempAskSessionId = ref<string | null>(null)
  const tempAskMessages = computed(() => {
    if (!tempAskSessionId.value) return []
    return messagesCache.value.get(tempAskSessionId.value) || []
  })
  
  // 待引用内容
  const pendingQuote = ref<MessageQuote | null>(null)
  const generationRequestQueueBySession = ref<Map<string, GenerationRequestPayload[]>>(new Map())
  const submittingApprovalSessions = ref<Set<string>>(new Set())
  const abortingSessions = ref<Set<string>>(new Set())
  const approvalChatBySession = new Map<string, RendererApprovalChat>()

  const isBusy = computed(() => {
    if (!currentSessionId.value) return false
    const sessionId = currentSessionId.value
    return isStreaming.value || isAwaitingApproval.value || hasRunningToolInMessages(sessionId) || submittingApprovalSessions.value.has(sessionId)
  })

  const isSubmittingApproval = computed(() => {
    if (!currentSessionId.value) return false
    return submittingApprovalSessions.value.has(currentSessionId.value)
  })

  function loadCompletedUnreadSessionIds(): Set<string> {
    try {
      const raw = localStorage.getItem(COMPLETED_UNREAD_STORAGE_KEY)
      if (!raw) return new Set()
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return new Set()
      return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0))
    } catch (error) {
      logger.warn('loadCompletedUnreadSessionIds failed', { error })
      return new Set()
    }
  }

  function persistCompletedUnreadSessionIds(next: Set<string>) {
    try {
      localStorage.setItem(COMPLETED_UNREAD_STORAGE_KEY, JSON.stringify([...next]))
    } catch (error) {
      logger.warn('persistCompletedUnreadSessionIds failed', { error })
    }
  }

  function pruneCompletedUnreadSessionIds() {
    const alive = new Set(sessions.value.map((session) => session.id))
    const filtered = new Set([...completedUnreadSessionIds.value].filter((id) => alive.has(id)))
    if (filtered.size === completedUnreadSessionIds.value.size) return
    completedUnreadSessionIds.value = filtered
    persistCompletedUnreadSessionIds(filtered)
  }

  function markSessionCompletedUnread(sessionId: string) {
    if (!sessionId) return
    const next = new Set(completedUnreadSessionIds.value)
    next.add(sessionId)
    completedUnreadSessionIds.value = next
    persistCompletedUnreadSessionIds(next)
  }

  function clearSessionCompletedUnread(sessionId: string) {
    if (!completedUnreadSessionIds.value.has(sessionId)) return
    const next = new Set(completedUnreadSessionIds.value)
    next.delete(sessionId)
    completedUnreadSessionIds.value = next
    persistCompletedUnreadSessionIds(next)
  }

  function hasCompletedUnreadSession(sessionId: string): boolean {
    return completedUnreadSessionIds.value.has(sessionId)
  }

  function isSessionStreaming(sessionId: string): boolean {
    return streamingSessions.value.has(sessionId)
  }

  function clearSubmittingApprovalSession(sessionId: string) {
    if (!submittingApprovalSessions.value.has(sessionId)) return
    const next = new Set(submittingApprovalSessions.value)
    next.delete(sessionId)
    submittingApprovalSessions.value = next
  }

  function setSubmittingApprovalSession(sessionId: string) {
    if (submittingApprovalSessions.value.has(sessionId)) return
    const next = new Set(submittingApprovalSessions.value)
    next.add(sessionId)
    submittingApprovalSessions.value = next
  }

  function sanitizePartForAiSdk(part: MessageContentPart): MessageContentPart {
    if ((part as any)?.type !== 'dynamic-tool') return part
    const p = { ...stripDynamicToolApproval(part as any) }
    // AI SDK 期望 provider metadata 是 providerId -> record，业务侧临时字段易触发校验错误，统一剥离。
    delete p.callProviderMetadata
    return p as MessageContentPart
  }

  function mapSessionMessagesToAiSdk(sessionId: string): AppUIMessage[] {
    const source = messagesCache.value.get(sessionId) || []
    const uiMessages: AppUIMessage[] = []
    for (const msg of source) {
      if (msg.role !== 'system' && msg.role !== 'user' && msg.role !== 'assistant') continue
      uiMessages.push({
        id: msg.id,
        role: msg.role,
        parts: (msg.parts || []).map(sanitizePartForAiSdk) as any
      })
    }
    return uiMessages
  }

  function findToolApprovalPayload(toolCallId: string, fallback?: { sessionId: string; approvalId: string; toolName: string; input?: any; messageId?: string }) {
    if (fallback) {
      return {
        approvalId: fallback.approvalId,
        toolCall: {
          toolCallId,
          toolName: fallback.toolName,
          input: fallback.input
        },
        sessionId: fallback.sessionId,
        messageId: fallback.messageId || ''
      }
    }
    const sourceSessionId = currentSessionId.value
    if (!sourceSessionId) return undefined
    const source = messagesCache.value.get(sourceSessionId) || []
    for (let i = source.length - 1; i >= 0; i--) {
      const msg = source[i]
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts as any[]) {
        if (part?.type !== 'dynamic-tool') continue
        if (part?.toolCallId !== toolCallId) continue
        if (part?.state !== 'approval-requested') continue
        if (!part?.approval?.id) continue
        return {
          approvalId: part.approval.id as string,
          toolCall: {
            toolCallId,
            toolName: part.toolName || '',
            input: part.input
          },
          sessionId: sourceSessionId,
          messageId: msg.id
        }
      }
    }
    return undefined
  }

  function enqueueGenerationRequest(sessionId: string, payload: GenerationRequestPayload) {
    const next = new Map(generationRequestQueueBySession.value)
    const queue = [...(next.get(sessionId) || [])]
    queue.push(payload)
    next.set(sessionId, queue)
    generationRequestQueueBySession.value = next
  }

  function dequeueGenerationRequest(sessionId: string): GenerationRequestPayload | null {
    const next = new Map(generationRequestQueueBySession.value)
    const queue = [...(next.get(sessionId) || [])]
    const request = queue.shift() || null
    if (queue.length === 0) next.delete(sessionId)
    else next.set(sessionId, queue)
    generationRequestQueueBySession.value = next
    return request
  }

  function requeueGenerationRequest(sessionId: string, payload: GenerationRequestPayload) {
    const next = new Map(generationRequestQueueBySession.value)
    const queue = [payload, ...(next.get(sessionId) || [])]
    next.set(sessionId, queue)
    generationRequestQueueBySession.value = next
  }

  function markSessionLocallyAborted(sessionId: string) {
    const now = Date.now()
    const source = messagesCache.value.get(sessionId) || []

    let updatedTurnId: string | undefined
    for (const msg of source) {
      if (msg.role !== 'assistant') continue
      if (msg.status !== 'streaming' && msg.status !== 'pending') continue
      msg.parts = (msg.parts || []).map((part: any) => {
        if (part?.type === 'reasoning' && part?.state === 'streaming') {
          return { ...part, state: 'done' }
        }
        if (part?.type === 'dynamic-tool' && (
          part?.state === 'input-available' ||
          part?.state === 'approval-requested' ||
          part?.state === 'approval-responded' ||
          part?.state === 'input-streaming'
        )) {
          return {
            ...stripDynamicToolApproval(part),
            state: 'output-error',
            errorText: i18n.global.t('chat.store.aborted')
          }
        }
        return part
      })
      msg.status = 'aborted'
      msg.updatedAt = now
      if (!updatedTurnId && msg.turnId) updatedTurnId = msg.turnId
    }

    if (updatedTurnId) {
      updateLocalTurn(updatedTurnId, (turn) => ({
        ...turn,
        status: 'aborted',
        endedAt: turn.endedAt ?? now,
        updatedAt: now
      }), sessionId)
    }
  }

  function createApprovalTransport(sessionId: string): ChatTransport<AppUIMessage> {
    return {
      sendMessages: async ({ abortSignal, metadata }) => {
        const operation = dequeueGenerationRequest(sessionId)
        if (!operation) {
          return new ReadableStream<UIMessageChunk>({
            start(controller) {
              controller.close()
            }
          })
        }
        return new ReadableStream<UIMessageChunk>({
          start(controller) {
            let closed = false
            let aborted = false
            const close = () => {
              if (closed) return
              closed = true
              abortSignal?.removeEventListener('abort', onAbort)
              dispose()
              controller.close()
            }
            const fail = (error: unknown) => {
              if (closed) return
              closed = true
              abortSignal?.removeEventListener('abort', onAbort)
              dispose()
              controller.error(error instanceof Error ? error : new Error(String(error)))
            }
            const onAbort = () => {
              if (aborted) return
              aborted = true
              void window.ipc('chat:abort', { sessionId })
              close()
            }
            abortSignal?.addEventListener('abort', onAbort)
            const dispose = window.chat.onStream((evt) => {
              if (evt.sessionId !== sessionId) return
              controller.enqueue(evt.chunk as UIMessageChunk)
              if (evt.chunk.type === 'finish' || evt.chunk.type === 'abort' || evt.chunk.type === 'error' || evt.chunk.type === 'tool-approval-request') {
                close()
              }
            })
            void window.ipc('chat:send', JSON.parse(JSON.stringify(operation)))
              .then((result: any) => {
                if (result?.ok) return
                requeueGenerationRequest(sessionId, operation)
                fail(result?.error || i18n.global.t('chat.store.submitFailed'))
              })
              .catch((error: unknown) => {
                requeueGenerationRequest(sessionId, operation)
                fail(error)
              })
          },
          cancel() {
            // 用户主动取消时，保留队列，后续可重试
            requeueGenerationRequest(sessionId, operation)
          }
        })
      },
      reconnectToStream: async () => null
    }
  }

  function getApprovalChat(sessionId: string): RendererApprovalChat {
    const existing = approvalChatBySession.get(sessionId)
    if (existing) return existing
    const state: ChatState<AppUIMessage> = {
      status: 'ready',
      error: undefined,
      messages: mapSessionMessagesToAiSdk(sessionId),
      pushMessage: (message) => { state.messages.push(message) },
      popMessage: () => { state.messages.pop() },
      replaceMessage: (index, message) => { state.messages[index] = message },
      snapshot: <T>(thing: T) => JSON.parse(JSON.stringify(thing)) as T
    }
    const chat = new RendererApprovalChat({
      id: sessionId,
      state,
      transport: createApprovalTransport(sessionId)
    })
    approvalChatBySession.set(sessionId, chat)
    return chat
  }
  async function addToolApprovalResponse(params: {
    sessionId: string
    approvalId: string
    approved: boolean
    reason?: string
    addToWhitelist?: boolean
    toolName?: string
    args?: { command?: string }
  }) {
    const result = await window.ipc('chat:submitToolApproval', JSON.parse(JSON.stringify({
      sessionId: params.sessionId,
      approvalId: params.approvalId,
      approved: params.approved,
      reason: params.reason,
      addToWhitelist: params.addToWhitelist,
      toolName: params.toolName || '',
      args: params.args
    })))
    if (!result?.ok) {
      throw new Error(result?.error || i18n.global.t('chat.store.submitApprovalFailed'))
    }
  }
  async function confirmToolExecution(
    toolCallId: string,
    action: 'allow' | 'allow-and-whitelist' | 'reject',
    fallback?: { sessionId: string; approvalId: string; toolName: string; input?: any; messageId?: string }
  ) {
    const payload = findToolApprovalPayload(toolCallId, fallback)
    if (!payload) return
    setSubmittingApprovalSession(payload.sessionId)
    try {
      await addToolApprovalResponse({
        sessionId: payload.sessionId,
        approvalId: payload.approvalId,
        approved: action !== 'reject',
        reason: action === 'reject' ? 'User rejected' : undefined,
        addToWhitelist: action === 'allow-and-whitelist',
        toolName: payload.toolCall.toolName,
        args: payload.toolCall.input
      })
    } catch (error) {
      throw error
    } finally {
      clearSubmittingApprovalSession(payload.sessionId)
    }
  }
  // 缓存管理配置
  const MAX_CACHE_SIZE = 10  // 最多缓存 10 个会话的消息
  
  // ===== Getters =====
  const currentSession = computed(() => 
    currentSessionId.value ? sessionById.value.get(currentSessionId.value) : undefined
  )
  
  const selectedScenarioId = computed(() => {
    if (currentSessionId.value && currentSession.value) {
      return currentSession.value.scenarioId
    }
    return pendingScenarioId.value
  })
  
  const selectedScenario = computed(() => 
    settingsStore.scenarios.find(s => s.id === selectedScenarioId.value)
  )
  
  /** 当前会话的上下文轮数：优先 session 固化的值，否则用 scenario 的配置 */
  const sessionContextCount = computed(() =>
    currentSession.value?.contextCount ?? selectedScenario.value?.contextCount ?? 10
  )
  
  /** 根据 sessionId 获取上下文轮数（用于临时问、重新生成等） */
  function getContextCountForSession(sessionId: string | null): number {
    if (!sessionId) return selectedScenario.value?.contextCount ?? 10
    const s = sessionById.value.get(sessionId)
    const scenario = s ? settingsStore.scenarios.find(sc => sc.id === s.scenarioId) : selectedScenario.value
    return s?.contextCount ?? scenario?.contextCount ?? 10
  }
  
  const selectedModel = computed(() => {
    if (currentSessionId.value && currentSession.value) {
      return currentSession.value.selectedModel
    }
    return pendingModel.value
  })
  
  // 会话级 MCP 配置
  const sessionMcpServerIds = computed(() => {
    if (currentSessionId.value && currentSession.value) {
      return currentSession.value.mcpServerIds || []
    }
    return pendingMcpServerIds.value
  })

  const sessionMcpPolicy = computed(() => {
    if (currentSessionId.value && currentSession.value) {
      return currentSession.value.mcpPolicy || 'manual'
    }
    return pendingMcpPolicy.value
  })
  
  // 会话级模式配置（chat/agent）
  const sessionMode = computed(() => {
    if (currentSessionId.value && currentSession.value) {
      return currentSession.value.mode || 'chat'
    }
    return pendingMode.value
  })

  // 会话级技能策略（auto/off）
  const sessionSkillPolicy = computed(() => {
    if (currentSessionId.value && currentSession.value) {
      return currentSession.value.skillPolicy || 'auto'
    }
    return pendingSkillPolicy.value
  })
  
  // 会话级网络搜索配置（builtin/native/close 或 provider ID）
  const sessionWebSearch = computed(() => {
    if (currentSessionId.value && currentSession.value) {
      return currentSession.value.webSearch || 'builtin'
    }
    return pendingWebSearch.value
  })

  // 会话级思考深度配置（auto/off/on/standard/deep/ultra）
  const sessionThinking = computed(() => {
    if (currentSessionId.value && currentSession.value) {
      return currentSession.value.thinking || 'auto'
    }
    return pendingThinking.value
  })

  // 会话级知识库：pinned（持久，来自场景或 session） + temp（临时，发送后清空）
  const pendingKbIds = ref<string[]>([])
  const tempKbIds = ref<string[]>([])
  const sessionKbIds = computed(() => {
    if (currentSessionId.value && currentSession.value) {
      return currentSession.value.kbIds ?? []
    }
    return pendingKbIds.value
  })
  const effectiveKbIds = computed(() => {
    const pinned = sessionKbIds.value
    const temp = tempKbIds.value
    return [...new Set([...pinned, ...temp])]
  })

  const resolvedModel = computed(() => {
    const model = selectedModel.value
    
    if (model === DEFAULT_MODEL_PLACEHOLDER) {
      return defaultModel.value
    }
    
    if (model === SCENARIO_MODEL_PLACEHOLDER) {
      const scenario = selectedScenario.value
      if (!scenario) return null
      
      let scenarioModel = scenario.selectedModel
      if (scenarioModel === DEFAULT_MODEL_PLACEHOLDER) {
        return defaultModel.value
      }
      return scenarioModel
    }
    
    return model
  })
  
  const defaultModel = computed(() => {
    const model = settingsStore.defaultModel
    if (model?.providerId && model?.modelId) {
      return `${model.providerId}::${model.modelId}`
    }
    return null
  })
  
  // 获取主会话（仅显示 mainSessionId = null 的，按更新时间倒序）
  // 获取所有主会话（rootSessionId = NULL）
  const mainSessions = computed(() => 
    sessions.value
      .filter(s => !s.rootSessionId && !s.isTemporary)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  )
  
  // 获取当前主会话的分支（扁平化：所有分支都在同一层级）
  const currentBranches = computed(() => {
    if (!currentSession.value) return []
    
    const rootId = currentSession.value.rootSessionId || currentSession.value.id
    return sessions.value.filter(s => s.rootSessionId === rootId)
  })
  
  // ===== Actions =====
  async function loadSessions() {
    logger.info('loadSessions')
    sessions.value = await window.ipc('sessions:list')
    pruneCompletedUnreadSessionIds()
    if (tempAskSessionId.value) {
      const tempAskMeta = await window.ipc('sessions:get', { id: tempAskSessionId.value }) as SessionPublic | null
      if (!tempAskMeta) {
        tempAskOpen.value = false
        tempAskAnchorSessionId.value = null
        tempAskSessionId.value = null
      } else if (!sessions.value.some(s => s.id === tempAskMeta.id)) {
        sessions.value.unshift(tempAskMeta)
      }
    }
    if (currentSessionId.value) {
      let current = sessionById.value.get(currentSessionId.value)
      if (!current) {
        current = await window.ipc('sessions:get', { id: currentSessionId.value }) as SessionPublic | null
        if (current) {
          sessions.value.unshift(current)
        }
      }
      isTemporarySession.value = !!current?.isTemporary
    }
  }
  
  // 添加到缓存（带 LRU 清理）
  function addToCache(sessionId: string, msgs: MessagePublic[]) {
    // 检查缓存大小，超过限制时清理
    if (messagesCache.value.size >= MAX_CACHE_SIZE) {
      // 找出要清理的会话（不清理当前会话和正在流式的会话）
      for (const [id] of messagesCache.value) {
        if (id !== sessionId && 
            id !== currentSessionId.value && 
            !streamingSessions.value.has(id)) {
          messagesCache.value.delete(id)
          logger.info('addToCache: evicted cache', { evictedSessionId: id })
          break
        }
      }
    }
    
    messagesCache.value.set(sessionId, msgs)
  }
  
  async function loadMessages(sessionId: string) {
    logger.info('loadMessages', { sessionId })
    const [msgs, turns] = await Promise.all([
      window.ipc('messages:getDisplayMessages', { sessionId }),
      window.ipc('turns:listBySession', { sessionId })
    ])
    const nextMsgs = msgs as MessagePublic[]
    addToCache(sessionId, nextMsgs)
    clearSubmittingApprovalSession(sessionId)
    turnsBySessionCache.value.set(sessionId, turns as Turn[])
    const byId = new Map(turnsByIdCache.value)
    for (const turn of turns as Turn[]) byId.set(turn.id, turn)
    turnsByIdCache.value = byId
  }

  function getTurnById(turnId?: string | null): Turn | null {
    if (!turnId) return null
    return turnsByIdCache.value.get(turnId) ?? null
  }

  function getTurnByMessage(message?: MessagePublic | null): Turn | null {
    if (!message?.turnId) return null
    return getTurnById(message.turnId)
  }

  function getTurnsBySession(sessionId?: string | null): Turn[] {
    const targetSessionId = sessionId ?? currentSessionId.value
    if (!targetSessionId) return []
    return turnsBySessionCache.value.get(targetSessionId) || []
  }

  function upsertLocalTurn(turn: Turn, sessionId?: string) {
    const nextById = new Map(turnsByIdCache.value)
    nextById.set(turn.id, turn)
    turnsByIdCache.value = nextById

    const targetSessionId = sessionId || turn.sessionId
    if (!targetSessionId) return
    const list = [...(turnsBySessionCache.value.get(targetSessionId) || [])]
    const index = list.findIndex((t) => t.id === turn.id)
    if (index >= 0) list[index] = turn
    else list.push(turn)
    list.sort((a, b) => a.createdAt - b.createdAt)
    turnsBySessionCache.value.set(targetSessionId, list)
  }

  function createLocalPendingTurn(params: {
    turnId: string
    sessionId: string
    userMessageId?: string | null
    assistantMessageId?: string | null
    triggerType: Turn['triggerType']
    selectedModel: string
    mcpServerIds?: string[]
    mode?: ChatMode
    webSearch?: WebSearchMode
    thinking?: ThinkingMode
    effectiveThinking?: ThinkingMode
    skillId?: string | null
    citationRequired?: boolean
    citationStartIndex?: number
    parentTurnId?: string | null
  }): Turn {
    const now = Date.now()
    const turn: Turn = {
      id: params.turnId,
      sessionId: params.sessionId,
      userMessageId: params.userMessageId ?? null,
      assistantMessageId: params.assistantMessageId ?? null,
      parentTurnId: params.parentTurnId ?? null,
      triggerType: params.triggerType,
      status: 'pending',
      selectedModel: params.selectedModel,
      mcpServerIds: params.mcpServerIds,
      mode: params.mode,
      webSearch: params.webSearch,
      thinking: params.thinking,
      effectiveThinking: params.effectiveThinking,
      skillId: params.skillId ?? null,
      citationRequired: params.citationRequired ?? false,
      citationStartIndex: params.citationStartIndex ?? 0,
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now
    }
    upsertLocalTurn(turn, params.sessionId)
    return turn
  }

  function updateLocalTurn(
    turnId: string | undefined,
    updater: (turn: Turn) => Turn,
    sessionId?: string
  ) {
    if (!turnId) return
    const turn = turnsByIdCache.value.get(turnId)
    if (!turn) return
    upsertLocalTurn(updater(turn), sessionId)
  }

  function pruneTemporarySessionLocals(exceptId?: string | null) {
    const keepId = exceptId ?? null
    const temporaryIds = sessions.value
      .filter(s => s.isTemporary && s.id !== keepId)
      .map(s => s.id)
    if (temporaryIds.length === 0) return

    const toDelete = new Set(temporaryIds)
    sessions.value = sessions.value.filter(s => !toDelete.has(s.id))
    for (const id of toDelete) {
      messagesCache.value.delete(id)
      turnsBySessionCache.value.delete(id)
      streamingSessions.value.delete(id)
      clearSubmittingApprovalSession(id)
    }
  }

  async function ensureTurnLoaded(turnId?: string, sessionId?: string) {
    if (!turnId || turnsByIdCache.value.has(turnId)) return
    try {
      const turn = await window.ipc('turns:get', { id: turnId })
      if (!turn) return
      const nextById = new Map(turnsByIdCache.value)
      nextById.set(turn.id, turn as Turn)
      turnsByIdCache.value = nextById
      if (sessionId) {
        const list = [...(turnsBySessionCache.value.get(sessionId) || [])]
        if (!list.some(t => t.id === turn.id)) {
          list.push(turn as Turn)
          list.sort((a, b) => a.createdAt - b.createdAt)
          turnsBySessionCache.value.set(sessionId, list)
        }
      }
    } catch (error) {
      logger.warn('ensureTurnLoaded failed', { turnId, sessionId, error })
    }
  }
  
  async function createNewSession() {
    // 检查是否已经是新会话状态
    if (!currentSessionId.value && !isTemporarySession.value) {
      logger.info('createNewSession: already in new session state')
      return
    }
    
    logger.info('createNewSession: preparing new session')
    if (tempAskOpen.value) await closeTempAsk()
    pruneTemporarySessionLocals()
    
    currentSessionId.value = null
    isTemporarySession.value = false
    pendingScenarioId.value = 'default-scenario'
    pendingModel.value = SCENARIO_MODEL_PLACEHOLDER
    pendingMcpPolicy.value = 'auto'
    pendingMode.value = 'chat'  // 重置为默认 Chat 模式
    pendingSkillPolicy.value = 'auto'  // 重置为默认技能策略
    pendingWebSearch.value = 'builtin'  // 重置为默认内置搜索
    pendingThinking.value = 'auto'  // 重置为默认自动思考
    pendingKbIds.value = []

    // 初始化 MCP、知识库配置为当前场景的默认值
    const scenario = selectedScenario.value
    pendingMcpServerIds.value = scenario?.mcpServerIds ? [...scenario.mcpServerIds] : []
    pendingMcpPolicy.value = scenario?.mcpPolicy ?? 'auto'
    pendingSkillPolicy.value = scenario?.skillPolicy ?? 'auto'
    pendingKbIds.value = scenario?.kbIds ? [...scenario.kbIds] : []
    tempKbIds.value = []
  }

  async function createTemporarySession() {
    logger.info('createTemporarySession: creating temporary session')
    if (tempAskOpen.value) await closeTempAsk()
    pruneTemporarySessionLocals()

    const scenario = selectedScenario.value
    const mcpServerIds = scenario?.mcpServerIds ? [...scenario.mcpServerIds] : []
    const mcpPolicy = scenario?.mcpPolicy ?? 'auto'
    const skillPolicy = scenario?.skillPolicy ?? 'auto'
    const kbIds = scenario?.kbIds ? [...scenario.kbIds] : []
    const mode: ChatMode = 'chat'
    const webSearch: WebSearchMode = 'builtin'
    const thinking: ThinkingMode = 'auto'

    const tempSession = await window.ipc('sessions:create', JSON.parse(JSON.stringify({
      selectedModel: SCENARIO_MODEL_PLACEHOLDER,
      scenarioId: selectedScenarioId.value || 'default-scenario',
      title: i18n.global.t('chat.sessionList.tempSession'),
      mcpServerIds,
      mcpPolicy,
      mode,
      skillPolicy,
      webSearch,
      thinking,
      kbIds,
      isTemporary: true,
      temporaryType: 'session'
    })))

    currentSessionId.value = tempSession.id
    isTemporarySession.value = true
    sessions.value.unshift(tempSession)
    messagesCache.value.set(tempSession.id, [])
    turnsBySessionCache.value.set(tempSession.id, [])
    pendingKbIds.value = []
    tempKbIds.value = []
  }

  async function switchSession(sessionId: string) {
    try {
      logger.info('switchSession', { sessionId })
      
      if (tempAskOpen.value) await closeTempAsk()
      pruneTemporarySessionLocals(sessionId)
      
      // 重置 pending 状态（切换到已有会话，清空新会话的临时配置）
      pendingMcpServerIds.value = []
      pendingMcpPolicy.value = 'auto'
      pendingKbIds.value = []
      tempKbIds.value = []

      currentSessionId.value = sessionId
      clearSessionCompletedUnread(sessionId)
      let sessionMeta = sessionById.value.get(sessionId)
      if (!sessionMeta) {
        sessionMeta = await window.ipc('sessions:get', { id: sessionId }) as SessionPublic | null
        if (sessionMeta) {
          sessions.value.unshift(sessionMeta)
        }
      }
      isTemporarySession.value = !!sessionMeta?.isTemporary
      
      // 优先使用缓存
      const msgs = messagesCache.value.get(sessionId)
      const turns = turnsBySessionCache.value.get(sessionId)
      if (!msgs || !turns) {
        // 缓存未命中，从数据库加载
        logger.info('switchSession: cache miss, loading from DB', { sessionId })
        await loadMessages(sessionId)
      } else {
        logger.info('switchSession: cache hit', { sessionId, msgCount: msgs.length, turnCount: turns.length })
      }
      
      const pendingTarget = pendingScrollTarget.value
      if (pendingTarget?.sessionId === sessionId) {
        emitter.emit('chat:scroll-to-message', pendingTarget.messageId)
      } else {
        // 切换会话后自动滚动到底部
        emitter.emit('chat:scroll-to-bottom')
      }
    } catch (error) {
      logger.error('switchSession failed', { error })
    }
  }

  function setPendingScrollTarget(target: PendingScrollTarget | null) {
    pendingScrollTarget.value = target
  }

  function clearPendingScrollTarget() {
    pendingScrollTarget.value = null
  }
  
  async function deleteSession(sessionId: string) {
    if (tempAskAnchorSessionId.value === sessionId) {
      await closeTempAsk()
    }
    await window.ipc('sessions:delete', { id: sessionId })
    sessions.value = sessions.value
      .filter(s => s.id !== sessionId)
      .map((session) => {
        if (session.rootSessionId === sessionId) {
          return {
            ...session,
            rootSessionId: null,
            parentSessionId: null,
            forkFromMessageId: null,
            forkPointMessageId: null
          }
        }

        if (session.parentSessionId === sessionId) {
          return {
            ...session,
            parentSessionId: null,
            forkFromMessageId: null,
            forkPointMessageId: null
          }
        }

        return session
      })

    // 清理缓存
    messagesCache.value.delete(sessionId)
    turnsBySessionCache.value.delete(sessionId)

    // 清理流式状态
    streamingSessions.value.delete(sessionId)
    approvalChatBySession.delete(sessionId)
    generationRequestQueueBySession.value.delete(sessionId)
    clearSubmittingApprovalSession(sessionId)
    clearSessionCompletedUnread(sessionId)
    
    if (currentSessionId.value === sessionId) {
      currentSessionId.value = null
      isTemporarySession.value = false
    }

    if (tempAskSessionId.value === sessionId) {
      tempAskOpen.value = false
      tempAskAnchorSessionId.value = null
      tempAskSessionId.value = null
    }
  }
  
  function touchLocalSession(sessionId: string, ts: number = Date.now()) {
    const session = sessionById.value.get(sessionId)
    if (!session) return
    session.updatedAt = ts
  }

  async function updateSessionTitle(sessionId: string, newTitle: string) {
    await window.ipc('sessions:updateTitle', { id: sessionId, title: newTitle })
    const session = sessionById.value.get(sessionId)
    if (session) {
      session.title = newTitle
      // 后端会写 updatedAt，这里同步一份，保证会话列表时间/排序即时刷新
      session.updatedAt = Date.now()
    }
  }

  async function moveSessionToProject(sessionId: string, projectId: string | null): Promise<number> {
    const result = await window.ipc('sessions:moveToProject', { id: sessionId, projectId }) as { sessionIds?: string[] } | null
    await loadSessions()
    return result?.sessionIds?.length ?? 0
  }

  async function updateSessionFavorite(sessionId: string, isFavorite: boolean) {
    await window.ipc('sessions:updateFavorite', { id: sessionId, isFavorite })
    const session = sessionById.value.get(sessionId)
    if (session) {
      session.isFavorite = isFavorite
    }
  }

  async function updateSessionArchive(sessionId: string, isArchived: boolean) {
    await window.ipc('sessions:updateArchive', { id: sessionId, isArchived })
    const session = sessionById.value.get(sessionId)
    if (session) {
      session.isArchived = isArchived
    }
  }

  function fallbackTitleFromFirstMessage(parts: MessageContentPart[], maxChars = 12) {
    // 提取文本和图片数量
    const text = extractAnswerTextFromContent(parts)
    const imageCount = parts.filter(p => p.type === 'file' && p.mediaType.startsWith('image/')).length
    
    const normalized = text
      .trim()
      .replace(/\s+/g, ' ')

    // 如果有图片但没有文本，或者文本是兜底提示
    if (imageCount > 0 && (!normalized || normalized === AUTO_GENERATED_IMAGE_PROMPT)) {
      return imageCount === 1
        ? i18n.global.t('chat.store.imageConsultationSingle')
        : i18n.global.t('chat.store.imageConsultationMultiple', { count: imageCount })
    }

    if (!normalized) return i18n.global.t('chat.sessionList.newSession')
    if (normalized.length <= maxChars) return normalized
    return normalized.slice(0, maxChars)
  }

  function getBranchTitleSuffix() {
    return ` - ${i18n.global.t('chat.store.branchSuffix')}`
  }

  async function generateAndUpdateSessionTitle(sessionId: string, firstMessage: MessageContentPart[], initialTitle: string) {
    if (settingsStore.sessionPreferences.titleGenerationMode !== 'ai') return
    try {
      // 如果用户已经改过标题（或被别的流程改过），就不要覆盖
      const current = sessionById.value.get(sessionId)
      if (!current || current.title !== initialTitle) return

      const result = await window.ipc('sessions:generateTitle', { parts: firstMessage })
      if (!result?.ok || !result?.title || typeof result.title !== 'string' || !result.title.trim()) {
        return
      }

      // 二次校验：仍然只在标题未变化时覆盖
      const latest = sessionById.value.get(sessionId)
      if (!latest || latest.title !== initialTitle) return

      const newTitle = result.title.trim()
      if (newTitle && newTitle !== initialTitle) {
        await updateSessionTitle(sessionId, newTitle)
      }
    } catch (error) {
      // 失败完全忽略（兜底标题已写入）
      logger.warn('generateAndUpdateSessionTitle failed', { error })
    }
  }

  async function generateBranchTitle(sessionId: string, firstMessage: MessageContentPart[], initialTitle: string) {
    if (settingsStore.sessionPreferences.titleGenerationMode !== 'ai') return
    try {
      // 第一次检查：标题是否还是初始的分支后缀格式
      const current = sessionById.value.get(sessionId)
      if (!current || !current.title.endsWith(getBranchTitleSuffix())) return
      if (current.title !== initialTitle) return

      const result = await window.ipc('sessions:generateTitle', { parts: firstMessage })
      if (!result?.ok || !result?.title || typeof result.title !== 'string' || !result.title.trim()) {
        return
      }

      // 第二次检查：标题是否仍然未变
      const latest = sessionById.value.get(sessionId)
      if (!latest || latest.title !== initialTitle) return

      const newTitle = result.title.trim()
      if (newTitle && newTitle !== initialTitle) {
        await updateSessionTitle(sessionId, newTitle)
      }
    } catch (error) {
      // 失败完全忽略（兜底标题已写入）
      logger.warn('generateBranchTitle failed', { error })
    }
  }
  
  function setScenario(scenarioId: string) {
    logger.info('setScenario', { scenarioId })

    if (currentSessionId.value) {
      // 普通会话：更新后端会话场景
      window.ipc('sessions:updateScenario', { 
        id: currentSessionId.value, 
        scenarioId 
      })
      const session = currentSession.value
      if (session) {
        session.scenarioId = scenarioId
        touchLocalSession(session.id)
      }
    } else {
      // 新会话：临时保存场景，待会话创建后保存到后端
      pendingScenarioId.value = scenarioId
      
      // 同步新场景的 MCP、知识库配置
      const scenario = settingsStore.scenarios.find(s => s.id === scenarioId)
      pendingMcpServerIds.value = scenario?.mcpServerIds ? [...scenario.mcpServerIds] : []
      pendingMcpPolicy.value = scenario?.mcpPolicy ?? 'auto'
      pendingSkillPolicy.value = scenario?.skillPolicy ?? 'auto'
      pendingKbIds.value = scenario?.kbIds ? [...scenario.kbIds] : []
      tempKbIds.value = []
    }
  }
  
  function setModel(model: string) {
    logger.info('setModel', { model })

    if (currentSessionId.value) {
      window.ipc('sessions:updateModel', { 
        id: currentSessionId.value, 
        selectedModel: model 
      })
      const session = currentSession.value
      if (session) {
        session.selectedModel = model
        touchLocalSession(session.id)
      }
    } else {
      pendingModel.value = model
    }
  }
  
  function setProject(projectId: string | null) {
    logger.info('setProject', { projectId })

    if (currentSessionId.value) {
      window.ipc('sessions:updateProject', { 
        id: currentSessionId.value, 
        projectId 
      })
      const session = currentSession.value
      if (session) {
        session.projectId = projectId
        touchLocalSession(session.id)
      }
    } else {
      pendingProjectId.value = projectId
    }
  }
  
  function updateSessionMcpServers(mcpServerIds: string[]) {
    logger.info('updateSessionMcpServers', { mcpServerIds })

    if (currentSessionId.value) {
      // 已创建的会话：更新数据库
      window.ipc('sessions:updateMcpServers', { 
        id: currentSessionId.value, 
        mcpServerIds 
      })
      const session = currentSession.value
      if (session) {
        session.mcpServerIds = mcpServerIds
        touchLocalSession(session.id)
      }
    } else {
      // 新会话：只更新 pending 状态，待会话创建后保存到后端
      pendingMcpServerIds.value = mcpServerIds
    }
  }

  function updateSessionMcpPolicy(mcpPolicy: SessionMcpPolicy) {
    logger.info('updateSessionMcpPolicy', { mcpPolicy })

    if (currentSessionId.value) {
      window.ipc('sessions:updateMcpPolicy', {
        id: currentSessionId.value,
        mcpPolicy
      })
      const session = currentSession.value
      if (session) {
        session.mcpPolicy = mcpPolicy
        touchLocalSession(session.id)
      }
    } else {
      pendingMcpPolicy.value = mcpPolicy
    }
  }
  
  function updateSessionMode(mode: ChatMode) {
    logger.info('updateSessionMode', { mode })

    if (currentSessionId.value) {
      // 已创建的会话：更新数据库
      window.ipc('sessions:updateMode', { 
        id: currentSessionId.value, 
        mode 
      })
      const session = currentSession.value
      if (session) {
        session.mode = mode
        touchLocalSession(session.id)
      }
    } else {
      // 新会话：只更新 pending 状态，待会话创建后保存到后端
      pendingMode.value = mode
    }
  }

  function updateSessionSkillPolicy(skillPolicy: SessionSkillPolicy) {
    logger.info('updateSessionSkillPolicy', { skillPolicy })

    if (currentSessionId.value) {
      window.ipc('sessions:updateSkillPolicy', {
        id: currentSessionId.value,
        skillPolicy
      })
      const session = currentSession.value
      if (session) {
        session.skillPolicy = skillPolicy
        touchLocalSession(session.id)
      }
    } else {
      pendingSkillPolicy.value = skillPolicy
    }
  }
  
  function updateSessionWebSearch(webSearch: WebSearchMode) {
    logger.info('updateSessionWebSearch', { webSearch })

    if (currentSessionId.value) {
      // 已创建的会话：更新数据库
      window.ipc('sessions:updateWebSearch', { 
        id: currentSessionId.value, 
        webSearch 
      })
      const session = currentSession.value
      if (session) {
        session.webSearch = webSearch
        touchLocalSession(session.id)
      }
    } else {
      // 新会话：只更新 pending 状态，待会话创建后保存到后端
      pendingWebSearch.value = webSearch
    }
  }

  function updateSessionThinking(thinking: ThinkingMode) {
    logger.info('updateSessionThinking', { thinking })

    if (currentSessionId.value) {
      window.ipc('sessions:updateThinking', {
        id: currentSessionId.value,
        thinking
      })
      const session = currentSession.value
      if (session) {
        session.thinking = thinking
        touchLocalSession(session.id)
      }
    } else {
      pendingThinking.value = thinking
    }
  }

  async function updateSessionKbIds(ids: string[]) {
    const next = [...ids]
    if (currentSessionId.value && currentSession.value) {
      await window.ipc('sessions:updateKbIds', { id: currentSessionId.value, kbIds: next })
      const session = sessionById.value.get(currentSessionId.value)
      if (session) session.kbIds = next
    } else {
      pendingKbIds.value = next
    }
  }

  function addKbToTemp(kbId: string) {
    if (tempKbIds.value.includes(kbId) || sessionKbIds.value.includes(kbId)) return
    tempKbIds.value = [...tempKbIds.value, kbId]
  }

  function removeKbFromSelection(kbId: string) {
    if (sessionKbIds.value.includes(kbId)) {
      const next = sessionKbIds.value.filter(id => id !== kbId)
      void updateSessionKbIds(next)
    } else if (tempKbIds.value.includes(kbId)) {
      tempKbIds.value = tempKbIds.value.filter(id => id !== kbId)
    }
  }

  async function toggleKbPin(kbId: string) {
    const pinned = sessionKbIds.value
    const temp = tempKbIds.value
    if (pinned.includes(kbId)) {
      const nextPinned = pinned.filter(id => id !== kbId)
      await updateSessionKbIds(nextPinned)
      tempKbIds.value = [...temp, kbId]
    } else if (temp.includes(kbId)) {
      tempKbIds.value = temp.filter(id => id !== kbId)
      await updateSessionKbIds([...pinned, kbId])
    }
  }
  
  /**
   * 触发 AI 生成的核心函数（统一入口）
   * - 新建模式：assistantMessageId 传前端生成的 ID
   * - 替换模式：existingAssistantMessageId 传要重置的现有消息 ID
   */
  async function triggerGeneration(params: {
    sessionId: string;
    turnId?: string;
    assistantMessageId?: string;        // 新建模式：前端生成的 ID
    existingAssistantMessageId?: string; // 替换模式：要重置的现有消息 ID
    userMessageId: string;
    dialogMessages: Array<Pick<AppUIMessage, 'role' | 'parts'>>;
    selectedModel: string;
    mcpServerIds: string[];
    mcpSelection?: McpSelectionPayload;  // MCP 策略（本次请求）
    mode: ChatMode;  // 发送模式
    skillSelection?: SkillSelectionPayload;  // 技能策略（本次请求）
    webSearch?: WebSearchMode;  // 网络搜索模式
    thinking?: ThinkingMode;  // 思考深度模式
    scenarioId?: string;  // 临时会话需要
    citationRequired?: boolean;  // 是否需要在回答中标注引用
    citationStartIndex?: number;  // 网络搜索来源起始序号（0=无知识库）
  }) {
    streamingSessions.value.add(params.sessionId)

    let skillSelectionToUse = params.skillSelection
    if (!skillSelectionToUse) {
      const session = sessionById.value.get(params.sessionId)
      const fallbackPolicy: SessionSkillPolicy = session?.skillPolicy ?? sessionSkillPolicy.value
      skillSelectionToUse = { mode: fallbackPolicy }
    }

    let mcpSelectionToUse = params.mcpSelection
    if (!mcpSelectionToUse) {
      const session = sessionById.value.get(params.sessionId)
      const fallbackPolicy: SessionMcpPolicy = session?.mcpPolicy ?? sessionMcpPolicy.value
      mcpSelectionToUse = fallbackPolicy === 'manual'
        ? { mode: 'manual', serverIds: [...params.mcpServerIds] }
        : { mode: fallbackPolicy }
    }

    const payload: GenerationRequestPayload = {
      sessionId: params.sessionId,
      turnId: params.turnId,
      assistantMessageId: params.assistantMessageId,
      existingAssistantMessageId: params.existingAssistantMessageId,
      userMessageId: params.userMessageId,
      messages: params.dialogMessages,
      selectedModel: params.selectedModel,
      mcpServerIds: params.mcpServerIds,
      ...(mcpSelectionToUse && { mcpSelection: mcpSelectionToUse }),
      mode: params.mode,
      ...(skillSelectionToUse && { skillSelection: skillSelectionToUse }),
      webSearch: params.webSearch,
      thinking: params.thinking,
      ...(params.scenarioId && { scenarioId: params.scenarioId }),
      ...(params.citationRequired !== undefined && { citationRequired: params.citationRequired }),
      ...(params.citationStartIndex !== undefined && { citationStartIndex: params.citationStartIndex })
    }
    enqueueGenerationRequest(params.sessionId, payload)
    const sessionChat = getApprovalChat(params.sessionId)
    sessionChat.messages = mapSessionMessagesToAiSdk(params.sessionId)
    await sessionChat.sendMessage()
  }
  
  async function sendMessage(parts: MessageContentPart[], manualSkillId?: string | null) {
    // 检查是否为空（没有文本也没有附件）
    if (parts.length === 0) return
    
    const hasText = parts.some(p => p.type === 'text' && p.text.trim())
    const hasFiles = parts.some(p => p.type === 'file')
    if (!hasText && !hasFiles) return
    
    const model = resolvedModel.value
    if (!model) {
      logger.error('sendMessage: no model selected')
      toast.error(i18n.global.t('chat.input.error.modelNotConfigured'))
      return
    }
    
    let assistantMessageId: string | null = null
    let pendingTurnId: string | null = null
    let sessionId: string | null = currentSessionId.value
    try {
      // 立即清空 tempKbIds，与笔记一致（badge 马上消失）；后续用 snapshot
      const tempKbIdsSnapshot = [...tempKbIds.value]
      tempKbIds.value = []

      // 1. 确保会话存在（懒创建）
      let initialTitle: string | null = null
      
      if (!sessionId) {
        initialTitle = fallbackTitleFromFirstMessage(parts, 12)
        
        const mcpServerIds = pendingMcpServerIds.value
        const mcpPolicy = pendingMcpPolicy.value
        const mode = pendingMode.value
        const skillPolicy = pendingSkillPolicy.value
        const webSearch = pendingWebSearch.value
        const thinking = pendingThinking.value
        
        const newSession = await window.ipc('sessions:create', JSON.parse(JSON.stringify({
          selectedModel: pendingModel.value,
          scenarioId: pendingScenarioId.value,
          title: initialTitle,
          projectId: pendingProjectId.value,
          mcpServerIds,
          mcpPolicy,
          mode,
          skillPolicy,
          webSearch,
          thinking,
          kbIds: [...pendingKbIds.value]
        })))
        sessionId = newSession.id
        currentSessionId.value = sessionId
        isTemporarySession.value = !!newSession.isTemporary
        sessions.value.unshift(newSession)
        
        // 为新会话初始化缓存
        messagesCache.value.set(sessionId, [])

        // 清空 pending 状态
        pendingKbIds.value = []

        // 清空其余 pending 状态
        pendingMcpServerIds.value = []
        pendingMcpPolicy.value = 'auto'
        pendingMode.value = 'chat'  // 重置为默认值
        pendingSkillPolicy.value = 'auto'  // 重置为默认值
        pendingWebSearch.value = 'builtin'  // 重置为默认值
        pendingThinking.value = 'auto'  // 重置为默认值

        logger.info('sendMessage: created new session', { sessionId, mcpServerIds, mcpPolicy, mode, skillPolicy, webSearch, thinking })
      } else {
        isTemporarySession.value = !!sessionById.value.get(sessionId)?.isTemporary
      }

      // 2. 准备引用和用户原文（同步，不阻塞）
      const quote = pendingQuote.value
      const quoteData = quote ? { ...toRaw(quote), parts: [...toRaw(quote).parts] } : null
      let displayContent = upsertQuotePart(parts, quoteData)
      const apiBaseContent = parseMessageContent(resolveMessageContent({ parts, quote }))
      pendingQuote.value = null

      // 2.5 发送前校验（pinned + temp 分别校验，提前执行以便将 data-kb 写入 displayContent）
      let mcpServerIdsToUse = sessionMcpServerIds.value
      let webSearchToUse = sessionWebSearch.value
      const thinkingToUse = sessionThinking.value
      let pinnedKbIdsToUse = [...sessionKbIds.value]
      let tempKbIdsToUse = [...tempKbIdsSnapshot]
      let kbListForNames: Array<{ id: string; name: string }> = []
      try {
        const [kbList, providers, mcpServers] = await Promise.all([
          window.ipc('kb:list'),
          window.ipc('webSearch:listProviders'),
          window.ipc('mcp:listServers')
        ])
        kbListForNames = kbList as Array<{ id: string; name: string }>
        const validKbIds = new Set(kbListForNames.map(kb => kb.id))
        const validWebSearch = new Set([
          'builtin', 'native', 'close',
          ...(providers as { id: string; enabled: boolean }[]).filter(p => p.enabled).map(p => p.id)
        ])
        const validMcpIds = new Set((mcpServers as { id: string }[]).map(s => s.id))
        pinnedKbIdsToUse = pinnedKbIdsToUse.filter(id => validKbIds.has(id))
        tempKbIdsToUse = tempKbIdsToUse.filter(id => validKbIds.has(id))
        if (pinnedKbIdsToUse.length !== sessionKbIds.value.length) await updateSessionKbIds(pinnedKbIdsToUse)
        if (!validWebSearch.has(webSearchToUse)) {
          webSearchToUse = 'builtin'
          updateSessionWebSearch(webSearchToUse)
        }
        mcpServerIdsToUse = mcpServerIdsToUse.filter(id => validMcpIds.has(id))
        if (mcpServerIdsToUse.length !== sessionMcpServerIds.value.length) await updateSessionMcpServers(mcpServerIdsToUse)
      } catch (e) {
        logger.error('sendMessage: validate session options failed', { error: e })
      }

      const kbIdsToUse = [...new Set([...pinnedKbIdsToUse, ...tempKbIdsToUse])]

      // 2.6 将 data-kb 写入 displayContent（与笔记的 data-note-context 一致，创建时 parts 即完整）
      if (kbIdsToUse.length > 0) {
        const kbs = kbIdsToUse.map(id => {
          const kb = kbListForNames.find(k => k.id === id)
          return { id, name: kb?.name ?? id }
        })
        displayContent = upsertKbPart(displayContent, { kbs })
      }

      // 3. 创建用户消息 + assistant 占位并展示（displayContent 已含 data-kb，与笔记一致）
      const mcpServerIds = mcpServerIdsToUse
      const mode = sessionMode.value
      const webSearch = webSearchToUse
      const thinking = thinkingToUse
      pendingTurnId = nanoid()
      const userMessage: MessagePublic = await window.ipc('messages:createUser', JSON.parse(JSON.stringify({
        sessionId,
        turnId: pendingTurnId,
        parts: displayContent,
        contextSources: undefined
      })))

      let msgs = messagesCache.value.get(sessionId)
      if (!msgs) {
        msgs = []
        messagesCache.value.set(sessionId, msgs)
      }
      assistantMessageId = nanoid()
      const assistantMessage: MessagePublic = {
        id: assistantMessageId,
        sessionId,
        turnId: pendingTurnId,
        role: 'assistant',
        parts: [{ type: 'text', text: '' }],
        createdAt: Date.now(),
        status: 'pending'
      }
      createLocalPendingTurn({
        turnId: pendingTurnId,
        sessionId,
        userMessageId: userMessage.id,
        assistantMessageId,
        triggerType: 'submit',
        selectedModel: model,
        mcpServerIds,
        mode,
        webSearch,
        thinking,
        effectiveThinking: thinking,
        skillId: manualSkillId ?? null
      })
      msgs.push(userMessage)
      msgs.push(assistantMessage)
      emitter.emit('chat:scroll-to-bottom')
      touchLocalSession(sessionId)
      logger.info('sendMessage: created user + assistant placeholder, doing RAG next')

      // 4. 知识库检索（耗时），更新 contextSources（data-kb 已在 step 2.6 写入，创建时 parts 即完整）
      let contextSources: CitationSource[] = []
      let contentForApi: MessageContentPart[] = apiBaseContent
      if (kbIdsToUse.length > 0) {
        const query = extractAnswerTextFromContent(parts).trim()
        if (query) {
          try {
            const rawTopK = selectedScenario.value?.kbRecallTopK ?? 5
            const topK = Math.min(50, Math.max(1, rawTopK))
            const minScore = selectedScenario.value?.kbRecallMinScore ?? 0.75
            const result = await window.ipc('kb:search', { query, kbIds: kbIdsToUse, topK, minScore }) as {
              ok?: boolean
              results?: Array<{
                chunkId: number;
                kbId: string;
                kbName?: string;
                kbItemId?: string;
                kbItemType?: 'text' | 'file' | 'directory' | 'url';
                kbItemTitle?: string;
                content: string;
                source?: string;
                title?: string;
                url?: string;
              }>
            }
            if (result?.ok && result.results?.length) {
              const results = result.results
              contextSources = results.map((r, i) => ({
                index: i + 1,
                id: `S${i + 1}`,
                kind: 'knowledge',
                source: r.source,
                title: r.title,
                content: r.content,
                url: r.url,
                kbId: r.kbId,
                kbName: r.kbName ?? r.source,
                kbItemId: r.kbItemId,
                kbItemType: r.kbItemType,
                kbItemTitle: r.kbItemTitle ?? r.title,
                chunkId: r.chunkId
              }))
              contentForApi = buildRagInjectedContent(apiBaseContent, contextSources)
              // 同步更新 cache 中的 user 消息（含 contextSources），以触发 Vue 响应式
              const uidx = msgs.findIndex(m => m.id === userMessage.id)
              if (uidx >= 0) msgs[uidx] = { ...msgs[uidx], contextSources }
            }
          } catch (e) {
            logger.error('sendMessage: kb:search failed', { error: e })
          }
        }
        // 更新 contextSources（parts 创建时已含 data-kb，无需再更新）
        await window.ipc('messages:update', { id: userMessage.id, updates: { contextSources } } as any)
      }

      const finalPrompt = serializeMessageContent(contentForApi)

      // 6. 异步生成更好的标题（只在首条消息创建新会话时触发）
      // 临时会话不需要生成标题
      if (initialTitle && !isTemporarySession.value) {
        void generateAndUpdateSessionTitle(sessionId, parts, initialTitle)
      }

      // 2.2 分支会话：检查是否需要生成标题（分叉后第一条消息）
      // 临时会话不支持分支
      if (!isTemporarySession.value) {
        const currentSession = sessionById.value.get(sessionId)
        if (currentSession && currentSession.title.endsWith(getBranchTitleSuffix())) {
          // 这是分支会话，且标题仍然是初始的分支后缀格式
          // 说明这是分叉后的第一条消息，触发标题生成
          void generateBranchTitle(sessionId, parts, currentSession.title)
        }
      }

      const citationRequired = contextSources.length > 0 || (webSearchToUse !== 'close' && webSearchToUse !== 'native')
      const citationStartIndex = contextSources.length

      const contextRounds = sessionContextCount.value
      const filteredMsgs = msgs.filter(m => isCompletedMessageStatus(m.status) && !m.isDeleted && m.id !== userMessage.id)
      const historyMessages = sliceByRounds(filteredMsgs, contextRounds)
      
      const dialogMessages = prepareDialogMessages({
        historyMessages,
        finalPrompt
      })
      
      await triggerGeneration({
        sessionId,
        turnId: pendingTurnId,
        assistantMessageId,
        userMessageId: userMessage.id,
        dialogMessages,
        selectedModel: model,
        mcpServerIds: mcpServerIdsToUse,
        mcpSelection: sessionMcpPolicy.value === 'manual'
          ? { mode: 'manual', serverIds: mcpServerIdsToUse }
          : { mode: sessionMcpPolicy.value },
        mode: sessionMode.value,
        skillSelection: manualSkillId
          ? { mode: 'manual', skillId: manualSkillId }
          : { mode: sessionSkillPolicy.value },
        webSearch: webSearchToUse,
        thinking: thinkingToUse,
        citationRequired,
        citationStartIndex
      })
      
    } catch (error) {
      logger.error('sendMessage failed', { error })
      if (sessionId) {
        streamingSessions.value.delete(sessionId)
      }
      // 若已创建过 assistant 占位，将其标为 error
      if (assistantMessageId && sessionId) {
        const list = messagesCache.value.get(sessionId)
        const msg = list?.find(m => m.id === assistantMessageId)
        if (msg) msg.status = 'error'
      }
    }
  }
  
  async function openTempAsk() {
    if (!currentSessionId.value || isTemporarySession.value) return
    const anchorSession = currentSession.value
    if (!anchorSession) return

    if (tempAskOpen.value && tempAskSessionId.value) {
      await closeTempAsk()
    }

    const tempSession = await window.ipc('sessions:create', JSON.parse(JSON.stringify({
      selectedModel: anchorSession.selectedModel || SCENARIO_MODEL_PLACEHOLDER,
      scenarioId: anchorSession.scenarioId,
      title: i18n.global.t('chat.tempAsk.title'),
      mcpServerIds: [],
      mcpPolicy: 'off',
      mode: 'chat',
      skillPolicy: 'off',
      webSearch: 'close',
      thinking: 'auto',
      kbIds: [],
      isTemporary: true,
      temporaryType: 'ask'
    })))

    tempAskAnchorSessionId.value = anchorSession.id
    tempAskSessionId.value = tempSession.id
    tempAskOpen.value = true
    sessions.value.unshift(tempSession)
    messagesCache.value.set(tempSession.id, [])
    turnsBySessionCache.value.set(tempSession.id, [])
    isTemporarySession.value = !!anchorSession.isTemporary
  }
  
  async function closeTempAsk() {
    const targetSessionId = tempAskSessionId.value
    tempAskOpen.value = false
    tempAskAnchorSessionId.value = null
    tempAskSessionId.value = null

    if (targetSessionId) {
      try {
        await abortChat(targetSessionId)
      } catch (error) {
        logger.warn('closeTempAsk: abort temp ask session failed', { targetSessionId, error })
      }
      try {
        await deleteSession(targetSessionId)
      } catch (error) {
        logger.warn('closeTempAsk: delete temp ask session failed', { targetSessionId, error })
      }
      approvalChatBySession.delete(targetSessionId)
      generationRequestQueueBySession.value.delete(targetSessionId)
      streamingSessions.value.delete(targetSessionId)
    }
  }
  
  function abortTempAsk() {
    if (!tempAskSessionId.value) return
    void abortChat(tempAskSessionId.value)
  }
  
  async function sendTempAsk(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const anchorSessionId = tempAskAnchorSessionId.value
    const tempSessionId = tempAskSessionId.value
    if (!anchorSessionId || !tempSessionId) {
      toast.error(i18n.global.t('chat.tempAsk.error.expired'))
      logger.warn('sendTempAsk skipped: missing temp ask session or anchor')
      return
    }

    const model = resolvedModel.value
    if (!model) {
      toast.error(i18n.global.t('chat.tempAsk.error.selectModel'))
      return
    }

    const userContent = [{ type: 'text' as const, text: trimmed }]
    const pendingTurnId = nanoid()
    const userMessage: MessagePublic = await window.ipc('messages:createUser', JSON.parse(JSON.stringify({
      sessionId: tempSessionId,
      turnId: pendingTurnId,
      parts: userContent
    })))

    let tempMsgs = messagesCache.value.get(tempSessionId)
    if (!tempMsgs) {
      tempMsgs = []
      messagesCache.value.set(tempSessionId, tempMsgs)
    }
    tempMsgs.push(userMessage)

    const assistantMessageId = nanoid()
    const assistantMessage: MessagePublic = {
      id: assistantMessageId,
      sessionId: tempSessionId,
      turnId: pendingTurnId,
      role: 'assistant',
      parts: [{ type: 'text', text: '' }],
      createdAt: Date.now(),
      status: 'pending'
    }
    tempMsgs.push(assistantMessage)
    createLocalPendingTurn({
      turnId: pendingTurnId,
      sessionId: tempSessionId,
      userMessageId: userMessage.id,
      assistantMessageId,
      triggerType: 'submit',
      selectedModel: model,
      mcpServerIds: [],
      mode: 'chat',
      webSearch: 'close',
      thinking: 'auto',
      effectiveThinking: 'auto',
      skillId: null
    })

    const contextRounds = getContextCountForSession(anchorSessionId)
    const anchorMsgs = messagesCache.value.get(anchorSessionId) || []
    const filteredAnchor = anchorMsgs.filter(m => isCompletedMessageStatus(m.status) && !m.isDeleted)
    const historyFromAnchor = sliceByRounds(filteredAnchor, contextRounds)
    const historyFromTemp = (messagesCache.value.get(tempSessionId) || [])
      .slice(0, -2)
      .filter(m => isCompletedMessageStatus(m.status) && !m.isDeleted)
    const historyMessages = [...historyFromAnchor, ...historyFromTemp]
    const dialogMessages = prepareDialogMessages({
      historyMessages,
      finalPrompt: serializeMessageContent(userContent)
    })

    streamingSessions.value.add(tempSessionId)

    try {
      await triggerGeneration({
        sessionId: tempSessionId,
        turnId: pendingTurnId,
        assistantMessageId,
        userMessageId: userMessage.id,
        dialogMessages,
        selectedModel: model,
        mcpServerIds: [],
        mcpSelection: { mode: 'off' },
        mode: 'chat',
        skillSelection: { mode: 'off' },
        webSearch: 'close',
        thinking: 'auto',
        citationRequired: false,
        citationStartIndex: 0
      })
    } catch (error) {
      streamingSessions.value.delete(tempSessionId)
      const placeholder = tempMsgs.find(m => m.id === assistantMessageId)
      if (placeholder) placeholder.status = 'error'
      toast.error({
        title: i18n.global.t('chat.tempAsk.error.failed'),
        description: error instanceof Error ? error.message : String(error)
      })
      logger.error('sendTempAsk failed', { error })
    }
  }
  
  async function handleStreamChunk(inputEvent: StreamEvent) {
    const { sessionId, messageId, turnId, chunk } = inputEvent
    if (!sessions.value.some(s => s.id === sessionId)) {
      return
    }
    if (
      abortingSessions.value.has(sessionId) &&
      chunk.type !== 'abort' &&
      chunk.type !== 'error'
    ) {
      return
    }
    clearSubmittingApprovalSession(sessionId)
    if (!turnId) {
      logger.error('handleStreamChunk: missing turnId', { sessionId, messageId, chunkType: chunk.type })
      return
    }
    if (turnId) {
      void ensureTurnLoaded(turnId, sessionId)
    }
    const metadata = (chunk as any).messageMetadata as StreamChunkMetadata | undefined
    let event: any = null
    if (chunk.type === 'text-start') event = { type: 'text-start', sessionId, messageId, turnId }
    else if (chunk.type === 'text-delta') event = { type: 'text-delta', sessionId, messageId, turnId, delta: chunk.delta }
    else if (chunk.type === 'text-end') event = { type: 'text-end', sessionId, messageId, turnId }
    else if (chunk.type === 'reasoning-start') event = { type: 'reasoning-start', sessionId, messageId, turnId, startTime: (chunk as any).startTime }
    else if (chunk.type === 'reasoning-delta') event = { type: 'reasoning-delta', sessionId, messageId, turnId, delta: chunk.delta }
    else if (chunk.type === 'reasoning-end') event = { type: 'reasoning-end', sessionId, messageId, turnId, endTime: (chunk as any).endTime }
    else if (chunk.type === 'tool-input-available') event = { type: 'tool-call', sessionId, messageId, turnId, toolCallId: chunk.toolCallId, toolName: chunk.toolName, input: chunk.input }
    else if (chunk.type === 'tool-output-available') event = { type: 'tool-result', sessionId, messageId, turnId, toolCallId: chunk.toolCallId, output: chunk.output }
    else if (chunk.type === 'tool-output-error') event = { type: 'tool-error', sessionId, messageId, turnId, toolCallId: chunk.toolCallId, error: { error: chunk.errorText } }
    else if (chunk.type === 'tool-approval-request') event = { type: 'tool-approval-request', sessionId, messageId, turnId, approvalId: chunk.approvalId, toolCall: { toolCallId: chunk.toolCallId, toolName: '' } }
    else if ((chunk as any).type === 'tool-approval-responded') event = { type: 'tool-approval-responded', sessionId, messageId, turnId, approvalId: (chunk as any).approvalId, toolCallId: (chunk as any).toolCallId, approved: !!(chunk as any).approved }
    else if ((chunk as any).type === 'tool-execution-started') event = { type: 'tool-execution-started', sessionId, messageId, turnId, toolCallId: (chunk as any).toolCallId }
    else if (chunk.type === 'finish') event = { type: 'finish', sessionId, messageId, turnId, createdMessageIds: metadata?.createdMessageIds, tokenUsage: metadata?.tokenUsage }
    else if (chunk.type === 'abort') event = { type: 'abort', sessionId, messageId, turnId, createdMessageIds: inputEvent.createdMessageIds, tokenUsage: inputEvent.tokenUsage }
    else if (chunk.type === 'error') event = { type: 'error', sessionId, messageId, turnId, message: chunk.errorText, tokenUsage: inputEvent.tokenUsage }

    if ((chunk as any).type === 'suggestions') {
      const list = Array.isArray((chunk as any).suggestions) ? (chunk as any).suggestions : []
      if (list.length > 0 && turnId) {
        const next = new Map(turnSuggestionsMap.value)
        next.set(turnId, list)
        turnSuggestionsMap.value = next
        updateLocalTurn(turnId, (t) => ({ ...t, suggestions: list }), sessionId)
        logger.debug('handleStreamChunk: suggestions received', { turnId, count: list.length })
      }
      return
    }

    if (chunk.type === 'source-url' || chunk.type === 'source-document' || chunk.type === 'file' || chunk.type.startsWith('data-')) {
      let msgs = messagesCache.value.get(sessionId)
      if (!msgs) {
        msgs = []
        messagesCache.value.set(sessionId, msgs)
      }
      let msg = msgs.find(m => m.id === messageId)
      if (!msg) {
        msg = {
          id: messageId,
          sessionId,
          role: 'assistant',
          parts: [],
          status: 'streaming',
          turnId
        }
        msgs.push(msg)
      } else if (turnId && !msg.turnId) {
        msg.turnId = turnId
      }
      if (msg.status !== 'streaming') {
        msg.status = 'streaming'
      }
      msg.parts.push(chunk as any)
      streamingSessions.value.add(sessionId)
      return
    }

    if (!event) return

    const streamingEventTypes = new Set([
      'text-start',
      'text-delta',
      'text-end',
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'tool-call',
      'tool-result',
      'tool-error',
      'tool-execution-started'
    ])
    if (streamingEventTypes.has(event.type)) {
      updateLocalTurn(event.turnId, (turn) => ({
        ...turn,
        status: 'streaming',
        updatedAt: Date.now()
      }), sessionId)
    } else if (event.type === 'tool-approval-request') {
      updateLocalTurn(event.turnId, (turn) => ({
        ...turn,
        status: 'awaiting_approval',
        updatedAt: Date.now()
      }), sessionId)
    } else if (event.type === 'tool-approval-responded') {
      updateLocalTurn(event.turnId, (turn) => ({
        ...turn,
        status: event.approved ? 'streaming' : 'awaiting_approval',
        updatedAt: Date.now()
      }), sessionId)
    }
    
    // ===== 文本相关事件 =====
    if (event.type === 'text-start') {
      // 文本开始：创建新的 text part
      const { sessionId, messageId, turnId } = event
      
      // 获取或创建该会话的消息数组
      let msgs = messagesCache.value.get(sessionId)
      if (!msgs) {
        msgs = []
        messagesCache.value.set(sessionId, msgs)
        logger.info('handleStreamChunk: created cache for session', { sessionId })
      }
      
      // 查找或创建消息
      let msg = msgs.find(m => m.id === messageId)
      if (!msg) {
        msg = {
          id: messageId,
          sessionId,
          role: 'assistant',
          parts: [],
          status: 'streaming',
          turnId
        }
        msgs.push(msg)
        logger.debug('handleStreamChunk: created new message for text-start', { messageId, sessionId })
      } else if (turnId && !msg.turnId) {
        msg.turnId = turnId
      }
      
      if (msg.status !== 'streaming') {
        msg.status = 'streaming'
      }
      
      for (const part of msg.parts) {
        if ((part as any).type === 'reasoning' && (part as any).state === 'streaming') {
          (part as any).state = 'done'
        }
      }
      
      // 创建新的 text part
      msg.parts.push({ type: 'text', text: '' })
      
      // 标记该会话正在流式
      streamingSessions.value.add(sessionId)
      logger.debug('handleStreamChunk: text-start', { messageId, sessionId })
      
    } else if (event.type === 'text-delta') {
      const { sessionId, messageId, delta, turnId } = event
      
      // 获取该会话的消息数组
      const msgs = messagesCache.value.get(sessionId)
      const msg = msgs?.find(m => m.id === messageId)
      
      if (msg) {
        // 追加到最后一个 text part（由 text-start 创建）
        const idx = findLastIndexCompat((msg.parts as any[]), p => p.type === 'text')
        if (idx !== -1 && msg.parts[idx].type === 'text') {
          msg.parts[idx].text += delta
        }
      }
      
    } else if (event.type === 'text-end') {
      // 文本结束
      const { sessionId, messageId } = event
      logger.debug('handleStreamChunk: text-end', { messageId, sessionId })
      
    } else if (event.type === 'tool-call') {
      // 🆕 处理工具调用事件
      const { sessionId, messageId, toolCallId, toolName, input, turnId } = event
      
      let msgs = messagesCache.value.get(sessionId)
      if (!msgs) {
        msgs = []
        messagesCache.value.set(sessionId, msgs)
      }
      
      let msg = msgs.find(m => m.id === messageId)
      if (!msg) {
        msg = {
          id: messageId,
          sessionId,
          role: 'assistant',
          parts: [],
          status: 'streaming',
          turnId  // 设置 turnId
        }
        msgs.push(msg)
      } else if (turnId && !msg.turnId) {
        msg.turnId = turnId
      }
      
      // 更新或新增 dynamic-tool part（按 toolCallId 去重，避免审批续跑时重复）
      const contentParts = Array.isArray(msg.parts) ? [...msg.parts] : []
      const existingIdx = contentParts.findIndex((part: any) => part?.type === 'dynamic-tool' && part?.toolCallId === toolCallId)
      if (existingIdx >= 0) {
        const existing = contentParts[existingIdx] as any
        contentParts[existingIdx] = {
          ...stripDynamicToolApproval(existing),
          toolName,
          toolCallId,
          type: 'dynamic-tool',
          state: 'input-streaming',
          input: input ?? existing?.input
        } as any
      } else {
        contentParts.push({
          toolName,
          toolCallId,
          type: 'dynamic-tool',
          state: 'input-streaming',
          input
        } as any)
      }
      msg.parts = contentParts
      
      logger.info('handleStreamChunk: tool call received', { toolCallId, toolName })
    } else if (event.type === 'tool-result') {
      // 🆕 处理工具结果事件（更新对应 dynamic-tool part）
      const { sessionId, toolCallId, output } = event
      
      let msgs = messagesCache.value.get(sessionId)
      if (!msgs) {
        msgs = []
        messagesCache.value.set(sessionId, msgs)
      }
      
      const target = [...msgs].reverse().find(m => m.role === 'assistant' && m.parts.some((p: any) => p.type === 'dynamic-tool' && p.toolCallId === toolCallId))
      if (target) {
        target.parts = target.parts.map((part: any) =>
          part.type === 'dynamic-tool' && part.toolCallId === toolCallId
            ? { ...stripDynamicToolApproval(part), state: 'output-available', output }
            : part
        )
      }
      logger.info('handleStreamChunk: tool result received', { toolCallId })
      streamingSessions.value.add(sessionId)
    } else if (event.type === 'tool-error') {
      // 🆕 处理工具错误事件
      const { sessionId, toolCallId, error } = event
      
      let msgs = messagesCache.value.get(sessionId)
      if (!msgs) {
        msgs = []
        messagesCache.value.set(sessionId, msgs)
      }
      
      const target = [...msgs].reverse().find(m => m.role === 'assistant' && m.parts.some((p: any) => p.type === 'dynamic-tool' && p.toolCallId === toolCallId))
      if (target) {
        target.parts = target.parts.map((part: any) =>
          part.type === 'dynamic-tool' && part.toolCallId === toolCallId
            ? {
                ...stripDynamicToolApproval(part),
                state: 'output-error',
                errorText: error?.error || error?.message || i18n.global.t('chat.store.toolExecutionFailed')
              }
            : part
        )
      }
      logger.error('handleStreamChunk: tool error received', { toolCallId, error: error?.error || error?.message })
      streamingSessions.value.add(sessionId)
    } else if (event.type === 'tool-approval-responded') {
      const { sessionId, messageId, toolCallId, approvalId, approved } = event
      let msgs = messagesCache.value.get(sessionId)
      if (!msgs) {
        msgs = []
        messagesCache.value.set(sessionId, msgs)
      }
      let msg = msgs.find(m => m.id === messageId)
      if (!msg) {
        msg = {
          id: messageId,
          sessionId,
          role: 'assistant',
          parts: [],
          status: 'streaming',
          turnId: event.turnId
        }
        msgs.push(msg)
      }
      msg.parts = msg.parts.map((part: any) => {
        if (part?.type !== 'dynamic-tool' || part?.toolCallId !== toolCallId) return part
        if (!approved) {
          return {
            ...stripDynamicToolApproval(part),
            state: 'output-error',
            errorText: i18n.global.t('chat.store.userRejectedExecution')
          }
        }
        return {
          ...stripDynamicToolApproval(part),
          state: 'input-streaming'
        }
      })
      if (approved) streamingSessions.value.add(sessionId)
      else streamingSessions.value.delete(sessionId)
      logger.info('handleStreamChunk: tool approval responded', { toolCallId, approved })
    } else if (event.type === 'tool-execution-started') {
      const { sessionId, messageId, toolCallId } = event
      let msgs = messagesCache.value.get(sessionId)
      if (!msgs) {
        msgs = []
        messagesCache.value.set(sessionId, msgs)
      }
      let msg = msgs.find(m => m.id === messageId)
      if (!msg) {
        msg = {
          id: messageId,
          sessionId,
          role: 'assistant',
          parts: [],
          status: 'streaming',
          turnId: event.turnId
        }
        msgs.push(msg)
      }
      let updated = false
      msg.parts = msg.parts.map((part: any) => {
        if (part?.type !== 'dynamic-tool' || part?.toolCallId !== toolCallId) return part
        updated = true
        return {
          ...stripDynamicToolApproval(part),
          state: 'input-streaming'
        }
      })
      if (!updated) {
        msg.parts.push({
          type: 'dynamic-tool',
          toolName: '',
          toolCallId,
          state: 'input-streaming'
        } as any)
      }
      streamingSessions.value.add(sessionId)
      logger.info('handleStreamChunk: tool execution started', { toolCallId })
    } else if (event.type === 'tool-approval-request') {
      const { sessionId, messageId, approvalId } = event
      let toolCall = event.toolCall as { toolCallId: string; toolName: string; input?: any }
      if (!toolCall?.toolName) {
        const msgs = messagesCache.value.get(sessionId) || []
        const target = [...msgs].reverse().find(m =>
          m.role === 'assistant' &&
          m.parts.some((p: any) => p.type === 'dynamic-tool' && p.toolCallId === toolCall?.toolCallId)
        )
        const part = target?.parts.find((p: any) => p.type === 'dynamic-tool' && p.toolCallId === toolCall?.toolCallId) as any
        toolCall = {
          toolCallId: toolCall?.toolCallId,
          toolName: part?.toolName || '',
          input: part?.input
        }
      }
      let msgs = messagesCache.value.get(sessionId)
      if (!msgs) {
        msgs = []
        messagesCache.value.set(sessionId, msgs)
      }
      let msg = msgs.find(m => m.id === messageId)
      if (!msg) {
        msg = {
          id: messageId,
          sessionId,
          role: 'assistant',
          parts: [],
          status: 'streaming',
          turnId: event.turnId
        }
        msgs.push(msg)
      }
      let updated = false
      msg.parts = msg.parts.map((part: any) => {
        if (part?.type !== 'dynamic-tool' || part?.toolCallId !== toolCall.toolCallId) return part
        updated = true
        return {
          ...part,
          state: 'approval-requested',
          input: toolCall.input ?? part.input,
          approval: { id: approvalId }
        }
      })
      if (!updated) {
        msg.parts.push({
          type: 'dynamic-tool',
          toolName: toolCall.toolName || '',
          toolCallId: toolCall.toolCallId,
          state: 'approval-requested',
          input: toolCall.input,
          approval: { id: approvalId }
        } as any)
      }
      streamingSessions.value.delete(sessionId)
      logger.info('handleStreamChunk: tool approval requested', { toolCallId: toolCall.toolCallId, toolName: toolCall.toolName })
    // ===== 思考/推理相关事件 =====
    } else if (event.type === 'reasoning-start') {
      const { sessionId, messageId, turnId } = event
      const startTime = typeof event.startTime === 'number' ? event.startTime : Date.now()
      
      // 获取或创建该会话的消息数组
      let msgs = messagesCache.value.get(sessionId)
      if (!msgs) {
        msgs = []
        messagesCache.value.set(sessionId, msgs)
        logger.info('handleStreamChunk: created cache for session', { sessionId })
      }
      
      // 查找或创建消息
      let msg = msgs.find(m => m.id === messageId)
      const isNewMessage = !msg
      if (!msg) {
        msg = {
          id: messageId,
          sessionId,
          role: 'assistant',
          parts: [],
          status: 'streaming',
          turnId
        }
        msgs.push(msg)
      } else if (turnId && !msg.turnId) {
        msg.turnId = turnId
      }
      
      if (msg.status !== 'streaming') {
        msg.status = 'streaming'
      }
      
      msg.parts.push({ type: 'reasoning', text: '', state: 'streaming', startTime } as any)
      
      // 标记该会话正在流式
      streamingSessions.value.add(sessionId)
      
      // 🔍 调试日志：记录是否创建了新消息和 thinking 数量
      logger.info('handleStreamChunk: reasoning-start', { 
        messageId, 
        sessionId,
        isNewMessage,
        reasoningCount: msg.parts.filter((p: any) => p.type === 'reasoning').length,
        totalMsgs: msgs.length
      })
      
    } else if (event.type === 'reasoning-delta') {
      const { sessionId, messageId, delta, turnId } = event
      
      // 获取或创建该会话的消息数组
      let msgs = messagesCache.value.get(sessionId)
      if (!msgs) {
        msgs = []
        messagesCache.value.set(sessionId, msgs)
        logger.info('handleStreamChunk: created cache for session', { sessionId })
      }
      
      // 查找或创建消息
      let msg = msgs.find(m => m.id === messageId)
      if (!msg) {
        msg = {
          id: messageId,
          sessionId,
          role: 'assistant',
          parts: [{ type: 'reasoning', text: '', state: 'streaming', startTime: Date.now() } as any],
          status: 'streaming',
          turnId
        }
        msgs.push(msg)
        logger.debug('handleStreamChunk: created new message for reasoning-delta', { messageId, sessionId })
      } else if (turnId && !msg.turnId) {
        msg.turnId = turnId
      }
      
      if (msg.status !== 'streaming') {
        msg.status = 'streaming'
      }
      
      const idx = findLastIndexCompat((msg.parts as any[]), (p: any) => p.type === 'reasoning' && p.state === 'streaming')
      if (idx !== -1 && (msg.parts[idx] as any).type === 'reasoning') {
        ;(msg.parts[idx] as any).text += delta
      } else {
        msg.parts.push({ type: 'reasoning', text: delta, state: 'streaming', startTime: Date.now() } as any)
      }
      
      // 标记该会话正在流式
      streamingSessions.value.add(sessionId)
      
    } else if (event.type === 'reasoning-end') {
      const { sessionId, messageId } = event
      const endTime = typeof event.endTime === 'number' ? event.endTime : Date.now()
      
      const msgs = messagesCache.value.get(sessionId)
      let msg = msgs?.find(m => m.id === messageId)
      const foundByMessageId = !!msg
      
      if (!msg && msgs) {
        for (const m of msgs) {
          if (m.role === 'assistant' && m.parts.some((p: any) => p.type === 'reasoning' && p.state === 'streaming')) {
            msg = m
            logger.warn('handleStreamChunk: reasoning-end found streaming reasoning in different message', {
              expectedMessageId: messageId,
              actualMessageId: m.id
            })
            break
          }
        }
      }
      
      if (msg) {
        const idx = findLastIndexCompat((msg.parts as any[]), (p: any) => p.type === 'reasoning' && p.state === 'streaming')
        if (idx !== -1 && (msg.parts[idx] as any).type === 'reasoning') {
          ;(msg.parts[idx] as any).state = 'done'
          ;(msg.parts[idx] as any).endTime = endTime
          // 🔍 调试日志
          logger.info('handleStreamChunk: reasoning-end SUCCESS', { 
            messageId: msg.id, 
            idx,
            foundByMessageId,
            reasoningCount: msg.parts.filter((p: any) => p.type === 'reasoning').length
          })
        } else {
          const reasonings = msg.parts.filter((p: any) => p.type === 'reasoning').map((p, i) => ({
            index: i,
            state: (p as any).state,
            hasText: !!(p as any).text
          }))
          logger.warn('handleStreamChunk: reasoning-end no streaming reasoning found', { 
            messageId: msg.id,
            reasonings
          })
        }
      } else {
        // 🔍 调试日志：列出所有消息
        const msgIds = msgs?.map(m => ({ id: m.id, role: m.role })) || []
        logger.warn('handleStreamChunk: reasoning-end message not found', { 
          messageId, 
          sessionId,
          availableMsgs: msgIds
        })
      }
    
    // ===== 流程控制事件 =====
    } else if (event.type === 'finish') {
      const { sessionId, messageId, createdMessageIds, tokenUsage } = event
      const now = Date.now()
      
      // 清除该会话的流式状态
      streamingSessions.value.delete(sessionId)
      
      const msgs = messagesCache.value.get(sessionId)
      if (msgs) {
        for (const msg of msgs) {
          if (msg.role === 'assistant') {
            for (const part of msg.parts) {
              if ((part as any).type === 'reasoning' && (part as any).state === 'streaming') {
                (part as any).state = 'done'
              }
            }
          }
        }
      }
      
      // 🆕 如果有 createdMessageIds，从数据库重新加载所有相关消息
      // 这包括：assistant (tool_call), tool (tool_result), assistant (final response)
      if (createdMessageIds && createdMessageIds.length > 1) {
        try {
          // 重新加载整个会话的消息，确保包含所有新创建的 tool 消息
          await loadMessages(sessionId)
          logger.info('handleStreamChunk: reloaded all messages after tool calls', {
            sessionId,
            createdMessageIds
          })
        } catch (error) {
          logger.error('handleStreamChunk: failed to reload messages', { sessionId, error })
        }
      } else {
        // 没有工具调用，只重新加载单个消息
        try {
          const fullMessage = await window.ipc('messages:get', { id: messageId })
          if (fullMessage) {
            const msgs = messagesCache.value.get(sessionId)
            const msg = msgs?.find(m => m.id === messageId)
            if (msg) {
              // 用数据库数据覆盖本地消息（确保所有字段准确）
              Object.assign(msg, fullMessage)
              logger.debug('handleStreamChunk: reloaded message from DB', { messageId })
            }
          }
        } catch (error) {
          logger.error('handleStreamChunk: failed to reload message', { messageId, error })
          // 降级：仅更新状态
          const msgs = messagesCache.value.get(sessionId)
          const msg = msgs?.find(m => m.id === messageId)
          if (msg) {
            msg.status = 'success'
            msg.updatedAt = Date.now()
          }
        }
      }
      // 🆕 保存 tokenUsage 到消息（数据库中没有此字段，需要从事件中获取）
      if (tokenUsage) {
        const msgs = messagesCache.value.get(sessionId)
        const msg = msgs?.find(m => m.id === messageId)
        if (msg) {
          msg.tokenUsage = tokenUsage
        }
      }
      updateLocalTurn(event.turnId, (turn) => ({
        ...turn,
        status: 'success',
        tokenUsage: tokenUsage ?? turn.tokenUsage,
        endedAt: now,
        updatedAt: now
      }), sessionId)

      // assistant 回复完成也算一次会话更新（用于会话列表时间/排序）
      if (sessionId) {
        touchLocalSession(sessionId)
      }
      
      logger.info('handleStreamChunk: finish', { messageId, sessionId, tokenUsage })
      
    } else if (event.type === 'abort') {
      const { sessionId, messageId, createdMessageIds, tokenUsage } = event
      const now = Date.now()
      abortingSessions.value.delete(sessionId)
      
      // 清除该会话的流式状态
      streamingSessions.value.delete(sessionId)
      
      const msgs = messagesCache.value.get(sessionId)
      const msg = msgs?.find(m => m.id === messageId)
      if (msg) {
        msg.parts = msg.parts.map((part: any) => {
          if (part?.type === 'reasoning' && part?.state === 'streaming') {
            return { ...part, state: 'done' }
          }
          if (part?.type === 'dynamic-tool' && (part?.state === 'input-available' || part?.state === 'approval-requested' || part?.state === 'input-streaming')) {
            return {
              ...stripDynamicToolApproval(part),
              state: 'output-error',
              errorText: i18n.global.t('chat.store.aborted')
            }
          }
          return part
        })
        msg.status = 'aborted'
        msg.updatedAt = Date.now()
        // 🆕 保存 tokenUsage
        if (tokenUsage) {
          msg.tokenUsage = tokenUsage
        }
      }
      
      // 如果有 createdMessageIds，从数据库重新加载
      if (createdMessageIds && createdMessageIds.length > 1) {
        try {
          await loadMessages(sessionId)
          // 重新加载后需要再次赋值 tokenUsage
          if (tokenUsage) {
            const msgs = messagesCache.value.get(sessionId)
            const msg = msgs?.find(m => m.id === messageId)
            if (msg) {
              msg.tokenUsage = tokenUsage
            }
          }
          logger.info('handleStreamChunk: reloaded messages after abort', { sessionId, createdMessageIds })
        } catch (error) {
          logger.error('handleStreamChunk: failed to reload messages after abort', { sessionId, error })
        }
      }
      
      // 更新会话时间
      if (sessionId) {
        touchLocalSession(sessionId)
      }
      
      logger.info('handleStreamChunk: abort', { messageId, sessionId, tokenUsage })
      updateLocalTurn(event.turnId, (turn) => ({
        ...turn,
        status: 'aborted',
        tokenUsage: tokenUsage ?? turn.tokenUsage,
        endedAt: now,
        updatedAt: now
      }), sessionId)
      
    } else if (event.type === 'error') {
      const { sessionId, messageId, message, tokenUsage } = event
      const now = Date.now()
      abortingSessions.value.delete(sessionId)
      
      // 清除该会话的流式状态
      streamingSessions.value.delete(sessionId)
      
      // 查找消息，只更新状态，保留已有内容
      const msgs = messagesCache.value.get(sessionId)
      const msg = msgs?.find(m => m.id === messageId)
      
      if (msg) {
        msg.status = 'error'
        // 不覆盖 content，保留已有内容
        // 🆕 保存 tokenUsage
        if (tokenUsage) {
          msg.tokenUsage = tokenUsage
        }
      }
      
      // 用 toast 显示错误信息
      toast.error(message)
      updateLocalTurn(event.turnId, (turn) => ({
        ...turn,
        status: 'error',
        error: message,
        tokenUsage: tokenUsage ?? turn.tokenUsage,
        endedAt: now,
        updatedAt: now
      }), sessionId)
      
      logger.error('handleStreamChunk: stream error', { messageId, sessionId, message, tokenUsage })
    }
  }
  
  /**
   * 判断是否是最后一条 assistant 消息
   */
  function checkIfLastAssistantMessage(messageId: string): boolean {
    const assistantMessages = messages.value.filter(m => m.role === 'assistant')
    if (assistantMessages.length === 0) return false
  
  const lastAssistant = assistantMessages[assistantMessages.length - 1]
    return lastAssistant.id === messageId
  }
  
  /**
   * 解析消息内容：处理引用和只有图片的情况
   * 注意：返回的仍然是 JSON 字符串格式
   * - 如果有引用，会将引用内容（包括图片）拼接到用户消息中
   * - 如果只有图片没有文本，会自动添加默认文本提示
   */
  function injectNoteContext(parts: MessageContentPart[]): MessageContentPart[] {
    const noteCtx = extractNoteContextFromContent(parts)
    if (!noteCtx || noteCtx.notes.length === 0) return parts

    // Keep injected model-only note context in English for prompt stability.
    const noteBlocks = noteCtx.notes.map((n, i) =>
      `[Note ${i + 1}: ${n.title}]\n${stripCitationMarkersForModel(n.contentMd)}`
    ).join('\n\n---\n\n')

    const userText = extractAnswerTextFromContent(parts)
    const injectedText = `The following note content was attached by the user as background context only. It is not a citeable source for this turn.\nIf the notes contain historical citation markers such as [S1] or [S2], ignore those old markers and do not reuse them in this turn.\n\n${noteBlocks}\n\n---\n\nUser question:\n${userText}`

    const otherParts = parts.filter(p => p.type !== 'text' && p.type !== 'data-note-context')
    return [{ type: 'text', text: injectedText } as MessageContentPart, ...otherParts]
  }

  function resolveMessageContent(msg: {
    parts: MessageContentPart[]
    quote?: MessageQuote
  }): string {
    try {
      let contentParts = Array.isArray(msg.parts) ? [...msg.parts] : parseMessageContent(String(msg.parts))
      const hasText = contentParts.some(p => p.type === 'text')
      const hasImages = contentParts.some(p => p.type === 'file' && p.mediaType.startsWith('image/'))
      
      // 如果只有图片没有文本，自动添加默认文本提示
      if (!hasText && hasImages) {
        contentParts = [
          { type: 'text', text: AUTO_GENERATED_IMAGE_PROMPT },
          ...contentParts.filter(p => p.type === 'file' && p.mediaType.startsWith('image/'))
        ]
      }
      
      // 如果有引用，需要处理引用
      if (msg.quote) {
        const quoteParts = msg.quote.parts
        const quoteText = extractAnswerTextFromContent(quoteParts)
        const quoteImages = extractImagesFromContent(quoteParts)
        const originalText = extractAnswerTextFromContent(contentParts)
        const userImages = contentParts.filter(p => p.type === 'file' && p.mediaType.startsWith('image/'))
        
        const quoteImageCount = quoteImages.length
        const userImageCount = userImages.length
        
        // 构建引用部分文本
        let quoteTextPart = quoteText || ''
        
        // 如果引用中有图片，添加图片锚点说明
        if (quoteImageCount > 0) {
          const refAnchors = quoteImages.map((_, i) => `#ref_img_${i + 1}`).join(' ')
          const refStartIndex = 1
          const refEndIndex = quoteImageCount
          
          if (quoteTextPart) {
            quoteTextPart += `\n\nReferenced images: ${refAnchors}`
          } else {
            quoteTextPart = `Referenced images: ${refAnchors}`
          }
          
          if (quoteImageCount === 1) {
            quoteTextPart += `\nNote: this corresponds to image ${refStartIndex} below.`
          } else {
            quoteTextPart += `\nNote: this corresponds to images ${refStartIndex}-${refEndIndex} below.`
          }
        }
        
        // 构建当前输入区块（仅当有当前图片时）
        let currentInputPart = ''
        if (userImageCount > 0) {
          const qAnchors = userImages.map((_, i) => `#q_img_${i + 1}`).join(' ')
          const qStartIndex = quoteImageCount + 1
          const qEndIndex = quoteImageCount + userImageCount
          
          currentInputPart = `\n\n[Current Input]\n<<<\nCurrent images: ${qAnchors}`
          
          if (userImageCount === 1) {
            currentInputPart += `\nNote: this corresponds to image ${qStartIndex} below.`
          } else {
            currentInputPart += `\nNote: this corresponds to images ${qStartIndex}-${qEndIndex} below.`
          }
          
          currentInputPart += `\n>>>\n[/Current Input]`
        }
        
        // 构建用户问题部分文本
        const userQuestionPart = originalText || AUTO_GENERATED_IMAGE_PROMPT
        
        const textWithQuote = `[Quote]
<<<
${quoteTextPart}
>>>
[/Quote]${currentInputPart}

User question:
${userQuestionPart}`
        
        // 合并内容：引用图片 + 用户文本 + 用户图片
        const newContentParts: MessageContentPart[] = []
        
        // 1. 添加文本部分
        newContentParts.push({ type: 'text', text: textWithQuote })
        
        // 2. 添加引用中的图片
        newContentParts.push(...quoteImages.map(img => ({ type: 'file' as const, mediaType: 'image/*', url: img })))
        
        // 3. 添加用户消息中的图片
        newContentParts.push(...userImages)
        
        return serializeMessageContent(injectNoteContext(newContentParts))
      }
      
      // 没有引用，直接返回序列化后的 content
      return serializeMessageContent(injectNoteContext(contentParts))
    } catch (error) {
      // 解析失败，显示错误提示
      const errorMessage = error instanceof Error ? error.message : i18n.global.t('chat.store.parseMessageFailed')
      logger.error('resolveMessageContent failed', { error: errorMessage })
      toast.error(i18n.global.t('chat.store.parseMessageRetry'))
      throw new Error(`${i18n.global.t('chat.store.parseMessageFailed')}: ${errorMessage}`)
    }
  }
  
  /**
   * 按"轮数"截断历史消息
   * 一轮 = 一个 user 消息 + 后续的所有 assistant 消息（直到下一个 user）
   * 确保截断后第一条消息是 user
   * 
   * @param messages 已过滤的消息列表（status=success, !isDeleted）
   * @param rounds 要保留的轮数
   * @returns 截断后的消息列表
   */
  function sliceByRounds(messages: MessagePublic[], rounds: number): MessagePublic[] {
    if (rounds <= 0 || messages.length === 0) return []
    
    // 找出所有 user 消息的索引
    const userIndices: number[] = []
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        userIndices.push(i)
      }
    }
    
    if (userIndices.length === 0) {
      // 没有 user 消息，返回空（这种情况不应该发生）
      return []
    }
    
    // 取最后 N 轮的起始 user 索引
    const startUserIndex = userIndices.length <= rounds 
      ? 0  // 不足 N 轮，全部保留
      : userIndices.length - rounds
    
    const sliceFrom = userIndices[startUserIndex]
    return messages.slice(sliceFrom)
  }

  /**
   * 将 tool_result 的 output 转换为文本
   */
  function stringifyToolOutput(output: unknown): string {
    if (typeof output === 'string') return output
    if (output === null || output === undefined) return ''
    try {
      return JSON.stringify(output, null, 2)
    } catch {
      return String(output)
    }
  }

  /**
   * 摘要化 dynamic-tool(output-available) 结果，避免历史消息过长
   */
  function summarizeDynamicToolPart(part: MessageContentPart): MessageContentPart {
    if (part.type !== 'dynamic-tool' || part.state !== 'output-available') return part
    const THRESHOLD = 500
    const outputText = stringifyToolOutput(part.output)
    if (outputText.length <= THRESHOLD) return part

    return {
      ...part,
      output: {
        _summarized: true,
        text: `[${part.toolName} output omitted, ${outputText.length} chars total, toolCallId: "${part.toolCallId}"]`
      }
    } as MessageContentPart
  }

  /**
   * 根据用户原文 + contextSources 拼出 RAG 注入后的 content（与发送时格式一致）
   * 用于：当前轮发送、重新生成时重建该条 user 的 prompt
   */
  function buildRagInjectedContent(
    originalContent: MessageContentPart[],
    contextSources: CitationSource[]
  ): MessageContentPart[] {
    const userText = extractAnswerTextFromContent(originalContent)
    const blocks = contextSources
      .map((r, i) => `[S${i + 1}]\nSource: ${r.source ?? 'Knowledge Base'}\nContent: ${r.content}`)
      .join('\n\n')
    const ragFullText = `User question:\n${userText}\n\nReference materials (${contextSources.length}):\n\n${blocks}`
    const otherParts = originalContent.filter((p: MessageContentPart) => p.type !== 'text')
    return [{ type: 'text', text: ragFullText }, ...otherParts]
  }

  function stripDataPartsForModel(parts: MessageContentPart[]): MessageContentPart[] {
    return (parts || []).filter((p) => !(typeof p.type === 'string' && p.type.startsWith('data-')))
  }

  function filterAssistantPartsForModel(parts: MessageContentPart[]): MessageContentPart[] {
    const filteredParts: MessageContentPart[] = []
    for (const part of parts) {
      if (part.type === 'text' && part.text.trim()) {
        filteredParts.push({
          ...part,
          text: stripCitationMarkersForModel(part.text)
        } as MessageContentPart)
      } else if (part.type === 'dynamic-tool') {
        filteredParts.push(sanitizeDynamicToolPartForModel(part))
      } else if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
        filteredParts.push(part)
      }
    }
    return filteredParts
  }

  /**
   * 准备对话历史消息（用于发送给 AI）
   * 只包含对话内容，不包含 system prompt（由后端附加）
   * 
   * 核心策略：
   * - user 消息：保留完整内容（处理引用后）；历史条仅原文，无 RAG 块
   * - assistant 消息：保留 text/dynamic-tool/tool-*（排除 reasoning）
   */
  function prepareDialogMessages(options: {
    historyMessages: MessagePublic[],
    finalPrompt: string // 已经是序列化后的 JSON 字符串
  }) {
    const messages: Array<Pick<AppUIMessage, 'role' | 'parts'>> = []
    
    // 遍历历史消息
    for (const msg of options.historyMessages) {
      if (msg.role === 'user') {
        // user 消息：直接添加（处理引用）
        messages.push({
          role: 'user',
          parts: stripCitationMarkersFromParts(
            stripDataPartsForModel(parseMessageContent(resolveMessageContent(msg)))
          )
        })
      } else if (msg.role === 'assistant') {
        const filteredParts = filterAssistantPartsForModel(msg.parts)
        if (filteredParts.length > 0) {
          messages.push({
            role: 'assistant',
            parts: filteredParts
          })
        }
      }
    }
    
    // 添加当前用户输入（已经是序列化后的 JSON 字符串）
    messages.push({
      role: 'user',
      parts: stripDataPartsForModel(parseMessageContent(options.finalPrompt))
    })
    
    return messages
  }
  
  /**
   * 基于当前 user 消息内容构造“风格指令版”的 content
   * - 保持 content 为 JSON 字符串格式（MessageContentPart[]）
   * - 仅修改文本分片内容为 stylePrompt
   * - 保留原有的图片分片等结构不变
   */
  function appendStylePromptToContent(baseContent: string, stylePrompt: string): string {
    // 空风格指令时直接返回原内容
    if (!stylePrompt.trim()) {
      return baseContent
    }
    
    // 解析原始内容
    const parts = parseMessageContent(baseContent)
    
    // 分离图片分片
    const imageParts = parts.filter(part => part.type === 'file' && part.mediaType.startsWith('image/')) as MessageContentPart[]
    
    // 重新构造内容：文本 = stylePrompt，图片保留
    const newParts: MessageContentPart[] = [
      { type: 'text', text: stylePrompt },
      ...imageParts
    ]
    
    return serializeMessageContent(newParts)
  }

  function getTurnConfigFromUserMessage(userMessage: MessagePublic) {
    const turn = getTurnByMessage(userMessage)
    const mode = turn?.mode ?? sessionMode.value
    const mcpServerIds = turn?.mcpServerIds ?? sessionMcpServerIds.value
    const webSearch = turn?.webSearch ?? sessionWebSearch.value
    const thinking = turn?.thinking ?? sessionThinking.value
    const kbContextCount = userMessage.contextSources?.length ?? 0
    const citationRequired = kbContextCount > 0 || (webSearch !== 'close' && webSearch !== 'native')
    const citationStartIndex = kbContextCount
    return { turn, mode, mcpServerIds, webSearch, thinking, citationRequired, citationStartIndex }
  }
  
  /**
   * 准备重新生成所需的上下文（公共逻辑）
   * @returns null 表示准备失败，应该终止操作
   */
  async function prepareRegenerateContext(
    messageId: string,
    options?: {
      stylePrompt?: string;
      model?: string;
    }
  ) {
    if (!currentSessionId.value) {
      logger.error('prepareRegenerateContext: no current session')
      return null
    }
    
    // 1. 解析模型
    const model = options?.model || resolvedModel.value
    if (!model) {
      logger.error('prepareRegenerateContext: no model selected')
      return null
    }
    
    // 2. 获取父 user 消息
    const result = await window.ipc('messages:getParentUserMessage', {
      sessionId: currentSessionId.value,
      messageId
    })
    
      if (!result.ok || !result.parentMessage) {
      logger.error('prepareRegenerateContext: failed to get parent message', result)
      return null
    }
    
    const userMessage = result.parentMessage as MessagePublic
    
    // 3. 确定 prompt：有 contextSources 时用原文+contextSources 重建 RAG 注入内容
    let baseSerialized: string
    if (userMessage.contextSources?.length) {
      const ragInjected = buildRagInjectedContent(userMessage.parts, userMessage.contextSources)
      baseSerialized = serializeMessageContent(ragInjected)
    } else {
      baseSerialized = serializeMessageContent(userMessage.parts)
    }
    let finalPrompt: string
    if (options?.stylePrompt) {
      try {
        finalPrompt = appendStylePromptToContent(baseSerialized, options.stylePrompt)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : i18n.global.t('chat.store.unknownError')
        logger.error('prepareRegenerateContext: failed to append style prompt', { error: errorMessage })
        toast.error(i18n.global.t('chat.store.applyStylePromptFailed'))
        return null
      }
    } else {
      finalPrompt = baseSerialized
    }
    
    return {
      sessionId: currentSessionId.value,
      model,
      userMessage,
      turnConfig: getTurnConfigFromUserMessage(userMessage),
      finalPrompt,
      mode: options?.stylePrompt ? 'improvement' : 'normal'
    }
  }
  
  /**
   * 覆盖重新生成（用于最后一条消息）
   */
  async function regenerateAndOverwrite(
    messageId: string,
    options?: {
      stylePrompt?: string;  // 风格指令
      model?: string;        // 临时模型
    }
  ) {
    let sessionId: string | null = null
    try {
      // 1. 准备上下文
      const context = await prepareRegenerateContext(messageId, options)
      if (!context) return
      sessionId = context.sessionId
      
      // 2. 准备对话历史消息（在清空之前）
      const msgs = messagesCache.value.get(context.sessionId)
      if (!msgs) return
      
      // 获取到当前消息为止的所有消息
      const messageIndex = msgs.findIndex(m => m.id === messageId)
      if (messageIndex === -1) return
      
      // contextCount 表示"轮数"，一轮 = 一个 user 消息 + 后续的 assistant/tool 消息
      const contextRounds = getContextCountForSession(context.sessionId)
      const filteredMsgs = msgs
        .slice(0, messageIndex + 1)  // 包含当前 assistant 消息
        .filter(m => isCompletedMessageStatus(m.status) && !m.isDeleted)
      let historyMessages = sliceByRounds(filteredMsgs, contextRounds)
      
      // 根据模式处理历史消息
      if (options?.stylePrompt) {
        // 改进模式：保留原 assistant 消息，排除其后的 user 消息（因为会用 stylePrompt 代替）
        historyMessages = historyMessages  // 保持所有消息
      } else {
        // 纯重新生成：排除原 assistant 消息和对应的 user 消息（因为会用 finalPrompt 重新添加）
        historyMessages = historyMessages.filter(m => 
          m.id !== messageId && m.id !== context.userMessage.id
        )
      }
      
      const dialogMessages = prepareDialogMessages({
        historyMessages,
        finalPrompt: context.finalPrompt
      })
      
      // 3. 覆盖重生复用同一 turn：重置本地 turn + assistant 消息状态
      const msg = msgs.find(m => m.id === messageId)
      const userMsgInCache = msgs.find(m => m.id === context.userMessage.id)
      const matchedTurn = [...(turnsBySessionCache.value.get(context.sessionId) || [])]
        .reverse()
        .find((turn) => turn.assistantMessageId === messageId || turn.userMessageId === context.userMessage.id)
      const turnId = msg?.turnId || userMsgInCache?.turnId || matchedTurn?.id

      if (!turnId) {
        logger.error('regenerateAndOverwrite: turnId missing for overwrite mode', {
          messageId,
          userMessageId: context.userMessage.id,
          sessionId: context.sessionId
        })
        toast.error(i18n.global.t('chat.store.submitFailed'))
        return
      }

      const now = Date.now()
      // 覆盖重生开始时，先清掉旧的“继续提问”建议
      const nextSuggestionsMap = new Map(turnSuggestionsMap.value)
      nextSuggestionsMap.delete(turnId)
      turnSuggestionsMap.value = nextSuggestionsMap

      updateLocalTurn(turnId, (turn) => ({
        ...turn,
        selectedModel: context.model,
        mcpServerIds: context.turnConfig.mcpServerIds,
        mode: context.turnConfig.mode,
        webSearch: context.turnConfig.webSearch,
        thinking: context.turnConfig.thinking,
        effectiveThinking: context.turnConfig.thinking,
        citationRequired: context.turnConfig.citationRequired,
        citationStartIndex: context.turnConfig.citationStartIndex,
        status: 'pending',
        tokenUsage: undefined,
        error: null,
        suggestions: undefined,
        startedAt: now,
        endedAt: null,
        updatedAt: now
      }), context.sessionId)

      if (msg) {
        msg.turnId = turnId
        msg.status = 'pending'  // 初始状态（流式开始后会变为 streaming）
        msg.parts = []  // 重置为空数组（thinking 和 text 都在 content 中）
        msg.isDeleted = false  // 清除删除标记
        msg.deletedAt = undefined
        msg.userEdited = false  // 重置用户编辑标记
        msg.updatedAt = undefined  // 关键：清除完成时间，流式完成后才会有
      }
      if (userMsgInCache) {
        userMsgInCache.turnId = turnId
      }

      const originalMode = context.turnConfig.mode
      const originalMcpServerIds = context.turnConfig.mcpServerIds
      const originalWebSearch = context.turnConfig.webSearch
      const originalThinking = context.turnConfig.thinking
      const citationRequired = context.turnConfig.citationRequired
      const citationStartIndex = context.turnConfig.citationStartIndex
      
      await triggerGeneration({
        sessionId: context.sessionId,
        turnId,
        existingAssistantMessageId: messageId,
        userMessageId: context.userMessage.id,
        dialogMessages,
        selectedModel: context.model,
        mcpServerIds: originalMcpServerIds,
        mcpSelection: { mode: 'manual', serverIds: originalMcpServerIds },
        mode: originalMode,
        webSearch: originalWebSearch,
        thinking: originalThinking,
        citationRequired,
        citationStartIndex
      })
      
      logger.info('regenerateAndOverwrite: started', { 
        messageId, 
        regenerateMode: context.mode,
        chatMode: originalMode,
        hasCustomModel: !!options?.model,
        messagesCount: dialogMessages.length
      })
      
    } catch (error) {
      logger.error('regenerateAndOverwrite failed', { error })
      if (sessionId) {
        streamingSessions.value.delete(sessionId)
      }
    }
  }
  
  /**
   * 在分支会话中重新生成（用于所有消息）
   */
  async function regenerateInBranch(
    messageId: string,
    options?: {
      stylePrompt?: string;  // 风格指令
      model?: string;        // 临时模型
    }
  ) {
    try {
      // 1. 准备上下文
      const context = await prepareRegenerateContext(messageId, options)
      if (!context) return

      if (sessionById.value.get(context.sessionId)?.isTemporary) {
        logger.warn('regenerateInBranch: temporary session does not support branches', {
          sessionId: context.sessionId
        })
        return
      }
      
      // 2. 分支起点总是 user 消息（语义清晰：从用户问题开始重新生成）
      const forkFromMessageId = context.userMessage.id
      
      // 3. 创建分支会话（只复制到 user 消息）
      const newBranch = await window.ipc('sessions:createBranch', {
        parentSessionId: context.sessionId,
        forkFromMessageId
      })
      
      // 4. 添加到会话列表（后端 createBranch 已继承父会话 kbIds）
      sessions.value.push(newBranch)

      // 5. 切换到新分支
      await switchSession(newBranch.id)

      // 显示 toast 提示
      toast.success(i18n.global.t('chat.store.branchCreatedAndSwitched'))

      // 6. 准备对话历史消息
      // contextCount 表示"轮数"，一轮 = 一个 user 消息 + 后续的 assistant/tool 消息
      const contextRounds = getContextCountForSession(context.sessionId)
      let historyMessages: MessagePublic[]
      
      if (options?.stylePrompt) {
        // 改进模式：从原会话读取消息（包含原 assistant 消息作为上下文）
        const originalMessages = messagesCache.value.get(context.sessionId) || []
        const messageIndex = originalMessages.findIndex(m => m.id === messageId)
        if (messageIndex === -1) return
        
        const filteredMsgs = originalMessages
          .slice(0, messageIndex + 1)  // 包含原 assistant 消息
          .filter(m => isCompletedMessageStatus(m.status) && !m.isDeleted)
        historyMessages = sliceByRounds(filteredMsgs, contextRounds)
        
        logger.info('regenerateInBranch: improvement mode - using original session context', {
          originalSessionId: context.sessionId,
          includesOriginalAssistant: true,
          historyCount: historyMessages.length
        })
      } else {
        // 纯重新生成：从新会话读取消息，排除复制出来的 fork user；finalPrompt 会作为本轮 user 重新追加。
        const newSessionMessages = messagesCache.value.get(newBranch.id) || []
        const forkPointMessageId = newBranch.forkPointMessageId
        const filteredMsgs = newSessionMessages.filter(m =>
          isCompletedMessageStatus(m.status) &&
          !m.isDeleted &&
          m.id !== forkPointMessageId
        )
        historyMessages = sliceByRounds(filteredMsgs, contextRounds)
        
        logger.info('regenerateInBranch: normal mode - using new session context', {
          newSessionId: newBranch.id,
          excludedForkPointMessageId: forkPointMessageId,
          historyCount: historyMessages.length
        })
      }
      
      const dialogMessages = prepareDialogMessages({
        historyMessages,
        finalPrompt: context.finalPrompt
      })
      
      // 6.1 前端立即创建 assistant 消息（乐观更新）
      // 注意：selectedModel 已统一存在 user 消息上，assistant 消息不再存储
      const assistantMessageId = nanoid()
      const turnId = nanoid()
      const newSessionMessages = messagesCache.value.get(newBranch.id) || []
      const lastUserMessage = [...newSessionMessages].reverse().find(m => m.role === 'user')
      createLocalPendingTurn({
        turnId,
        sessionId: newBranch.id,
        userMessageId: lastUserMessage?.id || null,
        assistantMessageId,
        triggerType: 'regenerate',
        selectedModel: context.model,
        mcpServerIds: context.turnConfig.mcpServerIds,
        mode: context.turnConfig.mode,
        webSearch: context.turnConfig.webSearch,
        thinking: context.turnConfig.thinking,
        effectiveThinking: context.turnConfig.thinking,
        citationRequired: context.turnConfig.citationRequired,
        citationStartIndex: context.turnConfig.citationStartIndex
      })
      const assistantMessage: MessagePublic = {
        id: assistantMessageId,
        sessionId: newBranch.id,
        turnId,
        role: 'assistant',
        parts: [{ type: 'text', text: '' }],
        createdAt: Date.now(),
        status: 'pending'
      }
      newSessionMessages.push(assistantMessage)
      messagesCache.value.set(newBranch.id, newSessionMessages)
      
      logger.info('regenerateInBranch: created assistant message optimistically', { 
        assistantMessageId,
        branchId: newBranch.id
      })
      
      // 7. 获取新会话中最后一条 user 消息的 ID（用于关联调试信息）
      if (lastUserMessage) {
        lastUserMessage.turnId = turnId
      }
      
      const originalMode = context.turnConfig.mode
      const originalMcpServerIds = context.turnConfig.mcpServerIds
      const originalWebSearch = context.turnConfig.webSearch
      const originalThinking = context.turnConfig.thinking
      const citationRequired = context.turnConfig.citationRequired
      const citationStartIndex = context.turnConfig.citationStartIndex
      
      await triggerGeneration({
        sessionId: newBranch.id,
        turnId,
        assistantMessageId,
        userMessageId: lastUserMessage?.id || '',
        dialogMessages,
        selectedModel: context.model,
        mcpServerIds: originalMcpServerIds,
        mcpSelection: { mode: 'manual', serverIds: originalMcpServerIds },
        mode: originalMode,
        webSearch: originalWebSearch,
        thinking: originalThinking,
        citationRequired,
        citationStartIndex
      })
      
      logger.info('regenerateInBranch: created branch and regenerating', { 
        branchId: newBranch.id,
        regenerateMode: context.mode,
        chatMode: originalMode,
        hasCustomModel: !!options?.model,
        forkFromMessageId,
        messagesCount: dialogMessages.length
      })
      
    } catch (error) {
      logger.error('regenerateInBranch failed', { error })
    }
  }
  
  async function switchVariant(parentMessageId: string | null, targetChildId: string) {
    // 删除：不再需要变体切换功能
    logger.warn('switchVariant: function removed')
  }
  
  async function getVariantInfo(sessionId: string, messageId: string) {
    // 删除：不再需要变体信息功能
    logger.warn('getVariantInfo: function removed')
    return null
  }
  
  async function createBranch(forkFromMessageId: string) {
    if (!currentSessionId.value) return
    
    try {
      // 扁平化：从当前会话分叉，所有分支都会指向同一个根
      const newBranch = await window.ipc('sessions:createBranch', {
        parentSessionId: currentSessionId.value,  // 从当前会话分叉
        forkFromMessageId
      })
      
      sessions.value.push(newBranch)

      // 后端 createBranch 已继承父会话 kbIds，直接切换
      await switchSession(newBranch.id)

      // 显示 toast 提示
      toast.success(i18n.global.t('chat.store.branchCreatedAndSwitched'))

      logger.info('createBranch: created and switched', { branchId: newBranch.id })
    } catch (error) {
      logger.error('createBranch failed', { error })
    }
  }
  
  async function deleteMessage(messageId: string) {
    if (!currentSessionId.value) return
    
    try {
      await window.ipc('messages:delete', { id: messageId })
      
      // 直接修改本地消息状态
      const message = messages.value.find(m => m.id === messageId)
      if (message) {
        message.isDeleted = true
        message.parts = [{ type: 'text', text: '' }]
        message.deletedAt = Date.now()
      }
      
      logger.info('deleteMessage: success', { messageId })
    } catch (error) {
      logger.error('deleteMessage failed', { error })
      throw error
    }
  }
  
  /**
   * 按 turnId 批量删除消息组
   */
  async function deleteMessagesByTurnId(turnId: string, messages: MessagePublic[]) {
    if (!currentSessionId.value) return
    
    try {
      await window.ipc('messages:deleteByTurnId', { turnId })
      
      // 更新本地状态
      const now = Date.now()
      for (const msg of messages) {
        const localMsg = messagesCache.value.get(currentSessionId.value)?.find(m => m.id === msg.id)
        if (localMsg) {
          localMsg.isDeleted = true
          localMsg.parts = [{ type: 'text', text: '' }]
          localMsg.deletedAt = now
        }
      }
      
      logger.info('deleteMessagesByTurnId: success', { turnId, count: messages.length })
    } catch (error) {
      logger.error('deleteMessagesByTurnId failed', { error })
      throw error
    }
  }
  
  async function updateMessage(messageId: string, updates: { parts?: string }) {
    if (!currentSessionId.value) return
    
    try {
      // 设置 userEdited 为 true
      await window.ipc('messages:update', { 
        id: messageId, 
        updates: {
          ...(updates.parts ? { parts: parseMessageContent(updates.parts) } : {}),
          userEdited: true
        }
      } as any)
      
      // 更新本地消息状态
      const message = messages.value.find(m => m.id === messageId)
      if (message) {
        if (updates.parts !== undefined) {
          message.parts = parseMessageContent(updates.parts)
        }
        message.userEdited = true
        message.updatedAt = Date.now()
      }
      
      logger.info('updateMessage: success', { messageId, updates })
    } catch (error) {
      logger.error('updateMessage failed', { error })
      throw error
    }
  }
  
  async function abortChat(sessionId?: string) {
    const targetSessionId = sessionId || currentSessionId.value
    if (!targetSessionId) {
      logger.warn('abortChat: no session to abort')
      return
    }

    const nextAborting = new Set(abortingSessions.value)
    nextAborting.add(targetSessionId)
    abortingSessions.value = nextAborting
    markSessionLocallyAborted(targetSessionId)

    const sessionChat = approvalChatBySession.get(targetSessionId)
    if (sessionChat) {
      await sessionChat.stop()
    } else {
      await window.ipc('chat:abort', { sessionId: targetSessionId })
    }
    streamingSessions.value.delete(targetSessionId)
    logger.info('abortChat: aborted', { sessionId: targetSessionId })
  }
  
  // ===== 引用相关 =====
  function setQuote(parts: MessageContentPart[], sourceMessageId?: string) {
    pendingQuote.value = { parts, sourceMessageId }
    logger.info('setQuote', { sourceMessageId, contentLength: parts.length })
    // 触发聚焦输入框
    emitter.emit('chat:focus-input')
    // 智能滚动到底部（仅当已在底部时）
    emitter.emit('chat:scroll-to-bottom-if-needed')
  }
  
  function clearQuote() {
    pendingQuote.value = null
    logger.info('clearQuote')
  }
  
  // ===== 初始化 =====
  async function init() {
    await loadSessions()
    
    // 确保 settingsStore 已初始化（等待场景数据加载）
    if (!settingsStore.isInitialized) {
      await settingsStore.initialize()
    }
    
    // 如果是新会话状态，从场景配置初始化 MCP、知识库（pinned，刷新后恢复）
    if (!currentSessionId.value && !isTemporarySession.value) {
      const scenario = selectedScenario.value
      if (scenario) {
        pendingMcpServerIds.value = scenario.mcpServerIds ? [...scenario.mcpServerIds] : []
        pendingMcpPolicy.value = scenario.mcpPolicy ?? 'auto'
        pendingSkillPolicy.value = scenario.skillPolicy ?? 'auto'
        pendingKbIds.value = scenario.kbIds ? [...scenario.kbIds] : []
        tempKbIds.value = []
        logger.info('init: initialized pending Mcp/Skill/Kb from scenario', {
          scenarioId: scenario.id
        })
      }
    }
  }
  
  return {
    // State
    sessions,
    sessionById,
    mainSessions,
    currentBranches,
    currentSessionId,
    pendingScrollTarget,
    currentSession,
    messages,
    currentTurns,
    isStreaming,
    isAwaitingApproval,
    isBusy,
    isSubmittingApproval,
    isTempAskStreaming,
    isTemporarySession,
    tempAskMessages,
    tempAskOpen,
    tempAskAnchorSessionId,
    tempAskSessionId,
    pendingScenarioId,
    pendingModel,
    pendingProjectId,
    pendingMcpServerIds,
    pendingMcpPolicy,
    pendingSkillPolicy,
    pendingThinking,
    pendingQuote,
    selectedScenarioId,
    selectedScenario,
    selectedModel,
    resolvedModel,
    sessionContextCount,
    sessionMcpServerIds,
    sessionMcpPolicy,
    sessionMode,
    sessionSkillPolicy,
    pendingMode,
    pendingManualSkillId,
    sessionWebSearch,
    pendingWebSearch,
    sessionThinking,
    sessionKbIds,
    effectiveKbIds,
    tempKbIds,
    completedUnreadSessionIds,
    getTurnById,
    getTurnByMessage,
    getTurnsBySession,
    isSessionStreaming,
    hasCompletedUnreadSession,

    // Actions
    init,
    loadSessions,
    createNewSession,
    createTemporarySession,
    switchSession,
    setPendingScrollTarget,
    clearPendingScrollTarget,
    deleteSession,
    updateSessionTitle,
    moveSessionToProject,
    updateSessionFavorite,
    updateSessionArchive,
    setScenario,
    setModel,
    setProject,
    updateSessionMcpServers,
    updateSessionMcpPolicy,
    updateSessionMode,
    updateSessionSkillPolicy,
    updateSessionWebSearch,
    updateSessionThinking,
    updateSessionKbIds,
    addKbToTemp,
    removeKbFromSelection,
    toggleKbPin,
    sendMessage,
    handleStreamChunk,
    checkIfLastAssistantMessage,
    regenerateAndOverwrite,
    regenerateInBranch,
    switchVariant,
    getVariantInfo,
    createBranch,
    deleteMessage,
    deleteMessagesByTurnId,
    updateMessage,
    abortChat,
    setQuote,
    clearQuote,
    openTempAsk,
    closeTempAsk,
    sendTempAsk,
    abortTempAsk,
    markSessionCompletedUnread,
    clearSessionCompletedUnread,
    addToolApprovalResponse,
    confirmToolExecution,
    getSuggestions
  }
})
