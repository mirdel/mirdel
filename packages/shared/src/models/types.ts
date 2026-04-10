import type { ModelMessage, UIDataTypes, UIMessage, UIMessagePart, UITools } from 'ai'
import type {
  ConfigText,
  ImageCapabilities,
  VideoCapabilities,
  ModelType,
  ModelModality,
  ImageTaskType,
  ProviderOptionFieldSchema,
  NativeWebSearchConfig,
  NativeWebSearchModelConfig,
  ThinkingConfig,
  ThinkingMode
} from '../provider/types'

export interface ModelsConfig {
  version: string
  providers: Provider[]
}

export interface Provider {
  id: string
  name: ConfigText
  logo?: string
  type: string
  isBuiltin: boolean
  baseUrl: string
  imageBaseUrl?: string
  videoBaseUrl?: string
  defaultHeaders?: Record<string, string>
  nativeWebSearchDefaults?: NativeWebSearchConfig
  helpUrl?: string
  helpLabel?: ConfigText
  models: Model[]
}

export interface Model {
  id: string
  modelType: ModelType
  showInModelListByDefault?: boolean
  inputModalities?: ModelModality[]
  outputModalities?: ModelModality[]
  imageTasks?: ImageTaskType[]
  image?: ImageCapabilities
  imageOptionSchema?: ProviderOptionFieldSchema[]
  video?: VideoCapabilities
  videoOptionSchema?: ProviderOptionFieldSchema[]
  providerOptionsDefaults?: Record<string, unknown>
  thinking?: ThinkingConfig
  nativeWebSearch?: NativeWebSearchModelConfig
}

// ==================== 消息内容结构（直接使用 AI SDK UIMessage / UIMessagePart） ====================
export type MessageContentPart = UIMessagePart<UIDataTypes, UITools>
export type AppUIMessage = UIMessage<unknown, UIDataTypes, UITools>
export type MessageRole = AppUIMessage['role']
export type TextPart = Extract<MessageContentPart, { type: 'text' }>
export type ReasoningPart = Extract<MessageContentPart, { type: 'reasoning' }>
export type DynamicToolPart = Extract<MessageContentPart, { type: 'dynamic-tool' }>
export type FilePart = Extract<MessageContentPart, { type: 'file' }>
export type ImagePart = FilePart

// ==================== 调试信息类型（独立表存储）====================

/**
 * 执行步骤（每次 AI 调用）
 */
export interface DebugStep {
  index: number
  startTime: number
  endTime: number
  
  /** 该轮发送给 AI 的完整 messages（AI SDK 格式） */
  inputMessages: ModelMessage[]
  
  /** 该轮 AI 的响应内容（AI SDK 格式） */
  outputContent: MessageContentPart[] | unknown
  
  /** 该轮的结束原因 */
  finishReason?: string
  
  /** 该轮的 token 统计 */
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
}

/**
 * 工具执行记录
 */
export interface DebugToolExecution {
  /** 在第几个 step 之后执行的 */
  afterStepIndex: number
  toolCallId: string
  toolName: string
  serverName: string
  
  startTime: number
  endTime: number
  
  input: any
  output: any
  isError: boolean
  errorMessage?: string
}

/**
 * 完整的调试信息（ReAct 循环结构）
 */
export interface ChatDebugInfo {
  version: 2
  
  // ===== 元信息快照 =====
  meta: {
    runId: string
    turnId: string
    startTime: number
    endTime: number
    
    sessionId: string
    userMessageId?: string | null
    assistantMessageId?: string | null
    
    // 模型配置
    model: string
    provider: {
      id: string
      name: string
      baseUrl: string
    }
    
    // 实际使用的参数快照（不再存储场景概念，场景只是预设）
    params: {
      systemPrompt?: string
      temperature?: number
      topP?: number
      maxOutputTokens?: number
      maxToolSteps?: number
    }
    
    // MCP 配置快照
    mcpServers?: Array<{
      id: string
      name: string
      toolsCount: number
      fromCache: boolean
      buildTime?: number
    }>
    mcpAggregationTime?: number
    
    // 可用工具列表（简化版）
    availableTools?: Array<{
      name: string
      description?: string
    }>
  }
  
  // ===== 执行步骤 =====
  steps: DebugStep[]
  
  // ===== 工具执行记录 =====
  toolExecutions: DebugToolExecution[]
  
  // ===== 最终结果 =====
  result: {
    success: boolean
    error?: string
    finishReason?: string
    createdMessageIds: string[]
  }
  
  // ===== 统计汇总 =====
  stats: {
    totalDuration: number
    stepsCount: number
    totalInputTokens: number | null  // null 表示无法获取（如中止时）
    totalOutputTokens: number | null // null 表示无法获取（如中止时）
    toolCallsCount: number
    toolCallsSuccessCount: number
    toolCallsFailedCount: number
    toolCallsTotalDuration: number
  }
}

// ==================== 消息树和分支相关类型 ====================

export type ChatMode = 'chat' | 'agent'

export interface MessageQuote {
  parts: MessageContentPart[]
  sourceMessageId?: string
}

/** 
 * 网络搜索模式
 * - 'close': 关闭搜索
 * - 'native': 模型原生搜索（如 Qwen 的 enable_search）
 * - 'builtin': 内置 Bing 搜索
 * - 其他字符串: 第三方搜索服务的 provider ID
 */
export type WebSearchMode = 'builtin' | 'native' | 'close' | (string & {})

/**
 * 网络搜索来源（用于 UI 展示）
 */
export interface WebSearchSource {
  /** 来源序号（从 1 开始） */
  index: number;
  /** 完整 URL */
  url: string;
  /** 页面标题 */
  title: string;
  /** 正文内容 */
  content: string;
  /** 网站名称 */
  siteName?: string;
  /** Favicon URL */
  favicon?: string;
}

export type CitationSourceKind = 'knowledge' | 'web'

/**
 * 统一引用来源（知识库召回 + 网络搜索，用于 UI 展示与持久化）
 */
export interface CitationSource {
  /** 来源序号（1-based，对应 [S1] 中的 1） */
  index: number;
  /** 稳定 ID，如 "S1" */
  id: string;
  /** 来源类型（旧消息可能缺失，前端需做兼容推断） */
  kind?: CitationSourceKind;
  /** 展示标题（可选） */
  title?: string;
  /** 来源描述（如「知识库A - 文件x.pdf」或网站名） */
  source?: string;
  /** 正文内容 */
  content: string;
  /** 完整 URL（网络搜索时有） */
  url?: string;
  /** 网站名称（网络搜索时有） */
  siteName?: string;
  /** Favicon URL（网络搜索时有） */
  favicon?: string;
  /** 知识库 ID（知识库来源时有） */
  kbId?: string;
  /** 知识库名称（知识库来源时有） */
  kbName?: string;
  /** 知识条目 ID（知识库来源时有） */
  kbItemId?: string;
  /** 知识条目类型（知识库来源时有） */
  kbItemType?: 'text' | 'file' | 'directory' | 'url';
  /** 知识条目标题（知识库来源时有） */
  kbItemTitle?: string;
  /** 召回命中的 chunk ID（知识库来源时有） */
  chunkId?: number;
}

export interface Message extends Omit<AppUIMessage, 'metadata'> {
  id: string
  sessionId: string
  turnId?: string
  status: 'pending' | 'streaming' | 'success' | 'aborted' | 'error'
  copiedFromMessageId?: string  // 消息溯源（复制自哪条消息）
  isShared?: boolean  // 是否为共享消息（从分支复制来的）
  isDeleted?: boolean  // 是否已删除
  deletedAt?: number  // 删除时间
  userEdited?: boolean  // 是否被用户手动编辑过
  tokenUsage?: { inputTokens: number | null; outputTokens: number | null }  // Token 消耗统计
  /** 知识库召回的结构化来源（仅 role=user 且本回合有 RAG 时存在，用于引用展示与持久化） */
  contextSources?: CitationSource[]
  createdAt: number
  updatedAt: number
}

export type TurnStatus = 'pending' | 'streaming' | 'awaiting_approval' | 'success' | 'aborted' | 'error'

export interface Turn {
  id: string
  sessionId: string
  userMessageId?: string | null
  assistantMessageId?: string | null
  parentTurnId?: string | null
  triggerType: 'submit' | 'regenerate' | 'approval' | 'temp-ask'
  status: TurnStatus
  selectedModel?: string
  mcpServerIds?: string[]
  mode?: ChatMode
  webSearch?: WebSearchMode
  thinking?: ThinkingMode
  effectiveThinking?: ThinkingMode
  skillId?: string | null
  citationRequired?: boolean
  citationStartIndex?: number
  tokenUsage?: { inputTokens: number | null; outputTokens: number | null }
  stateText?: string | null
  briefText?: string | null
  error?: string | null
  suggestions?: string[]
  startedAt: number
  endedAt?: number | null
  createdAt: number
  updatedAt: number
}

export interface Session {
  id: string
  title: string
  selectedModel: string
  scenarioId: string
  projectId?: string | null
  mainSessionId: string | null
  webSearch: WebSearchMode  // 当前会话的搜索模式
  thinking: ThinkingMode
  createdAt: number
  updatedAt: number
}

export interface Project {
  id: string
  name: string
  description?: string
  scenarioId: string
  createdAt: number
  updatedAt: number
}

export interface MessageSelection {
  sessionId: string
  parentMessageId: string
  selectedChildId: string
  updatedAt: number
}

export interface VariantInfo {
  total: number
  current: number
  siblings: Message[]
}
