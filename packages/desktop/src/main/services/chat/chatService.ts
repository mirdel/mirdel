import { BrowserWindow } from "electron";
import { streamText, type ModelMessage, stepCountIs, validateUIMessages, convertToModelMessages, type UIDataTypes, type UIMessageChunk } from "ai";
import type { LanguageModelUsage } from "ai";
import { NATIVE_WEB_SEARCH_TOOLS_BODY_KEY } from "../providers/llmProviderFactory";
import { loggerServiceMain, resolveNativeWebSearchConfig, resolveThinkingMode, normalizeInputModalities, getInputModalityFromMediaType, supportsInputModality, type MessageContentPart, type MessageRole, type AppUIMessage, type DebugStep, type DebugToolExecution, type NativeWebSearchConfig, type NativeWebSearchSdkNativeConfig, type ThinkingConfig, type ThinkingMode, type ToolApprovalMode, type ModelModality } from "@shared";
import { resolveModelInvocation } from "../providers/modelInvocation";
import { createAssistantMessage, updateMessage, getMessage, listMessages } from "./messageData";
import { appendDebugRunSteps, createDebugRun, finalizeDebugRun, getLatestDebugRunIdByTurnId } from "./debugInfoData";
import { touchSession, getSession, listSessionsForDigest, getEffectiveWorkingDirs, type ChatMode, type WebSearchMode } from "./sessionData";
import { enqueueSummaryTask } from "./memorySummaryService";
import { enqueueLongTermMemoryTask } from "./longTermMemoryService";
import { enqueueHistoricalMemoryIndexTask } from "./historicalMemoryService";
import { getScenario } from "../scenarios/scenarioData";
import { resolveSystemPromptEnvelope } from "./systemPrompt";
import { aggregateMcpTools } from "../mcp/mcpToolsAdapter";
import { BUILTIN_SKILL_REQUIRED_SERVER_IDS } from "../mcp/builtin";
import { getSkillDetail, getPublicSkillsPath } from "../skill";
import { getSkillDirById } from "../skill/skillData";
import { getMemorySettings, getSessionPreferences } from "../settings/settingsData";
import { addToolAllowlistEntry, type ToolAllowlistEntry } from "./toolAllowlistData";
import { createTurn, getLatestTurnByAssistantMessageId, getLatestTurnByUserMessageId, updateTurn } from "./turnData";
import { extractSuggestions } from "./suggestionExtractionService";
import { localModelRuntimeService } from "../model-server";
import { LOCAL_PROVIDER_ID } from "../providers/localModelConstants";
import { tMain } from "../../i18n";
import { resolveTargetResponseLocale } from "../language/responseLocale";

const logger = loggerServiceMain.withContext("chatService");

const TOOL_META_PROVIDER_KEY = 'mirdel';
const MAX_INLINE_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function extractTextFromParts(parts: MessageContentPart[]): string {
  return (parts || [])
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text' && typeof (p as any).text === 'string')
    .map((p) => p.text)
    .join('\n')
    .trim();
}

function extractUserTextContextFromDialogMessages(
  messages: Array<Pick<AppUIMessage, "role" | "parts">>
): { currentUserText: string; historicalUserTexts: string[] } {
  const userMessages = messages.filter((message) => message.role === "user");
  if (userMessages.length === 0) {
    return { currentUserText: "", historicalUserTexts: [] };
  }

  const currentUserText = extractTextFromParts(
    userMessages[userMessages.length - 1].parts as MessageContentPart[]
  );
  const historicalUserTexts = userMessages
    .slice(0, -1)
    .map((message) => extractTextFromParts(message.parts as MessageContentPart[]))
    .filter((text) => text.length > 0);

  return { currentUserText, historicalUserTexts };
}

function normalizeCitationSpacing(text: string): string {
  return text
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ');
}

function sanitizeCitationMarkersInText(text: string, validIndices: Set<number>): string {
  if (!text) return text;

  const cleaned = text
    .replace(/\[(?:S)?(\d+)\]\(cite:(\d+)\)/gi, (_match, _labelIndex, citeIndex) => {
      const index = Number.parseInt(String(citeIndex), 10);
      if (Number.isNaN(index) || !validIndices.has(index)) return '';
      return `[S${index}]`;
    })
    .replace(/\[S(\d+)\]/gi, (match, indexText) => {
      const index = Number.parseInt(String(indexText), 10);
      if (Number.isNaN(index) || !validIndices.has(index)) return '';
      return match;
    });

  return normalizeCitationSpacing(cleaned);
}

function parseCitationIndex(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const direct = Number.parseInt(value, 10);
    if (!Number.isNaN(direct)) {
      return direct;
    }
    const match = value.match(/^S(\d+)$/i);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      return Number.isNaN(parsed) ? null : parsed;
    }
  }
  return null;
}

function collectValidCitationIndices(baseCount: number, parts: MessageContentPart[]): Set<number> {
  const indices = new Set<number>();

  for (let index = 1; index <= baseCount; index += 1) {
    indices.add(index);
  }

  for (const part of parts || []) {
    if (part?.type !== 'dynamic-tool') continue;

    const sources = (part as any)?.output?._meta?.sources;
    if (!Array.isArray(sources)) continue;

    for (const source of sources) {
      const index = parseCitationIndex((source as any)?.index) ?? parseCitationIndex((source as any)?.id);
      if (index !== null) {
        indices.add(index);
      }
    }
  }

  return indices;
}

function sanitizeAssistantContentCitations(
  parts: MessageContentPart[],
  validIndices: Set<number>
): MessageContentPart[] {
  return (parts || []).map((part) => {
    if (part.type === 'text' && typeof (part as any).text === 'string') {
      return {
        ...part,
        text: sanitizeCitationMarkersInText((part as any).text, validIndices)
      };
    }

    if (part.type === 'reasoning' && typeof (part as any).text === 'string') {
      return {
        ...part,
        text: sanitizeCitationMarkersInText((part as any).text, validIndices)
      };
    }

    return part;
  });
}

function stripDynamicToolApproval(part: Record<string, any>): Record<string, any> {
  if (part.state === 'approval-requested') return part;
  const { approval: _approval, ...rest } = part;
  return rest;
}

function sanitizePartForAiSdk(part: MessageContentPart): any | null {
  if (!part || typeof part !== 'object') return null;
  if (part.type === 'text' && typeof (part as any).text === 'string') {
    return { type: 'text', text: (part as any).text };
  }
  if (part.type === 'source-url') {
    const p = part as any;
    if (typeof p.sourceId === 'string' && typeof p.url === 'string') {
      return { type: 'source-url', sourceId: p.sourceId, url: p.url, title: p.title };
    }
    return null;
  }
  if (part.type === 'source-document') {
    const p = part as any;
    if (typeof p.sourceId === 'string' && typeof p.mediaType === 'string' && typeof p.title === 'string') {
      return {
        type: 'source-document',
        sourceId: p.sourceId,
        mediaType: p.mediaType,
        title: p.title,
        filename: p.filename,
      };
    }
    return null;
  }
  if (part.type === 'file') {
    const p = part as any;
    if (typeof p.mediaType === 'string' && typeof p.url === 'string') {
      return { type: 'file', mediaType: p.mediaType, url: p.url, filename: p.filename };
    }
    return null;
  }
  if (typeof (part as any).type === 'string' && (part as any).type.startsWith('data-')) {
    const p = part as any;
    return { type: p.type, id: p.id, data: p.data, transient: p.transient };
  }
  if (part.type === 'dynamic-tool') {
    const p = part as any;
    const base = {
      type: 'dynamic-tool',
      toolName: p.toolName,
      toolCallId: p.toolCallId,
      state: p.state,
    } as any;
    if (p.input !== undefined) base.input = p.input;
    if (p.output !== undefined) base.output = p.output;
    if (typeof p.errorText === 'string') base.errorText = p.errorText;
    if (p.state === 'approval-requested' && p.approval && typeof p.approval === 'object') {
      base.approval = p.approval;
    }
    if (typeof p.inputText === 'string') base.inputText = p.inputText;
    return base;
  }
  return null;
}

function estimateDataUrlBytes(url: string): number | null {
  if (typeof url !== 'string' || !url.startsWith('data:')) return null;
  const commaIndex = url.indexOf(',');
  if (commaIndex < 0) return null;

  const meta = url.slice(0, commaIndex).toLowerCase();
  const payload = url.slice(commaIndex + 1).replace(/\s+/g, '');
  if (!payload) return 0;

  if (meta.includes(';base64')) {
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }

  try {
    return decodeURIComponent(payload).length;
  } catch {
    return payload.length;
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ResolvedChatError = {
  message: string;
  statusCode?: number;
  providerCode?: string;
  retryable?: boolean;
  rawMessage?: string;
};

function trimErrorMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRetryErrorMessage(message: string): string {
  const trimmed = message.trim();
  const retryMatch = trimmed.match(/^Failed after \d+ attempts\.\s*Last error:\s*([\s\S]+)$/i);
  if (!retryMatch) return trimmed;
  const lastError = retryMatch[1]?.trim();
  return lastError || trimmed;
}

function isGenericChatErrorMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === 'no output generated.') return true;
  if (normalized === 'no output generated. check the stream for errors.') return true;
  if (/^failed after \d+ attempts\./i.test(message.trim())) return true;
  return false;
}

function pickMessageAndCodeFromPayload(payload: unknown, depth = 0): { message?: string; code?: string } {
  if (depth > 5 || payload == null) return {};

  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      return pickMessageAndCodeFromPayload(parsed, depth + 1);
    } catch {
      return { message: trimmed };
    }
  }

  if (!isRecord(payload)) return {};

  const record = payload as Record<string, unknown>;
  const rawCode = record.code;
  const code = typeof rawCode === 'string'
    ? rawCode.trim() || undefined
    : (typeof rawCode === 'number' && Number.isFinite(rawCode) ? String(rawCode) : undefined);

  const directMessageKeys = ['message', 'msg', 'error_message', 'errorMessage', 'detail', 'error_description'] as const;
  for (const key of directMessageKeys) {
    const message = trimErrorMessage(record[key]);
    if (message) return { message, code };
  }

  const nestedKeys = ['error', 'data', 'body', 'response'] as const;
  for (const key of nestedKeys) {
    const nested = pickMessageAndCodeFromPayload(record[key], depth + 1);
    if (nested.message) return { message: nested.message, code: nested.code ?? code };
    if (!code && nested.code) return { code: nested.code };
  }

  return { code };
}

function resolveChatError(error: unknown): ResolvedChatError {
  const queue: unknown[] = [error];
  const visited = new Set<unknown>();

  let bestMessage: string | undefined;
  let genericMessage: string | undefined;
  let rawMessage: string | undefined;
  let statusCode: number | undefined;
  let providerCode: string | undefined;
  let retryable: boolean | undefined;

  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null) continue;

    if (typeof current === 'string') {
      const normalized = normalizeRetryErrorMessage(current);
      if (!normalized) continue;
      rawMessage ??= normalized;
      if (isGenericChatErrorMessage(normalized)) {
        genericMessage ??= normalized;
      } else {
        bestMessage ??= normalized;
      }
      continue;
    }

    if (!isRecord(current)) continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const record = current as Record<string, unknown>;

    if (statusCode == null && typeof record.statusCode === 'number' && Number.isFinite(record.statusCode)) {
      statusCode = record.statusCode;
    }
    if (retryable == null && typeof record.isRetryable === 'boolean') {
      retryable = record.isRetryable;
    }

    const directCode = typeof record.code === 'string'
      ? record.code.trim() || undefined
      : (typeof record.code === 'number' && Number.isFinite(record.code) ? String(record.code) : undefined);
    if (!providerCode && directCode) providerCode = directCode;

    const payloads = [record.data, record.responseBody, record.body, record.error];
    for (const payload of payloads) {
      const extracted = pickMessageAndCodeFromPayload(payload);
      if (extracted.code && !providerCode) providerCode = extracted.code;
      if (!extracted.message) continue;

      const normalized = normalizeRetryErrorMessage(extracted.message);
      rawMessage ??= normalized;
      if (isGenericChatErrorMessage(normalized)) {
        genericMessage ??= normalized;
      } else {
        bestMessage ??= normalized;
      }
    }

    const directMessage = trimErrorMessage(record.message);
    if (directMessage) {
      const normalized = normalizeRetryErrorMessage(directMessage);
      rawMessage ??= normalized;
      if (isGenericChatErrorMessage(normalized)) {
        genericMessage ??= normalized;
      } else {
        bestMessage ??= normalized;
      }
    }

    const nestedCandidates = [record.lastError, record.cause, record.error];
    for (const nested of nestedCandidates) {
      if (nested != null) queue.push(nested);
    }
    if (Array.isArray(record.errors)) {
      for (const nested of record.errors) queue.push(nested);
    }
  }

  const message = bestMessage
    ?? (statusCode === 429 ? tMain("chat.rateLimit") : undefined)
    ?? genericMessage
    ?? rawMessage
    ?? tMain("common.unknownError");

  return {
    message,
    statusCode,
    providerCode,
    retryable,
    rawMessage
  };
}

function validateInputModalitiesForMessages(params: {
  messages: Array<Pick<AppUIMessage, 'role' | 'parts'>>;
  inputModalities?: ModelModality[];
}) {
  const supported = normalizeInputModalities(params.inputModalities)

  for (const message of params.messages) {
    if (message.role !== 'user') continue

    for (const part of message.parts || []) {
      if (part.type !== 'file') continue

      const mediaType = part.mediaType || 'application/octet-stream'
      const modality = getInputModalityFromMediaType(mediaType)
      if (!supportsInputModality(supported, modality)) {
        throw new Error(tMain("chat.unsupportedInputModality", { modality, mediaType }))
      }

      const estimatedBytes = estimateDataUrlBytes((part as any).url)
      if (estimatedBytes != null && estimatedBytes > MAX_INLINE_ATTACHMENT_BYTES) {
        throw new Error(tMain("chat.inlineAttachmentTooLarge", {
          mediaType,
          size: formatBytes(estimatedBytes),
          maxSize: formatBytes(MAX_INLINE_ATTACHMENT_BYTES)
        }))
      }
    }
  }
}

function buildNativeSearchProviderOptions(
  providerId: string,
  nativeSearchConfig: NativeWebSearchConfig | null
): Record<string, Record<string, any>> | undefined {
  if (!nativeSearchConfig) {
    return undefined;
  }

  const providerOptions = nativeSearchConfig.providerOptions
    ? { ...nativeSearchConfig.providerOptions }
    : {};

  const providerOptionsTools = Array.isArray(providerOptions.tools)
    ? providerOptions.tools
    : undefined;

  const nativeSearchTools = providerOptionsTools && providerOptionsTools.length > 0
    ? providerOptionsTools
    : nativeSearchConfig.tools;

  if (nativeSearchTools && nativeSearchTools.length > 0) {
    providerOptions[NATIVE_WEB_SEARCH_TOOLS_BODY_KEY] = [...nativeSearchTools];
    delete providerOptions.tools;
  }

  return Object.keys(providerOptions).length > 0
    ? { [providerId]: providerOptions }
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function resolveLatestVersionedToolFactory(
  toolFactories: Record<string, unknown>,
  baseName: string
): { providerTool: string; factory: (args?: unknown) => any } | null {
  const pattern = new RegExp(`^${baseName}_(\\d{8})$`);
  const matches = Object.entries(toolFactories)
    .map(([name, factory]) => {
      const match = pattern.exec(name);
      if (!match || typeof factory !== "function") return null;
      return {
        providerTool: name,
        date: match[1],
        factory: factory as (args?: unknown) => any
      };
    })
    .filter((item): item is { providerTool: string; date: string; factory: (args?: unknown) => any } => !!item)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (matches.length > 0) {
    return { providerTool: matches[0].providerTool, factory: matches[0].factory };
  }

  const plainFactory = toolFactories[baseName];
  if (typeof plainFactory === "function") {
    return { providerTool: baseName, factory: plainFactory as (args?: unknown) => any };
  }

  return null;
}

function resolveNativeSdkToolFactory(
  providerId: string,
  strategy: NativeWebSearchSdkNativeConfig["strategy"],
  toolFactories: Record<string, unknown>
): { providerTool: string; toolName: string; factory: (args?: unknown) => any } | null {
  if (strategy === "anthropic_web_search") {
    const resolved = resolveLatestVersionedToolFactory(toolFactories, "webSearch");
    if (!resolved) {
      logger.warn("executeChatCore: anthropic web search tool factory not found", {
        providerId
      });
      return null;
    }
    return { ...resolved, toolName: "web_search" };
  }

  if (strategy === "google_search") {
    const factory = toolFactories.googleSearch;
    if (typeof factory !== "function") {
      logger.warn("executeChatCore: google search tool factory not found", {
        providerId
      });
      return null;
    }
    return {
      providerTool: "googleSearch",
      toolName: "google_search",
      factory: factory as (args?: unknown) => any
    };
  }

  return null;
}

function invokeNativeSdkToolFactory(
  factory: (args?: unknown) => any,
  args: Record<string, unknown> | undefined
): any {
  return args === undefined ? factory() : factory(args);
}

function buildNativeSearchSdkTools(params: {
  providerId: string;
  providerType: string;
  client: any;
  sdkNativeConfig: NativeWebSearchSdkNativeConfig | undefined;
  existingTools: Record<string, any> | undefined;
}): Record<string, any> | undefined {
  const { providerId, providerType, client, sdkNativeConfig, existingTools } = params;
  if (!sdkNativeConfig) return undefined;

  const toolFactories = (client as any)?.tools;
  if (!isRecord(toolFactories)) {
    logger.warn("executeChatCore: native sdk tools unavailable on client", { providerId, providerType });
    return undefined;
  }

  const resolved = resolveNativeSdkToolFactory(providerId, sdkNativeConfig.strategy, toolFactories);
  if (!resolved) {
    return undefined;
  }

  const args = sdkNativeConfig.args;
  if (args !== undefined && !isRecord(args)) {
    logger.warn("executeChatCore: native sdk tool args must be object", {
      providerId,
      strategy: sdkNativeConfig.strategy,
      args
    });
    return undefined;
  }

  try {
    const tool = invokeNativeSdkToolFactory(resolved.factory, args);
    return { [resolved.toolName]: tool };
  } catch (error) {
    logger.warn("executeChatCore: failed to create native sdk tool", {
      providerId,
      strategy: sdkNativeConfig.strategy,
      providerTool: resolved.providerTool,
      toolName: resolved.toolName,
      error
    });
    return undefined;
  }
}

function mergeToolsWithNativeSdkTools(
  providerId: string,
  existingTools: Record<string, any> | undefined,
  nativeSdkTools: Record<string, any> | undefined
): Record<string, any> | undefined {
  if (!nativeSdkTools) return existingTools;
  if (!existingTools || Object.keys(existingTools).length === 0) return nativeSdkTools;

  const merged: Record<string, any> = { ...nativeSdkTools };
  for (const [toolName, tool] of Object.entries(existingTools)) {
    if (Object.prototype.hasOwnProperty.call(merged, toolName)) {
      logger.warn("executeChatCore: native sdk tool name conflict, keeping native tool", {
        providerId,
        toolName
      });
      continue;
    }
    merged[toolName] = tool;
  }
  return merged;
}

/**
 * Chat 模式下允许使用的工具白名单
 * 只有白名单中的工具（前缀匹配）才会在 Chat 模式下传递给 AI
 * 这些通常是系统级工具，不涉及外部操作
 */
const CHAT_MODE_TOOLS_WHITELIST: string[] = [
  'system::web_search',
  'system::web_scrape',
  'system::historical_memory_search',
  'system::historical_memory_review',
];

type AggregatedToolStat = {
  serverId: string;
  serverName: string;
  toolsCount: number;
  fetchTime: number;
  status: string;
  error?: string;
};

function filterHistoricalSystemMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.filter((message) => message.role !== "system");
}

async function buildFinalMessages(params: {
  sessionId: string;
  mode: ChatMode;
  citationRequired: boolean;
  responseLocale: ReturnType<typeof resolveTargetResponseLocale>;
  currentUserText: string;
  skillId?: string | null;
  messages: Array<Pick<AppUIMessage, 'role' | 'parts'>>;
  prebuiltModelMessages?: ModelMessage[];
}): Promise<{
  messages: ModelMessage[];
  historicalMemory?: Awaited<ReturnType<typeof resolveSystemPromptEnvelope>>["historicalMemory"];
}> {
  const {
    sessionId,
    mode,
    citationRequired,
    responseLocale,
    currentUserText,
    skillId,
    messages,
    prebuiltModelMessages,
  } = params;

  const { systemMessages, contextDataMessages, historicalMemory } = await resolveSystemPromptEnvelope({
    sessionId,
    mode,
    citationRequired,
    responseLocale,
    currentUserText,
    skillId: skillId ?? null,
  });
  const finalMessages: ModelMessage[] = [...systemMessages, ...contextDataMessages];

  const modelMessages = prebuiltModelMessages ?? await (async () => {
    const uiMessages = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m, i) => ({
        id: `m-${i}`,
        role: m.role as MessageRole,
        parts: m.parts as any[],
      }));
    const validatedUIMessages = await validateUIMessages({ messages: uiMessages });
    return convertToModelMessages(
      validatedUIMessages.map(({ id, ...rest }) => rest),
      {
        convertDataPart: (part) => {
          if (part.type === 'data-quote' || part.type === 'data-note-context') {
            return { type: 'text', text: '' };
          }
          return { type: "text", text: JSON.stringify(part.data) };
        },
      }
    );
  })();
  finalMessages.push(...filterHistoricalSystemMessages(modelMessages));

  return { messages: finalMessages, historicalMemory };
}

async function aggregateToolsForMode(params: {
  sessionId: string;
  mode: ChatMode;
  toolApprovalMode: ToolApprovalMode;
  mcpServerIds?: string[];
  skillId?: string | null;
  webSearch: WebSearchMode;
  citationStartIndex: number;
  selectedModel: string;
}): Promise<{
  tools: Record<string, any> | undefined;
  mcpStats: AggregatedToolStat[];
  mcpAggregationTime: number;
}> {
  const { sessionId, mode, toolApprovalMode, mcpServerIds, skillId, webSearch, citationStartIndex, selectedModel } = params;
  let tools: Record<string, any> | undefined;
  let mcpStats: AggregatedToolStat[] = [];
  const mcpAggregationStartTime = Date.now();
  const isWebSearchEnabled = webSearch !== 'close' && webSearch !== 'native';
  const webSearchProviderId = isWebSearchEnabled ? webSearch : undefined;

  if (mode === 'agent') {
    const baseIds = mcpServerIds && mcpServerIds.length > 0 ? mcpServerIds : [];
    const serverIdsToAggregate =
      skillId != null && skillId !== ''
        ? [...new Set([...baseIds, ...BUILTIN_SKILL_REQUIRED_SERVER_IDS])]
        : baseIds;

    try {
      logger.info("executeChatCore: aggregating MCP tools (agent mode)", {
        serverCount: serverIdsToAggregate.length,
        skillActive: !!skillId
      });

      const result = await aggregateMcpTools({
        serverIds: serverIdsToAggregate,
        sessionId,
        toolApprovalMode,
        webSearchProviderId,
        citationStartIndex,
        selectedModel
      });
      tools = result.tools;
      mcpStats = result.stats;

      logger.info("executeChatCore: MCP tools aggregated", {
        toolCount: Object.keys(tools).length,
        aggregationTime: Date.now() - mcpAggregationStartTime
      });
    } catch (error) {
      logger.error("executeChatCore: failed to aggregate MCP tools", { error });
      tools = undefined;
    }
  } else {
    try {
      logger.info("executeChatCore: aggregating system tools only (chat mode)");
      const result = await aggregateMcpTools({
        serverIds: [],
        sessionId,
        toolApprovalMode,
        webSearchProviderId,
        citationStartIndex,
        selectedModel
      });

      const filteredTools: Record<string, any> = {};
      for (const [toolName, tool] of Object.entries(result.tools)) {
        const isWhitelisted = CHAT_MODE_TOOLS_WHITELIST.some(prefix => toolName.startsWith(prefix));
        if (isWhitelisted) {
          filteredTools[toolName] = tool;
        }
      }

      tools = Object.keys(filteredTools).length > 0 ? filteredTools : undefined;
      mcpStats = result.stats;

      logger.info("executeChatCore: system tools filtered for chat mode", {
        originalCount: Object.keys(result.tools).length,
        filteredCount: Object.keys(filteredTools).length
      });
    } catch (error) {
      logger.error("executeChatCore: failed to aggregate system tools", { error });
      tools = undefined;
    }
  }

  if (!isWebSearchEnabled && tools) {
    const filteredTools: Record<string, any> = {};
    for (const [toolName, tool] of Object.entries(tools)) {
      if (toolName === 'system::web_search') continue;
      filteredTools[toolName] = tool;
    }
    tools = Object.keys(filteredTools).length > 0 ? filteredTools : undefined;
    logger.info("executeChatCore: web_search tool filtered out", {
      webSearch,
      reason: webSearch === 'native' ? 'using native model search' : 'web search disabled',
      remainingToolCount: tools ? Object.keys(tools).length : 0
    });
  }

  if (!getMemorySettings().historicalEnabled && tools) {
    const filteredTools: Record<string, any> = {};
    for (const [toolName, tool] of Object.entries(tools)) {
      if (toolName === 'system::historical_memory_search') continue;
      if (toolName === 'system::historical_memory_review') continue;
      filteredTools[toolName] = tool;
    }
    tools = Object.keys(filteredTools).length > 0 ? filteredTools : undefined;
  }

  return {
    tools,
    mcpStats,
    mcpAggregationTime: Date.now() - mcpAggregationStartTime
  };
}

function resolveNativeSearchOptions(
  webSearch: WebSearchMode,
  providerId: string,
  nativeSearchConfig: NativeWebSearchConfig | null
): {
  providerOptions?: Record<string, Record<string, any>>;
  sdkNativeConfig?: NativeWebSearchSdkNativeConfig;
} {
  if (webSearch !== 'native') {
    return {};
  }

  if (!nativeSearchConfig) {
    logger.warn("executeChatCore: native search requested but provider not supported", {
      providerId
    });
    return {};
  }

  const providerOptions = buildNativeSearchProviderOptions(providerId, nativeSearchConfig);

  logger.info("executeChatCore: native search enabled", {
    providerId,
    hasProviderOptions: !!nativeSearchConfig.providerOptions,
    hasTools: !!nativeSearchConfig.tools,
    hasSdkNative: !!nativeSearchConfig.sdkNative
  });

  return {
    providerOptions,
    sdkNativeConfig: nativeSearchConfig.sdkNative
  };
}

type ProviderOptionsPatch = {
  source: string;
  options?: Record<string, Record<string, any>>;
};

function mergeProviderOptionsPatches(
  ...patches: ProviderOptionsPatch[]
): Record<string, Record<string, any>> | undefined {
  const merged: Record<string, Record<string, any>> = {};

  for (const { source, options: patch } of patches) {
    if (!patch) continue;
    for (const [providerId, options] of Object.entries(patch)) {
      if (!merged[providerId]) {
        merged[providerId] = { ...options };
      } else {
        const conflictingKeys = Object.keys(options).filter((key) => key in merged[providerId]);
        if (conflictingKeys.length > 0) {
          logger.warn("mergeProviderOptionsPatches: provider options conflict, later patch wins", {
            providerId,
            source,
            conflictingKeys
          });
        }
        merged[providerId] = { ...merged[providerId], ...options };
      }
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function resolveThinkingOptions(
  thinking: ThinkingMode,
  providerId: string,
  modelThinkingConfig: ThinkingConfig | undefined
): {
  effectiveThinking: ThinkingMode;
  providerOptions?: Record<string, Record<string, any>>;
} {
  const result = resolveThinkingMode(modelThinkingConfig, thinking);
  if (!result.patch) {
    return { effectiveThinking: result.effectiveMode };
  }

  return {
    effectiveThinking: result.effectiveMode,
    providerOptions: {
      [providerId]: { ...result.patch },
    },
  };
}

export type ChatSendParams = {
  sessionId: string;
  turnId?: string;  // 前端预先生成的 turn ID（严格 turn 驱动）
  assistantMessageId?: string;  // 可选的前端生成的 assistant 消息 ID（新建模式）
  existingAssistantMessageId?: string;  // 替换模式：要重置的现有 assistant 消息 ID
  userMessageId?: string;  // 触发请求的 user 消息 ID（用于关联调试信息和更新 selectedModel）
  messages: Array<Pick<AppUIMessage, 'role' | 'parts'>>;  // 前端构造的对话历史（结构化）
  selectedModel: string;
  window: BrowserWindow;
  abortSignal: AbortSignal;
  mcpServerIds?: string[];  // MCP 服务器 ID 列表
  mode?: ChatMode;  // 发送模式（chat/agent），默认 chat
  toolApprovalMode?: ToolApprovalMode;  // 工具审批模式（默认审批/自动审批）
  webSearch?: WebSearchMode;  // 网络搜索模式（auto/close），默认 auto
  thinking?: ThinkingMode;  // 思考深度（auto/off/on/standard/deep/ultra），默认 auto
  citationRequired?: boolean;  // 是否需要在回答中标注引用（知识库或网络搜索时由前端传入）
  citationStartIndex?: number;  // 网络搜索来源起始序号（0=无知识库，N=前 N 条为知识库）
  /** 本轮选中的技能 id（来自路由），有则注入技能说明并挂技能工具 */
  skillId?: string | null;
};

/**
 * 执行 AI 对话的核心逻辑（被 send 和 replaceGenerate 共用）
 */
async function executeChatCore(params: {
  sessionId: string;
  assistantMessageId: string;
  turnId?: string;
  debugRunId?: string;
  userMessageId?: string;  // 🆕 触发请求的 user 消息 ID（用于关联调试信息）
  messages: Array<Pick<AppUIMessage, 'role' | 'parts'>>;
  prebuiltModelMessages?: ModelMessage[];
  selectedModel: string;
  window: BrowserWindow;
  abortSignal: AbortSignal;
  mcpServerIds?: string[];  // MCP 服务器 ID 列表
  mode?: ChatMode;  // 发送模式（chat/agent），默认 chat
  toolApprovalMode?: ToolApprovalMode;  // 工具审批模式（默认审批/自动审批）
  webSearch?: WebSearchMode;  // 网络搜索模式（auto/close），默认 auto
  thinking?: ThinkingMode;  // 思考深度（auto/off/on/standard/deep/ultra），默认 auto
  citationRequired?: boolean;  // 是否需要在回答中标注引用
  citationStartIndex?: number;  // 网络搜索来源起始序号（0=无知识库）
  skillId?: string | null;  // 本轮选中的技能 id（来自路由），有则注入技能说明并挂技能工具）
}) {
  const { sessionId, assistantMessageId, turnId, debugRunId, userMessageId, messages, prebuiltModelMessages, selectedModel, window, abortSignal, mcpServerIds, mode = 'chat', toolApprovalMode = 'default', webSearch = 'auto', thinking = 'auto', citationRequired = false, citationStartIndex = 0, skillId } = params;
  const effectiveToolApprovalMode: ToolApprovalMode = mode === 'agent' ? toolApprovalMode : 'default';
  const shouldPersist = true;
  let sessionForRequest: ReturnType<typeof getSession> = null;

  // 记录请求开始时间
  const requestStartTime = Date.now();
  
  
  // 🆕 调试信息收集器
  const debugSteps: DebugStep[] = [];
  const debugToolExecutions: DebugToolExecution[] = [];
  let activeDebugRunId: string | undefined = debugRunId;
  const resolveToolAfterStepIndex = () =>
    debugSteps.length > 0
      ? debugSteps[debugSteps.length - 1].index
      : Math.max(currentStepIndex - 1, 0);
  let currentStepIndex = 0;
  let currentStepStartTime = requestStartTime;
  let currentStepInputMessages: any[] = [];  // 当前 step 的输入消息（在 step 开始时设置）
  let currentStepOutputContent: any = null;  // 当前 step 的输出内容
  const memorySettings = getMemorySettings();

  // 解析 selectedModel (格式: 'providerId::modelId')
  const [providerId, modelId] = selectedModel.split('::');
  if (!providerId || !modelId) {
    throw new Error(`Invalid selectedModel format: ${selectedModel}`);
  }
  if (providerId === LOCAL_PROVIDER_ID) {
    await localModelRuntimeService.ensureModelReady(modelId);
  }

  // 2. 获取会话信息
  sessionForRequest = getSession(sessionId);
  if (!sessionForRequest) {
    throw new Error(tMain("session.notFoundWithId", { sessionId }));
  }
  const currentScenarioId = sessionForRequest.scenarioId;
  // 更新会话的 updatedAt（临时会话会同时刷新 expiresAt）
  touchSession(sessionId);

  // 3. 获取场景配置
  const scenario = getScenario(currentScenarioId);
  if (!scenario) {
    throw new Error(tMain("scenario.notFoundWithId", { scenarioId: currentScenarioId }));
  }

  const { currentUserText, historicalUserTexts } = extractUserTextContextFromDialogMessages(messages);
  const responseLocale = resolveTargetResponseLocale({
    currentUserText,
    historicalUserTexts,
  });

  logger.info("executeChatCore: using scenario", {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    temperature: scenario.temperature,
    topP: scenario.topP,
    topK: scenario.topK,
    presencePenalty: scenario.presencePenalty,
    frequencyPenalty: scenario.frequencyPenalty,
    stopSequences: scenario.stopSequences,
    seed: scenario.seed,
    maxOutputTokens: scenario.maxOutputTokens,
    hasSystemPrompt: !!scenario.systemPrompt
  });

  // 4. 根据 providerId 创建对应的 Provider
  const { provider, client } = resolveModelInvocation({ providerId, modelId });
  const providerModel = provider.models.find((m) => m.id === modelId);
  validateInputModalitiesForMessages({
    messages,
    inputModalities: providerModel?.inputModalities,
  });
  const nativeSearchConfig = resolveNativeWebSearchConfig(
    provider.nativeWebSearchDefaults,
    providerModel?.nativeWebSearch
  );
  const thinkingOptions = resolveThinkingOptions(
    thinking,
    providerId,
    providerModel?.thinking
  );
  const effectiveWebSearch: WebSearchMode =
    webSearch === 'native' && !nativeSearchConfig ? 'builtin' : webSearch;

  if (webSearch === 'native' && !nativeSearchConfig) {
    logger.warn("executeChatCore: native search requested but model has no config; falling back", {
      providerId,
      modelId,
      fallbackWebSearch: effectiveWebSearch
    });
  }

  // 5. 构建最终消息：system 由 resolveSystemMessages 统一生成，再追加对话历史
  const promptEnvelope = await buildFinalMessages({
    sessionId,
    mode,
    citationRequired,
    responseLocale,
    currentUserText,
    skillId,
    messages,
    prebuiltModelMessages,
  });
  const finalMessages = promptEnvelope.messages;
  
  logger.info("executeChatCore: final messages constructed", {
    totalMessages: finalMessages.length,
    hasSystemPrompt: finalMessages[0]?.role === 'system',
    dialogMessagesCount: messages.length,
    messageTypes: finalMessages.map(m => ({
      role: m.role,
      contentTypes: Array.isArray((m as any).content)
        ? (m as any).content.map((p: any) => p.type).join(',')
        : 'string'
    }))
  });

  // 6. 聚合 MCP 工具（根据 mode 决定是否传递）
  const aggregatedTools = await aggregateToolsForMode({
    sessionId,
    mode,
    toolApprovalMode: effectiveToolApprovalMode,
    mcpServerIds,
    skillId,
    webSearch: effectiveWebSearch,
    citationStartIndex,
    selectedModel
  });
  let tools = aggregatedTools.tools;
  const mcpStats = aggregatedTools.mcpStats;
  const mcpAggregationTime = aggregatedTools.mcpAggregationTime;

  // 7. 调用 AI SDK streamText
  const maxToolSteps = scenario?.maxToolSteps ?? 20;
  
  // 7.1 构建原生搜索配置（仅在 native 模式下）
  const { providerOptions, sdkNativeConfig } = resolveNativeSearchOptions(
    effectiveWebSearch,
    providerId,
    nativeSearchConfig
  );
  const mergedProviderOptions = mergeProviderOptionsPatches(
    { source: "native-web-search", options: providerOptions },
    // Thinking patch has higher priority than native-search patch on key conflict.
    { source: "thinking", options: thinkingOptions.providerOptions }
  );
  const nativeSdkTools = buildNativeSearchSdkTools({
    providerId,
    providerType: provider.type,
    client,
    sdkNativeConfig,
    existingTools: tools
  });
  tools = mergeToolsWithNativeSdkTools(providerId, tools, nativeSdkTools);

  // 重新计算 hasTools
  const finalHasTools = tools && Object.keys(tools).length > 0;

  logger.info("executeChatCore: calling streamText", {
    modelId,
    messagesCount: finalMessages.length,
    temperature: scenario.temperature,
    topP: scenario.topP,
    topK: scenario.topK,
    presencePenalty: scenario.presencePenalty,
    frequencyPenalty: scenario.frequencyPenalty,
    stopSequences: scenario.stopSequences,
    seed: scenario.seed,
    maxOutputTokens: scenario.maxOutputTokens,
    toolsEnabled: finalHasTools,
    toolCount: tools ? Object.keys(tools).length : 0,
    nativeSdkToolCount: nativeSdkTools ? Object.keys(nativeSdkTools).length : 0,
    maxToolSteps,
    thinking,
    effectiveThinking: thinkingOptions.effectiveThinking
  });

  if (turnId) {
    updateTurn(turnId, {
      effectiveThinking: thinkingOptions.effectiveThinking
    });
  }

  const mcpServersSnapshot = mcpServerIds && mcpServerIds.length > 0 ? await Promise.all(
    mcpServerIds.map(async (serverId) => {
      const { getMcpServer } = await import('../mcp/mcpData');
      const config = getMcpServer(serverId);
      const stat = mcpStats.find(s => s.serverId === serverId);
      return {
        id: serverId,
        name: config?.name || serverId,
        toolsCount: stat?.toolsCount ?? 0,
        fromCache: false,
        buildTime: stat?.fetchTime
      };
    })
  ) : undefined;
  const availableTools = tools ? Object.entries(tools).map(([name, tool]) => ({
    name,
    description: (tool as any).description
  })) : undefined;
  const systemPromptSnapshot = finalMessages
    .filter((m): m is { role: 'system'; content: string } => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');

  if (shouldPersist && turnId && !activeDebugRunId) {
    try {
      activeDebugRunId = createDebugRun({
        sessionId,
        turnId,
        userMessageId: userMessageId ?? null,
        assistantMessageId,
        startTime: requestStartTime,
        meta: {
          sessionId,
          userMessageId: userMessageId ?? null,
          assistantMessageId,
          model: selectedModel,
          provider: {
            id: providerId,
            name: provider.name,
            baseUrl: provider.baseUrl
          },
          params: {
            systemPrompt: systemPromptSnapshot,
            temperature: scenario.temperature,
            topP: scenario.topP,
            maxOutputTokens: scenario.maxOutputTokens,
            maxToolSteps: scenario.maxToolSteps
          },
          mcpServers: mcpServersSnapshot,
          mcpAggregationTime: mcpServerIds && mcpServerIds.length > 0 ? mcpAggregationTime : undefined,
          availableTools,
          historicalMemory: promptEnvelope.historicalMemory,
        }
      });
    } catch (error) {
      logger.error("executeChatCore: failed to create debug run", { error, turnId });
    }
  }
  
  const { fullStream, usage } = streamText({
    model: client(modelId),
    messages: finalMessages,
    ...(scenario.temperature !== undefined ? { temperature: scenario.temperature } : {}),
    ...(scenario.topP !== undefined ? { topP: scenario.topP } : {}),
    ...(scenario.topK !== undefined && Number.isFinite(scenario.topK) ? { topK: Math.max(1, Math.floor(scenario.topK)) } : {}),
    ...(scenario.presencePenalty !== undefined ? { presencePenalty: scenario.presencePenalty } : {}),
    ...(scenario.frequencyPenalty !== undefined ? { frequencyPenalty: scenario.frequencyPenalty } : {}),
    ...(scenario.stopSequences && scenario.stopSequences.length > 0 ? { stopSequences: scenario.stopSequences } : {}),
    ...(scenario.seed !== undefined ? { seed: scenario.seed } : {}),
    maxOutputTokens: scenario.maxOutputTokens,
    abortSignal,
    
    // 模型原生搜索 providerOptions（仅在 native 模式且 Provider 支持时启用）
    ...(mergedProviderOptions ? { providerOptions: mergedProviderOptions } : {}),
    
    // 添加 tools 和 stopWhen（如果有工具）
    ...(finalHasTools ? {
      tools,
      stopWhen: stepCountIs(maxToolSteps)
    } : {})
  });
  
  // 🆕 初始化第一个 step 的 inputMessages（就是 finalMessages 的深拷贝）
  currentStepInputMessages = JSON.parse(JSON.stringify(finalMessages));

  // 8. 流式输出
  // 消息流式开始后更新数据库消息
  if (shouldPersist) {
    updateMessage(assistantMessageId, {
      status: 'streaming'
    });
    if (turnId) {
      updateTurn(turnId, {
        status: 'streaming',
        assistantMessageId
      });
    }
  }

  // 当前正在处理的 assistant 消息 ID（可能会创建多条）
  let currentAssistantMessageId = assistantMessageId;
  // 累积当前 assistant 消息的内容（初始为空数组，按需添加）
  let currentAssistantContent: MessageContentPart[] = [];
  if (shouldPersist && prebuiltModelMessages) {
    const existingAssistant = getMessage(assistantMessageId);
    if (existingAssistant?.parts?.length) {
      currentAssistantContent = JSON.parse(JSON.stringify(existingAssistant.parts));
    }
  }
  // 当前正在流式输出的 part 索引（-1 表示没有）
  let currentTextPartIndex = -1;
  let currentThinkingPartIndex = -1;
  
  // 工具调用时间追踪
  const toolCallStartTimes = new Map<string, number>();
  const toolCallInputs = new Map<string, any>();
  
  // 记录已创建的所有消息 ID（用于前端关联显示）
  const createdMessageIds: string[] = [assistantMessageId];
  
  // DB 节流更新：每 1 秒更新一次
  let lastDbUpdateTime = Date.now();
  const DB_UPDATE_INTERVAL = 1000; // 1 秒
  
  // 🆕 流处理结果状态
  let streamFinishReason: 'stop' | 'aborted' | 'error' = 'stop';
  let streamError: string | undefined = undefined;
  let lastStreamPartError: unknown = undefined;
  let tokenUsage: LanguageModelUsage | undefined = undefined;
  let hasPendingApproval = false;

  function emitStreamChunk(
    messageId: string,
    chunk: UIMessageChunk<{ createdMessageIds?: string[]; tokenUsage?: { inputTokens: number | null; outputTokens: number | null } }, UIDataTypes>,
    extra?: {
      createdMessageIds?: string[];
      tokenUsage?: { inputTokens: number | null; outputTokens: number | null };
    }
  ) {
    window.webContents.send('chat:stream', {
      sessionId,
      messageId,
      turnId,
      createdMessageIds: extra?.createdMessageIds,
      tokenUsage: extra?.tokenUsage,
      chunk,
    });
  }
  
  // 与历史实现兼容：同轮不再切分 assistant，保持单消息承载
  async function ensureCurrentAssistantMessage(_eventType: string) {
    return;
  }
  
  // 🆕 流处理循环（包在 try-catch 中，捕获中止和错误）
  try {
  
  for await (const part of fullStream) {
    // 用户已中止时，立即停止消费后续事件，避免工具晚返回写回内容。
    if (abortSignal.aborted) {
      streamFinishReason = 'aborted';
      logger.info('Stream aborted: stop consuming stream parts', { sessionId, messageId: currentAssistantMessageId });
      break;
    }

    // 记录所有流事件用于调试
    logger.debug('Stream event', { type: part.type });
    
    if (part.type === 'text-start') {
      // 文本开始：确保有可用的 assistant 消息，然后创建新的 text part
      await ensureCurrentAssistantMessage('text');
      
      currentAssistantContent.push({ type: 'text', text: '' });
      currentTextPartIndex = currentAssistantContent.length - 1;
      
      emitStreamChunk(currentAssistantMessageId, {
        type: 'text-start',
        id: part.id
      });
      logger.debug('Text started', { messageId: currentAssistantMessageId, id: part.id });
    } else if (part.type === 'text-delta') {
      // 文本增量：追加到当前 text part
      if (currentTextPartIndex >= 0) {
        const textPart = currentAssistantContent[currentTextPartIndex];
        if (textPart && textPart.type === 'text') {
          textPart.text += part.text;
        }
      }
      
      emitStreamChunk(currentAssistantMessageId, {
        type: 'text-delta',
        id: part.id,
        delta: part.text
      });
      
      // 节流更新数据库
      if (shouldPersist) {
        const now = Date.now();
        if (now - lastDbUpdateTime >= DB_UPDATE_INTERVAL) {
          updateMessage(currentAssistantMessageId, {
            parts: currentAssistantContent
          });
          lastDbUpdateTime = now;
        }
      }
    } else if (part.type === 'text-end') {
      // 文本结束：重置索引
      currentTextPartIndex = -1;
      
      emitStreamChunk(currentAssistantMessageId, {
        type: 'text-end',
        id: part.id
      });
      logger.debug('Text ended', { messageId: currentAssistantMessageId, id: part.id });
    } else if (part.type === 'reasoning-start') {
      // 思考开始：确保有可用的 assistant 消息，然后创建新的 thinking part
      const beforeMessageId = currentAssistantMessageId;
      await ensureCurrentAssistantMessage('reasoning');
      const afterMessageId = currentAssistantMessageId;
      const startTime = Date.now();
      
      const thinkingPart = {
        type: 'reasoning' as const,
        text: '',
        state: 'streaming' as const,
        startTime
      };
      currentAssistantContent.push(thinkingPart);
      currentThinkingPartIndex = currentAssistantContent.length - 1;
      
      emitStreamChunk(currentAssistantMessageId, {
        type: 'reasoning-start',
        id: part.id,
        startTime
      } as any);
      
      // 🔍 调试日志：记录是否创建了新消息
      logger.info('Reasoning started', { 
        messageId: currentAssistantMessageId, 
        id: part.id,
        messageChanged: beforeMessageId !== afterMessageId,
        thinkingPartIndex: currentThinkingPartIndex,
        contentLength: currentAssistantContent.length
      });
    } else if (part.type === 'reasoning-delta') {
      // 思考内容增量
      if (currentThinkingPartIndex >= 0) {
        const thinkingPart = currentAssistantContent[currentThinkingPartIndex];
        if (thinkingPart && (thinkingPart as any).type === 'reasoning') {
          (thinkingPart as any).text += part.text;
        }
      }
      
      emitStreamChunk(currentAssistantMessageId, {
        type: 'reasoning-delta',
        id: part.id,
        delta: part.text
      });
    } else if (part.type === 'reasoning-end') {
      // 思考结束：更新 thinking part 状态
      const endTime = Date.now();
      const thinkingUpdated = currentThinkingPartIndex >= 0;
      if (currentThinkingPartIndex >= 0) {
        const thinkingPart = currentAssistantContent[currentThinkingPartIndex];
        if (thinkingPart && (thinkingPart as any).type === 'reasoning') {
          (thinkingPart as any).state = 'done';
          (thinkingPart as any).endTime = endTime;
        }
        currentThinkingPartIndex = -1;
      }
      
      emitStreamChunk(currentAssistantMessageId, {
        type: 'reasoning-end',
        id: part.id,
        endTime
      } as any);
      
      // 🔍 调试日志：记录是否成功更新了 thinking
      logger.info('Reasoning ended', { 
        messageId: currentAssistantMessageId, 
        id: part.id,
        thinkingUpdated,
        contentLength: currentAssistantContent.length
      });
    } else if (part.type === 'source') {
      await ensureCurrentAssistantMessage('source');
      const source = part as any;
      if (source.sourceType === 'url') {
        const sourcePart = {
          type: 'source-url',
          sourceId: source.id,
          url: source.url,
          title: source.title,
          providerMetadata: source.providerMetadata
        } as const;
        currentAssistantContent.push(sourcePart as any);
        emitStreamChunk(currentAssistantMessageId, sourcePart as any);
      } else if (source.sourceType === 'document') {
        const sourcePart = {
          type: 'source-document',
          sourceId: source.id,
          mediaType: source.mediaType || 'application/octet-stream',
          title: source.title || source.filename || source.id,
          filename: source.filename,
          providerMetadata: source.providerMetadata
        } as const;
        currentAssistantContent.push(sourcePart as any);
        emitStreamChunk(currentAssistantMessageId, sourcePart as any);
      }
      if (shouldPersist) {
        updateMessage(currentAssistantMessageId, { parts: currentAssistantContent });
      }
    } else if (part.type === 'file') {
      await ensureCurrentAssistantMessage('file');
      const fileChunk = part as any;
      const generatedFile = fileChunk.file ?? {};
      const mediaType = generatedFile.mediaType || 'application/octet-stream';
      const base64 = generatedFile.base64 ?? generatedFile.base64Data;
      const url = generatedFile.url || (base64 ? `data:${mediaType};base64,${base64}` : undefined);
      if (url) {
        const filePart = { type: 'file', mediaType, url } as const;
        currentAssistantContent.push(filePart as any);
        emitStreamChunk(currentAssistantMessageId, filePart as any);
        if (shouldPersist) {
          updateMessage(currentAssistantMessageId, { parts: currentAssistantContent });
        }
      }
    } else if (part.type === 'tool-call') {
      // 工具调用：确保有可用的 assistant 消息
      await ensureCurrentAssistantMessage('tool-call');
      // 工具调用开始
      const startTime = Date.now();
      toolCallStartTimes.set(part.toolCallId, startTime);
      logger.info('Tool call started', {
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input
      });
      // 添加 dynamic-tool part 到当前 assistant 消息（AI SDK UI 原生结构）
      const [serverId, toolName] = part.toolName.split('::');
      
      // 获取服务器名称
      const { getMcpServer } = await import('../mcp/mcpData');
      const config = getMcpServer(serverId);
      
      const existingToolIndex = currentAssistantContent.findIndex((p: any) =>
        p?.type === 'dynamic-tool' && p?.toolCallId === part.toolCallId
      );
      if (existingToolIndex >= 0) {
        const existing = currentAssistantContent[existingToolIndex] as any;
        currentAssistantContent[existingToolIndex] = {
          ...stripDynamicToolApproval(existing),
          toolName: part.toolName,
          toolCallId: part.toolCallId,
          type: 'dynamic-tool',
          state: 'input-streaming',
          input: part.input ?? existing?.input,
          callProviderMetadata: {
            ...(existing?.callProviderMetadata || {}),
            [TOOL_META_PROVIDER_KEY]: {
              ...(existing?.callProviderMetadata?.[TOOL_META_PROVIDER_KEY] || {}),
              serverId: serverId || '',
              serverName: config?.name || serverId || '',
              toolName: toolName || '',
              startTime
            }
          }
        } as any;
      } else {
        currentAssistantContent.push({
          toolName: part.toolName,
          toolCallId: part.toolCallId,
          type: 'dynamic-tool',
          state: 'input-streaming',
          input: part.input,
          callProviderMetadata: {
            [TOOL_META_PROVIDER_KEY]: {
              serverId: serverId || '',
              serverName: config?.name || serverId || '',
              toolName: toolName || '',
              startTime
            }
          }
        } as any);
      }
      
      toolCallInputs.set(part.toolCallId, part.input);
      
      emitStreamChunk(currentAssistantMessageId, {
        type: 'tool-input-available',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
        dynamic: true
      });
      emitStreamChunk(currentAssistantMessageId, {
        type: 'tool-execution-started',
        toolCallId: part.toolCallId
      } as any);
      
      // 更新数据库
      if (shouldPersist) {
        updateMessage(currentAssistantMessageId, {
          parts: currentAssistantContent
        });
      }
    } else if (part.type === 'tool-result') {
      // 工具调用结果：创建独立的 tool 消息
      const output = (part as any).output;
      const startTime = toolCallStartTimes.get(part.toolCallId) || Date.now();
      const duration = Date.now() - startTime;
      const [serverId, toolName] = part.toolName.split('::');
      logger.info('Tool call result - creating independent tool message', {
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        duration,
        output: output
      });
      
      // 获取服务器名称
      const { getMcpServer } = await import('../mcp/mcpData');
      const config = getMcpServer(serverId);
      
      // 创建独立的 tool 消息
      // 合并工具返回的 _meta（如 sources）和我们添加的服务器元数据
      const toolOutputMeta = output?._meta || {};
      // 同步更新 assistant 内的 dynamic-tool 状态（AI SDK UI 原生结构）
      currentAssistantContent = currentAssistantContent.map((p: any) => {
        if (p?.type === 'dynamic-tool' && p.toolCallId === part.toolCallId) {
          const next = stripDynamicToolApproval(p);
          return {
            ...next,
            state: 'output-available',
            output,
            callProviderMetadata: {
              ...(next.callProviderMetadata || {}),
              [TOOL_META_PROVIDER_KEY]: {
                ...(next.callProviderMetadata?.[TOOL_META_PROVIDER_KEY] || {}),
                ...toolOutputMeta,
                serverId: serverId || '',
                serverName: config?.name || serverId || '',
                toolName: toolName || '',
                duration,
                isError: output?.isError || false
              }
            }
          };
        }
        return p;
      });

      // 工具结果只保存在 assistant 的 dynamic-tool part 中，不再落独立 tool 消息
      
      // 清理时间追踪
      const toolEndTime = Date.now();
      const toolInput = toolCallInputs.get(part.toolCallId);
      toolCallStartTimes.delete(part.toolCallId);
      toolCallInputs.delete(part.toolCallId);
      
      // 🆕 记录工具执行信息
      debugToolExecutions.push({
        afterStepIndex: resolveToolAfterStepIndex(),
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        serverName: config?.name || serverId || '',
        startTime,
        endTime: toolEndTime,
        input: toolInput,
        output: output,
        isError: output?.isError || false
      });
      
      emitStreamChunk(currentAssistantMessageId, {
        type: 'tool-output-available',
        toolCallId: part.toolCallId,
        output: output,
        dynamic: true
      });
      
      if (shouldPersist) {
        updateMessage(currentAssistantMessageId, {
          parts: currentAssistantContent
        });
      }
    } else if (part.type === 'tool-error') {
      // 🆕 工具执行错误：创建包含错误信息的 tool 消息
      const toolError = part as any;
      const startTime = toolCallStartTimes.get(toolError.toolCallId) || Date.now();
      const duration = Date.now() - startTime;
      const [serverId, toolName] = toolError.toolName.split('::');
      
      logger.error('Tool call error', {
        toolCallId: toolError.toolCallId,
        toolName: toolError.toolName,
        error: toolError.error
      });
      
      // 获取服务器名称
      const { getMcpServer } = await import('../mcp/mcpData');
      const config = getMcpServer(serverId);
      
      // 创建包含错误信息的 tool_result
      const errorOutput = {
        isError: true,
        error: toolError.error?.message || String(toolError.error) || tMain("common.toolExecutionFailed"),
        details: toolError.error
      };

      // 同步更新 assistant 内的 dynamic-tool 状态（AI SDK UI 原生结构）
      currentAssistantContent = currentAssistantContent.map((p: any) => {
        if (p?.type === 'dynamic-tool' && p.toolCallId === toolError.toolCallId) {
          const next = stripDynamicToolApproval(p);
          return {
            ...next,
            state: 'output-error',
            errorText: errorOutput.error,
            callProviderMetadata: {
              ...(next.callProviderMetadata || {}),
              [TOOL_META_PROVIDER_KEY]: {
                ...(next.callProviderMetadata?.[TOOL_META_PROVIDER_KEY] || {}),
                serverId: serverId || '',
                serverName: config?.name || serverId || '',
                toolName: toolName || '',
                duration,
                isError: true
              }
            }
          };
        }
        return p;
      });
      
      // 工具错误只保存在 assistant 的 dynamic-tool part 中，不再落独立 tool 消息
      
      // 清理时间追踪
      const toolEndTime = Date.now();
      const toolInput = toolCallInputs.get(toolError.toolCallId);
      toolCallStartTimes.delete(toolError.toolCallId);
      toolCallInputs.delete(toolError.toolCallId);
      
      // 🆕 记录工具执行错误信息
      debugToolExecutions.push({
        afterStepIndex: resolveToolAfterStepIndex(),
        toolCallId: toolError.toolCallId,
        toolName: toolError.toolName,
        serverName: config?.name || serverId || '',
        startTime,
        endTime: toolEndTime,
        input: toolInput,
        output: errorOutput,
        isError: true,
        errorMessage: errorOutput.error
      });
      
      emitStreamChunk(currentAssistantMessageId, {
        type: 'tool-output-error',
        toolCallId: toolError.toolCallId,
        errorText: errorOutput.error,
        dynamic: true
      });
      
      if (shouldPersist) {
        updateMessage(currentAssistantMessageId, {
          parts: currentAssistantContent
        });
      }
    } else if (part.type === 'tool-approval-request') {
      // AI SDK needsApproval：流在此结束；将 tool-approval-request 写入 assistant content，续跑时 SDK 需在 message history 中匹配 approvalId
      const approvalPart = part as { type: 'tool-approval-request'; approvalId: string; toolCall: { toolCallId: string; toolName: string; input?: any } };
      hasPendingApproval = true;
      let updated = false;
      currentAssistantContent = currentAssistantContent.map((p: any) => {
        if (p?.type === 'dynamic-tool' && p.toolCallId === approvalPart.toolCall.toolCallId) {
          updated = true;
          return {
            ...p,
            state: 'approval-requested',
            input: approvalPart.toolCall.input ?? p.input,
            approval: { id: approvalPart.approvalId }
          };
        }
        return p;
      });
      if (!updated) {
        currentAssistantContent.push({
          type: 'dynamic-tool',
          toolName: approvalPart.toolCall.toolName,
          toolCallId: approvalPart.toolCall.toolCallId,
          state: 'approval-requested',
          input: approvalPart.toolCall.input,
          approval: { id: approvalPart.approvalId }
        } as any);
      }
      if (shouldPersist) {
        updateMessage(currentAssistantMessageId, {
          parts: currentAssistantContent,
          status: 'streaming'
        });
        if (turnId) {
          updateTurn(turnId, {
            status: 'awaiting_approval',
            endedAt: null
          });
        }
      }
      emitStreamChunk(currentAssistantMessageId, {
        type: 'tool-approval-request',
        approvalId: approvalPart.approvalId,
        toolCallId: approvalPart.toolCall.toolCallId
      });
      logger.info('Tool approval requested', {
        approvalId: approvalPart.approvalId,
        toolCallId: approvalPart.toolCall.toolCallId,
        toolName: approvalPart.toolCall.toolName
      });
    } else if (part.type === 'finish') {
      logger.info('Stream finish event', {
        finishReason: (part as any).finishReason,
        usage: (part as any).usage
      });
    } else if (part.type === 'abort') {
      streamFinishReason = 'aborted';
      logger.info('Stream abort event', { messageId: currentAssistantMessageId });
    } else if (part.type === 'error') {
      lastStreamPartError = (part as any).error;
      streamFinishReason = 'error';
      const resolvedPartError = resolveChatError(lastStreamPartError);
      if (!streamError || isGenericChatErrorMessage(streamError)) {
        streamError = resolvedPartError.message;
      }
      logger.error('Stream error event', {
        error: (part as any).error,
        resolvedMessage: resolvedPartError.message,
        statusCode: resolvedPartError.statusCode,
        providerCode: resolvedPartError.providerCode,
        retryable: resolvedPartError.retryable
      });
    } else if (part.type === 'start-step') {
      const stepInfo = part as any;
      const requestMessages = stepInfo?.request?.body?.messages;
      if (Array.isArray(requestMessages)) {
        currentStepInputMessages = JSON.parse(JSON.stringify(requestMessages));
      }
    } else if (part.type === 'finish-step') {
      // Step 完成事件（多步骤执行时）
      const stepInfo = part as any;
      const stepEndTime = Date.now();
      
      logger.debug('Step finished', {
        stepIndex: currentStepIndex,
        finishReason: stepInfo.finishReason,
        inputTokens: stepInfo.usage?.inputTokens,
        outputTokens: stepInfo.usage?.outputTokens,
        totalTokens: stepInfo.usage?.totalTokens
      });
      
      // 🆕 记录当前 step 的调试信息
      debugSteps.push({
        index: currentStepIndex,
        startTime: currentStepStartTime,
        endTime: stepEndTime,
        inputMessages: currentStepInputMessages,
        outputContent: currentStepOutputContent || currentAssistantContent,
        finishReason: stepInfo.finishReason,
        usage: stepInfo.usage ? {
          inputTokens: stepInfo.usage.inputTokens,
          outputTokens: stepInfo.usage.outputTokens
        } : undefined
      });
      
      // 准备下一个 step
      currentStepIndex++;
      currentStepStartTime = stepEndTime;
      currentStepOutputContent = null;
    }
  }
  
  // 流处理正常完成，获取 token 统计
  tokenUsage = await usage;
  
  } catch (streamError_) {
    if (abortSignal.aborted) {
      // 用户主动中止
      streamFinishReason = 'aborted';
      logger.info('Stream aborted by user', { sessionId, messageId: currentAssistantMessageId });
    } else {
      // 真正的错误
      const resolvedStreamError = resolveChatError(lastStreamPartError ?? streamError_);
      streamFinishReason = 'error';
      streamError = resolvedStreamError.message;
      logger.error('Stream error', {
        sessionId,
        messageId: currentAssistantMessageId,
        error: resolvedStreamError.message,
        statusCode: resolvedStreamError.statusCode,
        providerCode: resolvedStreamError.providerCode,
        retryable: resolvedStreamError.retryable,
        rawError: resolvedStreamError.rawMessage
      });
    }
  }

  // 9. 完成：更新最后一条 assistant 消息状态
  const responseEndTime = Date.now();
  
  // 提取 token 统计信息
  const promptTokens = tokenUsage?.inputTokens;
  const completionTokens = tokenUsage?.outputTokens;
  
  // 根据结束原因确定消息状态
  const finalStatus = hasPendingApproval && streamFinishReason === 'stop'
    ? 'streaming'
    : (streamFinishReason === 'error' ? 'error' : streamFinishReason === 'aborted' ? 'aborted' : 'success');

  if (streamFinishReason === 'aborted') {
    // 中止时将进行中的 part 收敛为终态，避免刷新后仍显示“执行中”。
    const abortedAt = Date.now();
    currentAssistantContent = currentAssistantContent.map((part: any) => {
      if (part?.type === 'reasoning' && part?.state === 'streaming') {
        return { ...part, state: 'done', endTime: part?.endTime ?? abortedAt };
      }
      if (
        part?.type === 'dynamic-tool' &&
        (part?.state === 'input-available' ||
          part?.state === 'approval-requested' ||
          part?.state === 'approval-responded' ||
          part?.state === 'input-streaming')
      ) {
        return {
          ...stripDynamicToolApproval(part),
          state: 'output-error',
          errorText: tMain("common.cancelled")
        };
      }
      return part;
    });
  }

  const validCitationIndices = citationRequired
    ? collectValidCitationIndices(citationStartIndex, currentAssistantContent)
    : new Set<number>();
  currentAssistantContent = sanitizeAssistantContentCitations(currentAssistantContent, validCitationIndices);
  
  // 流式结束后回写数据库消息
  if (shouldPersist) {
    updateMessage(currentAssistantMessageId, {
      parts: currentAssistantContent,
      status: finalStatus as 'streaming' | 'success' | 'aborted' | 'error',
      historicalMemory: promptEnvelope.historicalMemory
        ? {
            mode: 'auto',
            query: promptEnvelope.historicalMemory.query,
            hits: promptEnvelope.historicalMemory.hits,
          }
        : undefined
    });
  }
  
  // 非正常结束时补一个未完成 step，确保可回放真实输入
  if (streamFinishReason !== 'stop') {
    const lastStepIndex = debugSteps.length > 0 ? debugSteps[debugSteps.length - 1].index : -1;
    if (currentStepIndex > lastStepIndex) {
      debugSteps.push({
        index: currentStepIndex,
        startTime: currentStepStartTime,
        endTime: responseEndTime,
        inputMessages: currentStepInputMessages,
        outputContent: currentAssistantContent,
        finishReason: 'interrupted',
        usage: undefined
      });
      logger.info('Added incomplete step to debug info', {
        stepIndex: currentStepIndex,
        finishReason: streamFinishReason,
        contentLength: currentAssistantContent.find(p => p.type === 'text')?.text?.length ?? 0
      });
    }
  }

  if (shouldPersist && turnId && activeDebugRunId) {
    try {
      appendDebugRunSteps({
        runId: activeDebugRunId,
        steps: debugSteps,
        toolExecutions: debugToolExecutions,
      });
      if (!hasPendingApproval) {
        finalizeDebugRun({
          runId: activeDebugRunId,
          status: streamFinishReason === 'stop' ? 'success' : streamFinishReason === 'aborted' ? 'aborted' : 'error',
          endTime: responseEndTime,
          finishReason: streamFinishReason,
          error: streamError ?? undefined,
          createdMessageIds,
        });
      }
      logger.info('Saved chat debug run', {
        runId: activeDebugRunId,
        turnId,
        stepsCount: debugSteps.length,
        pendingApproval: hasPendingApproval
      });
    } catch (error) {
      logger.error('Failed to save chat debug run', { error, turnId, runId: activeDebugRunId });
    }
  }

  // 记忆系统：流正常完成时，入队摘要任务（使用 session 固化的 contextCount）
  const shouldRunMemory = shouldPersist && !sessionForRequest?.isTemporary;
  if (shouldRunMemory && streamFinishReason === 'stop' && !hasPendingApproval) {
    const session = sessionForRequest ?? getSession(sessionId);
    enqueueSummaryTask({
      sessionId,
      contextCount: session?.contextCount ?? scenario.contextCount ?? 10
    });
    if (memorySettings.longTermEnabled && userMessageId) {
      enqueueLongTermMemoryTask({ userMessageId });
    }
  }

  // 🆕 计算 tokenUsage 用于发送事件和持久化
  const stepsInputTokens = debugSteps.reduce((sum, step) => sum + (step.usage?.inputTokens || 0), 0);
  const stepsOutputTokens = debugSteps.reduce((sum, step) => sum + (step.usage?.outputTokens || 0), 0);
  const hasTokenStats = stepsInputTokens > 0 || stepsOutputTokens > 0 || promptTokens || completionTokens;
  const tokenUsageForEvent = hasTokenStats ? {
    inputTokens: stepsInputTokens || promptTokens || 0,
    outputTokens: stepsOutputTokens || completionTokens || 0
  } : undefined;

  // 🆕 持久化 tokenUsage 到消息记录
  if (shouldPersist && tokenUsageForEvent) {
    updateMessage(currentAssistantMessageId, {
      tokenUsage: tokenUsageForEvent
    });
  }

  if (shouldPersist && turnId) {
    if (hasPendingApproval && streamFinishReason === 'stop') {
      updateTurn(turnId, {
        assistantMessageId: currentAssistantMessageId,
        status: 'awaiting_approval',
        tokenUsage: tokenUsageForEvent ?? null,
        error: null,
        endedAt: null
      });
    } else {
      updateTurn(turnId, {
        assistantMessageId: currentAssistantMessageId,
        status: streamFinishReason === 'error' ? 'error' : streamFinishReason === 'aborted' ? 'aborted' : 'success',
        tokenUsage: tokenUsageForEvent ?? null,
        error: streamFinishReason === 'error' ? (streamError || tMain("common.unknownError")) : null,
        endedAt: Date.now()
      });
    }
  }

  if (
    shouldRunMemory &&
    memorySettings.historicalEnabled &&
    streamFinishReason === 'stop' &&
    !hasPendingApproval &&
    turnId
  ) {
    enqueueHistoricalMemoryIndexTask({ turnId });
  }

  // 根据结束原因发送不同事件
  if (hasPendingApproval && streamFinishReason === 'stop') {
    logger.info("executeChatCore: waiting for tool approval", {
      sessionId,
      finalMessageId: currentAssistantMessageId
    });
    return {
      ok: true,
      waitingApproval: true,
      messageId: currentAssistantMessageId,
      createdMessageIds
    };
  }

  if (streamFinishReason === 'error') {
    emitStreamChunk(currentAssistantMessageId, {
      type: 'error',
      errorText: streamError || tMain("common.unknownError")
    });
    
    logger.error("executeChatCore: error", {
      sessionId,
      finalMessageId: currentAssistantMessageId,
      error: streamError
    });
    
    return {
      ok: false,
      error: streamError,
      messageId: currentAssistantMessageId,
      createdMessageIds
    };
  } else if (streamFinishReason === 'aborted') {
    emitStreamChunk(currentAssistantMessageId, {
      type: 'abort',
    }, {
      createdMessageIds,
      tokenUsage: tokenUsageForEvent
    });

    logger.info("executeChatCore: aborted", {
      sessionId,
      finalMessageId: currentAssistantMessageId,
      createdMessagesCount: createdMessageIds.length
    });

    return {
      ok: true,
      aborted: true,
      messageId: currentAssistantMessageId,
      createdMessageIds
    };
  } else {
    emitStreamChunk(currentAssistantMessageId, {
      type: 'finish',
      finishReason: 'stop',
      messageMetadata: {
        createdMessageIds,
        tokenUsage: tokenUsageForEvent
      }
    });

    logger.info("executeChatCore: completed", {
      sessionId,
      finalMessageId: currentAssistantMessageId,
      finishReason: streamFinishReason,
      createdMessagesCount: createdMessageIds.length,
      contentLength: currentAssistantContent.find(p => p.type === 'text')?.text?.length ?? 0
    });

    // 后台提取追问建议（不阻塞返回）
    const assistantText = extractTextFromParts(currentAssistantContent);
    if (getSessionPreferences().generateSuggestions && assistantText.trim().length >= 10) {
      extractSuggestions({ assistantText, targetLocale: responseLocale })
        .then((res) => {
          if (res.ok && res.data.needSuggestion && res.data.suggestions.length > 0) {
            const suggestions = res.data.suggestions;
            if (turnId) updateTurn(turnId, { suggestions });
            window.webContents.send('chat:stream', {
              sessionId,
              messageId: currentAssistantMessageId,
              turnId,
              chunk: { type: 'suggestions', suggestions }
            });
          }
        })
        .catch((err) => logger.warn('suggestion extraction failed', { error: String(err) }));
    }

    return {
      ok: true,
      messageId: currentAssistantMessageId,
      createdMessageIds
    };
  }
}

/**
 * 统一的 AI 对话入口（支持新建和替换两种模式）
 * 
 * 模式判断：
 * - existingAssistantMessageId 存在 → 替换模式（重新生成）
 * - existingAssistantMessageId 不存在 → 新建模式（发送新消息）
 */
export async function executeChat(params: ChatSendParams) {
  const { 
    sessionId, 
    turnId: requestedTurnId,
    assistantMessageId, 
    existingAssistantMessageId,
    userMessageId, 
    messages, 
    selectedModel, 
    window, 
    abortSignal, 
    mcpServerIds,
    mode,
    toolApprovalMode,
    webSearch,
    thinking,
    citationRequired,
    citationStartIndex
  } = params;
  const effectiveToolApprovalMode: ToolApprovalMode = mode === 'agent' ? (toolApprovalMode ?? 'default') : 'default';

  // 提升变量作用域，以便在 catch 块中访问
  let finalAssistantMessageId: string | undefined;
  let currentTurnId: string | undefined;
  const isReplaceMode = !!existingAssistantMessageId;

  try {
    if (isReplaceMode) {
      // ===== 替换模式：重置现有 assistant 消息 =====
      const existingMessage = getMessage(existingAssistantMessageId);
      if (!existingMessage) {
        throw new Error(tMain("message.notFoundWithId", { messageId: existingAssistantMessageId }));
      }

      const replaceTurn = getLatestTurnByAssistantMessageId(existingAssistantMessageId)
        ?? (userMessageId ? getLatestTurnByUserMessageId(userMessageId) : null);
      if (!replaceTurn) {
        throw new Error("Replace mode requires an existing turn");
      }
      currentTurnId = replaceTurn.id;

      // 重置现有 assistant 消息
      updateMessage(existingAssistantMessageId, {
        turnId: currentTurnId,
        parts: [{ type: 'text', text: '' }],
        status: 'pending',
        isDeleted: false,
        deletedAt: null,
        userEdited: false
      });

      finalAssistantMessageId = existingAssistantMessageId;
      if (userMessageId) {
        updateMessage(userMessageId, { turnId: currentTurnId });
      }
      updateTurn(currentTurnId, {
        selectedModel,
        mcpServerIds: mcpServerIds ?? null,
        mode,
        toolApprovalMode: effectiveToolApprovalMode,
        webSearch,
        thinking: params.thinking,
        effectiveThinking: params.thinking ?? replaceTurn.effectiveThinking ?? replaceTurn.thinking,
        skillId: params.skillId ?? replaceTurn.skillId ?? null,
        citationRequired: params.citationRequired ?? replaceTurn.citationRequired ?? false,
        citationStartIndex: params.citationStartIndex ?? replaceTurn.citationStartIndex ?? 0,
        status: 'streaming',
        error: null,
        endedAt: null
      });
      
      logger.info("executeChat: replace mode - resetting existing message", {
        messageId: finalAssistantMessageId,
        turnId: currentTurnId,
        userMessageId,
        sessionId,
        selectedModel
      });

    } else {
      // ===== 新建模式：创建新的 assistant 消息 =====
      const assistantMessage = createAssistantMessage({
        id: assistantMessageId,
        sessionId,
        turnId: requestedTurnId,
        status: 'pending'
      });
      finalAssistantMessageId = assistantMessage.id;
      
      logger.info("executeChat: new message mode", {
        messageId: finalAssistantMessageId,
        sessionId,
        usedProvidedId: !!assistantMessageId
      });

      const parentTurnId = userMessageId
        ? (getLatestTurnByUserMessageId(userMessageId)?.id ?? null)
        : null;
      const createdTurn = createTurn({
        id: requestedTurnId,
        sessionId,
        userMessageId: userMessageId ?? null,
        assistantMessageId: finalAssistantMessageId,
        parentTurnId,
        triggerType: 'submit',
        status: 'streaming',
        selectedModel,
        mcpServerIds,
        mode,
        toolApprovalMode: effectiveToolApprovalMode,
        webSearch,
        thinking: params.thinking ?? 'auto',
        effectiveThinking: params.thinking ?? 'auto',
        skillId: params.skillId ?? null,
        citationRequired: params.citationRequired ?? false,
        citationStartIndex: params.citationStartIndex ?? 0,
      });
      currentTurnId = createdTurn.id;
      if (userMessageId) {
        updateMessage(userMessageId, { turnId: createdTurn.id });
      }
      if (finalAssistantMessageId) {
        updateMessage(finalAssistantMessageId, { turnId: createdTurn.id });
      }
    }
    if (!currentTurnId) {
      throw new Error("Turn id missing before executeChatCore");
    }

    // 执行核心逻辑
    return await executeChatCore({
      sessionId,
      assistantMessageId: finalAssistantMessageId,
      turnId: currentTurnId,
      userMessageId,
      messages,
      selectedModel,
      window,
      abortSignal,
      mcpServerIds,
      mode,
      toolApprovalMode: effectiveToolApprovalMode,
      webSearch,
      thinking: params.thinking,
      citationRequired: params.citationRequired,
      citationStartIndex: params.citationStartIndex,
      skillId: params.skillId ?? undefined,
    });

  } catch (error) {
    const resolvedError = resolveChatError(error);
    const message = resolvedError.message;
    if (currentTurnId) {
      updateTurn(currentTurnId, {
        status: 'error',
        error: message,
        endedAt: Date.now()
      });
    }
    
    logger.error("executeChat failed (before stream)", { 
      error: message, 
      statusCode: resolvedError.statusCode,
      providerCode: resolvedError.providerCode,
      retryable: resolvedError.retryable,
      rawError: resolvedError.rawMessage,
      sessionId, 
      messageId: finalAssistantMessageId,
      isReplaceMode
    });

    window.webContents.send('chat:stream', {
      sessionId,
      messageId: finalAssistantMessageId,
      turnId: currentTurnId ?? requestedTurnId,
      chunk: {
        type: 'error',
        errorText: message
      }
    });

    return {
      ok: false,
      error: message,
      messageId: finalAssistantMessageId
    };
  }
}

/**
 * 用户对 tool-approval-request 做出允许/拒绝后，用当前会话消息 + tool-approval-response 续跑
 */
export async function executeChatWithToolApprovals(params: {
  sessionId: string;
  approvals: Array<{
    approvalId: string;
    approved: boolean;
    reason?: string;
    addToWhitelist?: boolean;
    toolName?: string;
    args?: { command?: string };
  }>;
  window: BrowserWindow;
  abortSignal: AbortSignal;
}) {
  const { sessionId, approvals, window, abortSignal } = params;

  for (const a of approvals) {
    if (a.addToWhitelist && a.toolName) {
      const [serverId, name] = a.toolName.split('::');
      const isRunCommandTool = serverId === 'system' && name === 'run_command';
      const entry: ToolAllowlistEntry = isRunCommandTool && a.args?.command != null
        ? { type: 'shell', key: String(a.args.command).trim() }
        : { type: 'tool', key: a.toolName };
      if (!(entry.type === 'shell' && !entry.key)) {
        addToolAllowlistEntry(entry);
      }
    }
  }

  const allMessages = listMessages(sessionId);
  const messages: Array<Pick<AppUIMessage, 'role' | 'parts'>> = allMessages.map(m => ({
    role: m.role,
    parts: m.parts
  }));

  const uiMessages = allMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m, i) => ({
      id: `approval-${i}`,
      role: m.role as MessageRole,
      parts: (m.parts || [])
        .map((p) => sanitizePartForAiSdk(p))
        .filter((p): p is NonNullable<typeof p> => p != null),
    }));
  const validatedUIMessages = await validateUIMessages({ messages: uiMessages });
  const prebuiltModelMessages = await convertToModelMessages(
    validatedUIMessages.map(({ id, ...rest }) => rest),
    {
      convertDataPart: (part) => {
        if (part.type === 'data-quote' || part.type === 'data-note-context') {
          return { type: 'text', text: '' };
        }
        return { type: 'text', text: JSON.stringify(part.data) };
      },
    }
  );
  prebuiltModelMessages.push({
    role: 'tool',
    content: approvals.map((a) => ({
      type: 'tool-approval-response' as const,
      approvalId: a.approvalId,
      approved: a.approved,
      ...(a.reason != null ? { reason: a.reason } : {}),
    })),
  } as ModelMessage);

  const session = getSession(sessionId);
  if (!session) throw new Error(tMain("session.notFoundWithId", { sessionId }));

  // 续跑与上一轮 assistant 同属一次「回复组」，便于前端分组展示
  const lastAssistant = [...allMessages].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant) {
    throw new Error(tMain("chat.resumeAssistantNotFound"));
  }
  const targetAssistantMessageId = lastAssistant.id;
  const currentTurn = getLatestTurnByAssistantMessageId(targetAssistantMessageId);
  if (!currentTurn) {
    throw new Error(tMain("chat.resumeTurnNotFound"));
  }
  const debugRunId = getLatestDebugRunIdByTurnId(currentTurn.id) ?? undefined;

  const selectedModel = currentTurn.selectedModel ?? session.selectedModel ?? '';
  if (!selectedModel) throw new Error(tMain("chat.resumeModelMissing"));
  const mcpServerIds = currentTurn.mcpServerIds;
  const mode = currentTurn.mode ?? 'chat';
  const toolApprovalMode = currentTurn.toolApprovalMode ?? 'default';
  const webSearch = currentTurn.webSearch ?? 'auto';
  const thinking = currentTurn.thinking ?? 'auto';

  const approvalsById = new Map(approvals.map((a) => [a.approvalId, a]));
  const approvalToToolCallId = new Map<string, string>();
  for (const part of (lastAssistant.parts || []) as any[]) {
    if (part?.type !== 'dynamic-tool' || part?.state !== 'approval-requested' || !part?.approval?.id || !part?.toolCallId) {
      continue;
    }
    approvalToToolCallId.set(part.approval.id, part.toolCallId);
  }
  const patchedParts = (lastAssistant.parts || []).map((part: any) => {
    if (part?.type !== 'dynamic-tool' || part?.state !== 'approval-requested' || !part?.approval?.id) return part;
    const hit = approvalsById.get(part.approval.id);
    if (!hit) return part;
    if (!hit.approved) {
      const next = stripDynamicToolApproval(part);
      return {
        ...next,
        state: 'output-error',
        errorText: hit.reason || tMain("chat.userDeniedExecution"),
      };
    }
    const next = stripDynamicToolApproval(part);
    return {
      ...next,
      state: 'input-streaming',
    };
  });
  updateMessage(targetAssistantMessageId, {
    parts: patchedParts,
    status: 'streaming',
    turnId: currentTurn.id
  });
  updateTurn(currentTurn.id, {
    status: 'streaming',
    endedAt: null
  });
  for (const approval of approvals) {
    const toolCallId = approvalToToolCallId.get(approval.approvalId);
    if (!toolCallId) continue;
    window.webContents.send('chat:stream', {
      sessionId,
      messageId: targetAssistantMessageId,
      turnId: currentTurn.id,
      chunk: {
        type: 'tool-approval-responded',
        approvalId: approval.approvalId,
        toolCallId,
        approved: approval.approved
      }
    });
  }

  return executeChatCore({
    sessionId,
    assistantMessageId: targetAssistantMessageId,
    turnId: currentTurn.id,
    debugRunId,
    userMessageId: currentTurn.userMessageId ?? undefined,
    messages,
    prebuiltModelMessages,
    selectedModel,
    window,
    abortSignal,
    mcpServerIds,
    mode,
    toolApprovalMode,
    webSearch,
    thinking,
    citationRequired: currentTurn.citationRequired ?? false,
    citationStartIndex: currentTurn.citationStartIndex ?? 0,
    skillId: currentTurn.skillId ?? undefined,
  });
}

export async function executeChatWithToolApproval(params: {
  sessionId: string;
  approvalId: string;
  approved: boolean;
  reason?: string;
  addToWhitelist?: boolean;
  toolName: string;
  args?: { command?: string };
  window: BrowserWindow;
  abortSignal: AbortSignal;
}) {
  return executeChatWithToolApprovals({
    sessionId: params.sessionId,
    approvals: [{
      approvalId: params.approvalId,
      approved: params.approved,
      reason: params.reason,
      addToWhitelist: params.addToWhitelist,
      toolName: params.toolName,
      args: params.args,
    }],
    window: params.window,
    abortSignal: params.abortSignal
  });
}
