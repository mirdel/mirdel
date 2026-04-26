/**
 * SearXNG Search Engine (builtin)
 */

import type { SearchEngine, SearchResultItem } from '../types';
import { sanitizeQuery } from '../utils';
import { searxngServerManager } from '../SearxngServerManager';
import { loggerServiceMain } from '@shared';
import type { SearchTimeRange } from '../webSearchData';

const logger = loggerServiceMain.withContext('SearxngEngine');

const SEARCH_TIMEOUT_MS = 15000;
const BUILTIN_WEB_ENGINE_ALLOWLIST = new Set<string>([
  'google',
  'bing',
  'duckduckgo',
  'brave',
  'baidu',
  'sogou',
  '360search',
  'quark',
  'yandex',
  'naver',
  'qwant',
  'mojeek',
  'startpage',
  'wikipedia',
]);

interface SearxngSearchResult {
  title?: string;
  url?: string;
  content?: string;
}

interface SearxngSearchResponse {
  results?: SearxngSearchResult[];
}

interface SearxngConfigEngine {
  name?: string;
  categories?: string[];
  enabled?: boolean;
}

interface SearxngConfigResponse {
  engines?: SearxngConfigEngine[];
}

export interface BuiltinSearchEngineOption {
  name: string;
  categories: string[];
  enabled: boolean;
}

interface SearxngSearchOptions {
  language: 'auto' | 'zh-CN' | 'en' | 'all';
  timeRange: SearchTimeRange;
  safeSearch: 0 | 1 | 2;
  engines?: string[];
  maxPages?: number;
}

export class SearxngEngine implements SearchEngine {
  readonly name = 'searxng';

  async search(query: string, limit: number = 5, options?: SearxngSearchOptions): Promise<SearchResultItem[]> {
    const sanitizedQuery = sanitizeQuery(query);
    if (!sanitizedQuery) {
      return [];
    }
    const searchOptions: SearxngSearchOptions = {
      language: options?.language ?? 'auto',
      timeRange: options?.timeRange ?? 'none',
      safeSearch: options?.safeSearch ?? 0,
      engines: Array.isArray(options?.engines)
        ? options.engines
          .map((item) => item.trim())
          .filter(Boolean)
        : undefined,
    };

    const startTime = Date.now();
    const port = await searxngServerManager.start();

    const maxPages = Math.max(1, Math.min(10, options?.maxPages ?? 3));
    const pagesNeeded = Math.min(maxPages, Math.max(1, Math.ceil(limit / 10)));
    logger.info('Starting SearXNG search', { query: sanitizedQuery, limit, pagesNeeded });

    const pageResults = await Promise.allSettled(
      Array.from({ length: pagesNeeded }).map((_, index) =>
        this.searchSinglePage(port, sanitizedQuery, index + 1, searchOptions)
      )
    );

    const rows: SearxngSearchResult[] = [];
    pageResults.forEach((item, index) => {
      if (item.status === 'fulfilled') {
        rows.push(...item.value);
      } else {
        logger.warn('SearXNG page search failed', {
          query: sanitizedQuery,
          page: index + 1,
          error: item.reason instanceof Error ? item.reason.message : String(item.reason),
        });
      }
    });

    const deduped = new Set<string>();
    const mapped: SearchResultItem[] = [];

    for (const row of rows) {
      const url = typeof row.url === 'string' ? row.url.trim() : '';
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      const snippet = typeof row.content === 'string' ? row.content.trim() : '';
      if (!url || !title) continue;
      if (!this.isValidSearchUrl(url)) continue;
      if (deduped.has(url)) continue;

      deduped.add(url);
      mapped.push({ title, url, ...(snippet ? { snippet } : {}) });
      if (mapped.length >= limit) break;
    }

    logger.info('SearXNG search completed', {
      query: sanitizedQuery,
      rawResultCount: rows.length,
      resultCount: mapped.length,
      duration: Date.now() - startTime,
    });

    return mapped;
  }

  private async searchSinglePage(
    port: number,
    query: string,
    pageno: number,
    options: SearxngSearchOptions
  ): Promise<SearxngSearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      pageno: String(pageno),
      safesearch: String(options.safeSearch),
      language: options.language,
    });
    if (options.engines && options.engines.length > 0) {
      params.set('engines', options.engines.join(','));
    } else {
      params.set('categories', 'general');
    }
    if (options.timeRange !== 'none') {
      params.set('time_range', options.timeRange);
    }
    const searchUrl = `http://127.0.0.1:${port}/search?${params.toString()}`;

    const response = await fetch(searchUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`SearXNG API request failed: ${response.status} ${response.statusText} ${body}`.trim());
    }

    const payload = await response.json() as SearxngSearchResponse;
    return Array.isArray(payload.results) ? payload.results : [];
  }

  async listWebSearchEngines(): Promise<BuiltinSearchEngineOption[]> {
    const port = await searxngServerManager.start();
    const url = `http://127.0.0.1:${port}/config`;
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`SearXNG config request failed: ${response.status} ${response.statusText} ${body}`.trim());
    }

    const payload = await response.json() as SearxngConfigResponse;
    const engines = Array.isArray(payload.engines) ? payload.engines : [];
    const result = engines
      .map((engine) => {
        const name = typeof engine.name === 'string' ? engine.name.trim() : '';
        const categories = Array.isArray(engine.categories)
          ? engine.categories.filter((item): item is string => typeof item === 'string')
          : [];
        const enabled = engine.enabled !== false;
        return { name, categories, enabled };
      })
      .filter((engine) => {
        if (!engine.name) return false;
        return BUILTIN_WEB_ENGINE_ALLOWLIST.has(engine.name);
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const deduped: BuiltinSearchEngineOption[] = [];
    const seen = new Set<string>();
    for (const item of result) {
      if (seen.has(item.name)) continue;
      seen.add(item.name);
      deduped.push(item);
    }
    return deduped;
  }

  private isValidSearchUrl(url: string): boolean {
    return url.startsWith('https://') || url.startsWith('http://');
  }
}

export const searxngEngine = new SearxngEngine();
