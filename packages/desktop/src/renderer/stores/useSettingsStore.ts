import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loggerServiceRenderer } from '@shared'
import {
  DEFAULT_APP_LANGUAGE_PREFERENCE,
  type NativeWebSearchConfig,
  resolveAppLocale,
  type AppLanguagePreference,
  type DefaultModelRef,
  type ProviderModel,
  type ProviderPublic,
  type SupportedAppLocale
} from '@shared'

const logger = loggerServiceRenderer.withContext('useSettingsStore')

// 使用 shared 的 ProviderPublic 类型（包含完整的 model 信息）
export type { ProviderPublic } from '@shared'

export type PromptLibraryEntry = {
  id: string
  title: string
  description: string
  content: string
  tags: string[]
  favorite: boolean
  createdAt: number
  updatedAt: number
}

/** 全局「新建提示词」弹窗保存后的动作 */
export type PromptLibraryCreateAfterSave = 'none' | 'reload-prompt-library'

export type PromptLibraryCreateRequest = {
  /** 预填正文 */
  presetContent: string
  afterSave: PromptLibraryCreateAfterSave
}

export type Scenario = {
  id: string
  name: string
  description?: string
  selectedModel: string  // '__default__' 或 'providerId::modelId'
  temperature?: number
  topP?: number
  topK?: number
  presencePenalty?: number
  frequencyPenalty?: number
  stopSequences?: string[]
  seed?: number
  contextCount: number
  maxOutputTokens?: number
  systemPrompt?: string
  mcpServerIds: string[]  // MCP 服务器 ID 列表
  mcpPolicy: 'auto' | 'manual' | 'off'  // MCP 默认策略
  skillPolicy: 'auto' | 'off'  // 技能默认策略
  maxToolSteps: number  // 工具调用的最大步数，默认 20
  workingDirs: string[]  // 工作目录列表，用于 filesystem MCP 服务器
  kbIds?: string[]  // 场景预选知识库 ID 列表
  kbRecallTopK?: number  // 知识库召回条数，默认 5，范围 1-50
  kbRecallMinScore?: number  // 知识库召回最低相似度，默认 0.75，低于此值的结果会被过滤
  createdAt: number
  updatedAt: number
}

export type DefaultModels = {
  general: DefaultModelRef
  fast: DefaultModelRef
  translate: DefaultModelRef
  embedding: DefaultModelRef
  imageGenerate: DefaultModelRef
  imageEdit: DefaultModelRef
  videoGenerate: DefaultModelRef
}

type AddModelToCommonResult = {
  model: ProviderModel
  copiedFromBase: boolean
  baseModelId?: string
}

export type SessionTitleGenerationMode = 'ai' | 'extract'

export type SessionPreferences = {
  titleGenerationMode: SessionTitleGenerationMode
  generateSuggestions: boolean
  showMindmap: boolean
  showTokenUsage: boolean
  showDebugEntry: boolean
}

export type ProxyMode = 'system' | 'custom' | 'direct'

export type ProxySettings = {
  mode: ProxyMode
  server: string
  bypassRules: string[]
}

export type AppBehaviorSettings = {
  launchAtLogin: boolean
  minimizeToTrayOnClose: boolean
}

export type LocalModelRuntimeState =
  | "not_downloaded"
  | "downloading"
  | "downloaded"
  | "loading"
  | "loaded"
  | "error"

export type LocalModelAvailability =
  | "available"
  | "limited"
  | "unavailable"
  | "unknown"

export type LocalModelAvailabilityReason =
  | "total_meets_recommended"
  | "total_below_recommended"
  | "total_below_min"
  | "requirements_missing"
  | "device_memory_unavailable"

export type LocalModelResourceRequirements = {
  minRamBytes?: number
  recommendedRamBytes?: number
}

export type LocalModelRuntimeStatus = {
  modelId: string
  modelName: string
  modelType: "embedding" | "generative" | "rerank"
  fileName: string
  sizeBytes?: number
  resourceRequirements?: LocalModelResourceRequirements
  deviceTotalMemoryBytes?: number
  availability: LocalModelAvailability
  availabilityReason: LocalModelAvailabilityReason
  state: LocalModelRuntimeState
  progress?: number
  downloadedBytes?: number
  totalBytes?: number
  speedBps?: number
  error?: string
}

const LOCAL_PROVIDER_ID = 'local'
const LOCAL_MODEL_SELECTABLE_STATES = new Set<LocalModelRuntimeState>(['downloaded', 'loading', 'loaded'])
const LOCAL_MODEL_RUNTIME_BUSY_STATES = new Set<LocalModelRuntimeState>(['downloading', 'loading'])
const LOCAL_MODEL_RUNTIME_POLL_INTERVAL_BUSY_MS = 1000
const LOCAL_MODEL_RUNTIME_POLL_INTERVAL_IDLE_MS = 8000

export const useSettingsStore = defineStore('settings', () => {
  // ===== State =====
  const providers = ref<ProviderPublic[]>([])
  const scenarios = ref<Scenario[]>([])
  const promptLibraryEntries = ref<PromptLibraryEntry[]>([])
  /** 打开全局「新建提示词」弹窗（消费后清空） */
  const promptLibraryCreateRequest = ref<PromptLibraryCreateRequest | null>(null)
  const defaultModels = ref<DefaultModels>({
    general: null,
    fast: null,
    translate: null,
    embedding: null,
    imageGenerate: null,
    imageEdit: null,
    videoGenerate: null,
  })
  const isInitialized = ref(false)
  const isLoading = ref(false)
  const aiDevToolsEnabled = ref(false)
  const sessionPreferences = ref<SessionPreferences>({
    titleGenerationMode: 'ai',
    generateSuggestions: true,
    showMindmap: true,
    showTokenUsage: true,
    showDebugEntry: false
  })
  const proxySettings = ref<ProxySettings>({
    mode: 'system',
    server: '',
    bypassRules: ['localhost', '127.0.0.1', '::1']
  })
  const appBehaviorSettings = ref<AppBehaviorSettings>({
    launchAtLogin: false,
    minimizeToTrayOnClose: false
  })
  const modelFavorites = ref<string[]>([])
  const systemLocale = ref(typeof navigator !== 'undefined' ? navigator.language : 'en')
  const languagePreference = ref<AppLanguagePreference>(DEFAULT_APP_LANGUAGE_PREFERENCE)
  const resolvedLanguage = ref<SupportedAppLocale>(resolveAppLocale(languagePreference.value, systemLocale.value))
  const localModelRuntimes = ref<Record<string, LocalModelRuntimeStatus>>({})
  let localModelRuntimePollTimer: ReturnType<typeof setTimeout> | null = null
  let localModelRuntimePollingRefCount = 0
  let localModelRuntimePollingRunning = false
  
  // ===== Computed =====
  const enabledProviders = computed(() => 
    providers.value.filter(p => p.enabled)
  )
  
  // 获取通用会话的默认模型（用于聊天页）
  const defaultModel = computed(() => defaultModels.value.general)
  
  // ===== Actions =====
  
  /**
   * 初始化：应用启动时调用一次
   * 加载所有基础配置数据
   */
  async function initialize() {
    if (isInitialized.value) {
      logger.info('already initialized, skip')
      return
    }
    
    logger.info('initializing settings store...')
    isLoading.value = true
    try {
      await Promise.all([
        loadProviders(),
        loadScenarios(),
        loadPromptLibrary(),
        loadDefaultModels(),
        loadAiDevToolsEnabled(),
        loadSessionPreferences(),
        loadProxySettings(),
        loadAppBehaviorSettings(),
        loadModelFavorites(),
        loadAppLanguage()
      ])
      isInitialized.value = true
      logger.info('settings store initialized successfully')
    } catch (error) {
      logger.error('failed to initialize settings store', { error })
      throw error
    } finally {
      isLoading.value = false
    }
  }
  
  /**
   * 加载 Providers
   */
  async function loadProviders() {
    logger.info('loading providers')
    providers.value = await window.ipc('providers:list')
    if (!providers.value.some((provider) => provider.id === LOCAL_PROVIDER_ID)) {
      localModelRuntimes.value = {}
    }
    logger.info('providers loaded', { count: providers.value.length })
  }
  
  /**
   * 加载 Scenarios
   */
  async function loadScenarios() {
    logger.info('loading scenarios')
    scenarios.value = await window.ipc('scenarios:list')
    logger.info('scenarios loaded', { count: scenarios.value.length })
  }

  async function loadPromptLibrary() {
    logger.info('loading prompt library')
    promptLibraryEntries.value = await window.ipc('promptLibrary:list')
    logger.info('prompt library loaded', { count: promptLibraryEntries.value.length })
  }

  function setPromptLibraryCreateRequest(req: PromptLibraryCreateRequest) {
    promptLibraryCreateRequest.value = req
  }

  function takePromptLibraryCreateRequest(): PromptLibraryCreateRequest | null {
    const r = promptLibraryCreateRequest.value
    promptLibraryCreateRequest.value = null
    return r
  }
  
  /**
   * 加载默认模型配置
   */
  async function loadDefaultModels() {
    logger.info('loading default models')
    const configs = await window.ipc('settings:getAllDefaultModels')
    defaultModels.value = configs
    logger.info('default models loaded', configs)
  }

  async function loadAiDevToolsEnabled() {
    const result = await window.ipc('settings:getAiDevToolsEnabled')
    aiDevToolsEnabled.value = !!result?.enabled
  }

  async function loadSessionPreferences() {
    const result = await window.ipc('settings:getSessionPreferences')
    sessionPreferences.value = {
      titleGenerationMode: result?.titleGenerationMode === 'extract' ? 'extract' : 'ai',
      generateSuggestions: result?.generateSuggestions !== false,
      showMindmap: result?.showMindmap !== false,
      showTokenUsage: result?.showTokenUsage !== false,
      showDebugEntry: result?.showDebugEntry === true
    }
  }

  async function loadProxySettings() {
    const result = await window.ipc('settings:getProxySettings')
    proxySettings.value = {
      mode: result?.mode === 'custom' || result?.mode === 'direct' ? result.mode : 'system',
      server: typeof result?.server === 'string' ? result.server : '',
      bypassRules: Array.isArray(result?.bypassRules)
        ? result.bypassRules.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : ['localhost', '127.0.0.1', '::1']
    }
  }

  async function loadAppBehaviorSettings() {
    const result = await window.ipc('settings:getAppBehaviorSettings')
    appBehaviorSettings.value = {
      launchAtLogin: result?.launchAtLogin === true,
      minimizeToTrayOnClose: result?.minimizeToTrayOnClose === true
    }
  }
  
  /**
   * 刷新所有配置（用于手动刷新）
   */
  async function refresh() {
    logger.info('refreshing all settings')
    await Promise.all([
      loadProviders(),
      loadScenarios(),
      loadPromptLibrary(),
      loadDefaultModels(),
      loadAiDevToolsEnabled(),
      loadSessionPreferences(),
      loadProxySettings(),
      loadAppBehaviorSettings(),
      loadModelFavorites(),
      loadAppLanguage()
    ])
  }

  async function setAiDevToolsEnabled(enabled: boolean) {
    await window.ipc('settings:setAiDevToolsEnabled', { enabled })
    aiDevToolsEnabled.value = enabled
  }

  async function setSessionPreferences(updates: Partial<SessionPreferences>) {
    await window.ipc('settings:setSessionPreferences', updates)
    sessionPreferences.value = {
      ...sessionPreferences.value,
      ...updates
    }
  }

  async function setProxySettings(next: ProxySettings) {
    const result = await window.ipc('settings:setProxySettings', next)
    proxySettings.value = {
      mode: result?.mode === 'custom' || result?.mode === 'direct' ? result.mode : 'system',
      server: typeof result?.server === 'string' ? result.server : '',
      bypassRules: Array.isArray(result?.bypassRules)
        ? result.bypassRules.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : ['localhost', '127.0.0.1', '::1']
    }
  }

  async function setAppBehaviorSettings(next: AppBehaviorSettings) {
    const result = await window.ipc('settings:setAppBehaviorSettings', next)
    appBehaviorSettings.value = {
      launchAtLogin: result?.launchAtLogin === true,
      minimizeToTrayOnClose: result?.minimizeToTrayOnClose === true
    }
  }

  async function openAiDevToolsViewer() {
    return await window.ipc('devtools:openViewer')
  }

  async function loadModelFavorites() {
    const list = await window.ipc('settings:getModelFavorites')
    modelFavorites.value = Array.isArray(list) ? list : []
  }

  async function loadAppLanguage() {
    const result = await window.ipc('settings:getAppLanguage')
    systemLocale.value = typeof result?.systemLocale === 'string' && result.systemLocale
      ? result.systemLocale
      : systemLocale.value
    languagePreference.value = result?.preference || DEFAULT_APP_LANGUAGE_PREFERENCE
    resolvedLanguage.value = result?.resolved || resolveAppLocale(languagePreference.value, systemLocale.value)
  }

  async function setAppLanguage(value: AppLanguagePreference) {
    const result = await window.ipc('settings:setAppLanguage', { preference: value })
    systemLocale.value = typeof result?.systemLocale === 'string' && result.systemLocale
      ? result.systemLocale
      : systemLocale.value
    languagePreference.value = value
    resolvedLanguage.value = result?.resolved || resolveAppLocale(languagePreference.value, systemLocale.value)
    await loadProviders()
  }

  function isModelFavorite(providerId: string, modelId: string) {
    return modelFavorites.value.includes(`${providerId}::${modelId}`)
  }

  async function setModelFavorite(providerId: string, modelId: string, favorite: boolean) {
    await window.ipc('settings:setModelFavorite', { providerId, modelId, favorite })
    const key = `${providerId}::${modelId}`
    const next = new Set(modelFavorites.value)
    if (favorite) {
      next.add(key)
    } else {
      next.delete(key)
    }
    modelFavorites.value = Array.from(next).sort((a, b) => a.localeCompare(b))
  }

  async function toggleModelFavorite(providerId: string, modelId: string) {
    const nextFavorite = !isModelFavorite(providerId, modelId)
    await setModelFavorite(providerId, modelId, nextFavorite)
  }
  
  // ===== Provider CRUD =====
  
  async function upsertProvider(data: any) {
    logger.info('upserting provider', { id: data.id })
    await window.ipc('providers:upsert', data)
    await loadProviders()
  }

  async function createCustomProvider(data: { name: string; logo?: string; type: string; baseUrl: string; imageBaseUrl?: string; videoBaseUrl?: string; apiKey?: string; customHeaders?: Record<string, string> | null; providerOptionsDefaults?: Record<string, unknown> | null; nativeWebSearchDefaults?: NativeWebSearchConfig | null; enabled?: boolean }) {
    logger.info('creating custom provider', { name: data.name })
    const result = await window.ipc('providers:createCustom', data)
    await loadProviders()
    return result
  }

  async function updateCustomProvider(id: string, data: { name?: string; logo?: string; type?: string; baseUrl?: string; imageBaseUrl?: string; videoBaseUrl?: string; apiKey?: string; customHeaders?: Record<string, string> | null; providerOptionsDefaults?: Record<string, unknown> | null; nativeWebSearchDefaults?: NativeWebSearchConfig | null; enabled?: boolean }) {
    logger.info('updating custom provider', { id })
    await window.ipc('providers:updateCustom', { id, data })
    await loadProviders()
  }

  async function deleteProvider(id: string) {
    logger.info('deleting provider', { id })
    await window.ipc('providers:delete', { id })
    await loadProviders()
  }
  
  async function testProvider(id: string) {
    logger.info('testing provider', { id })
    const result = await window.ipc('providers:test', { id })
    await loadProviders() // 测试后可能会拉取新模型
    return result
  }

  async function regenerateLocalProviderApiKey() {
    logger.info('regenerating local provider api key')
    const result = await window.ipc('providers:regenerateLocalApiKey')
    await loadProviders()
    return result as { ok: boolean; apiKey: string }
  }

  async function listLocalModelRuntimes(): Promise<LocalModelRuntimeStatus[]> {
    const result = await window.ipc("providers:listLocalModelRuntimes")
    return Array.isArray(result?.models) ? result.models as LocalModelRuntimeStatus[] : []
  }

  async function refreshLocalModelRuntimes() {
    const hasLocalProvider = providers.value.some((provider) => provider.id === LOCAL_PROVIDER_ID && provider.enabled)
    if (!hasLocalProvider) {
      localModelRuntimes.value = {}
      return
    }
    try {
      const list = await listLocalModelRuntimes()
      localModelRuntimes.value = Object.fromEntries(list.map((item) => [item.modelId, item]))
    } catch (error) {
      logger.warn('failed to refresh local model runtimes', { error })
    }
  }

  function resolveLocalModelRuntimePollIntervalMs(): number {
    const hasBusyModel = Object.values(localModelRuntimes.value).some((runtime) => (
      LOCAL_MODEL_RUNTIME_BUSY_STATES.has(runtime.state)
    ))
    return hasBusyModel ? LOCAL_MODEL_RUNTIME_POLL_INTERVAL_BUSY_MS : LOCAL_MODEL_RUNTIME_POLL_INTERVAL_IDLE_MS
  }

  function clearLocalModelRuntimePollTimer() {
    if (!localModelRuntimePollTimer) return
    clearTimeout(localModelRuntimePollTimer)
    localModelRuntimePollTimer = null
  }

  function scheduleNextLocalModelRuntimePoll(delayMs: number) {
    if (!localModelRuntimePollingRunning) return
    clearLocalModelRuntimePollTimer()
    localModelRuntimePollTimer = setTimeout(() => {
      void runLocalModelRuntimePollCycle()
    }, delayMs)
  }

  async function runLocalModelRuntimePollCycle() {
    if (!localModelRuntimePollingRunning) return
    await refreshLocalModelRuntimes()
    if (!localModelRuntimePollingRunning) return
    scheduleNextLocalModelRuntimePoll(resolveLocalModelRuntimePollIntervalMs())
  }

  function startLocalModelRuntimePolling() {
    localModelRuntimePollingRefCount += 1
    if (localModelRuntimePollingRunning) return
    localModelRuntimePollingRunning = true
    void runLocalModelRuntimePollCycle()
  }

  function stopLocalModelRuntimePolling() {
    if (localModelRuntimePollingRefCount > 0) {
      localModelRuntimePollingRefCount -= 1
    }
    if (localModelRuntimePollingRefCount > 0) return
    localModelRuntimePollingRunning = false
    clearLocalModelRuntimePollTimer()
  }

  function getLocalModelRuntime(modelId: string): LocalModelRuntimeStatus | null {
    return localModelRuntimes.value[modelId] ?? null
  }

  function isProviderModelSelectable(providerId: string, modelId: string): boolean {
    if (providerId !== LOCAL_PROVIDER_ID) return true
    const runtime = getLocalModelRuntime(modelId)
    if (!runtime) return false
    return LOCAL_MODEL_SELECTABLE_STATES.has(runtime.state)
  }

  async function downloadLocalModel(modelId: string) {
    await window.ipc("providers:downloadLocalModel", { modelId })
  }

  async function cancelLocalModelDownload(modelId: string) {
    await window.ipc("providers:cancelLocalModelDownload", { modelId })
  }

  async function loadLocalModel(modelId: string) {
    await window.ipc("providers:loadLocalModel", { modelId })
  }

  async function unloadLocalModel(modelId: string) {
    await window.ipc("providers:unloadLocalModel", { modelId })
  }
  
  async function addModelToCommon(
    providerId: string,
    modelId: string,
    modelType: 'generative' | 'embedding' | 'rerank' = 'generative',
    options?: { copyFromModelId?: string }
  ): Promise<AddModelToCommonResult> {
    const addResult = await window.ipc('providers:addModelToCommon', {
      providerId,
      modelId,
      modelType,
      copyFromModelId: options?.copyFromModelId
    })
    const result: AddModelToCommonResult = {
      model: addResult?.model && typeof addResult.model === 'object'
        ? (addResult.model as ProviderModel)
        : { id: modelId, modelType },
      copiedFromBase: Boolean(addResult?.copiedFromBase),
      ...(typeof addResult?.baseModelId === 'string' && addResult.baseModelId
        ? { baseModelId: addResult.baseModelId }
        : {})
    }
    const nextModel = result.model

    const provider = providers.value.find(p => p.id === providerId)
    if (provider) {
      providers.value = providers.value.map(p => {
        if (p.id !== providerId) return p

        const exists = p.models.some(m => m.id === modelId)
        return {
          ...p,
          models: exists
            ? p.models.map(m => (m.id === modelId ? nextModel : m))
            : [...p.models, nextModel]
        }
      })
    }

    return result
  }

  async function removeModelFromCommon(providerId: string, modelId: string) {
    await window.ipc('providers:removeModelFromCommon', { providerId, modelId })
    const provider = providers.value.find(p => p.id === providerId)
    if (provider?.models.some(m => m.id === modelId)) {
      providers.value = providers.value.map(p =>
        p.id !== providerId ? p : { ...p, models: p.models.filter(m => m.id !== modelId) }
      )
    }
  }
  
  async function getModelDetails(providerId: string, modelId: string) {
    logger.info('getting model details', { providerId, modelId })
    return await window.ipc('providers:getModelDetails', { providerId, modelId })
  }
  
  async function updateModelDetails(providerId: string, modelId: string, updates: any) {
    logger.info('updating model details', { providerId, modelId, updates })
    await window.ipc('providers:updateModelDetails', { providerId, modelId, updates })
    
    // 局部更新：只更新特定模型的字段
    const provider = providers.value.find(p => p.id === providerId)
    const model = provider?.models.find(m => m.id === modelId)
    
    if (provider && model) {
      providers.value = providers.value.map(p => {
        if (p.id !== providerId) return p
        
        return {
          ...p,
          models: p.models.map(m => {
            if (m.id !== modelId) return m
            
            const nextModel = {
              ...m,
              ...(updates.modelType !== undefined && { modelType: updates.modelType }),
              ...(updates.inputModalities !== undefined && { inputModalities: updates.inputModalities }),
              ...(updates.outputModalities !== undefined && { outputModalities: updates.outputModalities }),
              ...(updates.imageTasks !== undefined && { imageTasks: updates.imageTasks }),
              ...(updates.image !== undefined && { image: updates.image }),
              ...(updates.imageOptionSchema !== undefined && { imageOptionSchema: updates.imageOptionSchema }),
              ...(updates.providerOptionsDefaults !== undefined && { providerOptionsDefaults: updates.providerOptionsDefaults }),
              ...(updates.nativeWebSearch !== undefined && { nativeWebSearch: updates.nativeWebSearch })
            }

            if (updates.thinking !== undefined) {
              if (updates.thinking === null) {
                delete (nextModel as Record<string, unknown>).thinking
              } else {
                (nextModel as Record<string, unknown>).thinking = updates.thinking
              }
            }

            return nextModel
          })
        }
      })
      
      logger.info('locally updated model details', { providerId, modelId, updates })
    } else {
      logger.warn('provider or model not found in local state, falling back to full reload', { providerId, modelId })
      await loadProviders()
    }
  }
  
  async function resetModel(providerId: string, modelId: string) {
    logger.info('resetting model', { providerId, modelId })
    try {
      const result = await window.ipc('providers:resetModel', { providerId, modelId })
      const details = result?.model && typeof result.model === 'object'
        ? result.model
        : null
      const provider = providers.value.find(p => p.id === providerId)
      const modelExists = provider?.models.some(m => m.id === modelId)

      if (provider && modelExists && details) {
        providers.value = providers.value.map(p => {
          if (p.id !== providerId) return p

          return {
            ...p,
            models: p.models.map(m =>
              m.id === modelId ? details : m
            )
          }
        })

        logger.info('locally updated model after reset', { providerId, modelId })
      } else {
        logger.warn('provider or model not found after reset, falling back to full reload')
        await loadProviders()
      }
    } catch (error) {
      logger.error('failed to reset model, falling back to full reload', { error })
      await loadProviders()
    }
  }
  
  // ===== Scenario CRUD =====
  
  async function createScenario(data: { name: string; description?: string }) {
    logger.info('creating scenario', { name: data.name })
    const scenario = await window.ipc('scenarios:create', data)
    await loadScenarios()
    return scenario
  }
  
  async function updateScenario(id: string, data: any) {
    logger.info('updating scenario', { id })
    await window.ipc('scenarios:update', { id, data })
    await loadScenarios()
  }
  
  async function deleteScenario(id: string) {
    logger.info('deleting scenario', { id })
    await window.ipc('scenarios:delete', { id })
    await loadScenarios()
  }

  async function createPromptLibraryEntry(data?: { title?: string; description?: string; content?: string; tags?: string[] }) {
    const entry = await window.ipc('promptLibrary:create', data)
    await loadPromptLibrary()
    return entry as PromptLibraryEntry
  }

  async function updatePromptLibraryEntry(
    id: string,
    data: Partial<{ title: string; description: string; content: string; tags: string[]; favorite: boolean }>
  ) {
    await window.ipc('promptLibrary:update', { id, data })
    await loadPromptLibrary()
  }

  async function deletePromptLibraryEntry(id: string) {
    await window.ipc('promptLibrary:delete', { id })
    await loadPromptLibrary()
  }
  
  // ===== Default Models CRUD =====
  
  async function setDefaultModel(type: 'general' | 'fast' | 'translate' | 'embedding' | 'imageGenerate' | 'imageEdit' | 'videoGenerate', model: DefaultModelRef) {
    logger.info('setting default model', { type, model })
    await window.ipc('settings:setDefaultModelByType', {
      type,
      providerId: model?.providerId || '',
      modelId: model?.modelId || ''
    })
    await loadDefaultModels()
  }
  
  async function getDefaultModelByType(type: 'general' | 'fast' | 'translate' | 'embedding' | 'imageGenerate' | 'imageEdit' | 'videoGenerate'): Promise<DefaultModelRef> {
    return defaultModels.value[type]
  }
  
  return {
    // State
    providers,
    scenarios,
    promptLibraryEntries,
    promptLibraryCreateRequest,
    defaultModels,
    isInitialized,
    isLoading,
    modelFavorites,
    systemLocale,
    languagePreference,
    resolvedLanguage,
    localModelRuntimes,
    sessionPreferences,
    proxySettings,
    appBehaviorSettings,
    
    // Computed
    enabledProviders,
    defaultModel,
    aiDevToolsEnabled,
    
    // Actions
    initialize,
    refresh,
    loadProviders,
    loadAppLanguage,
    
    // Provider CRUD
    upsertProvider,
    createCustomProvider,
    updateCustomProvider,
    deleteProvider,
    testProvider,
    regenerateLocalProviderApiKey,
    listLocalModelRuntimes,
    refreshLocalModelRuntimes,
    startLocalModelRuntimePolling,
    stopLocalModelRuntimePolling,
    getLocalModelRuntime,
    isProviderModelSelectable,
    downloadLocalModel,
    cancelLocalModelDownload,
    loadLocalModel,
    unloadLocalModel,
    addModelToCommon,
    removeModelFromCommon,
    getModelDetails,
    updateModelDetails,
    resetModel,
    
    // Scenario CRUD
    createScenario,
    updateScenario,
    deleteScenario,
    loadPromptLibrary,
    setPromptLibraryCreateRequest,
    takePromptLibraryCreateRequest,
    createPromptLibraryEntry,
    updatePromptLibraryEntry,
    deletePromptLibraryEntry,
    
    // Default Models
    setDefaultModel,
    setAiDevToolsEnabled,
    setSessionPreferences,
    setProxySettings,
    setAppBehaviorSettings,
    setAppLanguage,
    openAiDevToolsViewer,
    getDefaultModelByType,
    loadModelFavorites,
    isModelFavorite,
    setModelFavorite,
    toggleModelFavorite,
    
  }
})
