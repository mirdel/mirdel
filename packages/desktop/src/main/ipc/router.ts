import path from "node:path";
import fs from "node:fs/promises";
import { ipcRouter } from "typed-electron-ipc";
import {
  loggerServiceMain,
  resolveAppLocale,
  type AppLanguagePreference
} from "@shared";
import { tMain } from "../i18n";
import { app, BrowserWindow, dialog, screen, shell } from "electron";
import { markdownToPlain } from "@mirdel/markdown-to-plain";
import {
  deleteProvider,
  listProviders,
  setProviderEnabled,
  upsertProvider,
  resetProvider,
  getModelDetails,
  updateModelDetails,
  resetModel,
  getProviderApiKey,
  createCustomProvider,
  updateCustomProvider,
  regenerateLocalProviderApiKey,
  setLocalProviderApiKey,
} from "../services/providers/providerData";
import { addModelToCommon, removeModelFromCommon } from "../services/providers/modelListService";
import { fetchProviderModels } from "../services/providers/fetchModelsService";
import { testProvider } from "../services/providers/providerHealthCheck";
import {
  getAppBehaviorSettings,
  getDefaultModel,
  setDefaultModel,
  getAllDefaultModels,
  getDefaultModelByType,
  setDefaultModelByType,
  getSendShortcut,
  setSendShortcut,
  getMemorySettings,
  setMemorySettings,
  getAiDevToolsEnabled,
  setAiDevToolsEnabled,
  getModelFavorites,
  setModelFavorite,
  getAppLanguagePreference,
  setAppLanguagePreference,
  getReadAloudTtsSettings,
  setReadAloudTtsSettings,
  getSessionPreferences,
  setSessionPreferences,
  getProxySettings,
  setProxySettings,
  setAppBehaviorSettings,
  getWelcomeOnboardingDismissedAt,
  dismissWelcomeOnboarding,
} from "../services/settings/settingsData";
import { applyProxySettings } from "../services/network/proxyRuntime";
import { exportUserDataToZip } from "../services/storage/userDataExport";
import { runImportUserDataArchiveWithDialog } from "../services/storage/userDataImport";
import { searxngServerManager } from "../services/web-search/SearxngServerManager";
import { applyLaunchAtLoginSetting } from "../services/app/loginItemService";
import {
  listSessions,
  listMainSessions,
  listBranches,
  listAllSessionsInGroup,
  createSession,
  createTemporarySession,
  createBranch,
  deleteSession,
  updateSessionTitle,
  updateSessionModel,
  updateSessionScenario,
  updateSessionProject,
  moveSessionToProject,
  updateSessionMcpServers,
  updateSessionMcpPolicy,
  updateSessionMode,
  updateSessionToolApprovalMode,
  updateSessionSkillPolicy,
  updateSessionWebSearch,
  updateSessionThinking,
  updateSessionKbIds,
  updateSessionLinkedNote,
  updateSessionFavorite,
  updateSessionArchive,
  getLinkedNoteIds,
  touchSession,
  getSession,
  getBuiltinWorkingDir,
  type ChatMode,
  type ToolApprovalMode,
  type SessionMcpPolicy,
  type SessionSkillPolicy,
  type TemporarySessionType,
  type WebSearchMode
} from "../services/chat/sessionData";
import { getSessionOverview } from "../services/chat/sessionOverviewService";
import { searchChat } from "../services/chat/chatSearchService";
import {
  listMessages,
  createUserMessage,
  createAssistantMessage,
  deleteMessage,
  getMessage,
  getParentUserMessage,
  updateMessage,
  getMessagesByTurnId,
  deleteMessagesByTurnId,
  type MessageStatus
} from "../services/chat/messageData";
import type { MessageContentPart, CitationSource, AppUIMessage, ThinkingMode, HistoricalMemoryRecall } from "@shared";
import { getBranchesInfo } from "../services/chat/branchService";
import { executeChat, executeChatWithToolApproval, executeChatWithToolApprovals } from "../services/chat/chatService";
import { getLatestTurnByUserMessageId, getTurn, listTurnsBySession, updateTurn } from "../services/chat/turnData";
import { clearToolAllowlist, getToolAllowlist, removeToolAllowlistEntry } from "../services/chat/toolAllowlistData";
import { generateSessionTitleByFastModel } from "../services/chat/titleService";
import {
  listScenarios,
  createScenario,
  duplicateScenario,
  getScenario,
  updateScenario,
  deleteScenario
} from "../services/scenarios/scenarioData";
import {
  listPromptLibraryEntries,
  createPromptLibraryEntry,
  getPromptLibraryEntry,
  updatePromptLibraryEntry,
  deletePromptLibraryEntry
} from "../services/prompts/promptLibraryData";
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  getProjectSessionCount,
  getUncategorizedSessionCount
} from "../services/chat/projectData";
import {
  listMcpServers,
  getMcpServer,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer
} from "../services/mcp/mcpData";
import { routeMcpServerIds } from "../services/mcp/mcpRouter";
import { isBuiltinServer } from "../services/mcp/builtin";
import { mcpServerManager } from "../services/mcp/mcpServerManager";
import { listSkills, getSkillDetail, readSkillFile, uninstallSkill, routeSkill } from "../services/skill";
import { lazyMcpManager } from "../services/mcp/LazyMcpManager";
import { getLatestDebugInfoByTurnId } from "../services/chat/debugInfoData";
import { rebuildChatSearchIndex } from "../services/chat/chatSearchIndex";
import { rebuildGlobalSearchIndex, searchAll } from "../services/search/searchService";
import { getSystemLocale } from "../i18n/systemLocale";
import { 
  getWebSearchConfig, 
  setWebSearchConfig, 
  listSearchProviders,
  getSearchProvider,
  addSearchProvider,
  updateSearchProvider,
  deleteSearchProvider,
  getActiveProviderId,
  setActiveProviderId,
  getAiSearchConfig,
  setAiSearchConfig,
  listAiSearchHistory,
  addAiSearchHistoryKeyword,
  clearAiSearchHistory,
  type WebSearchConfig 
} from "../services/web-search/webSearchData";
import { listPresetTemplates } from "../services/web-search/presets";
import { getTestRawHtml, webSearchService, resizePagePool } from "../services/web-search";
import type { SearchProvider } from "../services/web-search/types";
import { localModelRuntimeService, modelServerManager } from "../services/model-server";
import { LOCAL_PROVIDER_ID } from "../services/providers/localModelConstants";
import { resolveModelInvocation } from "../services/providers/modelInvocation";
import { getAiDevToolsViewerStatus, startAiDevToolsViewer } from "../services/devtools/aiDevToolsService";
import {
  checkForUpdates,
  getUpdateState,
  quitAndInstallUpdate,
} from "../services/app/updateService";
import {
  getChangelog,
  getPendingReleaseNotes,
  markReleaseNotesSeen,
} from "../services/app/changelogService";
import {
  appendImageGenerationAssets,
  createImageGeneration,
  deleteImageGeneration,
  createImageWorkspace,
  deleteImageAsset,
  deleteImageWorkspace,
  listImageGenerationsByWorkspace,
  listImageWorkspaces,
  renameImageWorkspace,
  updateImageGenerationStatus,
  updateImageWorkspaceLastComposer,
} from "../services/imageWorkspaceData";
import { abortImageGeneration, runImageGeneration } from "../services/image/imageGenerationService";
import {
  appendVideoGenerationAssets,
  createVideoGeneration,
  createVideoWorkspace,
  deleteVideoAsset,
  deleteVideoGeneration,
  deleteVideoWorkspace,
  listVideoGenerationsByWorkspace,
  listVideoWorkspaces,
  renameVideoWorkspace,
  updateVideoGenerationStatus,
  updateVideoWorkspaceLastComposer,
} from "../services/videoWorkspaceData";
import { abortVideoGeneration, runVideoGeneration } from "../services/video/videoGenerationService";
import { synthesizeStream as synthesizeEdgeTtsStream } from "@mirdel/tts-edge";
import {
  attachAssetToNote,
  createNote,
  createNoteList,
  deleteNote,
  deleteNoteList,
  getNote,
  listNoteLists,
  listNotes,
  updateNoteList,
  updateNote,
  type NoteScope,
} from "../services/notes/noteData";
import { assistNoteWriting } from "../services/notes/noteAiService";
import {
  createNoteAiSession,
  createNoteAiMessage,
  findNoteAiMessageByRequestAndRole,
  getNoteAiMessage,
  getNoteAiSessionById,
  getNoteAiSessionByNoteId,
  getOrCreateNoteAiSession,
  listNoteAiSessionsByNoteId,
  listNoteAiMessages,
  updateNoteAiSessionModel,
  updateNoteAiSessionContextMode,
  updateNoteAiMessage,
} from "../services/notes/noteAiData";
import { embed, embedMany } from "ai";
import { getEmbeddingModel } from "../services/providers/llmProviderFactory";
import {
  listKnowledgeBases,
  getKnowledgeBase,
  createKnowledgeBase,
  updateKnowledgeBase,
  migrateKnowledgeBase,
  deleteKnowledgeBase,
  listKbItems,
  listKbItemsByType,
  getKbItem,
  createKbItem,
  updateKbItem,
  deleteKbItem,
  getKbChunksByIds,
  type KbItemType,
  type KnowledgeBase
} from "../services/knowledge/knowledgeData";
import {
  processKbItem,
  scanDirectory,
  getFileInfo,
  checkFileChanged,
  searchKnowledgeBase,
  DEFAULT_MAX_DEPTH,
  isSupportedFile
} from "../services/knowledge";
import { parseFile } from "../services/knowledge/parsers";
import { createKbVectorTable, kbVectorTableExists } from "../services/db";
import {
  listApplets,
  getApplet,
  createApplet,
  updateApplet,
  deleteApplet,
  listAppletFiles,
  listAppletEntries,
  readAppletFile,
  writeAppletTextFile,
  writeAppletBase64File,
  createAppletFile,
  createAppletDirectory,
  renameAppletFile,
  deleteAppletFile,
  updateAppletWindowSize,
} from "../services/applet/appletData";
import {
  spawnAppletProcess,
  registerAppletWindow,
  getInitialStateSchema,
  dispatchAppletAction,
  closeAppletRun,
} from "../services/applet/appletProcessManager";

const logger = loggerServiceMain.withContext("ipc");
const APPLET_WINDOW_DEFAULT_RATIO = 0.9;
const APPLET_WINDOW_MIN_WIDTH = 480;
const APPLET_WINDOW_MIN_HEIGHT = 360;
const APPLET_WINDOW_SAVE_DEBOUNCE_MS = 250;

// 按会话维护 AbortController，支持多会话同时流式
const abortControllers = new Map<string, AbortController>();
const noteAiAbortControllers = new Map<string, AbortController>();
const ttsAbortControllers = new Map<string, AbortController>();
const translateAbortControllers = new Map<string, AbortController>();

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

// ==================== Embedding 辅助函数 ====================

/**
 * 获取 embedding 客户端配置
 * 统一处理官方 Provider 和第三方 Provider 的差异
 */
function getEmbeddingClient(): {
  modelId: string;
  client: ReturnType<typeof resolveModelInvocation>["client"];
} {
  const embeddingModel = getRequiredDefaultEmbeddingModel();
  const { providerId, modelId } = embeddingModel;
  const client = resolveModelInvocation({ providerId, modelId }).client;
  return { modelId, client };
}

/**
 * 根据 embeddingModel 字符串构建 embedding 客户端
 * @param embeddingModel '__default__' 或 'providerId/modelId'
 */
function getEmbeddingClientForModel(embeddingModel: string): {
  providerId: string;
  modelId: string;
  client: ReturnType<typeof resolveModelInvocation>["client"];
} {
  const normalizedModelRef = String(embeddingModel || "").trim();
  const defaultModel = (!normalizedModelRef || normalizedModelRef === "__default__")
    ? getRequiredDefaultEmbeddingModel()
    : undefined;
  const resolved = resolveModelInvocation({
    modelRef: normalizedModelRef || "__default__",
    separator: "/",
    defaultModel,
    invalidModelErrorKey: "embedding.invalidModelFormat",
  });
  return { providerId: resolved.providerId, modelId: resolved.modelId, client: resolved.client };
}

function getRequiredDefaultEmbeddingModel(): { providerId: string; modelId: string } {
  const embeddingModel = getDefaultModelByType("embedding");
  if (!embeddingModel?.providerId || !embeddingModel?.modelId) {
    throw new Error(tMain("embedding.defaultModelMissing"));
  }
  return embeddingModel;
}

/**
 * 根据知识库配置构建批量 embedding 函数（供 processItem / updateTextItemAndProcess 复用）
 */
function buildEmbedFnForKb(kb: KnowledgeBase): (texts: string[]) => Promise<number[][]> {
  const dimension = kb.embeddingDimension;
  const { providerId, modelId, client } = getEmbeddingClientForModel(
    kb.embeddingModel ?? '__default__'
  );
  const providerOptions = dimension
    ? { [providerId]: { dimensions: dimension } }
    : undefined;

  return async (texts: string[]) => {
    if (providerId === LOCAL_PROVIDER_ID) {
      await localModelRuntimeService.ensureModelReady(modelId);
    }
    const { embeddings } = await embedMany({
      model: getEmbeddingModel(client, modelId),
      values: texts,
      providerOptions
    });
    return embeddings;
  };
}

/**
 * typed-electron-ipc router
 */
function extractTextFromContent(content: MessageContentPart[]): string {
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof (p as { text?: string }).text === "string")
    .map((p) => (p as { text: string }).text)
    .join(" ")
    .trim();
}

function sanitizeFileName(input: string): string {
  const trimmed = (input || "").trim();
  const fallback = tMain("content.untitledNote");
  return (trimmed || fallback)
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 120) || fallback;
}

type SkillSelectionMode = "auto" | "off" | "manual";

type ChatSkillSelection = {
  mode: SkillSelectionMode;
  skillId?: string | null;
};

type McpSelectionMode = "auto" | "manual" | "off";

type ChatMcpSelection = {
  mode: McpSelectionMode;
  serverIds?: string[];
};

async function resolveSkillIdForRequest(input: {
  mode?: ChatMode;
  messages: Array<Pick<AppUIMessage, "role" | "parts">>;
  skillSelection?: ChatSkillSelection;
}): Promise<string | null> {
  if (input.mode !== "agent") {
    return null;
  }

  const mode = input.skillSelection?.mode ?? "auto";
  if (mode === "off") {
    return null;
  }

  const skills = listSkills();
  if (skills.length === 0) {
    return null;
  }

  if (mode === "manual") {
    const manualSkillId = (input.skillSelection?.skillId ?? "").trim();
    if (!manualSkillId) {
      return null;
    }
    const exists = skills.some((s) => s.id === manualSkillId);
    return exists ? manualSkillId : null;
  }

  const rev = [...input.messages].reverse();
  const lastUserMsg = rev.find((m) => m.role === "user");
  if (!lastUserMsg?.parts) {
    return null;
  }
  const userText = extractTextFromContent(lastUserMsg.parts);
  if (!userText) {
    return null;
  }
  const prevAssistantMsg = rev.slice(rev.indexOf(lastUserMsg) + 1).find((m) => m.role === "assistant");
  const assistantTail = prevAssistantMsg?.parts
    ? extractTextFromContent(prevAssistantMsg.parts).slice(-300)
    : "";
  // Keep router context labels in English for model stability.
  const contextForRouter = assistantTail
    ? `[Previous assistant reply tail]\n${assistantTail}\n\n[User message]\n${userText}`
    : userText;

  return routeSkill(contextForRouter);
}

async function resolveMcpServerIdsForRequest(input: {
  mode?: ChatMode;
  messages: Array<Pick<AppUIMessage, "role" | "parts">>;
  mcpSelection?: ChatMcpSelection;
  skillId?: string | null;
}): Promise<string[]> {
  if (input.mode !== "agent") {
    return [];
  }

  const allServers = listMcpServers();
  const mode = input.mcpSelection?.mode ?? "manual";
  if (mode === "off") {
    return [];
  }

  const validServerIds = new Set(allServers.map((s) => s.id));

  if (mode === "manual") {
    const manualIds = input.mcpSelection?.serverIds ?? [];
    return manualIds.filter((id) => validServerIds.has(id));
  }

  const candidates = allServers.filter((s) => s.enabled);
  if (candidates.length === 0) {
    return [];
  }

  const rev = [...input.messages].reverse();
  const lastUserMsg = rev.find((m) => m.role === "user");
  if (!lastUserMsg?.parts) {
    return [];
  }
  const userText = extractTextFromContent(lastUserMsg.parts);
  if (!userText) {
    return [];
  }
  const prevAssistantMsg = rev.slice(rev.indexOf(lastUserMsg) + 1).find((m) => m.role === "assistant");
  const assistantTail = prevAssistantMsg?.parts
    ? extractTextFromContent(prevAssistantMsg.parts).slice(-300)
    : "";
  // Keep router context labels in English for model stability.
  const contextForRouter = assistantTail
    ? `[Previous assistant reply tail]\n${assistantTail}\n\n[User message]\n${userText}`
    : userText;

  return routeMcpServerIds({
    contextForRouter,
    candidates,
    skillId: input.skillId ?? null,
  });
}

export const router = ipcRouter({
  // ==================== Updates ====================
  "updates:getState": async () => {
    return getUpdateState();
  },
  "updates:check": async () => {
    return checkForUpdates();
  },
  "updates:install": async () => {
    return quitAndInstallUpdate();
  },
  "updates:getChangelog": async (_event, input?: { locale?: string }) => {
    return getChangelog(input?.locale);
  },
  "updates:getPendingReleaseNotes": async (_event, input?: { locale?: string }) => {
    return getPendingReleaseNotes(input?.locale);
  },
  "updates:markReleaseNotesSeen": async (_event, input?: { version?: string }) => {
    return markReleaseNotesSeen(input?.version);
  },

  // ==================== Providers ====================
  "providers:list": async () => {
    return listProviders();
  },

  "providers:upsert": async (_event, input: any) => {
    return upsertProvider(input);
  },

  "providers:regenerateLocalApiKey": async () => {
    const previousApiKey = getProviderApiKey("local");
    const nextApiKey = regenerateLocalProviderApiKey();
    try {
      await modelServerManager.rotateApiKey(nextApiKey);
    } catch (error) {
      if (previousApiKey) {
        try {
          setLocalProviderApiKey(previousApiKey);
          await modelServerManager.rotateApiKey(previousApiKey);
        } catch {
          // ignore rollback error
        }
      }
      throw error;
    }
    return { ok: true, apiKey: nextApiKey };
  },

  "providers:delete": async (_event, input: { id: string }) => {
    deleteProvider(input.id);
    return { ok: true };
  },

  "providers:setEnabled": async (_event, input: { id: string; enabled: boolean }) => {
    setProviderEnabled(input.id, input.enabled);
    return { ok: true };
  },


  "providers:test": async (_event, input: { id: string }) => {
    return testProvider(input.id);
  },

  "providers:reset": async (_event, input: { id: string }) => {
    resetProvider(input.id);
    return { ok: true };
  },

  "providers:getModelDetails": async (_event, input: { providerId: string; modelId: string }) => {
    return getModelDetails(input.providerId, input.modelId);
  },

  "providers:updateModelDetails": async (_event, input: { providerId: string; modelId: string; updates: any }) => {
    updateModelDetails(input.providerId, input.modelId, input.updates);
    return { ok: true };
  },

  "providers:resetModel": async (_event, input: { providerId: string; modelId: string }) => {
    const model = resetModel(input.providerId, input.modelId);
    return { ok: true, model };
  },
  "providers:addModelToCommon": async (
    _event,
    input: {
      providerId: string;
      modelId: string;
      modelType?: 'generative' | 'embedding' | 'rerank';
      copyFromModelId?: string;
    }
  ) => {
    const result = addModelToCommon(
      input.providerId,
      input.modelId,
      input.modelType ?? "generative",
      { copyFromModelId: input.copyFromModelId }
    );
    return { ok: true, ...result };
  },
  "providers:removeModelFromCommon": async (_event, input: { providerId: string; modelId: string }) => {
    removeModelFromCommon(input.providerId, input.modelId);
    return { ok: true };
  },
  "providers:fetchModels": async (_event, input: { providerId: string }) => {
    return fetchProviderModels(input.providerId);
  },

  "providers:listLocalModelRuntimes": async () => {
    const list = await localModelRuntimeService.listStatuses();
    return { ok: true, models: list };
  },

  "providers:downloadLocalModel": async (_event, input: { modelId: string }) => {
    localModelRuntimeService.downloadModel(input.modelId);
    return { ok: true };
  },

  "providers:cancelLocalModelDownload": async (_event, input: { modelId: string }) => {
    localModelRuntimeService.cancelDownload(input.modelId);
    return { ok: true };
  },

  "providers:loadLocalModel": async (_event, input: { modelId: string }) => {
    await localModelRuntimeService.loadModel(input.modelId);
    return { ok: true };
  },

  "providers:unloadLocalModel": async (_event, input: { modelId: string }) => {
    await localModelRuntimeService.unloadModel(input.modelId);
    return { ok: true };
  },

  "providers:createCustom": async (_event, input: any) => {
    return createCustomProvider(input);
  },

  "providers:updateCustom": async (_event, input: { id: string; data: any }) => {
    updateCustomProvider(input.id, input.data);
    return { ok: true };
  },

  // ==================== Settings ====================
  "settings:getDefaultModel": async () => {
    return await getDefaultModel();
  },

  "settings:setDefaultModel": async (_event, input: { providerId: string; modelId: string }) => {
    setDefaultModel(input);
    return { ok: true };
  },

  "settings:getAllDefaultModels": async () => {
    return getAllDefaultModels();
  },

  "settings:getDefaultModelByType": async (_event, input: { type: 'general' | 'fast' | 'translate' | 'embedding' | 'imageGenerate' | 'imageEdit' | 'videoGenerate' }) => {
    return getDefaultModelByType(input.type);
  },

  "settings:setDefaultModelByType": async (_event, input: { type: 'general' | 'fast' | 'translate' | 'embedding' | 'imageGenerate' | 'imageEdit' | 'videoGenerate'; providerId: string; modelId: string }) => {
    const providerId = String(input.providerId || "").trim();
    const modelId = String(input.modelId || "").trim();
    if (providerId === "local") {
      const runtimes = await localModelRuntimeService.listStatuses();
      const runtime = runtimes.find((item) => item.modelId === modelId);
      if (!runtime || (runtime.state !== "downloaded" && runtime.state !== "loading" && runtime.state !== "loaded")) {
        throw new Error("Local model is not ready. Download it first.");
      }
    }
    setDefaultModelByType(input.type, { providerId, modelId });
    return { ok: true };
  },

  "settings:getSendShortcut": async () => {
    return getSendShortcut();
  },

  "settings:setSendShortcut": async (_event, input: { mode: string }) => {
    setSendShortcut(input.mode);
    return { ok: true };
  },

  "settings:getMemorySettings": async () => {
    return getMemorySettings();
  },

  "settings:setMemorySettings": async (_event, input: {
    sessionStateEnabled?: boolean;
    crossSessionEnabled?: boolean;
    longTermEnabled?: boolean;
    historicalEnabled?: boolean;
    historicalEmbeddingModel?: string;
    historicalEmbeddingDimension?: number | null;
    historicalMaxRecall?: number;
    historicalMinScore?: number;
  }) => {
    setMemorySettings(input);
    return { ok: true };
  },
  "settings:getSessionPreferences": async () => {
    return getSessionPreferences();
  },
  "settings:setSessionPreferences": async (_event, input: {
    titleGenerationMode?: "ai" | "extract";
    generateSuggestions?: boolean;
    showMindmap?: boolean;
    showTokenUsage?: boolean;
    showDebugEntry?: boolean;
  }) => {
    setSessionPreferences(input);
    return { ok: true };
  },
  "settings:getAppLanguage": async () => {
    const preference = getAppLanguagePreference();
    const systemLocale = getSystemLocale();
    return {
      preference,
      systemLocale,
      resolved: resolveAppLocale(preference, systemLocale)
    };
  },
  "settings:setAppLanguage": async (_event, input: { preference: AppLanguagePreference }) => {
    setAppLanguagePreference(input.preference);
    const systemLocale = getSystemLocale();
    return {
      ok: true,
      systemLocale,
      resolved: resolveAppLocale(input.preference, systemLocale)
    };
  },
  "settings:getProxySettings": async () => {
    return getProxySettings();
  },
  "settings:setProxySettings": async (_event, input: {
    mode?: "system" | "custom" | "direct";
    server?: string;
    bypassRules?: string[];
  }) => {
    const next = setProxySettings(input);
    await applyProxySettings(next);

    try {
      await searxngServerManager.stop();
      void searxngServerManager.start().catch(() => undefined);
    } catch {
      void searxngServerManager.start().catch(() => undefined);
    }

    return next;
  },
  "settings:getAppBehaviorSettings": async () => {
    return getAppBehaviorSettings();
  },
  "settings:setAppBehaviorSettings": async (_event, input: {
    launchAtLogin?: boolean;
    minimizeToTrayOnClose?: boolean;
  }) => {
    const next = setAppBehaviorSettings(input);
    applyLaunchAtLoginSetting(next.launchAtLogin);
    return next;
  },
  "settings:getAiDevToolsEnabled": async () => {
    return { enabled: getAiDevToolsEnabled() };
  },
  "settings:getWelcomeOnboardingDismissedAt": async () => {
    return { dismissedAt: getWelcomeOnboardingDismissedAt() };
  },
  "settings:dismissWelcomeOnboarding": async () => {
    dismissWelcomeOnboarding();
    return { ok: true };
  },
  "settings:setAiDevToolsEnabled": async (_event, input: { enabled: boolean }) => {
    setAiDevToolsEnabled(input.enabled);
    return { ok: true };
  },
  "settings:getModelFavorites": async () => {
    return getModelFavorites();
  },
  "settings:setModelFavorite": async (_event, input: { providerId: string; modelId: string; favorite: boolean }) => {
    setModelFavorite(input.providerId, input.modelId, input.favorite);
    return { ok: true };
  },
  "settings:getReadAloudTtsSettings": async () => {
    return getReadAloudTtsSettings();
  },
  "settings:setReadAloudTtsSettings": async (_event, input: { voice?: string; rate?: string; pitch?: string }) => {
    setReadAloudTtsSettings(input);
    return { ok: true };
  },
  "devtools:getStatus": async () => {
    return getAiDevToolsViewerStatus();
  },
  "devtools:openViewer": async () => {
    return startAiDevToolsViewer();
  },

  "settings:getBuiltinWorkingDir": async () => {
    return { path: getBuiltinWorkingDir() };
  },

  "imageWorkspace:list": async () => {
    return listImageWorkspaces();
  },

  "imageWorkspace:create": async (_event, input: { name?: string; lastComposer?: any }) => {
    return createImageWorkspace(input);
  },

  "imageWorkspace:rename": async (_event, input: { workspaceId: string; name: string }) => {
    return renameImageWorkspace(input);
  },

  "imageWorkspace:delete": async (_event, input: { workspaceId: string }) => {
    return deleteImageWorkspace(input);
  },

  "imageWorkspace:updateLastComposer": async (_event, input: { workspaceId: string; lastComposer: any }) => {
    return updateImageWorkspaceLastComposer(input);
  },

  "imageGeneration:listByWorkspace": async (_event, input: { workspaceId: string }) => {
    return listImageGenerationsByWorkspace(input);
  },

  "imageGeneration:create": async (_event, input: {
    workspaceId: string;
    prompt: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    selectedModel: string;
    params: Record<string, any>;
  }) => {
    return createImageGeneration(input);
  },

  "imageGeneration:updateStatus": async (_event, input: {
    generationId: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    errorMessage?: string;
  }) => {
    return updateImageGenerationStatus(input);
  },

  "imageGeneration:appendAssets": async (_event, input: {
    generationId: string;
    runId: string;
    assets: Array<{ id?: string; src?: string; filePath?: string; mediaType?: string; createdAt?: number }>;
  }) => {
    return appendImageGenerationAssets(input);
  },

  "imageGeneration:run": async (_event, input: {
    workspaceId: string;
    generationId: string;
    selectedModel: string;
    prompt: string;
    params?: {
      taskType?: "generate" | "edit";
      count?: number;
      size?: string;
      aspectRatio?: string;
      seed?: number;
      negativePrompt?: string;
      promptExtend?: boolean;
      watermark?: boolean;
      editFunction?: string;
      referenceImages?: Array<{ id?: string; name?: string; url: string }>;
      maskImage?: { id?: string; name?: string; url: string };
      providerOptions?: Record<string, unknown>;
    };
  }) => {
    return runImageGeneration(input);
  },

  "imageGeneration:abort": async (_event, input: { generationId: string }) => {
    return abortImageGeneration(input);
  },

  "imageGeneration:delete": async (_event, input: { generationId: string }) => {
    return deleteImageGeneration(input);
  },

  "imageAsset:delete": async (_event, input: { linkId: string }) => {
    return deleteImageAsset(input);
  },

  "videoWorkspace:list": async () => {
    return listVideoWorkspaces();
  },

  "videoWorkspace:create": async (_event, input: { name?: string; lastComposer?: any }) => {
    return createVideoWorkspace(input);
  },

  "videoWorkspace:rename": async (_event, input: { workspaceId: string; name: string }) => {
    return renameVideoWorkspace(input);
  },

  "videoWorkspace:delete": async (_event, input: { workspaceId: string }) => {
    return deleteVideoWorkspace(input);
  },

  "videoWorkspace:updateLastComposer": async (_event, input: { workspaceId: string; lastComposer: any }) => {
    return updateVideoWorkspaceLastComposer(input);
  },

  "videoGeneration:listByWorkspace": async (_event, input: { workspaceId: string }) => {
    return listVideoGenerationsByWorkspace(input);
  },

  "videoGeneration:create": async (_event, input: {
    workspaceId: string;
    prompt: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    selectedModel: string;
    params: Record<string, any>;
  }) => {
    return createVideoGeneration(input);
  },

  "videoGeneration:updateStatus": async (_event, input: {
    generationId: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    errorMessage?: string;
  }) => {
    return updateVideoGenerationStatus(input);
  },

  "videoGeneration:appendAssets": async (_event, input: {
    generationId: string;
    runId: string;
    assets: Array<{ id?: string; src?: string; filePath?: string; mediaType?: string; createdAt?: number }>;
  }) => {
    return appendVideoGenerationAssets(input);
  },

  "videoGeneration:run": async (_event, input: {
    workspaceId: string;
    generationId: string;
    selectedModel: string;
    prompt: string;
    params?: {
      count?: number;
      aspectRatio?: string;
      resolution?: string;
      duration?: number;
      fps?: number;
      seed?: number;
      negativePrompt?: string;
      referenceImages?: Array<{ id?: string; name?: string; url: string }>;
      providerOptions?: Record<string, unknown>;
    };
  }) => {
    return runVideoGeneration(input);
  },

  "videoGeneration:abort": async (_event, input: { generationId: string }) => {
    return abortVideoGeneration(input);
  },

  "videoGeneration:delete": async (_event, input: { generationId: string }) => {
    return deleteVideoGeneration(input);
  },

  "videoAsset:delete": async (_event, input: { linkId: string }) => {
    return deleteVideoAsset(input);
  },

  "videoAsset:download": async (_event, input: { filePath: string; name?: string }) => {
    try {
      const ownerWindow = BrowserWindow.fromWebContents(_event.sender);
      const sourceRaw = String(input.filePath || "").trim();
      if (!sourceRaw) {
        return { ok: false as const, error: "invalid video file path" };
      }
      const sourcePath = path.resolve(sourceRaw);

      const stat = await fs.stat(sourcePath);
      if (!stat.isFile()) {
        return { ok: false as const, error: "video file not found" };
      }

      const sourceExt = path.extname(sourcePath) || ".mp4";
      const baseName = sanitizeFileName(String(input.name || tMain("content.untitled")).replace(/\.[^.]+$/, ""));
      const defaultPath = `${baseName}${sourceExt}`;

      const { canceled, filePath } = await dialog.showSaveDialog(ownerWindow ?? undefined, {
        title: tMain("dialog.saveAs"),
        defaultPath,
        filters: [
          { name: sourceExt.toUpperCase().slice(1) || "Video", extensions: [sourceExt.slice(1)] },
          { name: tMain("dialog.filterAllFiles"), extensions: ["*"] },
        ],
      });
      if (canceled || !filePath) {
        return { ok: false as const, canceled: true as const };
      }

      await fs.copyFile(sourcePath, filePath);
      return { ok: true as const, filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("videoAsset:download failed", { message });
      return { ok: false as const, error: message };
    }
  },

  "notes:listLists": async () => {
    return listNoteLists();
  },

  "notes:createList": async (_event, input: { name: string; icon?: string; color?: string }) => {
    return createNoteList(input);
  },

  "notes:updateList": async (_event, input: { listId: string; updates: { name?: string; icon?: string; color?: string } }) => {
    return updateNoteList(input);
  },

  "notes:deleteList": async (_event, input: { listId: string }) => {
    return deleteNoteList(input);
  },

  "notes:list": async (_event, input?: { scope?: NoteScope; listId?: string }) => {
    return listNotes(input);
  },

  "notes:get": async (_event, input: { id: string }) => {
    return getNote(input.id);
  },

  "notes:create": async (_event, input: { listId?: string | null; title?: string; contentMd?: string }) => {
    return createNote(input);
  },

  "notes:update": async (_event, input: {
    id: string;
    updates: {
      title?: string;
      contentMd?: string;
      listId?: string | null;
    };
  }) => {
    return updateNote(input);
  },

  "notes:delete": async (_event, input: { id: string }) => {
    return deleteNote(input);
  },

  "notes:attachAsset": async (_event, input: {
    noteId: string;
    src?: string;
    filePath?: string;
    mediaType?: string;
    name?: string;
  }) => {
    return attachAssetToNote(input);
  },

  "content:export": async (_event, input: {
    title?: string;
    contentMd?: string;
    format: "plain" | "markdown";
  }) => {
    const ownerWindow = BrowserWindow.fromWebContents(_event.sender);
    const format = input.format === "plain" ? "plain" : "markdown";
    const extension = format === "plain" ? "txt" : "md";
    const defaultPath = `${sanitizeFileName(input.title || "")}.${extension}`;
    const contentMd = String(input.contentMd || "");
    const outputText = format === "plain"
      ? markdownToPlain(contentMd, { preserveLineBreaks: true })
      : contentMd;

    const { canceled, filePath } = await dialog.showSaveDialog(ownerWindow ?? undefined, {
      title: tMain("dialog.export"),
      defaultPath,
      filters: [
        format === "plain"
          ? { name: tMain("dialog.filterPlainText"), extensions: ["txt"] }
          : { name: tMain("dialog.filterMarkdown"), extensions: ["md", "markdown"] },
        { name: tMain("dialog.filterAllFiles"), extensions: ["*"] },
      ],
    });

    if (canceled || !filePath) {
      return { ok: false as const, canceled: true as const };
    }

    await fs.writeFile(filePath, outputText, "utf-8");
    return { ok: true as const, filePath };
  },

  "content:exportWord": async (_event, input: {
    title?: string;
    contentMd: string;
  }) => {
    const ownerWindow = BrowserWindow.fromWebContents(_event.sender);
    const title = (input.title || "").trim() || tMain("content.untitled");
    const defaultPath = `${sanitizeFileName(title)}.docx`;
    const contentMd = String(input.contentMd || "");

    const { canceled, filePath } = await dialog.showSaveDialog(ownerWindow ?? undefined, {
      title: tMain("dialog.exportWord"),
      defaultPath,
      filters: [
        { name: tMain("dialog.filterWordDocument"), extensions: ["docx"] },
        { name: tMain("dialog.filterAllFiles"), extensions: ["*"] },
      ],
    });
    if (canceled || !filePath) {
      return { ok: false as const, canceled: true as const };
    }

    const { marked } = await import("marked");
    const htmlToDocx = (await import("@turbodocx/html-to-docx")).default;
    const renderedHtml = await marked.parse(contentMd);

    const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body>${renderedHtml}</body></html>`;

    const buffer = await htmlToDocx(htmlContent, undefined, {
      table: { row: { cantSplit: true } },
      footer: false,
      header: false,
    });
    const docxBuffer = Buffer.isBuffer(buffer)
      ? buffer
      : buffer instanceof ArrayBuffer
        ? Buffer.from(buffer)
        : buffer instanceof Blob
          ? Buffer.from(await buffer.arrayBuffer())
          : Buffer.from(buffer as Uint8Array);
    await fs.writeFile(filePath, docxBuffer);
    return { ok: true as const, filePath };
  },

  "content:exportPdf": async (_event, input: {
    title?: string;
    contentMd: string;
  }) => {
    const ownerWindow = BrowserWindow.fromWebContents(_event.sender);
    const title = (input.title || "").trim() || tMain("content.untitled");
    const defaultPath = `${sanitizeFileName(title)}.pdf`;
    const contentMd = String(input.contentMd || "");

    const { canceled, filePath } = await dialog.showSaveDialog(ownerWindow ?? undefined, {
      title: tMain("dialog.exportPdf"),
      defaultPath,
      filters: [
        { name: tMain("dialog.filterPdfDocument"), extensions: ["pdf"] },
        { name: tMain("dialog.filterAllFiles"), extensions: ["*"] },
      ],
    });
    if (canceled || !filePath) {
      return { ok: false as const, canceled: true as const };
    }

    const { marked } = await import("marked");
    const renderedHtml = await marked.parse(contentMd);

    const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; padding: 40px; line-height: 1.8; color: #333; font-size: 14px; }
  h1 { font-size: 24px; font-weight: 700; margin: 28px 0 12px; } h2 { font-size: 20px; font-weight: 600; margin: 24px 0 10px; } h3 { font-size: 16px; font-weight: 600; margin: 20px 0 8px; }
  p { margin: 8px 0; } pre { background: #f5f5f5; padding: 12px 16px; border-radius: 6px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
  code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 13px; font-family: "SF Mono", Menlo, Consolas, monospace; }
  pre code { background: none; padding: 0; } blockquote { border-left: 3px solid #ddd; padding-left: 16px; color: #666; margin: 12px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; } th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; } th { background: #f5f5f5; font-weight: 600; }
  ul, ol { padding-left: 24px; } li { margin: 4px 0; } hr { border: none; border-top: 1px solid #eee; margin: 20px 0; }
  strong { font-weight: 600; } em { font-style: italic; } a { color: #0066cc; text-decoration: none; }
</style>
</head><body>${renderedHtml}</body></html>`;

    const win = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { offscreen: true } });
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
      await new Promise(r => setTimeout(r, 500));
      const pdfData = await win.webContents.printToPDF({
        printBackground: true,
        margins: { marginType: "custom", top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      });
      await fs.writeFile(filePath, pdfData);
    } finally {
      win.destroy();
    }
    return { ok: true as const, filePath };
  },

  "content:saveImage": async (_event, input: {
    title?: string;
    dataUrl: string;
  }) => {
    const ownerWindow = BrowserWindow.fromWebContents(_event.sender);
    const title = (input.title || "").trim() || tMain("content.untitled");
    const defaultPath = `${sanitizeFileName(title)}.png`;

    const { canceled, filePath } = await dialog.showSaveDialog(ownerWindow ?? undefined, {
      title: tMain("dialog.exportImage"),
      defaultPath,
      filters: [
        { name: tMain("dialog.filterPngImage"), extensions: ["png"] },
        { name: tMain("dialog.filterAllFiles"), extensions: ["*"] },
      ],
    });
    if (canceled || !filePath) {
      return { ok: false as const, canceled: true as const };
    }

    const base64Data = input.dataUrl.replace(/^data:image\/\w+;base64,/, "");
    await fs.writeFile(filePath, Buffer.from(base64Data, "base64"));
    return { ok: true as const, filePath };
  },

  "notes:aiAssist": async (_event, input: {
    requestId: string;
    noteId?: string;
    sessionId?: string;
    noteContentMd: string;
    userPrompt: string;
    selectionText?: string;
    selectionNearbyContext?: string;
    selectionAnchor?: {
      mode: "visual" | "source";
      from: number;
      to: number;
      expectedText: string;
    };
    selectionDocRevision?: string;
    contextMode?: "none" | "auto" | "selection" | "selection-nearby" | "full";
    model?: string;
    retryItemId?: string;
  }) => {
    const win = BrowserWindow.fromWebContents(_event.sender);
    const requestId = String(input.requestId || "").trim();
    if (!requestId) {
      return { ok: false as const, error: tMain("common.missingField", { field: "requestId" }) };
    }
    const noteId = String(input.noteId || "").trim();
    if (!noteId) {
      return { ok: false as const, error: tMain("common.missingField", { field: "noteId" }) };
    }

    const requestedSessionId = String(input.sessionId || "").trim();
    const session = requestedSessionId
      ? getNoteAiSessionById(requestedSessionId)
      : getOrCreateNoteAiSession(noteId, input.model);
    if (!session || session.noteId !== noteId) {
      return { ok: false as const, error: tMain("notes.aiSessionMismatch") };
    }
    const userMeta = {
      contextMode: input.contextMode || "auto",
      selectionText: input.selectionText || "",
      selectionNearbyContext: input.selectionNearbyContext || "",
      selectionAnchor: input.selectionAnchor || null,
      selectionDocRevision: input.selectionDocRevision || "",
    } as Record<string, unknown>;

    let userMessage = null as ReturnType<typeof createNoteAiMessage> | null;
    let assistantMessage = null as ReturnType<typeof createNoteAiMessage> | null;
    const retryItemId = String(input.retryItemId || "").trim();
    if (retryItemId) {
      const existingAssistant = getNoteAiMessage(retryItemId);
      if (!existingAssistant || existingAssistant.sessionId !== session.id || existingAssistant.role !== "assistant") {
        return { ok: false as const, error: tMain("notes.retryTargetInvalid") };
      }
      const pairedUser = findNoteAiMessageByRequestAndRole(session.id, existingAssistant.requestId, "user");
      if (!pairedUser) {
        return { ok: false as const, error: tMain("notes.retryTargetUserMissing") };
      }
      userMessage = updateNoteAiMessage(pairedUser.id, {
        requestId,
        parts: [{ type: "text", text: String(input.userPrompt || "") }],
        status: "success",
        error: null,
        tokenUsage: null,
        metaJson: userMeta,
      });
      assistantMessage = updateNoteAiMessage(existingAssistant.id, {
        requestId,
        parts: [],
        status: "pending",
        error: null,
        tokenUsage: null,
        metaJson: { model: input.model || null },
      });
      if (!userMessage || !assistantMessage) {
        return { ok: false as const, error: tMain("notes.retryTargetInvalid") };
      }
    } else {
      userMessage = createNoteAiMessage({
        sessionId: session.id,
        requestId,
        role: "user",
        parts: [{ type: "text", text: String(input.userPrompt || "") }],
        status: "success",
        metaJson: userMeta,
      });
      assistantMessage = createNoteAiMessage({
        sessionId: session.id,
        requestId,
        role: "assistant",
        parts: [],
        status: "pending",
        metaJson: { model: input.model || null },
      });
    }

    const persistedMessages = listNoteAiMessages(session.id).filter((message) => message.requestId !== requestId);
    const successfulRequestIds = new Set(
      persistedMessages
        .filter((message) => message.role === "assistant" && message.status === "success")
        .map((message) => message.requestId)
    );
    const historyMessages = persistedMessages
      .filter((message) => successfulRequestIds.has(message.requestId))
      .map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts,
      }));

    const abort = new AbortController();
    noteAiAbortControllers.set(requestId, abort);

    let assistantParts: MessageContentPart[] = Array.isArray(assistantMessage.parts)
      ? JSON.parse(JSON.stringify(assistantMessage.parts))
      : [];
    let lastPersistAt = 0;
    const STREAM_PERSIST_INTERVAL = 300;
    const persistStreaming = (force = false) => {
      const now = Date.now();
      if (!force && now - lastPersistAt < STREAM_PERSIST_INTERVAL) return;
      lastPersistAt = now;
      updateNoteAiMessage(assistantMessage.id, {
        parts: assistantParts,
        status: "streaming",
        error: null,
      });
    };
    const upsertToolPart = (toolCallId: string, toolName: string, patch: Record<string, unknown>) => {
      const idx = assistantParts.findIndex((part: any) => part?.type === "dynamic-tool" && part?.toolCallId === toolCallId);
      if (idx >= 0) {
        const current = assistantParts[idx] as any;
        assistantParts[idx] = {
          ...current,
          type: "dynamic-tool",
          toolCallId,
          toolName: toolName || current?.toolName || "",
          ...patch,
        } as any;
        return;
      }
      assistantParts.push({
        type: "dynamic-tool",
        toolCallId,
        toolName: toolName || "",
        ...patch,
      } as any);
    };

    try {
      const result = await assistNoteWriting({
        ...input,
        historyMessages,
      }, {
        abortSignal: abort.signal,
        onEvent: (event) => {
          if (event.type === "text-delta") {
            const delta = String(event.delta || "");
            if (delta) {
              const last = assistantParts[assistantParts.length - 1];
              if (last && last.type === "text") {
                last.text += delta;
              } else {
                assistantParts.push({ type: "text", text: delta });
              }
              persistStreaming(false);
            }
          } else if (event.type === "tool-call") {
            const toolCallId = String(event.toolCallId || "");
            if (toolCallId) {
              upsertToolPart(toolCallId, String(event.toolName || ""), {
                state: "input-streaming",
                input: event.input,
              });
              persistStreaming(false);
            }
          } else if (event.type === "tool-result") {
            const toolCallId = String(event.toolCallId || "");
            if (toolCallId) {
              const output = event.output as { ok?: boolean; error?: string } | undefined;
              if (output?.ok) {
                upsertToolPart(toolCallId, String(event.toolName || ""), {
                  state: "output-available",
                  output: event.output,
                  errorText: undefined,
                });
              } else {
                upsertToolPart(toolCallId, String(event.toolName || ""), {
                  state: "output-error",
                  output: event.output,
                  errorText: output?.error || tMain("common.toolExecutionFailed"),
                });
              }
              persistStreaming(false);
            }
          } else if (event.type === "error") {
            updateNoteAiMessage(assistantMessage.id, {
              parts: assistantParts,
              status: "error",
              error: String(event.error || tMain("common.requestFailed")),
            });
          }

          win?.webContents.send("notes:aiStream", {
            requestId,
            ...event,
          });
        },
      });

      if (result.ok) {
        if (result.text && !assistantParts.some((part) => part.type === "text")) {
          assistantParts.push({ type: "text", text: String(result.text).trim() });
        }
        if (
          Array.isArray(result.toolCalls) &&
          result.toolCalls.length > 0 &&
          !assistantParts.some((part: any) => part?.type === "dynamic-tool")
        ) {
          for (const call of result.toolCalls) {
            if (!call?.toolCallId) continue;
            upsertToolPart(String(call.toolCallId), String(call.toolName || ""), {
              state: call.status === "success" ? "output-available" : call.status === "error" ? "output-error" : "input-streaming",
              output: call.status === "success" ? { ok: true, proposal: call.proposal } : undefined,
              errorText: call.status === "error" ? String(call.error || tMain("common.toolExecutionFailed")) : undefined,
            });
          }
        }
      }

      updateNoteAiMessage(assistantMessage.id, {
        parts: assistantParts,
        status: abort.signal.aborted
          ? "aborted"
          : (result.ok ? "success" : "error"),
        error: abort.signal.aborted ? tMain("common.cancelled") : (result.ok ? null : (result.error || tMain("common.requestFailed"))),
        tokenUsage: result.ok ? (result.tokenUsage ?? null) : null,
        metaJson: result.ok
          ? {
              model: result.model || input.model || null,
            }
          : { model: input.model || null },
      });
      if (result.ok) {
        updateNoteAiSessionModel(session.id, result.model || input.model);
        if (input.contextMode) {
          updateNoteAiSessionContextMode(session.id, input.contextMode);
        }
      }
      return {
        ...result,
        sessionId: session.id,
      };
    } finally {
      noteAiAbortControllers.delete(requestId);
    }
  },

  "notes:aiAbort": async (_event, input: { requestId: string }) => {
    const requestId = String(input.requestId || "").trim();
    if (!requestId) return { ok: false as const, error: tMain("common.missingField", { field: "requestId" }) };

    const abort = noteAiAbortControllers.get(requestId);
    if (abort) {
      abort.abort();
      noteAiAbortControllers.delete(requestId);
    }
    return { ok: true as const };
  },

  "notes:aiHistory": async (_event, input: { noteId: string; sessionId?: string }) => {
    const noteId = String(input.noteId || "").trim();
    if (!noteId) return { session: null, sessions: [], messages: [] };

    const sessions = listNoteAiSessionsByNoteId(noteId);
    const requestedSessionId = String(input.sessionId || "").trim();
    const session = requestedSessionId
      ? sessions.find((item) => item.id === requestedSessionId) || null
      : (sessions[0] || null);
    if (!session) return { session: null, sessions, messages: [] };

    return {
      session,
      sessions,
      messages: listNoteAiMessages(session.id),
    };
  },

  "notes:aiCreateSession": async (_event, input: { noteId: string; model?: string; contextMode?: string }) => {
    const noteId = String(input.noteId || "").trim();
    if (!noteId) return { ok: false as const, error: tMain("common.missingField", { field: "noteId" }) };
    try {
      const session = createNoteAiSession(noteId, input.model, input.contextMode);
      return { ok: true as const, session };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  },

  "notes:aiUpdateSessionContextMode": async (_event, input: { sessionId: string; contextMode: string }) => {
    const sessionId = String(input.sessionId || "").trim();
    if (!sessionId) return { ok: false as const, error: tMain("common.missingField", { field: "sessionId" }) };
    try {
      updateNoteAiSessionContextMode(sessionId, input.contextMode);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  },

  "notes:aiUpdateSessionModel": async (_event, input: { sessionId: string; model: string }) => {
    const sessionId = String(input.sessionId || "").trim();
    if (!sessionId) return { ok: false as const, error: tMain("common.missingField", { field: "sessionId" }) };
    try {
      updateNoteAiSessionModel(sessionId, input.model);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  },

  "notes:aiSetToolCallDecision": async (_event, input: {
    noteId: string;
    sessionId: string;
    requestId: string;
    toolCallId: string;
    decision: "applied" | "rejected";
    value?: boolean;
  }) => {
    const noteId = String(input.noteId || "").trim();
    const sessionId = String(input.sessionId || "").trim();
    const requestId = String(input.requestId || "").trim();
    const toolCallId = String(input.toolCallId || "").trim();
    const decision = input.decision === "rejected" ? "rejected" : "applied";
    const value = input.value !== undefined ? !!input.value : true;
    if (!noteId) return { ok: false as const, error: tMain("common.missingField", { field: "noteId" }) };
    if (!sessionId) return { ok: false as const, error: tMain("common.missingField", { field: "sessionId" }) };
    if (!requestId) return { ok: false as const, error: tMain("common.missingField", { field: "requestId" }) };
    if (!toolCallId) return { ok: false as const, error: tMain("common.missingField", { field: "toolCallId" }) };

    const session = getNoteAiSessionById(sessionId);
    if (!session || session.noteId !== noteId) return { ok: false as const, error: tMain("notes.sessionNotFound") };

    const assistant = findNoteAiMessageByRequestAndRole(session.id, requestId, "assistant");
    if (!assistant) return { ok: false as const, error: tMain("notes.messageNotFound") };

    const nextParts: MessageContentPart[] = Array.isArray(assistant.parts)
      ? JSON.parse(JSON.stringify(assistant.parts))
      : [];
    const index = nextParts.findIndex((part: any) => part?.type === "dynamic-tool" && part?.toolCallId === toolCallId);
    if (index < 0) {
      return { ok: false as const, error: tMain("notes.toolProposalNotFound") };
    }

    const target = (nextParts[index] || {}) as Record<string, unknown>;
    const patched: Record<string, unknown> = { ...target };
    if (decision === "applied") {
      patched.applied = value;
      if (value) patched.rejected = false;
    } else {
      patched.rejected = value;
      if (value) patched.applied = false;
    }
    nextParts[index] = patched as MessageContentPart;

    const updated = updateNoteAiMessage(assistant.id, { parts: nextParts });
    if (!updated) return { ok: false as const, error: tMain("common.writeFailed") };

    return { ok: true as const };
  },

  "longTermMemory:list": async () => {
    const { listLongTermMemory } = await import("../services/chat/longTermMemoryData");
    return listLongTermMemory();
  },

  "longTermMemory:add": async (_event, input: { value: string }) => {
    const { addLongTermMemory } = await import("../services/chat/longTermMemoryData");
    const key = `custom_${Date.now()}`;
    const item = addLongTermMemory({ category: "other", key, value: input.value });
    return item ? { ok: true, item } : { ok: false, error: tMain("longTermMemory.addFailed") };
  },

  "longTermMemory:updateByKey": async (_event, input: { key: string; value: string }) => {
    const { updateLongTermMemoryByKey } = await import("../services/chat/longTermMemoryData");
    const ok = updateLongTermMemoryByKey(input.key, input.value);
    return { ok };
  },

  "longTermMemory:removeByKey": async (_event, input: { key: string }) => {
    const { removeLongTermMemoryByKey } = await import("../services/chat/longTermMemoryData");
    const ok = removeLongTermMemoryByKey(input.key);
    return { ok };
  },

  "historicalMemory:getStats": async () => {
    const { getHistoricalMemoryStats } = await import("../services/chat/historicalMemoryService");
    return getHistoricalMemoryStats();
  },

  "historicalMemory:rebuild": async () => {
    const { rebuildHistoricalMemoryIndex } = await import("../services/chat/historicalMemoryService");
    return { ok: true, result: await rebuildHistoricalMemoryIndex() };
  },

  "historicalMemory:clear": async () => {
    const { clearHistoricalMemoryIndex } = await import("../services/chat/historicalMemoryService");
    clearHistoricalMemoryIndex();
    return { ok: true };
  },

  "historicalMemory:testRecall": async (_event, input: { query: string }) => {
    const { testHistoricalMemoryRecall } = await import("../services/chat/historicalMemoryService");
    return { ok: true, result: await testHistoricalMemoryRecall(String(input.query || "")) };
  },

  // ==================== 翻译 ====================
  "translate:translate": async (event, input: { requestId?: string; input: string; targetLang: string; model?: string }) => {
    const requestId = String(input.requestId || "").trim();
    const win = BrowserWindow.fromWebContents(event.sender);
    const abort = requestId ? new AbortController() : null;
    let latestPartialText = "";

    if (requestId && abort) {
      const previous = translateAbortControllers.get(requestId);
      if (previous) {
        previous.abort();
      }
      translateAbortControllers.set(requestId, abort);
    }

    try {
      const { translate, translateStream } = await import("../services/translate/translateService");
      const { createTranslateRecord } = await import("../services/translate/translateData");
      const result = requestId
        ? await translateStream(
            {
              input: input.input,
              targetLang: input.targetLang,
              model: input.model,
              abortSignal: abort?.signal,
            },
            {
              onEvent: (streamEvent) => {
                if (streamEvent.type === "partial") {
                  latestPartialText = String(streamEvent.translationText || "").trim();
                }
                if (!win || win.isDestroyed()) return;
                win.webContents.send("translate:stream", {
                  requestId,
                  ...streamEvent,
                });
              },
            }
          )
        : await translate({ input: input.input, targetLang: input.targetLang, model: input.model });
      const record = createTranslateRecord({
        input: input.input,
        result: JSON.stringify(result),
        targetLang: input.targetLang,
      });
      return { ok: true, result, record };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const aborted = requestId ? !!abort?.signal.aborted : false;
      if (aborted) {
        logger.debug("translate:translate aborted", { requestId });
      } else {
        logger.error("translate:translate failed", { message });
      }
      if (requestId && win && !win.isDestroyed() && !aborted) {
        win.webContents.send("translate:stream", {
          requestId,
          type: "error",
          error: message,
        });
      }

      // 用户中止时，若已产生部分翻译，仍写入历史
      if (aborted && latestPartialText) {
        const { createTranslateRecord } = await import("../services/translate/translateData");
        const partialResult = {
          detected: {
            type: "text" as const,
            sourceLang: "unknown",
            confidence: 0,
          },
          translation: {
            targetLang: input.targetLang,
            text: latestPartialText,
          },
          meta: {
            aborted: true,
            partial: true,
          },
        };
        const record = createTranslateRecord({
          input: input.input,
          result: JSON.stringify(partialResult),
          targetLang: input.targetLang,
        });
        return { ok: true, result: partialResult, record, aborted: true };
      }

      return { ok: false, error: message, aborted };
    } finally {
      if (requestId) {
        translateAbortControllers.delete(requestId);
      }
    }
  },

  "translate:abort": async (_event, input: { requestId: string }) => {
    const requestId = String(input.requestId || "").trim();
    if (!requestId) {
      return { ok: false, error: tMain("common.missingField", { field: "requestId" }) };
    }
    const abort = translateAbortControllers.get(requestId);
    if (abort) {
      abort.abort();
      translateAbortControllers.delete(requestId);
    }
    return { ok: true };
  },

  "translate:readFile": async (_event, input: { filePath: string }) => {
    try {
      if (!isSupportedFile(input.filePath)) {
        return { ok: false, error: tMain("common.unsupportedFileType") };
      }
      const content = await parseFile(input.filePath);
      return { ok: true, content };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error("translate:readFile failed", { message });
      return { ok: false, error: message };
    }
  },

  "translate:listHistory": async () => {
    const { listTranslateHistory } = await import("../services/translate/translateData");
    return listTranslateHistory();
  },

  "translate:getRecord": async (_event, input: { id: string }) => {
    const { getTranslateRecord } = await import("../services/translate/translateData");
    return getTranslateRecord(input.id);
  },

  "translate:deleteRecord": async (_event, input: { id: string }) => {
    const { deleteTranslateRecord } = await import("../services/translate/translateData");
    deleteTranslateRecord(input.id);
    return { ok: true };
  },

  "translate:clearHistory": async () => {
    const { clearTranslateHistory } = await import("../services/translate/translateData");
    clearTranslateHistory();
    return { ok: true };
  },

  // ==================== Web Search ====================
  "webSearch:getConfig": async () => {
    return webSearchService.getConfigForSettings();
  },

  "webSearch:setConfig": async (_event, input: Partial<WebSearchConfig>) => {
    const oldConfig = getWebSearchConfig();
    const newConfig = setWebSearchConfig(input);
    
    // 如果池大小变化，调整页面池
    if (newConfig.pagePoolSize !== oldConfig.pagePoolSize) {
      await resizePagePool(newConfig.pagePoolSize);
    }
    
    return newConfig;
  },

  "webSearch:test": async (_event, input: { query: string; providerId?: string }) => {
    const startTime = Date.now();
    const result = await webSearchService.searchWithContentForTest(input.query, undefined, input.providerId);
    const duration = Date.now() - startTime;
    return { ...result, duration };
  },

  "webSearch:getTestRawHtml": async (_event, input: { token: string }) => {
    const token = String(input.token || '').trim();
    if (!token) {
      return { ok: false, error: tMain("common.missingField", { field: "token" }) };
    }

    const result = getTestRawHtml(token);
    if (!result) {
      return { ok: false, error: tMain("common.notFound") };
    }

    return {
      ok: true,
      html: result.html,
      url: result.url,
    };
  },

  "webSearch:listBuiltinEngines": async () => {
    return webSearchService.listBuiltinSearchEngines();
  },

  // ==================== Web Search Providers ====================
  "webSearch:listProviders": async () => {
    return listSearchProviders();
  },

  "webSearch:getProvider": async (_event, input: { id: string }) => {
    return getSearchProvider(input.id);
  },

  "webSearch:addProvider": async (_event, input: Omit<SearchProvider, 'id' | 'createdAt' | 'updatedAt'>) => {
    return addSearchProvider(input);
  },

  "webSearch:updateProvider": async (_event, input: { id: string; data: Partial<SearchProvider> }) => {
    return updateSearchProvider(input.id, input.data);
  },

  "webSearch:deleteProvider": async (_event, input: { id: string }) => {
    return deleteSearchProvider(input.id);
  },

  "webSearch:getActiveProviderId": async () => {
    return getActiveProviderId();
  },

  "webSearch:setActiveProviderId": async (_event, input: { id: string }) => {
    setActiveProviderId(input.id);
    return { ok: true };
  },

  "webSearch:listPresets": async () => {
    return listPresetTemplates();
  },

  // ==================== AI Search ====================
  "aiSearch:getConfig": async () => {
    return getAiSearchConfig();
  },

  "aiSearch:setConfig": async (_event, input: { model?: string; perQueryLimit?: number; maxResults?: number; pageSize?: number }) => {
    return setAiSearchConfig(input);
  },

  "aiSearch:listHistory": async () => {
    return listAiSearchHistory();
  },

  "aiSearch:clearHistory": async () => {
    clearAiSearchHistory();
    return { ok: true };
  },

  "aiSearch:search": async (_event, input: { query: string; model?: string | null; perQueryLimit?: number; maxResults?: number }) => {
    const query = String(input.query || '').trim();
    if (!query) {
      return { success: false as const, error: tMain("common.missingField", { field: "query" }) };
    }
    const result = await webSearchService.aiSearch({
      query,
      modelRef: input.model,
      perQueryLimit: input.perQueryLimit,
      maxResults: input.maxResults,
    });
    if (result.success) {
      addAiSearchHistoryKeyword(query);
    }
    return result;
  },

  "aiSearch:fetchPage": async (_event, input: { url: string }) => {
    const url = String(input.url || '').trim();
    if (!url) {
      return { success: false as const, url, error: tMain("common.missingField", { field: "url" }) };
    }
    return webSearchService.fetchPageContent(url, { format: 'reader' });
  },

  // ==================== Scenarios ====================
  "scenarios:list": async () => {
    return listScenarios();
  },

  "scenarios:create": async (_event, input: { name: string; description?: string }) => {
    return createScenario(input);
  },

  "scenarios:duplicate": async (_event, input: { id: string }) => {
    return duplicateScenario(input.id);
  },

  "scenarios:get": async (_event, input: { id: string }) => {
    return getScenario(input.id);
  },

  "scenarios:update": async (_event, input: { id: string; data: any }) => {
    return updateScenario(input.id, input.data);
  },

  "scenarios:delete": async (_event, input: { id: string }) => {
    deleteScenario(input.id);
    return { ok: true };
  },

  // ==================== Prompt library ====================
  "promptLibrary:list": async () => {
    return listPromptLibraryEntries();
  },

  "promptLibrary:create": async (_event, input?: { title?: string; description?: string; content?: string; tags?: string[] }) => {
    return createPromptLibraryEntry(input);
  },

  "promptLibrary:get": async (_event, input: { id: string }) => {
    return getPromptLibraryEntry(input.id);
  },

  "promptLibrary:update": async (
    _event,
    input: { id: string; data: Partial<{ title: string; description: string; content: string; tags: string[]; favorite: boolean }> }
  ) => {
    return updatePromptLibraryEntry(input.id, input.data);
  },

  "promptLibrary:delete": async (_event, input: { id: string }) => {
    deletePromptLibraryEntry(input.id);
    return { ok: true };
  },

  // ==================== Projects ====================
  "projects:list": async () => {
    return listProjects();
  },

  "projects:create": async (_event, input: { name: string; description?: string; scenarioId: string }) => {
    return createProject(input);
  },

  "projects:get": async (_event, input: { id: string }) => {
    return getProject(input.id);
  },

  "projects:update": async (_event, input: { id: string; data: any }) => {
    return updateProject(input.id, input.data);
  },

  "projects:delete": async (_event, input: { id: string }) => {
    deleteProject(input.id);
    return { ok: true };
  },

  "projects:getSessionCount": async (_event, input: { projectId: string }) => {
    return getProjectSessionCount(input.projectId);
  },

  "projects:getUncategorizedCount": async () => {
    return getUncategorizedSessionCount();
  },

  // ==================== Sessions ====================
  "sessions:list": async () => {
    return listSessions();
  },

  "sessions:listMain": async () => {
    return listMainSessions();
  },

  "sessions:listBranches": async (_event, input: { mainSessionId: string }) => {
    return listBranches(input.mainSessionId);
  },

  "sessions:listGroup": async (_event, input: { mainSessionId: string }) => {
    return listAllSessionsInGroup(input.mainSessionId);
  },

  "sessions:get": async (_event, input: { id: string }) => {
    return getSession(input.id);
  },

  "sessions:getBranchesInfo": async (_event, input: { rootSessionId: string }) => {
    return getBranchesInfo(input.rootSessionId);
  },

  "sessions:getOverview": async (_event, input: { rootSessionId: string }) => {
    return getSessionOverview(input.rootSessionId);
  },

  "sessions:create": async (_event, input?: { selectedModel?: string; scenarioId?: string; title?: string; projectId?: string | null; mcpServerIds?: string[]; mcpPolicy?: SessionMcpPolicy; mode?: ChatMode; toolApprovalMode?: ToolApprovalMode; skillPolicy?: SessionSkillPolicy; webSearch?: WebSearchMode; thinking?: ThinkingMode; kbIds?: string[]; isTemporary?: boolean; temporaryType?: TemporarySessionType }) => {
    if (input?.isTemporary) {
      return createTemporarySession(
        input?.selectedModel,
        input?.scenarioId,
        input?.title,
        input?.mcpServerIds,
        input?.mcpPolicy,
        input?.mode,
        input?.skillPolicy,
        input?.webSearch,
        input?.thinking,
        input?.kbIds ?? [],
        input?.temporaryType ?? 'session',
        input?.toolApprovalMode
      );
    }
    return createSession(input?.selectedModel, input?.scenarioId, input?.title, input?.projectId, input?.mcpServerIds, input?.mcpPolicy, input?.mode, input?.skillPolicy, input?.webSearch, input?.thinking, input?.kbIds ?? [], false, null, input?.toolApprovalMode);
  },

  "sessions:createBranch": async (_event, input: { parentSessionId: string; forkFromMessageId: string; title?: string }) => {
    return createBranch({
      parentSessionId: input.parentSessionId,
      forkFromMessageId: input.forkFromMessageId,
      title: input.title
    });
  },

  "sessions:delete": async (_event, input: { id: string }) => {
    deleteSession(input.id);
    return { ok: true };
  },

  "sessions:updateTitle": async (_event, input: { id: string; title: string }) => {
    updateSessionTitle(input.id, input.title);
    return { ok: true };
  },

  "sessions:updateModel": async (_event, input: { id: string; selectedModel: string | null }) => {
    updateSessionModel(input.id, input.selectedModel);
    return { ok: true };
  },

  "sessions:updateScenario": async (_event, input: { id: string; scenarioId: string }) => {
    updateSessionScenario(input.id, input.scenarioId);
    return { ok: true };
  },

  "sessions:updateProject": async (_event, input: { id: string; projectId: string | null }) => {
    updateSessionProject(input.id, input.projectId);
    return { ok: true };
  },

  "sessions:moveToProject": async (_event, input: { id: string; projectId: string | null }) => {
    return moveSessionToProject(input.id, input.projectId);
  },

  "sessions:updateMcpServers": async (_event, input: { id: string; mcpServerIds: string[] }) => {
    updateSessionMcpServers(input.id, input.mcpServerIds);
    return { ok: true };
  },

  "sessions:updateMcpPolicy": async (_event, input: { id: string; mcpPolicy: SessionMcpPolicy }) => {
    updateSessionMcpPolicy(input.id, input.mcpPolicy);
    return { ok: true };
  },

  "sessions:updateMode": async (_event, input: { id: string; mode: ChatMode }) => {
    updateSessionMode(input.id, input.mode);
    return { ok: true };
  },

  "sessions:updateToolApprovalMode": async (_event, input: { id: string; toolApprovalMode: ToolApprovalMode }) => {
    updateSessionToolApprovalMode(input.id, input.toolApprovalMode);
    return { ok: true };
  },

  "sessions:updateSkillPolicy": async (_event, input: { id: string; skillPolicy: SessionSkillPolicy }) => {
    updateSessionSkillPolicy(input.id, input.skillPolicy);
    return { ok: true };
  },

  "sessions:updateWebSearch": async (_event, input: { id: string; webSearch: WebSearchMode }) => {
    updateSessionWebSearch(input.id, input.webSearch);
    return { ok: true };
  },

  "sessions:updateThinking": async (_event, input: { id: string; thinking: ThinkingMode }) => {
    updateSessionThinking(input.id, input.thinking);
    return { ok: true };
  },

  "sessions:updateKbIds": async (_event, input: { id: string; kbIds: string[] }) => {
    updateSessionKbIds(input.id, input.kbIds);
    return { ok: true };
  },

  "sessions:createLinkedNote": async (_event, input: { sessionId: string; title?: string }) => {
    const session = getSession(input.sessionId);
    if (!session) throw new Error(tMain("notes.sessionNotFound"));
    if (session.linkedNoteId) {
      const existing = getNote(session.linkedNoteId);
      if (existing) return existing;
    }
    const note = await createNote({ title: input.title || session.title });
    updateSessionLinkedNote(input.sessionId, note.id);
    return note;
  },

  "sessions:updateLinkedNote": async (_event, input: { sessionId: string; linkedNoteId: string | null }) => {
    updateSessionLinkedNote(input.sessionId, input.linkedNoteId);
    return { ok: true };
  },

  "sessions:updateFavorite": async (_event, input: { id: string; isFavorite: boolean }) => {
    updateSessionFavorite(input.id, input.isFavorite);
    return { ok: true };
  },

  "sessions:updateArchive": async (_event, input: { id: string; isArchived: boolean }) => {
    updateSessionArchive(input.id, input.isArchived);
    return { ok: true };
  },

  "sessions:getLinkedNote": async (_event, input: { sessionId: string }) => {
    const session = getSession(input.sessionId);
    if (!session?.linkedNoteId) return null;
    return getNote(session.linkedNoteId) ?? null;
  },

  "sessions:getLinkedNoteIds": async () => {
    return getLinkedNoteIds();
  },

  "sessions:touch": async (_event, input: { id: string }) => {
    touchSession(input.id);
    return { ok: true };
  },

  "sessions:generateTitle": async (_event, input: { parts: MessageContentPart[]; maxChars?: number }) => {
    return generateSessionTitleByFastModel({
      parts: input.parts
      // maxChars 参数在 titleService 中未使用，忽略
    });
  },

  // ==================== Messages ====================
  "messages:list": async (_event, input: { sessionId: string }) => {
    return listMessages(input.sessionId);
  },

  "messages:getDisplayMessages": async (_event, input: { sessionId: string }) => {
    return listMessages(input.sessionId);
  },

  "messages:createUser": async (_event, input: { 
    sessionId: string; 
    turnId?: string;
    parts: MessageContentPart[];
    contextSources?: CitationSource[];
  }) => {
    return createUserMessage({
      sessionId: input.sessionId,
      turnId: input.turnId,
      parts: input.parts,
      contextSources: input.contextSources
    });
  },

  "messages:delete": async (_event, input: { id: string }) => {
    deleteMessage(input.id);
    return { ok: true };
  },

  "messages:update": async (_event, input: { 
    id: string; 
    updates: { 
      parts?: MessageContentPart[];
      status?: MessageStatus; 
      isDeleted?: boolean;
      deletedAt?: number | null;
      userEdited?: boolean;
      turnId?: string | null;
      contextSources?: CitationSource[];
      historicalMemory?: HistoricalMemoryRecall;
    } 
  }) => {
    updateMessage(input.id, input.updates);
    return { ok: true };
  },

  "messages:get": async (_event, input: { id: string }) => {
    return getMessage(input.id);
  },

  "messages:getParentUserMessage": async (_event, input: { 
    sessionId: string; 
    messageId: string; 
  }) => {
    const parentUserMsg = getParentUserMessage(input.messageId);
    if (!parentUserMsg) {
      return { ok: false, error: tMain("chat.parentMessageNotFound") };
    }
    
    return { 
      ok: true, 
      parentMessage: parentUserMsg
    };
  },

  // 🆕 获取调试信息（根据 turnId，聚合该轮全部续跑步骤）
  "messages:getDebugInfo": async (_event, input: { turnId: string }) => {
    const debugInfo = getLatestDebugInfoByTurnId(input.turnId);
    if (!debugInfo) {
      return { ok: false, error: tMain("chat.debugInfoNotFound") };
    }
    return { ok: true, debugInfo };
  },

  // 🆕 按 turnId 获取消息组
  "messages:getByTurnId": async (_event, input: { turnId: string }) => {
    return getMessagesByTurnId(input.turnId);
  },

  // 🆕 按 turnId 软删除消息组
  "messages:deleteByTurnId": async (_event, input: { turnId: string }) => {
    deleteMessagesByTurnId(input.turnId);
    return { ok: true };
  },

  // ==================== Turns ====================
  "turns:listBySession": async (_event, input: { sessionId: string }) => {
    return listTurnsBySession(input.sessionId);
  },

  "turns:get": async (_event, input: { id: string }) => {
    return getTurn(input.id);
  },

  // ==================== Chat ====================
  "chat:search": async (_event, input: {
    query: string;
    scope?: "all" | "messages" | "sessions";
    sessionId?: string;
    messageTimeRange?: "all" | "today" | "3d" | "7d" | "30d";
    limit?: number;
    offset?: number;
  }) => {
    return searchChat(input);
  },

  "chat:rebuildSearchIndex": async () => {
    rebuildChatSearchIndex();
    return { ok: true };
  },

  "search:search": async (_event, input: {
    query: string;
    scope?: "all" | "messages" | "sessions" | "translations" | "notes" | "knowledge";
    sessionId?: string;
    messageTimeRange?: "all" | "today" | "3d" | "7d" | "30d";
    limit?: number;
    offset?: number;
  }) => {
    return searchAll(input);
  },

  "search:rebuildIndex": async () => {
    rebuildGlobalSearchIndex();
    return { ok: true };
  },

  "chat:send": async (event, input: { 
    sessionId: string;
    turnId?: string;
    assistantMessageId?: string;  // 可选的前端生成的 assistant 消息 ID（新建模式）
    existingAssistantMessageId?: string;  // 替换模式：要重置的现有 assistant 消息 ID
    userMessageId?: string;  // 触发请求的 user 消息 ID（用于关联调试信息和更新 selectedModel）
    messages: Array<Pick<AppUIMessage, 'role' | 'parts'>>;  // 前端构造的对话历史（结构化）
    selectedModel: string;
    scenarioId?: string;  // 临时会话需要传递场景ID
    mcpServerIds?: string[];  // MCP 服务器 ID 列表
    mcpSelection?: ChatMcpSelection;  // MCP 选择策略（自动/手动/不使用）
    mode?: ChatMode;  // 消息发送模式（chat/agent）
    toolApprovalMode?: ToolApprovalMode;  // 工具审批模式（默认审批/自动审批）
    webSearch?: WebSearchMode;  // 网络搜索模式（auto/close）
    thinking?: ThinkingMode;  // 思考深度模式（auto/off/on/standard/deep/ultra）
    skillSelection?: ChatSkillSelection;  // 技能策略（自动/手动/不使用）
    citationRequired?: boolean;  // 是否需要在回答中标注引用（知识库或网络搜索时由前端传入）
    citationStartIndex?: number;  // 网络搜索来源起始序号（0=无知识库，N=前 N 条为知识库）
  }) => {
    logger.info("chat:send", { 
      sessionId: input.sessionId,
      turnId: input.turnId,
      assistantMessageId: input.assistantMessageId,
      existingAssistantMessageId: input.existingAssistantMessageId,
      userMessageId: input.userMessageId,
      messagesCount: input.messages.length,
      selectedModel: input.selectedModel,
      scenarioId: input.scenarioId,
      mcpServerIds: input.mcpServerIds,
      mcpSelection: input.mcpSelection,
      mode: input.mode,
      toolApprovalMode: input.toolApprovalMode,
      webSearch: input.webSearch,
      thinking: input.thinking,
      skillSelection: input.skillSelection
    });

    // 为这个会话创建独立的 AbortController
    const abort = new AbortController();
    abortControllers.set(input.sessionId, abort);

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      const message = "BrowserWindow not available for chat:send";
      logger.error(message);
      return { ok: false, error: message };
    }

    try {
      const skillId = await resolveSkillIdForRequest({
        mode: input.mode,
        messages: input.messages,
        skillSelection: input.skillSelection,
      });

      const routedMcpServerIds = await resolveMcpServerIdsForRequest({
        mode: input.mode,
        messages: input.messages,
        mcpSelection: input.mcpSelection ?? {
          mode: (input.mcpServerIds?.length ?? 0) > 0 ? 'manual' : 'off',
          serverIds: input.mcpServerIds ?? []
        },
        skillId
      });

      const result = await executeChat({
        sessionId: input.sessionId,
        turnId: input.turnId,
        assistantMessageId: input.assistantMessageId,
        existingAssistantMessageId: input.existingAssistantMessageId,
        userMessageId: input.userMessageId,
        messages: input.messages,
        selectedModel: input.selectedModel,
        mcpServerIds: routedMcpServerIds,
        mode: input.mode,
        toolApprovalMode: input.toolApprovalMode,
        webSearch: input.webSearch,
        thinking: input.thinking,
        citationRequired: input.citationRequired,
        citationStartIndex: input.citationStartIndex,
        window: win,
        abortSignal: abort.signal,
        skillId: skillId ?? undefined,
      });

      // 首轮成功后把路由得到的 skillId 和 citationRequired 写入 turn（仅持久化会话）
      if (result?.ok && input.userMessageId) {
        const turn = getLatestTurnByUserMessageId(input.userMessageId);
        if (turn) {
          updateTurn(turn.id, {
            skillId: skillId ?? null,
            citationRequired: input.citationRequired ?? false,
            citationStartIndex: input.citationStartIndex ?? 0
          });
        }
      }

      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error("chat:send failed", { message });
      win.webContents.send("chat:stream", {
        sessionId: input.sessionId,
        messageId: "",
        chunk: {
          type: "error",
          errorText: message
        }
      });
      return { ok: false, error: message };
    } finally {
      // 清理 AbortController
      abortControllers.delete(input.sessionId);
    }
  },

  "chat:abort": async (_event, input: { sessionId: string }) => {
    const abort = abortControllers.get(input.sessionId);
    if (abort) {
      abort.abort();
      abortControllers.delete(input.sessionId);
      logger.info("chat aborted", { sessionId: input.sessionId });
    }
    return { ok: true };
  },

  "chat:submitToolApproval": async (event, input: {
    sessionId: string;
    approvalId: string;
    approved: boolean;
    reason?: string;
    addToWhitelist?: boolean;
    toolName: string;
    args?: { command?: string };
  }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      logger.error("chat:submitToolApproval: BrowserWindow not available");
      return { ok: false, error: "BrowserWindow not available" };
    }
    const abort = new AbortController();
    abortControllers.set(input.sessionId, abort);
    try {
      const result = await executeChatWithToolApproval({
        sessionId: input.sessionId,
        approvalId: input.approvalId,
        approved: input.approved,
        reason: input.reason,
        addToWhitelist: input.addToWhitelist,
        toolName: input.toolName,
        args: input.args,
        window: win,
        abortSignal: abort.signal
      });
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error("chat:submitToolApproval failed", { message });
      win.webContents.send("chat:stream", {
        sessionId: input.sessionId,
        messageId: "",
        chunk: {
          type: "error",
          errorText: message
        }
      });
      return { ok: false, error: message };
    } finally {
      abortControllers.delete(input.sessionId);
    }
  },

  "chat:submitToolApprovals": async (event, input: {
    sessionId: string;
    approvals: Array<{
      approvalId: string;
      approved: boolean;
      reason?: string;
      addToWhitelist?: boolean;
      toolName?: string;
      args?: { command?: string };
    }>;
  }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      logger.error("chat:submitToolApprovals: BrowserWindow not available");
      return { ok: false, error: "BrowserWindow not available" };
    }
    const abort = new AbortController();
    abortControllers.set(input.sessionId, abort);
    try {
      const result = await executeChatWithToolApprovals({
        sessionId: input.sessionId,
        approvals: input.approvals,
        window: win,
        abortSignal: abort.signal
      });
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error("chat:submitToolApprovals failed", { message });
      win.webContents.send("chat:stream", {
        sessionId: input.sessionId,
        messageId: "",
        chunk: {
          type: "error",
          errorText: message
        }
      });
      return { ok: false, error: message };
    } finally {
      abortControllers.delete(input.sessionId);
    }
  },

  "toolAllowlist:list": async () => {
    return getToolAllowlist();
  },

  "toolAllowlist:remove": async (_event, input: { type: "tool" | "shell"; key: string }) => {
    removeToolAllowlistEntry({ type: input.type, key: input.key });
    return { ok: true };
  },

  "toolAllowlist:clear": async () => {
    clearToolAllowlist();
    return { ok: true };
  },

  // ==================== 轻应用 Applet ====================
  "applet:list": async () => listApplets(),
  "applet:get": async (_event, input: { id: string }) => getApplet(input.id),
  "applet:create": async (
    _event,
    input: { name: string; description?: string; logo?: string; entryFile?: string }
  ) =>
    await createApplet(input),
  "applet:update": async (_event, input: { id: string; name?: string; description?: string; logo?: string; entryFile?: string }) =>
    await updateApplet(input.id, input),
  "applet:delete": async (_event, input: { id: string }) => {
    const ok = await deleteApplet(input.id);
    return { ok };
  },
  "applet:listFiles": async (_event, input: { id: string }) => {
    return listAppletFiles(input.id);
  },
  "applet:listEntries": async (_event, input: { id: string }) => {
    return listAppletEntries(input.id);
  },
  "applet:readFile": async (_event, input: { id: string; path: string }) => {
    return readAppletFile(input.id, input.path);
  },
  "applet:writeFile": async (_event, input: { id: string; path: string; content: string }) => {
    const result = await writeAppletTextFile(input.id, input.path, input.content);
    return { ok: !!result, result };
  },
  "applet:writeFileBase64": async (_event, input: { id: string; path: string; base64: string }) => {
    const result = await writeAppletBase64File(input.id, input.path, input.base64);
    return { ok: !!result, result };
  },
  "applet:createFile": async (_event, input: { id: string; path: string; content?: string }) => {
    const result = await createAppletFile(input.id, input.path, input.content ?? "");
    return { ok: !!result, result };
  },
  "applet:createDir": async (_event, input: { id: string; path: string }) => {
    const result = await createAppletDirectory(input.id, input.path);
    return { ok: !!result, result };
  },
  "applet:renameFile": async (_event, input: { id: string; from: string; to: string }) => {
    const result = await renameAppletFile(input.id, input.from, input.to);
    return { ok: !!result, result };
  },
  "applet:deleteFile": async (_event, input: { id: string; path: string }) => {
    const ok = await deleteAppletFile(input.id, input.path);
    return { ok };
  },
  "applet:open": async (_event, input: { appletId: string }) => {
    const applet = await getApplet(input.appletId);
    if (!applet) return { ok: false as const, error: tMain("applet.notFound") };
    try {
      const result = await spawnAppletProcess(input.appletId);
      if (result.alreadyOpen) {
        return { ok: true as const, appletId: result.appletId };
      }
      const { appletId } = result;
      const devUrl = process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;
      const appletRunnerUrl = devUrl
        ? devUrl.replace(/(\/*index\.html)?$/, "/applet-runner.html")
        : null;
      const ownerWindow = BrowserWindow.fromWebContents(_event.sender);
      const targetDisplay = ownerWindow
        ? screen.getDisplayMatching(ownerWindow.getBounds())
        : screen.getPrimaryDisplay();
      const workAreaWidth = Math.max(1, Math.round(targetDisplay.workAreaSize.width));
      const workAreaHeight = Math.max(1, Math.round(targetDisplay.workAreaSize.height));
      const minWidth = Math.min(APPLET_WINDOW_MIN_WIDTH, workAreaWidth);
      const minHeight = Math.min(APPLET_WINDOW_MIN_HEIGHT, workAreaHeight);
      const defaultWidth = clampInt(
        Math.floor(workAreaWidth * APPLET_WINDOW_DEFAULT_RATIO),
        minWidth,
        workAreaWidth
      );
      const defaultHeight = clampInt(
        Math.floor(workAreaHeight * APPLET_WINDOW_DEFAULT_RATIO),
        minHeight,
        workAreaHeight
      );
      const width = clampInt(applet.windowWidth ?? defaultWidth, minWidth, workAreaWidth);
      const height = clampInt(applet.windowHeight ?? defaultHeight, minHeight, workAreaHeight);
      const win = new BrowserWindow({
        width,
        height,
        minWidth,
        minHeight,
        resizable: true,
        title: applet.name,
        webPreferences: {
          preload: path.join(__dirname, "../preload/index.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      registerAppletWindow(appletId, win);
      let saveTimer: NodeJS.Timeout | null = null;
      const persistAppletWindowSize = () => {
        if (win.isDestroyed()) return;
        if (win.isMaximized() || win.isFullScreen()) return;
        const [nextWidth, nextHeight] = win.getSize();
        updateAppletWindowSize(appletId, { width: nextWidth, height: nextHeight }).catch((error) => {
          logger.warn("failed to persist applet window size", {
            appletId,
            message: error instanceof Error ? error.message : String(error),
          });
        });
      };
      const schedulePersistAppletWindowSize = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveTimer = null;
          persistAppletWindowSize();
        }, APPLET_WINDOW_SAVE_DEBOUNCE_MS);
      };
      win.on("resize", schedulePersistAppletWindowSize);
      win.on("close", () => {
        if (saveTimer) {
          clearTimeout(saveTimer);
          saveTimer = null;
        }
        persistAppletWindowSize();
      });
      win.on("closed", () => closeAppletRun(appletId));
      if (appletRunnerUrl) {
        await win.loadURL(appletRunnerUrl + "#appletId=" + encodeURIComponent(appletId));
      } else {
        await win.loadFile(path.join(__dirname, "../renderer/appletRunner.html"), { hash: "appletId=" + encodeURIComponent(appletId) });
      }
      const appletName = applet.name;
      win.setTitle(appletName);
      win.webContents.once("did-finish-load", () => win.setTitle(appletName));
      win.show();
      return { ok: true as const, appletId };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error("applet:open failed", { appletId: input.appletId, message });
      return { ok: false as const, error: message };
    }
  },
  "applet:dispatch": async (event, input: { appletId: string; action: unknown }) => {
    const ok = dispatchAppletAction(input.appletId, input.action);
    return { ok };
  },
  "applet:getInitialStateSchema": async (_event, input: { appletId: string }) => {
    return getInitialStateSchema(input.appletId);
  },

  // ==================== MCP Servers ====================
  "mcp:listServers": async () => {
    return listMcpServers();
  },

  "mcp:getServer": async (_event, input: { id: string }) => {
    return getMcpServer(input.id);
  },

  "mcp:createServer": async (_event, input: any) => {
    const server = createMcpServer(input);
    return server;
  },

  "mcp:updateServer": async (_event, input: { id: string; updates: any }) => {
    const isRunning = lazyMcpManager.isRunning(input.id);
    updateMcpServer(input.id, input.updates);
    
    // 如果服务器正在运行且配置有变化，需要停止并更新 enabled 状态
    if (isRunning) {
      try {
        await lazyMcpManager.manualStop(input.id);
        updateMcpServer(input.id, { enabled: false });
        logger.info("Stopped MCP server after config update, set enabled to false", { serverId: input.id });
      } catch (error) {
        logger.error("Failed to stop server after update", { serverId: input.id, error });
      }
    }
    
    return { ok: true };
  },

  "mcp:deleteServer": async (_event, input: { id: string }) => {
    // 先停止服务器（如果正在运行）
    try {
      await lazyMcpManager.manualStop(input.id);
    } catch (error) {
      logger.warn("Failed to stop server before deletion", { serverId: input.id, error });
    }
    
    deleteMcpServer(input.id);
    return { ok: true };
  },

  "mcp:setEnabled": async (_event, input: { id: string; enabled: boolean }) => {
    const { id, enabled } = input;
    
    // 内置服务器不允许禁用
    if (isBuiltinServer(id) && !enabled) {
      logger.warn("Cannot disable built-in server", { serverId: id });
      return { ok: false, error: "Cannot disable built-in server" };
    }
    
    if (enabled) {
      // 启动服务器
      try {
        await lazyMcpManager.manualStart(id);
        // 加载服务器能力
        await mcpServerManager.loadServerCapabilities(id);
        // 更新数据库
        updateMcpServer(id, { enabled: true });
        logger.info("MCP server enabled and started", { serverId: id });
        return { ok: true };
      } catch (error) {
        // 启动失败，确保 enabled 为 false
        updateMcpServer(id, { enabled: false });
        logger.error("Failed to enable MCP server", { serverId: id, error });
        throw error;
      }
    } else {
      // 停止服务器
      try {
        await lazyMcpManager.manualStop(id);
      } catch (error) {
        logger.warn("Failed to stop server during disable", { serverId: id, error });
      }
      // 更新数据库
      updateMcpServer(id, { enabled: false });
      logger.info("MCP server disabled and stopped", { serverId: id });
      return { ok: true };
    }
  },

  "mcp:getServerRuntime": async (_event, input: { serverId: string }) => {
    const runtime = mcpServerManager.getServerRuntime(input.serverId);
    
    // 如果服务器正在运行但还没有加载能力，自动加载
    if (runtime && runtime.status === 'running' && 
        runtime.tools.length === 0 && runtime.prompts.length === 0 && runtime.resources.length === 0) {
      try {
        await mcpServerManager.loadServerCapabilities(input.serverId);
        return mcpServerManager.getServerRuntime(input.serverId);
      } catch (error) {
        logger.error('Failed to load server capabilities', { serverId: input.serverId, error });
      }
    }
    
    return runtime;
  },

  "mcp:refreshServerCapabilities": async (_event, input: { id: string }) => {
    // 清空缓存并重新加载
    mcpServerManager.clearServerCapabilitiesCache(input.id);
    await mcpServerManager.loadServerCapabilities(input.id);
    return { ok: true };
  },

  "mcp:getServerLogs": async (_event, input: { id: string }) => {
    const runtime = mcpServerManager.getServerRuntime(input.id);
    return runtime?.logs || [];
  },

  "mcp:clearServerLogs": async (_event, input: { id: string }) => {
    mcpServerManager.clearServerLogs(input.id);
    return { ok: true };
  },

  "mcp:callTool": async (_event, input: { serverId: string; toolName: string; args: any }) => {
    const wasRunning = lazyMcpManager.isRunning(input.serverId);
    
    const result = await lazyMcpManager.use(input.serverId, async (client) => {
      // 获取工具集
      const tools = await client.tools();
      
      // 查找目标工具
      const tool = tools[input.toolName];
      if (!tool) {
        throw new Error(tMain("common.toolNotFound", { toolName: input.toolName }));
      }
      
      // 执行工具（AI SDK 会自动处理输入验证和输出转换）
      return await tool.execute(input.args, {
        toolCallId: `manual-${Date.now()}`,
        messages: []
      });
    });
    
    // 如果服务器是刚刚启动的，更新 enabled 状态
    if (!wasRunning) {
      updateMcpServer(input.serverId, { enabled: true });
      await mcpServerManager.loadServerCapabilities(input.serverId);
    }
    
    return result;
  },

  "mcp:getPrompt": async (_event, input: { serverId: string; promptName: string; args?: any }) => {
    const wasRunning = lazyMcpManager.isRunning(input.serverId);
    
    const result = await lazyMcpManager.use(input.serverId, async (client) => {
      return await (client as any).getPrompt({
        name: input.promptName,
        arguments: input.args
      });
    });
    
    // 如果服务器是刚刚启动的，更新 enabled 状态
    if (!wasRunning) {
      updateMcpServer(input.serverId, { enabled: true });
      await mcpServerManager.loadServerCapabilities(input.serverId);
    }
    
    return result;
  },

  "mcp:readResource": async (_event, input: { serverId: string; uri: string }) => {
    const wasRunning = lazyMcpManager.isRunning(input.serverId);
    
    const result = await lazyMcpManager.use(input.serverId, async (client) => {
      return await client.readResource({ uri: input.uri });
    });
    
    // 如果服务器是刚刚启动的，更新 enabled 状态
    if (!wasRunning) {
      updateMcpServer(input.serverId, { enabled: true });
      await mcpServerManager.loadServerCapabilities(input.serverId);
    }
    
    return result;
  },

  // ==================== Skills ====================
  "skill:list": async () => {
    return listSkills();
  },
  "skill:getDetail": async (_event, input: { id: string }) => {
    return getSkillDetail(input.id);
  },
  "skill:readFile": async (_event, input: { id: string; relativePath: string }) => {
    return readSkillFile(input.id, input.relativePath);
  },
  "skill:uninstall": async (_event, input: { id: string }) => {
    uninstallSkill(input.id);
  },

  // ==================== Dialog ====================
  "dialog:selectDirectory": async (_event, input: { title?: string; defaultPath?: string }) => {
    const result = await dialog.showOpenDialog({
      title: input.title || tMain("dialog.selectDirectory"),
      defaultPath: input.defaultPath,
      properties: ['openDirectory', 'createDirectory']
    });
    
    return {
      canceled: result.canceled,
      filePath: result.filePaths[0] || null
    };
  },

  // ==================== Embedding ====================
  "embedding:embed": async (_event, input: { text: string }) => {
    const { modelId, client } = getEmbeddingClient();
    const { embedding } = await embed({
      model: getEmbeddingModel(client, modelId),
      value: input.text
    });
    return { ok: true, vector: embedding };
  },

  "embedding:embedBatch": async (_event, input: { texts: string[] }) => {
    const { modelId, client } = getEmbeddingClient();
    const { embeddings } = await embedMany({
      model: getEmbeddingModel(client, modelId),
      values: input.texts
    });
    return { ok: true, vectors: embeddings };
  },

  "embedding:getStatus": async () => {
    // 返回 model server 状态
    return modelServerManager.getStatus();
  },

  // ==================== TTS ====================
  "tts:start": async (event, input: {
    requestId?: string;
    text: string;
    voice?: string;
    rate?: string;
    pitch?: string;
    volume?: string;
  }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      const message = "BrowserWindow not available for tts:start";
      logger.error(message);
      return { ok: false as const, error: message };
    }

    const requestId = String(input.requestId || "").trim()
      || `tts_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const existingAbort = ttsAbortControllers.get(requestId);
    if (existingAbort) {
      existingAbort.abort();
      ttsAbortControllers.delete(requestId);
    }

    const abort = new AbortController();
    ttsAbortControllers.set(requestId, abort);

    void (async () => {
      try {
        for await (const chunk of synthesizeEdgeTtsStream(input.text, {
          voice: input.voice,
          rate: input.rate,
          pitch: input.pitch,
          volume: input.volume,
          signal: abort.signal,
        })) {
          if (win.isDestroyed()) {
            abort.abort();
            break;
          }

          win.webContents.send("tts:stream", {
            requestId,
            type: "chunk",
            audioBase64: Buffer.from(chunk).toString("base64"),
            mimeType: "audio/mpeg",
          });
        }

        if (!win.isDestroyed()) {
          win.webContents.send("tts:stream", {
            requestId,
            type: "done",
            aborted: abort.signal.aborted,
          });
        }
      } catch (error) {
        if (win.isDestroyed()) return;
        const message = error instanceof Error ? error.message : String(error);
        if (abort.signal.aborted) {
          win.webContents.send("tts:stream", {
            requestId,
            type: "done",
            aborted: true,
          });
          return;
        }
        logger.error("tts:start stream failed", { requestId, message });
        win.webContents.send("tts:stream", {
          requestId,
          type: "error",
          error: message,
        });
      } finally {
        ttsAbortControllers.delete(requestId);
      }
    })();

    return { ok: true as const, requestId };
  },

  "tts:stop": async (_event, input: { requestId: string }) => {
    const requestId = String(input.requestId || "").trim();
    if (!requestId) return { ok: true as const };
    const abort = ttsAbortControllers.get(requestId);
    if (abort) {
      abort.abort();
      ttsAbortControllers.delete(requestId);
    }
    return { ok: true as const };
  },

  /** 探测 embedding 模型的默认输出维度（不传 dimensions 参数，probe 一次） */
  "embedding:detectDimension": async (_event, input: { embeddingModel: string }) => {
    const { providerId, modelId, client } = getEmbeddingClientForModel(input.embeddingModel);
    if (providerId === LOCAL_PROVIDER_ID) {
      await localModelRuntimeService.ensureModelReady(modelId);
    }
    const { embedding } = await embed({
      model: getEmbeddingModel(client, modelId),
      value: "test"
    });
    return { dimension: embedding.length };
  },

  /** 校验指定维度是否被该模型支持 */
  "embedding:validateDimension": async (_event, input: { embeddingModel: string; dimension: number }) => {
    const { providerId, modelId, client } = getEmbeddingClientForModel(input.embeddingModel);
    if (providerId === LOCAL_PROVIDER_ID) {
      await localModelRuntimeService.ensureModelReady(modelId);
    }
    const dim = input.dimension;
    try {
      const providerOptions = { [providerId]: { dimensions: dim } };
      const { embedding } = await embed({
        model: getEmbeddingModel(client, modelId),
        value: "test",
        providerOptions
      });
      const valid = embedding.length === dim;
      return {
        ok: valid,
        error: valid ? undefined : tMain("embedding.dimensionUnsupported", { expected: dim }),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  },

  // ==================== Knowledge Base ====================
  "kb:list": async () => {
    return listKnowledgeBases();
  },

  "kb:get": async (_event, input: { id: string }) => {
    return getKnowledgeBase(input.id);
  },

  "kb:create": async (_event, input: { name: string; description?: string; embeddingModel?: string; embeddingDimension?: number }) => {
    let dimension = input.embeddingDimension;
    if (dimension == null) {
      const { providerId, modelId, client } = getEmbeddingClientForModel(input.embeddingModel ?? '__default__');
      if (providerId === LOCAL_PROVIDER_ID) {
        await localModelRuntimeService.ensureModelReady(modelId);
      }
      const { embedding } = await embed({
        model: getEmbeddingModel(client, modelId),
        value: "test"
      });
      dimension = embedding.length;
    }
    return createKnowledgeBase({ ...input, embeddingDimension: dimension });
  },

  "kb:update": async (_event, input: { id: string; updates: Partial<Pick<KnowledgeBase, 'name' | 'description'>> }) => {
    updateKnowledgeBase(input.id, input.updates);
    return { ok: true };
  },

  "kb:migrate": async (_event, input: { id: string; updates: Pick<KnowledgeBase, 'embeddingModel' | 'embeddingDimension'> }) => {
    migrateKnowledgeBase(input.id, input.updates);
    return { ok: true };
  },

  "kb:delete": async (_event, input: { id: string }) => {
    deleteKnowledgeBase(input.id);
    return { ok: true };
  },

  // ==================== Knowledge Base Items ====================
  "kb:listItems": async (_event, input: { kbId: string }) => {
    return listKbItems(input.kbId);
  },

  "kb:listItemsByType": async (_event, input: { kbId: string; type: KbItemType }) => {
    return listKbItemsByType(input.kbId, input.type);
  },

  "kb:getItem": async (_event, input: { id: string }) => {
    return getKbItem(input.id);
  },

  "kb:createItem": async (_event, input: {
    kbId: string;
    type: KbItemType;
    name: string;
    source?: string;
    content?: string;
    fileType?: string;
    fileSize?: number;
    fileMtime?: number;
    maxDepth?: number;
  }) => {
    return createKbItem(input);
  },

  "kb:updateItem": async (_event, input: { id: string; updates: any }) => {
    updateKbItem(input.id, input.updates);
    return { ok: true };
  },

  "kb:deleteItem": async (_event, input: { id: string }) => {
    deleteKbItem(input.id);
    return { ok: true };
  },

  // ==================== Knowledge Base Processing ====================
  "kb:processItem": async (_event, input: { itemId: string; kbId: string }) => {
    const kb = getKnowledgeBase(input.kbId);
    if (!kb) {
      return { ok: false, error: tMain("knowledge.kbNotFound") };
    }

    const dimension = kb.embeddingDimension ?? 768;
    if (!kbVectorTableExists(input.kbId)) {
      createKbVectorTable(input.kbId, dimension);
    }

    try {
      await processKbItem(input.itemId, { embedFn: buildEmbedFnForKb(kb) });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  },

  "kb:updateTextItemAndProcess": async (_event, input: { itemId: string; name: string; content: string }) => {
    const item = getKbItem(input.itemId);
    if (!item) {
      return { ok: false, error: tMain("knowledge.itemNotFound") };
    }
    if (item.type !== 'text') {
      return { ok: false, error: tMain("knowledge.textOnly") };
    }

    const kb = getKnowledgeBase(item.kbId);
    if (!kb) {
      return { ok: false, error: tMain("knowledge.kbNotFound") };
    }

    const dimension = kb.embeddingDimension ?? 768;
    if (!kbVectorTableExists(item.kbId)) {
      createKbVectorTable(item.kbId, dimension);
    }

    updateKbItem(input.itemId, {
      name: input.name,
      content: input.content,
      status: 'pending',
      chunkCount: 0
    });

    try {
      await processKbItem(input.itemId, { embedFn: buildEmbedFnForKb(kb) });
      const updated = getKbItem(input.itemId);
      return { ok: true, item: updated };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  },

  // ==================== File & Directory Operations ====================
  "kb:scanDirectory": async (_event, input: { dirPath: string; maxDepth?: number }) => {
    return scanDirectory(input.dirPath, input.maxDepth || DEFAULT_MAX_DEPTH);
  },

  "kb:getFileInfo": async (_event, input: { filePath: string }) => {
    return getFileInfo(input.filePath);
  },

  "kb:checkFileChanged": async (_event, input: { filePath: string; recordedMtime: number }) => {
    return checkFileChanged(input.filePath, input.recordedMtime);
  },

  "kb:isSupportedFile": async (_event, input: { filePath: string }) => {
    return isSupportedFile(input.filePath);
  },

  "app:getStoragePaths": async () => {
    const userData = app.getPath("userData");
    const logsDir = path.join(userData, "logs");
    const autoImportBackupDir = path.join(userData, "backups", "auto-before-import");
    await fs.mkdir(logsDir, { recursive: true });
    await fs.mkdir(autoImportBackupDir, { recursive: true });
    return { userData, logsDir, autoImportBackupDir };
  },

  "app:exportUserDataArchive": async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const defaultName = `mirdel-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    const { canceled, filePath } = await dialog.showSaveDialog(win ?? undefined, {
      title: tMain("storage.exportDialogTitle"),
      defaultPath: path.join(app.getPath("documents"), defaultName),
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (canceled || !filePath) {
      return { ok: false as const, canceled: true as const };
    }
    let targetPath = filePath;
    if (!targetPath.toLowerCase().endsWith(".zip")) {
      targetPath = `${targetPath}.zip`;
    }
    const result = await exportUserDataToZip(targetPath);
    if (!result.ok) {
      return { ok: false as const, canceled: false as const, error: result.error };
    }
    return {
      ok: true as const,
      filePath: result.filePath,
      byteSize: result.byteSize,
    };
  },

  "app:importUserDataArchive": async (event) => {
    return runImportUserDataArchiveWithDialog(() => BrowserWindow.fromWebContents(event.sender));
  },

  "shell:showItemInFolder": async (_event, path: string) => {
    shell.showItemInFolder(path);
    return { ok: true };
  },

  "shell:openPath": async (_event, path: string) => {
    const result = await shell.openPath(path);
    return { ok: result === '', error: result || undefined };
  },

  "dialog:selectFile": async (_event, input: { 
    title?: string; 
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    multiSelections?: boolean;
  }) => {
    const properties: ('openFile' | 'multiSelections')[] = ['openFile'];
    if (input.multiSelections) {
      properties.push('multiSelections');
    }

    const result = await dialog.showOpenDialog({
      title: input.title || tMain("dialog.selectFile"),
      defaultPath: input.defaultPath,
      filters: input.filters,
      properties
    });
    
    return {
      canceled: result.canceled,
      filePaths: result.filePaths
    };
  },

  // ==================== Knowledge Base Search ====================
  "kb:search": async (_event, input: { query: string; kbIds: string[]; topK?: number; minScore?: number }) => {
    const topK = input.topK || 10;
    const minScore = input.minScore ?? 0.75;
    const results: Array<{
      chunkId: number;
      kbId: string;
      content: string;
      score: number;
      metadata?: Record<string, any>;
      source?: string;
      title?: string;
      kbName?: string;
      kbItemId?: string;
      kbItemType?: 'text' | 'file' | 'directory' | 'url';
      kbItemTitle?: string;
      url?: string;
    }> = [];

    for (const kbId of input.kbIds) {
      const kb = getKnowledgeBase(kbId);
      if (!kb || !kbVectorTableExists(kbId)) continue;

      const dimension = kb.embeddingDimension;
      let embedding: number[];

      try {
        const modelRef = kb.embeddingModel && kb.embeddingModel !== "__default__" ? kb.embeddingModel : "__default__";
        const defaultModel = modelRef === "__default__" ? getRequiredDefaultEmbeddingModel() : undefined;
        const resolved = resolveModelInvocation({
          modelRef,
          separator: "/",
          defaultModel,
          invalidModelErrorKey: "embedding.invalidModelFormat",
        });
        if (resolved.providerId === LOCAL_PROVIDER_ID) {
          await localModelRuntimeService.ensureModelReady(resolved.modelId);
        }
        const providerOptions = dimension
          ? { [resolved.providerId]: { dimensions: dimension } }
          : undefined;
        const r = await embed({
          model: getEmbeddingModel(resolved.client, resolved.modelId),
          value: input.query,
          providerOptions,
        });
        embedding = r.embedding;
      } catch {
        continue;
      }

      const kbResults = searchKnowledgeBase(kbId, embedding, topK);
      results.push(...kbResults);
    }

    // 按相似度阈值过滤，去掉无关结果
    const filtered = results.filter((r) => r.score >= minScore);

    // 为每条结果补充 source（知识库名）、title（第二行：文件用文件名、目录用目录名、网页用标题或 url、文本不显示）
    if (filtered.length > 0) {
      const chunkIds = filtered.map(r => r.chunkId);
      const chunks = getKbChunksByIds(chunkIds);
      const chunkMap = new Map(chunks.map(c => [c.id, c]));
      for (const r of filtered) {
        const chunk = chunkMap.get(r.chunkId);
        const kb = getKnowledgeBase(r.kbId);
        const item = chunk ? getKbItem(chunk.itemId) : undefined;
        const kbName = kb?.name ?? r.kbId;
        r.source = kbName;
        r.kbName = kbName;
        if (item) {
          r.kbItemId = item.id;
          r.kbItemType = item.type;
          if (item.type === 'text') {
            r.title = '';
            r.kbItemTitle = '';
          } else if (item.type === 'file' || item.type === 'directory') {
            const itemTitle = item.name || '';
            r.title = itemTitle;
            r.kbItemTitle = itemTitle;
          } else if (item.type === 'url') {
            const itemTitle = item.name || item.source || '';
            r.title = itemTitle;
            r.kbItemTitle = itemTitle;
            if (item.source) {
              r.url = item.source;
            }
          } else {
            const itemTitle = item.name || '';
            r.title = itemTitle;
            r.kbItemTitle = itemTitle;
          }
        } else {
          const fallbackTitle = chunk ? tMain("knowledge.chunkTitle", { chunkId: r.chunkId }) : '';
          r.title = fallbackTitle;
          r.kbItemTitle = fallbackTitle;
        }
      }
    }

    return { ok: true, results: filtered };
  }
});

/**
 * 获取 router 推导出的类型（供 preload 使用）
 */
export type Router = typeof router;
