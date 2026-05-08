/**
 * Web Search Service
 * 提供 web 搜索和网页内容获取功能
 * 
 * 使用 PagePool 实现并行页面抓取
 * 支持 RAG 模式（语义检索）和截断模式
 */

import { searxngEngine } from './engines/SearxngEngine';
import { createCustomEngine, type CustomSearchResultItem } from './engines/CustomEngine';
import { fetchPageContent as fetchPage, type PageContentFormat } from './PageFetcher';
import {
  DEFAULT_WEB_SEARCH_CONFIG,
  getActiveProvider,
  getSearchProvider,
  setWebSearchConfig,
  ensureWebSearchConfig,
  resolveDefaultSelectedEngines,
  type WebSearchConfig
} from './webSearchData';
import { destroyPagePool } from './PagePool';
import { chunkText } from './chunking';
import { MemoryVectorStore, batchEmbed, RETRIEVAL_TOP_K, MAX_CHUNKS_PER_URL, EMBED_BATCH_SIZE } from './vectorSearch';
import { getDefaultModelByType, getAppLanguagePreference } from '../settings/settingsData';
import { embed, embedMany, generateText, type ModelMessage } from 'ai';
import { getEmbeddingModel } from '../providers/llmProviderFactory';
import { resolveModelInvocation } from '../providers/modelInvocation';
import type { 
  SearchResult, 
  SearchWithContentResult,
  SearchWithContentSuccessResult,
  SearchResultWithContent,
  FetchPageResult, 
  SearchResultItem,
  RagStats,
  SearchProvider
} from './types';
import type { BuiltinSearchEngineOption } from './engines/SearxngEngine';
import { loggerServiceMain, resolveAppLocale } from '@shared';
import { tMain } from '../../i18n';
import { getSystemLocale } from '../../i18n/systemLocale';
import { generateSearchPlan } from './searchPlannerService';

const logger = loggerServiceMain.withContext('WebSearchService');

function resolveSearchLanguageByLocale(): 'auto' | 'zh-CN' | 'en' {
  const locale = resolveAppLocale(getAppLanguagePreference(), getSystemLocale());
  if (locale === 'en') return 'en';
  if (locale === 'zh-CN' || locale === 'zh-TW') return 'zh-CN';
  return 'auto';
}

/**
 * 获取当前配置
 */
function getConfig() {
  try {
    return ensureWebSearchConfig();
  } catch {
    // 数据库未初始化时使用默认配置
    return DEFAULT_WEB_SEARCH_CONFIG;
  }
}

type RawPlannedSearchResult = SearchResultItem & {
  content?: string;
};

type SearchPlanQueryStat = {
  query: string;
  resultCount: number;
};

type SearchPlanMeta = {
  request: string;
  queries: SearchPlanQueryStat[];
  plannerModel: string;
  rawResultCount: number;
  uniqueUrlCount: number;
  fetchedCount: number;
};

type SearchByRequestResult =
  | (SearchWithContentSuccessResult & { plan: SearchPlanMeta })
  | { success: false; error: string };

type AiSearchResult =
  | {
      success: true;
      source: string;
      results: SearchResultItem[];
      searchDuration: number;
      duration: number;
      plan?: SearchPlanMeta;
      summary?: string | null;
      aiEnabled: boolean;
    }
  | { success: false; error: string };

// ==================== Embedding 辅助函数 ====================

/**
 * 解析嵌入模型配置
 * @param embeddingModel 配置中的嵌入模型，格式 'providerId::modelId' 或 '__default__'（使用默认）
 */
function parseEmbeddingModel(embeddingModel: string): { providerId: string; modelId: string } {
  if (embeddingModel === '__default__') {
    const defaultModel = getDefaultModelByType('embedding');
    if (!defaultModel?.providerId || !defaultModel?.modelId) {
      throw new Error(tMain('embedding.defaultModelMissing'));
    }
    return { providerId: defaultModel.providerId, modelId: defaultModel.modelId };
  }
  
  // 解析 'providerId::modelId' 格式
  const [providerId, modelId] = embeddingModel.split('::');
  if (!providerId || !modelId) {
    throw new Error(tMain('embedding.invalidModelFormat'));
  }
  
  return { providerId, modelId };
}

/**
 * 获取 embedding 客户端配置
 * 统一处理官方 Provider 和第三方 Provider 的差异
 */
function getEmbeddingClientConfig(
  embeddingModelConfig: string,
  embeddingDimension: number | null
): {
  providerId: string;
  modelId: string;
  client: ReturnType<typeof resolveModelInvocation>["client"];
  providerOptions: Record<string, { dimensions: number }> | undefined;
} {
  const { providerId, modelId } = parseEmbeddingModel(embeddingModelConfig);
  const { client } = resolveModelInvocation({ providerId, modelId });

  const providerOptions =
    embeddingDimension !== null
      ? { [providerId]: { dimensions: embeddingDimension } }
      : undefined;

  return { providerId, modelId, client, providerOptions };
}

/**
 * 批量生成 embedding
 */
async function embedTexts(
  texts: string[],
  embeddingModelConfig: string,
  embeddingDimension: number | null
): Promise<number[][]> {
  const { modelId, client, providerOptions } = getEmbeddingClientConfig(embeddingModelConfig, embeddingDimension);
  
  return batchEmbed(texts, async (batch) => {
    const { embeddings } = await embedMany({
      model: getEmbeddingModel(client, modelId),
      values: batch,
      providerOptions
    });
    return embeddings;
  }, EMBED_BATCH_SIZE);
}

/**
 * 生成单个文本的 embedding
 */
async function embedText(
  text: string,
  embeddingModelConfig: string,
  embeddingDimension: number | null
): Promise<number[]> {
  const { modelId, client, providerOptions } = getEmbeddingClientConfig(embeddingModelConfig, embeddingDimension);
  
  const { embedding } = await embed({
    model: getEmbeddingModel(client, modelId),
    value: text,
    providerOptions
  });
  
  return embedding;
}

class WebSearchService {
  async getConfigForSettings(): Promise<WebSearchConfig> {
    const config = ensureWebSearchConfig();

    let availableEngineNames: string[];
    try {
      const engines = await this.listBuiltinSearchEngines();
      availableEngineNames = engines.map((item) => item.name).filter(Boolean);
    } catch (error) {
      logger.warn('Failed to list builtin engines when loading config, using DB config directly', {
        error: error instanceof Error ? error.message : String(error),
      });
      return config;
    }

    if (availableEngineNames.length === 0) {
      return config;
    }

    const availableEngineSet = new Set(availableEngineNames);
    const normalizedSelectedEngines = Array.from(
      new Set(
        (Array.isArray(config.selectedEngines) ? config.selectedEngines : [])
          .filter((name): name is string => typeof name === 'string')
          .map((name) => name.trim())
          .filter((name) => name.length > 0 && availableEngineSet.has(name))
      )
    );

    const fallbackSelectedEngines = resolveDefaultSelectedEngines().filter((name) => availableEngineSet.has(name));
    const finalSelectedEngines = normalizedSelectedEngines.length > 0
      ? normalizedSelectedEngines
      : fallbackSelectedEngines.length > 0
        ? fallbackSelectedEngines
        : [availableEngineNames[0]];

    if (this.areStringArraysEqual(config.selectedEngines, finalSelectedEngines)) {
      return config;
    }

    return setWebSearchConfig({ selectedEngines: finalSelectedEngines });
  }

  /**
   * 搜索
   * 使用内置 SearXNG 搜索引擎
   */
  async search(query: string, limit: number = 5): Promise<SearchResult> {
    logger.info('Starting web search', { query, limit });
    
    const startTime = Date.now();
    const config = getConfig();
    
    try {
      const results = await searxngEngine.search(query, limit, {
        language: resolveSearchLanguageByLocale(),
        timeRange: config.timeRange,
        safeSearch: config.safeSearch,
        engines: config.selectedEngines,
      });
      const duration = Date.now() - startTime;
      
      if (results && results.length > 0) {
        logger.info('SearXNG search completed', {
          query,
          resultCount: results.length,
          duration
        });
        return {
          success: true,
          source: 'searxng',
          results
        };
      }
      
      // 没有结果
      logger.warn('SearXNG search returned no results', { query, duration });
      return {
        success: false,
        error: tMain("search.noResults")
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('SearXNG search failed', {
        query, 
        error: error instanceof Error ? error.message : String(error),
        duration 
      });
      return {
        success: false,
        error: tMain("search.searchFailed", { message: error instanceof Error ? error.message : String(error) })
      };
    }
  }

  async listBuiltinSearchEngines(): Promise<BuiltinSearchEngineOption[]> {
    return searxngEngine.listWebSearchEngines();
  }

  private areStringArraysEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    return left.every((item, index) => item === right[index]);
  }
  
  /**
   * 使用第三方搜索服务搜索
   */
  private async searchWithProvider(
    provider: SearchProvider,
    query: string,
    timeout: number,
    abortSignal?: AbortSignal
  ): Promise<{ results: CustomSearchResultItem[]; source: string } | { error: string }> {
    try {
      const engine = createCustomEngine(provider);
      const results = await engine.searchWithContent(query, timeout, abortSignal);
      return {
        results,
        source: provider.name,
      };
    } catch (error) {
      logger.error('Third-party search failed', {
        provider: provider.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        error: tMain("search.providerSearchFailed", {
          providerName: provider.name,
          message: error instanceof Error ? error.message : String(error)
        }),
      };
    }
  }
  
  /**
   * 搜索并获取内容
   * 获取搜索结果后，并行抓取每个结果的正文内容
   * 
   * 两种处理模式：
   * - truncate: 直接截断内容
   * - rag: 边抓取边处理（切片 + 向量化），最后统一召回
   * 
   * @param query 搜索关键词
   * @param limit 结果数量限制
   * @param providerId 指定使用的搜索服务提供者 ID（可选，默认使用全局激活的）
   */
  async searchWithContent(
    query: string,
    limit?: number,
    providerId?: string,
    abortSignal?: AbortSignal
  ): Promise<SearchWithContentResult> {
    return this.searchWithContentInternal(query, limit, providerId, abortSignal, false, false);
  }

  async searchWithContentForTest(
    query: string,
    limit?: number,
    providerId?: string,
    abortSignal?: AbortSignal
  ): Promise<SearchWithContentResult> {
    return this.searchWithContentInternal(query, limit, providerId, abortSignal, true, true);
  }

  async searchByRequest(
    request: string,
    providerId?: string,
    abortSignal?: AbortSignal,
    plannerModelRef?: string
  ): Promise<SearchByRequestResult> {
    const normalizedRequest = request.trim();
    const planResult = await generateSearchPlan({
      request: normalizedRequest,
      modelRefs: plannerModelRef ? [plannerModelRef] : [],
    });

    if (planResult.ok === false) {
      logger.info('Search plan unavailable, falling back to single query', {
        request: normalizedRequest,
        error: planResult.error,
      });
      return this.searchWithPlannedQueries({
        request: normalizedRequest,
        queries: [normalizedRequest],
        plannerModel: 'single-query',
        providerId,
        abortSignal,
      });
    }

    return this.searchWithPlannedQueries({
      request: normalizedRequest,
      queries: planResult.data.queries,
      plannerModel: planResult.data.plannerModel,
      providerId,
      abortSignal,
    });
  }

  async aiSearch(params: {
    query: string;
    modelRef?: string | null;
    perQueryLimit?: number;
    maxResults?: number;
    abortSignal?: AbortSignal;
  }): Promise<AiSearchResult> {
    const searchResult = await this.aiSearchResults(params);
    if (searchResult.success === false) return searchResult;

    const modelRef = typeof params.modelRef === 'string' ? params.modelRef.trim() : '';
    const summary = searchResult.aiEnabled
      ? await this.summarizeAiSearchSnippets({
          query: params.query.trim(),
          results: searchResult.results,
          modelRef,
          abortSignal: params.abortSignal,
        })
      : null;

    return {
      ...searchResult,
      summary,
    };
  }

  async aiSearchResults(params: {
    query: string;
    modelRef?: string | null;
    perQueryLimit?: number;
    maxResults?: number;
    abortSignal?: AbortSignal;
  }): Promise<AiSearchResult> {
    const query = params.query.trim();
    if (!query) {
      return { success: false, error: tMain("common.missingField", { field: "query" }) };
    }
    if (params.abortSignal?.aborted) {
      return { success: false, error: tMain("common.cancelled") };
    }

    const modelRef = typeof params.modelRef === 'string' ? params.modelRef.trim() : '';
    const perQueryLimit = Math.max(5, Math.min(50, Math.round(params.perQueryLimit ?? 20)));
    const maxResults = Math.max(20, Math.min(100, Math.round(params.maxResults ?? 50)));
    const planResult = modelRef
      ? await generateSearchPlan({
          request: query,
          modelRefs: [modelRef],
          useDefaultFallbacks: false,
          abortSignal: params.abortSignal,
        })
      : { ok: false as const, error: 'model-not-configured' };

    if (params.abortSignal?.aborted) {
      return { success: false, error: tMain("common.cancelled") };
    }

    const aiEnabled = planResult.ok === true;
    const searchResult = await this.searchPlannedResultsOnly({
      request: query,
      queries: aiEnabled ? planResult.data.queries : [query],
      plannerModel: aiEnabled ? planResult.data.plannerModel : 'single-query',
      perQueryLimit: aiEnabled ? perQueryLimit : maxResults,
      maxResults,
      abortSignal: params.abortSignal,
    });

    if (searchResult.success === false) return searchResult;

    return {
      ...searchResult,
      summary: null,
      aiEnabled,
    };
  }

  private async searchPlannedResultsOnly(params: {
    request: string;
    queries: string[];
    plannerModel: string;
    perQueryLimit: number;
    maxResults: number;
    abortSignal?: AbortSignal;
  }): Promise<AiSearchResult> {
    const { request, queries, plannerModel, perQueryLimit, maxResults } = params;
    const config = getConfig();
    const source = 'searxng';
    const searchStartTime = Date.now();

    const queryResults = await Promise.allSettled(
      queries.map(async (query): Promise<{ query: string; results: RawPlannedSearchResult[] }> => {
        const results = await searxngEngine.search(query, perQueryLimit, {
          language: resolveSearchLanguageByLocale(),
          timeRange: config.timeRange,
          safeSearch: config.safeSearch,
          engines: config.selectedEngines,
          maxPages: Math.ceil(perQueryLimit / 10),
          abortSignal: params.abortSignal,
        });
        return { query, results };
      })
    );

    const queryStats: SearchPlanQueryStat[] = [];
    const rawResults: RawPlannedSearchResult[] = [];
    let firstError: string | null = null;

    for (let index = 0; index < queryResults.length; index += 1) {
      const settled = queryResults[index];
      const fallbackQuery = queries[index];

      if (settled.status === 'fulfilled') {
        queryStats.push({
          query: settled.value.query,
          resultCount: settled.value.results.length,
        });
        rawResults.push(...settled.value.results);
        continue;
      }

      queryStats.push({ query: fallbackQuery, resultCount: 0 });
      if (!firstError) {
        firstError = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
      }
    }

    if (rawResults.length === 0) {
      return {
        success: false,
        error: firstError || tMain("search.noResults"),
      };
    }

    const uniqueResults = this.dedupeRawResults(rawResults).slice(0, maxResults);
    if (uniqueResults.length === 0) {
      return { success: false, error: tMain("search.noResults") };
    }

    const searchDuration = Date.now() - searchStartTime;
    return {
      success: true,
      source,
      results: uniqueResults.map((item) => ({
        title: item.title,
        url: item.url,
        ...(item.snippet ? { snippet: item.snippet } : {}),
      })),
      searchDuration,
      duration: Date.now() - searchStartTime,
      aiEnabled: plannerModel !== 'single-query',
      plan: {
        request,
        queries: queryStats,
        plannerModel,
        rawResultCount: rawResults.length,
        uniqueUrlCount: uniqueResults.length,
        fetchedCount: 0,
      },
    };
  }

  async summarizeAiSearchSnippets(params: {
    query: string;
    results: SearchResultItem[];
    modelRef: string;
    abortSignal?: AbortSignal;
  }): Promise<string | null> {
    let client: ReturnType<typeof resolveModelInvocation>["client"];
    let providerId = '';
    let modelId = '';
    try {
      const resolved = resolveModelInvocation({
        modelRef: params.modelRef,
        defaultModel: params.modelRef === '__default__' ? getDefaultModelByType('general') : undefined,
      });
      client = resolved.client;
      providerId = resolved.providerId;
      modelId = resolved.modelId;
    } catch (error) {
      logger.info('AI search summary model unavailable', {
        modelRef: params.modelRef,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    const sourceText = params.results
      .slice(0, 10)
      .map((item, index) => {
        const lines = [
          `[${index + 1}] ${item.title}`,
          item.url,
          item.snippet ? `Snippet: ${item.snippet}` : '',
        ].filter(Boolean);
        return lines.join('\n');
      })
      .join('\n\n');

    if (!sourceText.trim()) return null;

    const messages: ModelMessage[] = [
      {
        role: 'system',
        content: [
          'You summarize search results for a desktop search view.',
          'Use the same language as the user query when natural.',
          'Base the summary only on the provided result titles, URLs, and snippets.',
          'Do not invent facts that are not present in the search results.',
          'If the snippets are insufficient, say that the available information is limited.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `User query: ${params.query}\n\nSearch results:\n${sourceText}`,
      },
    ];

    try {
      const { text } = await generateText({
        model: client(modelId),
        messages,
        temperature: 0.2,
        maxOutputTokens: 800,
        abortSignal: params.abortSignal,
        providerOptions: {
          [providerId]: { think: { type: 'disable' as const } },
        },
      });
      return (text ?? '').trim() || null;
    } catch (error) {
      logger.info('AI search summary failed', {
        modelRef: params.modelRef,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async searchWithPlannedQueries(params: {
    request: string;
    queries: string[];
    plannerModel: string;
    providerId?: string;
    abortSignal?: AbortSignal;
  }): Promise<SearchByRequestResult> {
    const { request, queries, plannerModel, providerId, abortSignal } = params;
    const config = getConfig();
    const processMode = config.processMode;
    const contentMaxLength = config.contentMaxLength;
    const searchTimeout = config.searchTimeout * 1000;
    const fetchTimeout = config.fetchTimeout * 1000;
    const provider = providerId ? getSearchProvider(providerId) : getActiveProvider();
    const isBuiltin = !provider || provider.type === 'builtin';
    const source = isBuiltin ? 'searxng' : provider!.name;
    const searchStartTime = Date.now();

    const queryResults = await Promise.allSettled(
      queries.map(async (query): Promise<{ query: string; results: RawPlannedSearchResult[] }> => {
        if (isBuiltin) {
          const result = await this.search(query, config.resultLimit);
          if (result.success === false) {
            throw new Error(result.error);
          }
          return { query, results: result.results };
        }

        const result = await this.searchWithProvider(provider!, query, searchTimeout, abortSignal);
        if ('error' in result) {
          throw new Error(result.error);
        }
        return {
          query,
          results: result.results.map((item) => ({
            title: item.title,
            url: item.url,
            content: item.content,
          })),
        };
      })
    );

    const queryStats: SearchPlanQueryStat[] = [];
    const rawResults: RawPlannedSearchResult[] = [];
    let firstError: string | null = null;

    for (let index = 0; index < queryResults.length; index += 1) {
      const settled = queryResults[index];
      const fallbackQuery = queries[index];

      if (settled.status === 'fulfilled') {
        queryStats.push({
          query: settled.value.query,
          resultCount: settled.value.results.length,
        });
        rawResults.push(...settled.value.results);
        continue;
      }

      queryStats.push({
        query: fallbackQuery,
        resultCount: 0,
      });
      if (!firstError) {
        firstError = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
      }
    }

    if (rawResults.length === 0) {
      return {
        success: false,
        error: firstError || tMain("search.noResults"),
      };
    }

    const uniqueResults = this.dedupeRawResults(rawResults);
    if (uniqueResults.length === 0) {
      return {
        success: false,
        error: tMain("search.noResults"),
      };
    }

    const searchDuration = Date.now() - searchStartTime;
    let finalResults: SearchResultWithContent[];
    let ragStats: RagStats | undefined;

    if (processMode === 'rag' && uniqueResults.every((item) => !item.content || item.content.length === 0)) {
      const ragResult = await this.processWithRAGStreaming(
        request,
        uniqueResults.map(({ title, url }) => ({ title, url })),
        rawResults.length,
        fetchTimeout,
        config,
        abortSignal
      );
      finalResults = ragResult.results;
      ragStats = ragResult.stats ?? undefined;
    } else {
      const contentfulResults = uniqueResults
        .filter((item) => item.content && item.content.trim().length > 0)
        .map((item) => ({
          title: item.title,
          url: item.url,
          content: item.content!.trim(),
          truncated: false,
          fetchSuccess: true,
          fetchDuration: 0,
        }));
      const missingContentItems = uniqueResults
        .filter((item) => !item.content || item.content.trim().length === 0)
        .map((item) => ({ title: item.title, url: item.url }));
      const fetchedResults = missingContentItems.length > 0
        ? await this.fetchAllContent(missingContentItems, fetchTimeout, null, abortSignal)
        : [];
      const mergedResults = this.sortResultsByRawOrder(
        [...contentfulResults, ...fetchedResults],
        uniqueResults
      );

      if (processMode === 'rag') {
        const ragResult = await this.processWithRAGFromContent(request, mergedResults, rawResults.length, config);
        finalResults = ragResult.results;
        ragStats = ragResult.stats ?? undefined;
      } else {
        finalResults = this.truncateResults(mergedResults, contentMaxLength);
      }
    }

    const totalDuration = Date.now() - searchStartTime;
    const fetchedCount = finalResults.filter((item) => item.fetchSuccess).length;

    return {
      success: true,
      source,
      results: finalResults,
      searchDuration,
      duration: totalDuration,
      processMode,
      ragStats,
      plan: {
        request,
        queries: queryStats,
        plannerModel,
        rawResultCount: rawResults.length,
        uniqueUrlCount: uniqueResults.length,
        fetchedCount,
      },
    };
  }

  private dedupeRawResults(items: RawPlannedSearchResult[]): RawPlannedSearchResult[] {
    const deduped = new Map<string, RawPlannedSearchResult>();

    for (const item of items) {
      const normalizedUrl = this.normalizeSearchResultUrl(item.url);
      if (!normalizedUrl) continue;

      const normalizedItem: RawPlannedSearchResult = {
        ...item,
        url: normalizedUrl,
      };
      const existing = deduped.get(normalizedUrl);

      if (!existing) {
        deduped.set(normalizedUrl, normalizedItem);
        continue;
      }

      if ((!existing.content || existing.content.trim().length === 0) && normalizedItem.content && normalizedItem.content.trim().length > 0) {
        deduped.set(normalizedUrl, normalizedItem);
      }
    }

    return Array.from(deduped.values());
  }

  private sortResultsByRawOrder(
    results: SearchResultWithContent[],
    rawOrder: RawPlannedSearchResult[]
  ): SearchResultWithContent[] {
    const orderMap = new Map<string, number>();
    rawOrder.forEach((item, index) => {
      const normalizedUrl = this.normalizeSearchResultUrl(item.url);
      if (!orderMap.has(normalizedUrl)) {
        orderMap.set(normalizedUrl, index);
      }
    });

    return [...results].sort((left, right) => {
      const leftIndex = orderMap.get(this.normalizeSearchResultUrl(left.realUrl || left.url)) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = orderMap.get(this.normalizeSearchResultUrl(right.realUrl || right.url)) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
  }

  private normalizeSearchResultUrl(url: string): string {
    const trimmed = typeof url === 'string' ? url.trim() : '';
    if (!trimmed) return '';

    try {
      const parsed = new URL(trimmed);
      parsed.hash = '';

      const paramsToDelete: string[] = [];
      parsed.searchParams.forEach((_value, key) => {
        if (key.startsWith('utm_')) {
          paramsToDelete.push(key);
        }
      });
      paramsToDelete.forEach((key) => parsed.searchParams.delete(key));

      const pathname = parsed.pathname.replace(/\/+$/, '');
      parsed.pathname = pathname || '/';

      return parsed.toString();
    } catch {
      return trimmed;
    }
  }

  private async searchWithContentInternal(
    query: string,
    limit?: number,
    providerId?: string,
    abortSignal?: AbortSignal,
    debugMode: boolean = false,
    includeSearchResults: boolean = false
  ): Promise<SearchWithContentResult> {
    // 读取配置
    const config = getConfig();
    const actualLimit = limit ?? config.resultLimit;
    const processMode = config.processMode;
    const contentMaxLength = config.contentMaxLength;
    const searchTimeout = config.searchTimeout * 1000; // 转换为毫秒
    const fetchTimeout = config.fetchTimeout * 1000; // 转换为毫秒
    
    // 获取搜索服务提供者
    const provider = providerId ? getSearchProvider(providerId) : getActiveProvider();
    const isBuiltin = !provider || provider.type === 'builtin';
    
    logger.info('Starting web search with content', { 
      query, 
      limit: actualLimit,
      processMode,
      contentMaxLength,
      searchTimeout,
      fetchTimeout,
      provider: provider?.id || 'builtin',
      providerType: provider?.type || 'builtin',
    });
    
    const startTime = Date.now();
    
    // 根据 provider 类型选择搜索方式
    if (isBuiltin) {
      // 内置 SearXNG 搜索
      return this.searchWithBuiltinEngine(
        query,
        actualLimit,
        processMode,
        contentMaxLength,
        fetchTimeout,
        config,
        startTime,
        abortSignal,
        debugMode,
        includeSearchResults
      );
    } else {
      // 第三方搜索服务
      return this.searchWithThirdPartyEngine(
        provider!,
        query,
        processMode,
        contentMaxLength,
        searchTimeout,
        fetchTimeout,
        config,
        startTime,
        abortSignal,
        debugMode,
        includeSearchResults
      );
    }
  }
  
  /**
   * 使用内置引擎搜索（SearXNG）
   */
  private async searchWithBuiltinEngine(
    query: string,
    limit: number,
    processMode: 'rag' | 'truncate',
    contentMaxLength: number | null,
    fetchTimeout: number,
    config: ReturnType<typeof getConfig>,
    startTime: number,
    abortSignal?: AbortSignal,
    debugMode: boolean = false,
    includeSearchResults: boolean = false
  ): Promise<SearchWithContentResult> {
    // 第一步：获取搜索结果
    const searchResult = await this.search(query, limit);
    
    if (!searchResult.success) {
      return {
        success: false as const,
        error: (searchResult as { success: false; error: string }).error,
      };
    }
    
    const searchDuration = Date.now() - startTime;
    const searchResultCount = searchResult.results.length;
    
    logger.info('Builtin search completed, starting content fetch', {
      query,
      resultCount: searchResultCount,
      searchDuration
    });
    
    // 根据处理模式决定后续流程
    let finalResults: SearchResultWithContent[];
    let ragStats: RagStats | undefined;
    
    if (processMode === 'rag') {
      // RAG 模式：边抓取边处理（切片 + 向量化），最后统一召回
      const ragResult = await this.processWithRAGStreaming(
        query,
        searchResult.results,
        searchResultCount,
        fetchTimeout,
        config,
        abortSignal,
        debugMode
      );
      finalResults = ragResult.results;
      ragStats = ragResult.stats ?? undefined;
    } else {
      // 截断模式：并行抓取后截断
      finalResults = await this.fetchAllContent(searchResult.results, fetchTimeout, contentMaxLength, abortSignal, debugMode);
    }
    
    const totalDuration = Date.now() - startTime;
    const successCount = finalResults.filter(r => r.fetchSuccess).length;
    
    logger.info('Builtin search with content completed', {
      query,
      processMode,
      resultCount: finalResults.length,
      successCount,
      searchDuration,
      totalDuration,
      ragStats
    });
    
    return {
      success: true,
      source: searchResult.source,
      results: finalResults,
      searchDuration,
      duration: totalDuration,
      processMode,
      ragStats,
      ...(includeSearchResults ? { searchResults: searchResult.results } : {}),
    };
  }
  
  /**
   * 使用第三方引擎搜索
   */
  private async searchWithThirdPartyEngine(
    provider: SearchProvider,
    query: string,
    processMode: 'rag' | 'truncate',
    contentMaxLength: number | null,
    searchTimeout: number,
    fetchTimeout: number,
    config: ReturnType<typeof getConfig>,
    startTime: number,
    abortSignal?: AbortSignal,
    debugMode: boolean = false,
    includeSearchResults: boolean = false
  ): Promise<SearchWithContentResult> {
    // 第一步：使用第三方 API 搜索（结果数量由服务自己的配置决定）
    const searchResponse = await this.searchWithProvider(provider, query, searchTimeout, abortSignal);
    
    if ('error' in searchResponse) {
      return {
        success: false as const,
        error: searchResponse.error,
      };
    }
    
    const { results: apiResults, source } = searchResponse;
    const searchResults: SearchResultItem[] = apiResults.map(r => ({
      title: r.title,
      url: r.url,
    }));
    const searchDuration = Date.now() - startTime;
    const searchResultCount = apiResults.length;
    
    if (searchResultCount === 0) {
      return {
        success: false as const,
        error: tMain("search.noResults"),
      };
    }
    
    logger.info('Third-party search completed', {
      query,
      provider: provider.id,
      resultCount: searchResultCount,
      searchDuration,
    });
    
    // 检查第三方 API 是否已返回完整内容
    const engine = createCustomEngine(provider);
    const hasContent = engine.supportsContent && apiResults.some(r => r.content && r.content.length > 0);
    
    let finalResults: SearchResultWithContent[];
    let ragStats: RagStats | undefined;
    
    if (hasContent) {
      // API 已返回内容，直接使用
      logger.info('Third-party API returned content, using directly');
      
      // 转换为 SearchResultWithContent 格式
      const resultsWithContent: SearchResultWithContent[] = apiResults.map(r => ({
        title: r.title,
        url: r.url,
        content: r.content || '',
        truncated: false,
        fetchSuccess: true,
        fetchDuration: 0,
        ...(debugMode ? { debugFetchMode: 'api' } : {}),
      }));
      
      if (processMode === 'rag') {
        // RAG 模式：对已有内容进行 RAG 处理
        const ragResult = await this.processWithRAGFromContent(query, resultsWithContent, searchResultCount, config);
        finalResults = ragResult.results;
        ragStats = ragResult.stats ?? undefined;
      } else {
        // 截断模式
        finalResults = this.truncateResults(resultsWithContent, contentMaxLength);
      }
    } else {
      // API 未返回内容，需要抓取网页
      logger.info('Third-party API did not return content, fetching pages');
      
      const searchItems: SearchResultItem[] = searchResults;
      
      if (processMode === 'rag') {
        const ragResult = await this.processWithRAGStreaming(
          query,
          searchItems,
          searchResultCount,
          fetchTimeout,
          config,
          abortSignal,
          debugMode
        );
        finalResults = ragResult.results;
        ragStats = ragResult.stats ?? undefined;
      } else {
        finalResults = await this.fetchAllContent(searchItems, fetchTimeout, contentMaxLength, abortSignal, debugMode);
      }
    }
    
    const totalDuration = Date.now() - startTime;
    const successCount = finalResults.filter(r => r.fetchSuccess).length;
    
    logger.info('Third-party search with content completed', {
      query,
      provider: provider.id,
      processMode,
      resultCount: finalResults.length,
      successCount,
      searchDuration,
      totalDuration,
      ragStats,
    });
    
    return {
      success: true,
      source,
      results: finalResults,
      searchDuration,
      duration: totalDuration,
      processMode,
      ragStats,
      ...(includeSearchResults ? { searchResults } : {}),
    };
  }
  
  /**
   * 对已有内容进行 RAG 处理（用于第三方 API 已返回内容的情况）
   */
  private async processWithRAGFromContent(
    query: string,
    results: SearchResultWithContent[],
    searchResultCount: number,
    config: ReturnType<typeof getConfig>
  ): Promise<{ results: SearchResultWithContent[]; stats: RagStats | null }> {
    const ragStartTime = Date.now();
    
    // 过滤出有内容的结果
    const successResults = results.filter(r => r.content && r.content.length > 0);
    
    if (successResults.length === 0) {
      return { results, stats: null };
    }
    
    // 切片
    const allChunks: Array<{
      url: string;
      title: string;
      text: string;
      chunkIndex: number;
      originalResult: SearchResultWithContent;
    }> = [];
    
    for (const result of successResults) {
      const chunkResult = chunkText(result.content);
      
      for (const chunk of chunkResult.chunks) {
        allChunks.push({
          url: result.realUrl || result.url,
          title: result.title,
          text: chunk.text,
          chunkIndex: chunk.index,
          originalResult: result,
        });
      }
    }
    
    if (allChunks.length === 0) {
      return { results, stats: null };
    }
    
    // 向量化
    const chunkTexts = allChunks.map(c => c.text);
    let chunkVectors: number[][];
    
    try {
      chunkVectors = await embedTexts(chunkTexts, config.embeddingModel, config.embeddingDimension);
    } catch (error) {
      logger.error('Failed to embed chunks', { error });
      return { results: this.fallbackToTruncate(results, config.contentMaxLength), stats: null };
    }
    
    // 向量化 query
    let queryVector: number[];
    try {
      queryVector = await embedText(query, config.embeddingModel, config.embeddingDimension);
    } catch (error) {
      logger.error('Failed to embed query', { error });
      return { results: this.fallbackToTruncate(results, config.contentMaxLength), stats: null };
    }
    
    // 构建向量存储并召回
    const vectorStore = new MemoryVectorStore();
    for (let i = 0; i < allChunks.length; i++) {
      vectorStore.add({
        url: allChunks[i].url,
        title: allChunks[i].title,
        text: allChunks[i].text,
        chunkIndex: allChunks[i].chunkIndex,
        vector: chunkVectors[i],
      });
    }
    
    const topN = config.ragTopN;
    const retrievedChunks = vectorStore.searchWithDiversity(
      queryVector,
      RETRIEVAL_TOP_K,
      MAX_CHUNKS_PER_URL,
      topN
    );
    
    // 按 URL 分组
    const urlToChunks = new Map<string, Array<{ text: string; score: number; chunkIndex: number }>>();
    const urlToOriginalResult = new Map<string, SearchResultWithContent>();
    
    for (const retrieved of retrievedChunks) {
      const url = retrieved.chunk.url;
      
      if (!urlToChunks.has(url)) {
        urlToChunks.set(url, []);
        const original = allChunks.find(c => c.url === url)?.originalResult;
        if (original) {
          urlToOriginalResult.set(url, original);
        }
      }
      
      urlToChunks.get(url)!.push({
        text: retrieved.chunk.text,
        score: retrieved.score,
        chunkIndex: retrieved.chunk.chunkIndex,
      });
    }
    
    // 生成最终结果
    const finalResults: SearchResultWithContent[] = [];
    
    for (const [url, chunks] of urlToChunks) {
      const originalResult = urlToOriginalResult.get(url);
      if (!originalResult) continue;
      
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const content = chunks.map(c => c.text).join('\n\n---\n\n');
      
      finalResults.push({
        ...originalResult,
        content,
        truncated: false,
      });
    }
    
    if (finalResults.length === 0) {
      return { results: this.fallbackToTruncate(results, config.contentMaxLength), stats: null };
    }
    
    const ragDuration = Date.now() - ragStartTime;
    return {
      results: finalResults,
      stats: {
        mode: 'rag' as const,
        searchResultCount,
        fetchSuccessCount: successResults.length,
        fetchFailedCount: results.length - successResults.length,
        totalChunks: allChunks.length,
        retrievedChunks: retrievedChunks.length,
        retrievedUrlCount: urlToChunks.size,
        ragDuration,
      },
    };
  }
  
  /**
   * 截断结果内容
   */
  private truncateResults(
    results: SearchResultWithContent[],
    maxLength: number | null
  ): SearchResultWithContent[] {
    if (maxLength === null) {
      return results;
    }
    
    return results.map(r => ({
      ...r,
      content: r.content.substring(0, maxLength),
      truncated: r.content.length > maxLength,
    }));
  }
  
  /**
   * 并行抓取所有网页内容（截断模式使用）
   */
  private async fetchAllContent(
    items: SearchResultItem[],
    fetchTimeout: number,
    contentMaxLength: number | null,
    abortSignal?: AbortSignal,
    debugMode: boolean = false
  ): Promise<SearchResultWithContent[]> {
    const fetchPromises = items.map(async (item): Promise<SearchResultWithContent> => {
      const fetchStartTime = Date.now();
      try {
        const result = await fetchPage(item.url, {
          timeout: fetchTimeout,
          abortSignal,
          debugMode,
        });
        const fetchDuration = Date.now() - fetchStartTime;
        
        let content = result.content;
        let truncated = false;
        
        // 截断内容
        if (contentMaxLength !== null && content.length > contentMaxLength) {
          content = content.substring(0, contentMaxLength);
          truncated = true;
        }
        
        const baseResult: SearchResultWithContent = {
          title: result.title || item.title,
          url: item.url,
          realUrl: result.realUrl,
          content,
          truncated,
          byline: result.byline,
          siteName: result.siteName,
          publishedDate: result.publishedDate,
          fetchSuccess: true,
          fetchDuration,
        };
        return Object.assign(baseResult, debugMode && result.debug
          ? {
              debugFetchMode: result.debug.fetchMode,
              debugRawHtmlToken: result.debug.rawHtmlToken,
              debugFallbackReasons: result.debug.fallbackReasons,
            }
          : {});
      } catch (error) {
        const fetchDuration = Date.now() - fetchStartTime;
        logger.warn('Failed to fetch content for result', {
          url: item.url,
          error: error instanceof Error ? error.message : String(error),
          fetchDuration
        });
        
        return {
          title: item.title,
          url: item.url,
          content: '',
          truncated: false,
          fetchSuccess: false,
          fetchError: error instanceof Error ? error.message : String(error),
          fetchDuration,
        };
      }
    });
    
    return Promise.all(fetchPromises);
  }
  
  /**
   * RAG 流式处理：边抓取边切片边向量化
   * 
   * 优化策略：
   * 1. 每个网页独立处理：抓取 → 切片 → 向量化
   * 2. 所有网页并行处理
   * 3. 快网页的向量化可以和慢网页的抓取并行，减少总耗时
   */
  private async processWithRAGStreaming(
    query: string,
    items: SearchResultItem[],
    searchResultCount: number,
    fetchTimeout: number,
    config: ReturnType<typeof getConfig>,
    abortSignal?: AbortSignal,
    debugMode: boolean = false
  ): Promise<{ results: SearchResultWithContent[]; stats: RagStats | null }> {
    const ragStartTime = Date.now();
    
    // 用于收集所有处理结果
    const allFetchedResults: SearchResultWithContent[] = [];
    const allChunks: Array<{
      url: string;
      title: string;
      text: string;
      chunkIndex: number;
      vector: number[];
      originalResult: SearchResultWithContent;
    }> = [];
    
    // 统计
    let fetchSuccessCount = 0;
    let fetchFailedCount = 0;
    let totalChunks = 0;
    
    logger.info('Starting RAG streaming processing', { 
      itemCount: items.length,
      embeddingModel: config.embeddingModel
    });
    
    // 并行处理每个网页：抓取 → 切片 → 向量化
    const processPromises = items.map(async (item) => {
      const fetchStartTime = Date.now();
      let fetchedResult: SearchResultWithContent | null = null;
      
      try {
        // 1. 抓取网页
        const result = await fetchPage(item.url, {
          timeout: fetchTimeout,
          abortSignal,
          debugMode,
        });
        const fetchDuration = Date.now() - fetchStartTime;
        
        const baseFetchedResult: SearchResultWithContent = {
          title: result.title || item.title,
          url: item.url,
          realUrl: result.realUrl,
          content: result.content,
          truncated: false,
          byline: result.byline,
          siteName: result.siteName,
          publishedDate: result.publishedDate,
          fetchSuccess: true,
          fetchDuration,
        };
        fetchedResult = Object.assign(baseFetchedResult, debugMode && result.debug
          ? {
              debugFetchMode: result.debug.fetchMode,
              debugRawHtmlToken: result.debug.rawHtmlToken,
              debugFallbackReasons: result.debug.fallbackReasons,
            }
          : {});
        
        allFetchedResults.push(fetchedResult);
        fetchSuccessCount++;
        
        // 如果内容为空，跳过切片和向量化
        if (!result.content || result.content.length === 0) {
          return;
        }
        
        // 2. 切片
        const chunkResult = chunkText(result.content);
        totalChunks += chunkResult.chunks.length;
        
        logger.debug('Chunked document', {
          url: item.url,
          chunkCount: chunkResult.chunks.length,
          fetchDuration
        });
        
        // 3. 向量化（每个网页的 chunks 独立向量化）
        if (chunkResult.chunks.length > 0) {
          const chunkTexts = chunkResult.chunks.map(c => c.text);
          const embedStartTime = Date.now();
          const vectors = await embedTexts(chunkTexts, config.embeddingModel, config.embeddingDimension);
          
          logger.debug('Embedded document chunks', {
            url: item.url,
            chunkCount: chunkResult.chunks.length,
            embedDuration: Date.now() - embedStartTime
          });
          
          // 收集带向量的 chunks
          for (let i = 0; i < chunkResult.chunks.length; i++) {
            allChunks.push({
              url: result.realUrl || item.url,
              title: result.title || item.title,
              text: chunkResult.chunks[i].text,
              chunkIndex: chunkResult.chunks[i].index,
              vector: vectors[i],
              originalResult: fetchedResult
            });
          }
        }
      } catch (error) {
        const fetchDuration = Date.now() - fetchStartTime;
        logger.warn('Failed to fetch/process content for result', {
          url: item.url,
          error: error instanceof Error ? error.message : String(error),
          fetchDuration
        });
        
        // 只有在抓取阶段失败（fetchedResult 还未创建）时才添加失败记录
        // 如果是 embedding 阶段失败，抓取结果已经添加过了，不需要重复添加
        if (!fetchedResult) {
          allFetchedResults.push({
            title: item.title,
            url: item.url,
            content: '',
            truncated: false,
            fetchSuccess: false,
            fetchError: error instanceof Error ? error.message : String(error),
            fetchDuration,
          });
          fetchFailedCount++;
        }
      }
    });
    
    // 等待所有处理完成
    await Promise.all(processPromises);
    
    logger.info('RAG fetch and embedding completed', {
      fetchSuccessCount,
      fetchFailedCount,
      totalChunks: allChunks.length,
      duration: Date.now() - ragStartTime
    });
    
    // 如果没有成功的 chunks，降级返回截断结果
    if (allChunks.length === 0) {
      logger.warn('No chunks generated, falling back to truncated content');
      return { 
        results: this.fallbackToTruncate(allFetchedResults, config.contentMaxLength), 
        stats: null 
      };
    }
    
    // 向量化 query
    let queryVector: number[];
    try {
      queryVector = await embedText(query, config.embeddingModel, config.embeddingDimension);
    } catch (error) {
      logger.error('Failed to embed query', { error });
      return { 
        results: this.fallbackToTruncate(allFetchedResults, config.contentMaxLength), 
        stats: null 
      };
    }
    
    // 构建向量存储并召回
    const vectorStore = new MemoryVectorStore();
    for (const chunk of allChunks) {
      vectorStore.add({
        url: chunk.url,
        title: chunk.title,
        text: chunk.text,
        chunkIndex: chunk.chunkIndex,
        vector: chunk.vector
      });
    }
    
    // 召回（带多样性控制）
    const topN = config.ragTopN;
    const retrievedChunks = vectorStore.searchWithDiversity(
      queryVector,
      RETRIEVAL_TOP_K,
      MAX_CHUNKS_PER_URL,
      topN
    );
    
    logger.info('RAG retrieval completed', {
      totalChunks,
      retrievedCount: retrievedChunks.length,
      topN,
      ragDuration: Date.now() - ragStartTime
    });
    
    // 按 URL 分组，生成最终结果
    const urlToChunks = new Map<string, Array<{ text: string; score: number; chunkIndex: number }>>();
    const urlToOriginalResult = new Map<string, SearchResultWithContent>();
    
    for (const retrieved of retrievedChunks) {
      const url = retrieved.chunk.url;
      
      if (!urlToChunks.has(url)) {
        urlToChunks.set(url, []);
        const original = allChunks.find(c => c.url === url)?.originalResult;
        if (original) {
          urlToOriginalResult.set(url, original);
        }
      }
      
      urlToChunks.get(url)!.push({
        text: retrieved.chunk.text,
        score: retrieved.score,
        chunkIndex: retrieved.chunk.chunkIndex
      });
    }
    
    // 生成最终结果
    const finalResults: SearchResultWithContent[] = [];
    
    for (const [url, chunks] of urlToChunks) {
      const originalResult = urlToOriginalResult.get(url);
      if (!originalResult) continue;
      
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const content = chunks.map(c => c.text).join('\n\n---\n\n');
      
      finalResults.push({
        ...originalResult,
        content,
        truncated: false
      });
    }
    
    if (finalResults.length === 0) {
      logger.warn('RAG retrieval returned no results, falling back to truncated content');
      return { 
        results: this.fallbackToTruncate(allFetchedResults, config.contentMaxLength), 
        stats: null 
      };
    }
    
    const ragDuration = Date.now() - ragStartTime;
    return {
      results: finalResults,
      stats: {
        mode: 'rag' as const,
        searchResultCount,
        fetchSuccessCount,
        fetchFailedCount,
        totalChunks: allChunks.length,
        retrievedChunks: retrievedChunks.length,
        retrievedUrlCount: urlToChunks.size,
        ragDuration
      }
    };
  }
  
  /**
   * 降级处理：将抓取结果截断后返回
   * 用于 RAG 处理失败时的降级
   */
  private fallbackToTruncate(
    results: SearchResultWithContent[],
    maxLength: number | null
  ): SearchResultWithContent[] {
    const truncateLength = maxLength ?? 2000;
    return results.map(r => ({
      ...r,
      content: r.content.substring(0, truncateLength),
      truncated: r.content.length > truncateLength
    }));
  }
  
  /**
   * 获取网页内容
   * 使用 PageFetcher 抓取并提取网页主内容
   */
  async fetchPageContent(
    url: string,
    options: {
      abortSignal?: AbortSignal;
      format?: PageContentFormat;
    } = {}
  ): Promise<FetchPageResult> {
    logger.info('Fetching page content', { url });
    
    const startTime = Date.now();
    
    try {
      const result = await fetchPage(url, {
        abortSignal: options.abortSignal,
        format: options.format,
      });
      
      const wordCount = result.content.split(/\s+/).filter(Boolean).length;
      
      logger.info('Page content fetched successfully', {
        url,
        title: result.title,
        contentLength: result.content.length,
        wordCount,
        byline: result.byline,
        duration: Date.now() - startTime
      });
      
      return {
        success: true,
        url,
        title: result.title,
        content: result.content,
        wordCount,
        byline: result.byline,
        siteName: result.siteName,
      };
    } catch (error) {
      logger.error('Page content fetch failed', {
        url,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      });
      
      return {
        success: false,
        url,
        error: tMain("search.fetchPageFailed", { message: error instanceof Error ? error.message : String(error) })
      };
    }
  }
  
  /**
   * 销毁服务（清理资源）
   */
  destroy(): void {
    destroyPagePool();
  }
}

export const webSearchService = new WebSearchService();
