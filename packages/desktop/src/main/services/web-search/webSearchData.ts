/**
 * Web Search 配置数据层
 * 使用 settings 表存储配置
 */

import { getDb } from '../db';
import { loggerServiceMain, resolveSystemLocale } from '@shared';
import type { SearchProvider } from './types';
import { tMain } from '../../i18n';
import { getSystemLocale } from '../../i18n/systemLocale';

const logger = loggerServiceMain.withContext('WebSearchData');

const KEY_WEB_SEARCH_CONFIG = 'webSearch:config';
const KEY_WEB_SEARCH_PROVIDERS = 'webSearch:providers';
const KEY_WEB_SEARCH_ACTIVE_PROVIDER = 'webSearch:activeProvider';
const KEY_AI_SEARCH_CONFIG = 'aiSearch:config';
const KEY_AI_SEARCH_HISTORY = 'aiSearch:history';
const AI_SEARCH_HISTORY_LIMIT = 100;

/**
 * 搜索结果处理模式
 */
export type ProcessMode = 'rag' | 'truncate';
export type SearchTimeRange = 'none' | 'day' | 'month' | 'year';

export const DEFAULT_SELECTED_ENGINES = [
  'google',
  'duckduckgo',
  'bing',
];

export const DEFAULT_ZH_CN_SELECTED_ENGINES = [
  'bing',
  'sogou',
  '360search',
];

/**
 * 网络搜索配置
 */
export interface WebSearchConfig {
  /** 搜索结果数量，1-30，默认 5 */
  resultLimit: number;
  /** 内置 SearXNG 选择的引擎列表 */
  selectedEngines: string[];
  /** 时间范围（none / day / month / year） */
  timeRange: SearchTimeRange;
  /** 安全搜索等级（0/1/2） */
  safeSearch: 0 | 1 | 2;
  /** 搜索阶段超时（秒），1-60，默认 10 */
  searchTimeout: number;
  /** 单页抓取超时（秒），1-60，默认 15 */
  fetchTimeout: number;
  /** 并发页面池大小，1-10，默认 5 */
  pagePoolSize: number;
  
  // ===== 搜索结果处理 =====
  /** 处理模式：rag 或 truncate，默认 rag */
  processMode: ProcessMode;
  /** 嵌入模型，格式 'providerId::modelId'，'__default__' 表示使用默认嵌入模型 */
  embeddingModel: string;
  /** 嵌入维度，null 表示使用模型默认维度 */
  embeddingDimension: number | null;
  /** RAG 模式：最终返回给 LLM 的 chunk 数量，默认 8 */
  ragTopN: number;
  /** 内容截断长度（截断模式使用），null 表示不截断，默认 2000 */
  contentMaxLength: number | null;
}

export interface AiSearchConfig {
  /** providerId::modelId，__default__ 表示默认通用模型，空字符串表示不使用 AI 增强 */
  model: string;
  /** AI 多关键词搜索时，每个关键词请求的候选结果数 */
  perQueryLimit: number;
  /** 聚合去重后最多返回给智搜页面的结果数 */
  maxResults: number;
  /** 前端每批展示的结果数 */
  pageSize: number;
}

const DEFAULT_AI_SEARCH_CONFIG: Omit<AiSearchConfig, 'model'> = {
  perQueryLimit: 20,
  maxResults: 50,
  pageSize: 15,
};

/**
 * 默认配置
 */
export const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
  resultLimit: 10,
  selectedEngines: [...DEFAULT_SELECTED_ENGINES],
  timeRange: 'none',
  safeSearch: 0,
  searchTimeout: 15,
  fetchTimeout: 15,
  pagePoolSize: 5,
  // 搜索结果处理
  processMode: 'truncate',
  embeddingModel: '__default__',
  embeddingDimension: null,
  ragTopN: 8,
  contentMaxLength: 2000,
};

export function resolveDefaultSelectedEngines(systemLocale = getSystemLocale()): string[] {
  return resolveSystemLocale(systemLocale) === 'zh-CN'
    ? [...DEFAULT_ZH_CN_SELECTED_ENGINES]
    : [...DEFAULT_SELECTED_ENGINES];
}

function resolveDefaultAiSearchModel(): string {
  return '__default__';
}

function normalizeAiSearchConfig(input: unknown): AiSearchConfig {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const perQueryLimit = Number(source.perQueryLimit ?? DEFAULT_AI_SEARCH_CONFIG.perQueryLimit);
  const maxResults = Number(source.maxResults ?? DEFAULT_AI_SEARCH_CONFIG.maxResults);
  const pageSize = Number(source.pageSize ?? DEFAULT_AI_SEARCH_CONFIG.pageSize);

  return {
    model: typeof source.model === 'string' ? source.model.trim() : resolveDefaultAiSearchModel(),
    perQueryLimit: Math.max(5, Math.min(50, Number.isFinite(perQueryLimit) ? Math.round(perQueryLimit) : DEFAULT_AI_SEARCH_CONFIG.perQueryLimit)),
    maxResults: Math.max(20, Math.min(100, Number.isFinite(maxResults) ? Math.round(maxResults) : DEFAULT_AI_SEARCH_CONFIG.maxResults)),
    pageSize: Math.max(5, Math.min(30, Number.isFinite(pageSize) ? Math.round(pageSize) : DEFAULT_AI_SEARCH_CONFIG.pageSize)),
  };
}

export function createDefaultWebSearchConfig(systemLocale?: string | null): WebSearchConfig {
  return {
    ...DEFAULT_WEB_SEARCH_CONFIG,
    selectedEngines: resolveDefaultSelectedEngines(systemLocale ?? undefined),
  };
}

export function ensureWebSearchConfig(): WebSearchConfig {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_WEB_SEARCH_CONFIG) as { value: string } | undefined;
  if (row) {
    return getWebSearchConfig();
  }
  const initial = createDefaultWebSearchConfig();
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_WEB_SEARCH_CONFIG, JSON.stringify(initial));
  return initial;
}

/**
 * 获取配置
 */
export function getWebSearchConfig(): WebSearchConfig {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_WEB_SEARCH_CONFIG) as { value: string } | undefined;
  
  if (!row) {
    return createDefaultWebSearchConfig();
  }
  
  try {
    const parsed = JSON.parse(row.value);
    const selectedEngines = Array.isArray(parsed.selectedEngines)
      ? Array.from(
        new Set<string>(
          parsed.selectedEngines
            .filter((item: unknown): item is string => typeof item === 'string')
            .map((item: string) => item.trim())
            .filter(Boolean)
        )
      )
      : resolveDefaultSelectedEngines();
    return {
      resultLimit: parsed.resultLimit ?? DEFAULT_WEB_SEARCH_CONFIG.resultLimit,
      selectedEngines: selectedEngines.length > 0 ? selectedEngines : resolveDefaultSelectedEngines(),
      timeRange: parsed.timeRange ?? DEFAULT_WEB_SEARCH_CONFIG.timeRange,
      safeSearch: parsed.safeSearch ?? DEFAULT_WEB_SEARCH_CONFIG.safeSearch,
      searchTimeout: parsed.searchTimeout ?? DEFAULT_WEB_SEARCH_CONFIG.searchTimeout,
      fetchTimeout: parsed.fetchTimeout ?? DEFAULT_WEB_SEARCH_CONFIG.fetchTimeout,
      pagePoolSize: parsed.pagePoolSize ?? DEFAULT_WEB_SEARCH_CONFIG.pagePoolSize,
      // 搜索结果处理
      processMode: parsed.processMode ?? DEFAULT_WEB_SEARCH_CONFIG.processMode,
      embeddingModel: parsed.embeddingModel ?? DEFAULT_WEB_SEARCH_CONFIG.embeddingModel,
      embeddingDimension: parsed.embeddingDimension ?? DEFAULT_WEB_SEARCH_CONFIG.embeddingDimension,
      ragTopN: parsed.ragTopN ?? DEFAULT_WEB_SEARCH_CONFIG.ragTopN,
      contentMaxLength: parsed.contentMaxLength ?? DEFAULT_WEB_SEARCH_CONFIG.contentMaxLength,
    };
  } catch {
    return createDefaultWebSearchConfig();
  }
}

/**
 * 保存配置
 */
export function setWebSearchConfig(config: Partial<WebSearchConfig>): WebSearchConfig {
  logger.info('setWebSearchConfig called', { input: config });
  
  const db = getDb();
  
  // 合并现有配置
  const current = getWebSearchConfig();
  const merged: WebSearchConfig = {
    ...current,
    ...config,
  };
  
  // 验证范围（内置搜索按该范围限制返回条数）
  merged.resultLimit = Math.max(1, Math.min(30, merged.resultLimit));
  merged.selectedEngines = Array.from(
    new Set(
      (Array.isArray(merged.selectedEngines) ? merged.selectedEngines : [])
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
  // 至少保留一个引擎
  if (merged.selectedEngines.length === 0) {
    merged.selectedEngines = current.selectedEngines.length > 0
      ? [...current.selectedEngines]
      : resolveDefaultSelectedEngines();
  }
  if (!['none', 'day', 'month', 'year'].includes(merged.timeRange)) {
    merged.timeRange = 'none';
  }
  if (![0, 1, 2].includes(merged.safeSearch)) {
    merged.safeSearch = 0;
  }
  merged.searchTimeout = Math.max(1, Math.min(60, merged.searchTimeout));
  merged.fetchTimeout = Math.max(1, Math.min(60, merged.fetchTimeout));
  merged.pagePoolSize = Math.max(1, Math.min(10, merged.pagePoolSize));
  
  // 验证处理模式
  if (merged.processMode !== 'rag' && merged.processMode !== 'truncate') {
    merged.processMode = 'rag';
  }
  
  // 验证嵌入维度
  if (merged.embeddingDimension !== null) {
    merged.embeddingDimension = Math.max(1, merged.embeddingDimension);
  }
  
  // 验证 RAG topN（1-20）
  merged.ragTopN = Math.max(1, Math.min(20, merged.ragTopN));
  
  // 验证截断长度
  if (merged.contentMaxLength !== null) {
    merged.contentMaxLength = Math.max(500, merged.contentMaxLength);
  }
  
  const value = JSON.stringify(merged);
  logger.info('Saving web search config', { key: KEY_WEB_SEARCH_CONFIG, value });
  
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_WEB_SEARCH_CONFIG, value);
  
  logger.info('Web search config saved successfully');
  return merged;
}

export function getAiSearchConfig(): AiSearchConfig {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_AI_SEARCH_CONFIG) as { value: string } | undefined;
  if (!row?.value) return normalizeAiSearchConfig({});
  try {
    return normalizeAiSearchConfig(JSON.parse(row.value));
  } catch {
    return normalizeAiSearchConfig({});
  }
}

export function setAiSearchConfig(config: Partial<AiSearchConfig>): AiSearchConfig {
  const db = getDb();
  const current = getAiSearchConfig();
  const merged = normalizeAiSearchConfig({ ...current, ...(config || {}) });
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_AI_SEARCH_CONFIG, JSON.stringify(merged));
  return merged;
}

export function listAiSearchHistory(): string[] {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_AI_SEARCH_HISTORY) as { value: string } | undefined;
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, AI_SEARCH_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function addAiSearchHistoryKeyword(keyword: string): string[] {
  const normalized = keyword.trim().replace(/\s+/g, ' ');
  if (!normalized) return listAiSearchHistory();
  const current = listAiSearchHistory();
  const next = [normalized, ...current.filter((item) => item !== normalized)].slice(0, AI_SEARCH_HISTORY_LIMIT);
  const db = getDb();
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_AI_SEARCH_HISTORY, JSON.stringify(next));
  return next;
}

export function deleteAiSearchHistoryKeyword(keyword: string): string[] {
  const normalized = keyword.trim().replace(/\s+/g, ' ');
  if (!normalized) return listAiSearchHistory();
  const next = listAiSearchHistory().filter((item) => item !== normalized);
  const db = getDb();
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_AI_SEARCH_HISTORY, JSON.stringify(next));
  return next;
}

export function clearAiSearchHistory(): void {
  const db = getDb();
  db.prepare(`DELETE FROM settings WHERE key = ?`).run(KEY_AI_SEARCH_HISTORY);
}

// ==================== 搜索服务提供者管理 ====================

/**
 * 内置免费搜索服务（固定存在，不可删除）
 */
function getBuiltinProvider(): SearchProvider {
  return {
    id: 'builtin',
    type: 'builtin',
    name: tMain('search.builtinProvider'),
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

/**
 * 获取所有搜索服务提供者
 */
export function listSearchProviders(): SearchProvider[] {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_WEB_SEARCH_PROVIDERS) as { value: string } | undefined;
  
  // 始终包含内置服务
  const providers: SearchProvider[] = [getBuiltinProvider()];
  
  if (row) {
    try {
      const saved = JSON.parse(row.value) as SearchProvider[];
      providers.push(...saved);
    } catch {
      // 解析失败，返回只有内置服务
    }
  }
  
  return providers;
}

/**
 * 获取单个搜索服务提供者
 */
export function getSearchProvider(id: string): SearchProvider | undefined {
  if (id === 'builtin') {
    return getBuiltinProvider();
  }
  
  const providers = listSearchProviders();
  return providers.find(p => p.id === id);
}

/**
 * 添加搜索服务提供者
 */
export function addSearchProvider(provider: Omit<SearchProvider, 'id' | 'createdAt' | 'updatedAt'>): SearchProvider {
  const db = getDb();
  const now = Date.now();
  
  const newProvider: SearchProvider = {
    ...provider,
    id: `provider_${now}_${Math.random().toString(36).substring(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  
  // 获取现有提供者（不包括内置）
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_WEB_SEARCH_PROVIDERS) as { value: string } | undefined;
  const existing: SearchProvider[] = row ? JSON.parse(row.value) : [];
  
  existing.push(newProvider);
  
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_WEB_SEARCH_PROVIDERS, JSON.stringify(existing));
  
  logger.info('Search provider added', { id: newProvider.id, name: newProvider.name });
  return newProvider;
}

/**
 * 更新搜索服务提供者
 */
export function updateSearchProvider(id: string, data: Partial<SearchProvider>): SearchProvider | undefined {
  if (id === 'builtin') {
    logger.warn('Cannot update builtin provider');
    return getBuiltinProvider();
  }
  
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_WEB_SEARCH_PROVIDERS) as { value: string } | undefined;
  
  if (!row) {
    return undefined;
  }
  
  const providers: SearchProvider[] = JSON.parse(row.value);
  const index = providers.findIndex(p => p.id === id);
  
  if (index === -1) {
    return undefined;
  }
  
  // 更新
  providers[index] = {
    ...providers[index],
    ...data,
    id, // 确保 id 不被修改
    updatedAt: Date.now(),
  };
  
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_WEB_SEARCH_PROVIDERS, JSON.stringify(providers));
  
  logger.info('Search provider updated', { id, name: providers[index].name });
  return providers[index];
}

/**
 * 删除搜索服务提供者
 */
export function deleteSearchProvider(id: string): boolean {
  if (id === 'builtin') {
    logger.warn('Cannot delete builtin provider');
    return false;
  }
  
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_WEB_SEARCH_PROVIDERS) as { value: string } | undefined;
  
  if (!row) {
    return false;
  }
  
  const providers: SearchProvider[] = JSON.parse(row.value);
  const filtered = providers.filter(p => p.id !== id);
  
  if (filtered.length === providers.length) {
    return false;
  }
  
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_WEB_SEARCH_PROVIDERS, JSON.stringify(filtered));
  
  // 如果删除的是当前激活的提供者，重置为内置
  const activeId = getActiveProviderId();
  if (activeId === id) {
    setActiveProviderId('builtin');
  }
  
  logger.info('Search provider deleted', { id });
  return true;
}

/**
 * 获取当前激活的搜索服务提供者 ID
 */
export function getActiveProviderId(): string {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_WEB_SEARCH_ACTIVE_PROVIDER) as { value: string } | undefined;
  
  if (!row) {
    return 'builtin';
  }
  
  try {
    const id = JSON.parse(row.value);
    // 验证 provider 是否存在
    const provider = getSearchProvider(id);
    return provider ? id : 'builtin';
  } catch {
    return 'builtin';
  }
}

/**
 * 设置当前激活的搜索服务提供者 ID
 */
export function setActiveProviderId(id: string): void {
  const db = getDb();
  
  // 验证 provider 是否存在
  const provider = getSearchProvider(id);
  if (!provider) {
    logger.warn('Provider not found, using builtin', { id });
    id = 'builtin';
  }
  
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_WEB_SEARCH_ACTIVE_PROVIDER, JSON.stringify(id));
  
  logger.info('Active provider set', { id });
}

/**
 * 获取当前激活的搜索服务提供者
 */
export function getActiveProvider(): SearchProvider {
  const id = getActiveProviderId();
  return getSearchProvider(id) || getBuiltinProvider();
}
