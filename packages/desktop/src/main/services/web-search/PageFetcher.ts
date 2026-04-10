/**
 * 网页内容抓取器
 * 
 * 抓取策略：
 * 1. 先尝试用 HTTP 请求（fetch）直接抓取，速度快、资源消耗低
 * 2. 对原始 HTML 进行清洗，提取主内容候选并转换为 Markdown
 * 3. 如果清洗后的有效文本过短，说明 fetch 拿到的 HTML 不适合直接使用，转 Browser Window 兜底
 * 4. 如果超时，直接失败（网络不可达，Browser Window 也没用）
 * 
 * 这是一个独立的通用模块，可被所有搜索类型（内置、预设、自定义）共用
 */

import * as cheerio from 'cheerio';
import { randomUUID } from 'node:crypto';
import TurndownService from 'turndown';
import { getPagePool } from './PagePool';
import { getRandomHeaders } from './utils';
import { loggerServiceMain } from '@shared';
import { tMain } from '../../i18n';

const logger = loggerServiceMain.withContext('PageFetcher');
const MAX_CONTENT_LENGTH = 50000;
const TEST_RAW_HTML_CACHE_TTL_MS = 10 * 60 * 1000;
const BASE_REMOVE_SELECTORS = [
  'head',
  'meta',
  'script',
  'style',
  'noscript',
  'template',
];
const STRICT_REMOVE_SELECTORS = [
  'header',
  'footer',
  'nav',
  'aside',
  'dialog',
  '[role="dialog"]',
  '[aria-modal="true"]',
  '.header',
  '.top',
  '.navbar',
  '#header',
  '.footer',
  '.bottom',
  '#footer',
  '.sidebar',
  '.side',
  '.aside',
  '#sidebar',
  '.modal',
  '.popup',
  '#modal',
  '.overlay',
  '.ad',
  '.ads',
  '.advert',
  '#ad',
  '.lang-selector',
  '.language',
  '#language-selector',
  '.social',
  '.social-media',
  '.social-links',
  '#social',
  '.menu',
  '.navigation',
  '#nav',
  '.breadcrumbs',
  '#breadcrumbs',
  '.share',
  '#share',
  '.widget',
  '#widget',
  '.cookie',
  '#cookie',
  '.cookie-banner',
  '.cookie-consent',
  '.consent-banner',
  '.newsletter-popup',
  '.modal-backdrop',
  '[data-nosnippet="true"]',
  'iframe[src*="consent"]',
  'iframe[src*="cookie"]',
];

type FetchMode = 'http' | 'browser';

interface RawHtmlCacheEntry {
  html: string;
  url: string;
  createdAt: number;
}

const testRawHtmlCache = new Map<string, RawHtmlCacheEntry>();

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  linkStyle: 'inlined',
  emDelimiter: '*',
  bulletListMarker: '-',
});

turndownService.addRule('imagePlaceholder', {
  filter: 'img',
  replacement: (_content, node) => {
    const alt = node.getAttribute('alt')?.trim() || '';
    if (!alt) {
      return '';
    }
    return `![${alt}]()`;
  },
});

turndownService.addRule('linkTextOnly', {
  filter: 'a',
  replacement: (content) => content.trim(),
});

/**
 * 网页内容抓取结果
 */
export interface PageContent {
  title: string;
  content: string;
  byline?: string;
  siteName?: string;
  /** 跳转后的真实 URL（可能与原 URL 不同） */
  realUrl?: string;
  /** 发布日期（YYYY-MM-DD 格式） */
  publishedDate?: string;
  debug?: {
    fetchMode: FetchMode;
    rawHtmlToken?: string;
    fallbackReasons?: string[];
  };
}

interface FetchAttemptResult {
  html: string;
  realUrl: string;
  pageContent?: PageContent;
  fallbackReason?: string;
}

function cleanupExpiredTestRawHtmlCache(): void {
  const now = Date.now();
  for (const [token, entry] of testRawHtmlCache.entries()) {
    if (now - entry.createdAt > TEST_RAW_HTML_CACHE_TTL_MS) {
      testRawHtmlCache.delete(token);
    }
  }
}

function storeTestRawHtml(html: string, url: string): string | undefined {
  if (!html) return undefined;
  cleanupExpiredTestRawHtmlCache();
  const token = randomUUID();
  testRawHtmlCache.set(token, {
    html,
    url,
    createdAt: Date.now(),
  });
  return token;
}

export function getTestRawHtml(token: string): { html: string; url: string } | null {
  cleanupExpiredTestRawHtmlCache();
  const entry = testRawHtmlCache.get(token);
  if (!entry) return null;
  return {
    html: entry.html,
    url: entry.url,
  };
}

/**
 * 超时错误类型
 */
class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

class ContentExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentExtractionError';
  }
}

/**
 * 抓取网页内容
 * 
 * 策略：先尝试 HTTP 请求，清洗并提取主内容；无效时再用 Browser Window 兜底
 * 
 * @param url 页面 URL
 * @param timeout 超时时间（毫秒），HTTP 和 Browser Window 各自独立使用完整的超时时间
 * @param abortSignal 外部中止信号（如用户点击中止）
 */
export async function fetchPageContent(
  url: string,
  timeout?: number,
  abortSignal?: AbortSignal,
  debugMode: boolean = false
): Promise<PageContent> {
  const startTime = Date.now();
  let fallbackReasons: string[] | null = null;
  
  logger.info('Fetching page content', { url, timeout });
  
  try {
    // 第一步：尝试用 HTTP 请求抓取
    const result = await fetchWithHttp(url, timeout, abortSignal);

    if (result.pageContent) {
      if (debugMode) {
        result.pageContent.debug = {
          fetchMode: 'http',
          rawHtmlToken: storeTestRawHtml(result.html, result.pageContent.realUrl || url),
        };
      }
      logger.info('Page content fetched via HTTP', {
        url,
        contentLength: result.pageContent.content.length,
        duration: Date.now() - startTime
      });
      return result.pageContent;
    }

    const fallbackReason = result.fallbackReason || 'content_invalid';
    fallbackReasons = [fallbackReason];

    logger.info('HTTP content is invalid after cleaning, falling back to Browser Window', {
      url,
      realUrl: result.realUrl,
      fallbackReason,
      elapsed: Date.now() - startTime,
    });
  } catch (error) {
    // 如果是超时错误，直接抛出，不兜底
    if (error instanceof TimeoutError) {
      logger.error('Fetch timeout, not retrying with Browser Window', {
        url,
        duration: Date.now() - startTime
      });
      throw error;
    }

    if (abortSignal?.aborted || (error instanceof Error && error.message === tMain("common.cancelled"))) {
      throw error;
    }

    fallbackReasons = ['http_fetch_failed'];

    logger.info('HTTP fetch failed, falling back to Browser Window', {
      url,
      error: error instanceof Error ? error.message : String(error),
      elapsed: Date.now() - startTime
    });
  }

  return await fetchWithBrowserWindow(url, timeout, abortSignal, debugMode, fallbackReasons ?? ['content_invalid']).then(
    ({ pageContent, html }) => {
      if (debugMode) {
        pageContent.debug = {
          fetchMode: 'browser',
          rawHtmlToken: storeTestRawHtml(html, pageContent.realUrl || url),
          fallbackReasons: fallbackReasons ?? ['content_invalid'],
        };
      }
      return pageContent;
    }
  );
}

/**
 * 使用 HTTP 请求抓取网页
 */
async function fetchWithHttp(url: string, timeout?: number, abortSignal?: AbortSignal): Promise<FetchAttemptResult> {
  const startTime = Date.now();
  
  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;
  let timedOut = false;
  const onAbort = () => controller.abort();
  abortSignal?.addEventListener('abort', onAbort, { once: true });
  
  if (timeout && timeout > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
  }
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: getRandomHeaders(),
      signal: controller.signal,
      redirect: 'follow',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    const realUrl = response.url;
    
    logger.debug('HTTP fetch completed', {
      url,
      realUrl,
      htmlLength: html.length,
      duration: Date.now() - startTime
    });

    try {
      return {
        html,
        realUrl,
        pageContent: parseHtmlContent(html, url, realUrl),
      };
    } catch (error) {
      if (error instanceof ContentExtractionError) {
        logger.debug('HTTP content is invalid after HTML cleaning', {
          url,
          realUrl,
          error: error.message,
        });

        return {
          html,
          realUrl,
          fallbackReason: error.message,
        };
      }
      throw error;
    }
    
  } catch (error) {
    // 区分超时错误和其他错误
    if (error instanceof Error && error.name === 'AbortError') {
      if (!timedOut && abortSignal?.aborted) {
        throw new Error(tMain("common.cancelled"));
      }
      throw new TimeoutError(`HTTP request timeout (${timeout}ms)`);
    }
    throw error;
  } finally {
    abortSignal?.removeEventListener('abort', onAbort);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 使用 Browser Window 抓取网页（支持 JavaScript 渲染）
 */
async function fetchWithBrowserWindow(
  url: string,
  timeout?: number,
  abortSignal?: AbortSignal,
  _debugMode: boolean = false,
  _fallbackReasons: string[] = []
): Promise<FetchAttemptResult> {
  const startTime = Date.now();
  const pool = getPagePool();
  let page: any = null;
  let isTimedOut = false;
  let isAborted = false;
  let timeoutTimer: NodeJS.Timeout | null = null;
  const stopPage = () => {
    if (!page) return;
    try {
      page.webContents.stop();
    } catch {
      // 忽略停止失败
    }
  };
  const onAbort = () => {
    isAborted = true;
    stopPage();
    logger.info('Browser Window load stopped due to abort', {
      url,
      elapsed: Date.now() - startTime,
    });
  };
  
  try {
    // 从池中获取一个页面
    page = await pool.acquire();
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    
    // 设置超时：超时后停止页面加载
    if (timeout) {
      timeoutTimer = setTimeout(() => {
        isTimedOut = true;
        stopPage();
        logger.info('Browser Window load stopped due to timeout', { 
          url, 
          elapsed: Date.now() - startTime 
        });
      }, timeout);
    }
    
    // 加载页面
    await pool.loadPage(page, url);
    
    // 检查是否已超时
    if (isTimedOut) {
      throw new TimeoutError('Browser Window fetch timeout');
    }
    if (isAborted) {
      throw new Error(tMain("common.cancelled"));
    }
    
    // 获取跳转后的真实 URL
    const realUrl = pool.getPageUrl(page);
    
    // 获取渲染后的 HTML
    const html = await pool.getPageHtml(page);
    
    logger.debug('Browser Window fetch completed', {
      url,
      realUrl,
      htmlLength: html.length,
      duration: Date.now() - startTime
    });
    
    // 解析 HTML 提取正文
    const result = parseHtmlContent(html, url, realUrl);
    
    logger.info('Page content fetched via Browser Window', {
      url,
      realUrl,
      title: result.title,
      contentLength: result.content.length,
      duration: Date.now() - startTime
    });
    
    return {
      html,
      realUrl,
      pageContent: result,
    };
    
  } catch (error) {
    if (isAborted || abortSignal?.aborted) {
      throw new Error(tMain("common.cancelled"));
    }
    logger.error('Browser Window fetch failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
      timedOut: isTimedOut
    });
    throw error;
  } finally {
    abortSignal?.removeEventListener('abort', onAbort);
    // 清除超时计时器
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }
    // 归还页面到池
    if (page) {
      pool.release(page);
    }
  }
}

/**
 * 解析 HTML 提取正文内容
 */
function parseHtmlContent(html: string, originalUrl: string, realUrl: string): PageContent {
  const publishedDate = extractPublishedDate(html);
  const title = extractTitle(html);
  const byline = extractByline(html);
  const siteName = extractSiteName(html, realUrl);
  const extraction = extractContentFromHtml(html, realUrl);

  return {
    title,
    content: truncateMarkdown(extraction.markdown),
    byline,
    siteName,
    realUrl: realUrl !== originalUrl ? realUrl : undefined,
    publishedDate,
  };
}

function extractContentFromHtml(html: string, url: string): {
  markdown: string;
} {
  const attempts = [
    { onlyMainContent: true },
    { onlyMainContent: false },
  ] as const;

  let bestAttemptLength = 0;

  for (const attempt of attempts) {
    const cleanedHtml = cleanHtml(html, url, attempt);
    const candidate = extractContentCandidate(cleanedHtml);
    bestAttemptLength = Math.max(bestAttemptLength, candidate.textLength);

    if (candidate.textLength <= 0) {
      continue;
    }

    const markdown = normalizeMarkdown(turndownService.turndown(candidate.html));
    const markdownTextLength = getEffectiveTextLength(markdown);

    if (markdownTextLength <= 0) {
      bestAttemptLength = Math.max(bestAttemptLength, markdownTextLength);
      continue;
    }

    return {
      markdown,
    };
  }

  throw new ContentExtractionError(`content_too_short:${bestAttemptLength}`);
}

function cleanHtml(
  html: string,
  url: string,
  options: {
    onlyMainContent: boolean;
  }
): string {
  const $ = cheerio.load(html);
  const baseUrl = resolveBaseUrl($, url);

  for (const selector of BASE_REMOVE_SELECTORS) {
    $(selector).remove();
  }

  if (options.onlyMainContent) {
    for (const selector of STRICT_REMOVE_SELECTORS) {
      $(selector).remove();
    }
  }

  $('img[srcset]').each((_, element) => {
    const srcset = $(element).attr('srcset');
    if (!srcset) return;

    const candidates = srcset
      .split(',')
      .map((item) => item.trim())
      .map((item) => {
        const parts = item.split(/\s+/);
        const descriptor = parts[parts.length - 1] || '1x';
        const isDescriptor = /(\d+w|\d+x)$/i.test(descriptor);
        const urlPart = isDescriptor ? parts.slice(0, -1).join(' ') : parts.join(' ');
        const numericValue = Number.parseFloat(descriptor.slice(0, -1));
        return {
          url: urlPart,
          score: Number.isFinite(numericValue) ? numericValue : 1,
        };
      })
      .filter((item) => item.url.length > 0)
      .sort((left, right) => right.score - left.score);

    if (candidates.length > 0) {
      $(element).attr('src', candidates[0].url);
    }
  });

  absolutizeUrls($, baseUrl);

  return $.html();
}

function extractContentCandidate(html: string): {
  html: string;
  textLength: number;
} {
  const $ = cheerio.load(html);
  const body = $('body').first();
  const fallbackHtml = body.length ? (body.html() || '') : $.root().html() || '';
  const fallbackText = body.length ? body.text() : $.root().text();

  return {
    html: fallbackHtml,
    textLength: getEffectiveTextLength(fallbackText),
  };
}

function absolutizeUrls($: cheerio.CheerioAPI, baseUrl: string): void {
  $('img[src]').each((_, element) => {
    const src = $(element).attr('src');
    if (!src) return;
    try {
      $(element).attr('src', new URL(src, baseUrl).href);
    } catch {
      // ignore invalid urls
    }
  });

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (!href) return;
    try {
      $(element).attr('href', new URL(href, baseUrl).href);
    } catch {
      // ignore invalid urls
    }
  });
}

function resolveBaseUrl($: cheerio.CheerioAPI, fallbackUrl: string): string {
  const baseHref = $('base[href]').first().attr('href');

  if (!baseHref) {
    return fallbackUrl;
  }

  try {
    return new URL(baseHref, fallbackUrl).href;
  } catch {
    return fallbackUrl;
  }
}

function extractTitle(html: string): string {
  try {
    const $ = cheerio.load(html);
    return (
      $('meta[property="og:title"]').attr('content')
      || $('meta[name="twitter:title"]').attr('content')
      || $('title').first().text().trim()
      || ''
    ).trim();
  } catch {
    return '';
  }
}

function extractByline(html: string): string | undefined {
  try {
    const $ = cheerio.load(html);
    const value = (
      $('meta[name="author"]').attr('content')
      || $('meta[property="article:author"]').attr('content')
      || $('meta[name="article:author"]').attr('content')
      || $('meta[name="byline"]').attr('content')
      || ''
    ).trim();

    return value || undefined;
  } catch {
    return undefined;
  }
}

function extractSiteName(html: string, url: string): string | undefined {
  try {
    const $ = cheerio.load(html);
    const siteName = (
      $('meta[property="og:site_name"]').attr('content')
      || $('meta[name="application-name"]').attr('content')
      || ''
    ).trim();

    if (siteName) {
      return siteName;
    }
  } catch {
    // ignore metadata extraction failures
  }

  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function getEffectiveTextLength(content: string): number {
  return content.replace(/\s+/g, ' ').trim().length;
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/\[Skip to Content\]\(#[^)]+\)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateMarkdown(markdown: string): string {
  if (markdown.length <= MAX_CONTENT_LENGTH) {
    return markdown;
  }

  return `${markdown.slice(0, MAX_CONTENT_LENGTH)}\n\n[Content truncated]`;
}

/**
 * 从 HTML 中提取发布日期
 * 尝试多种常见的 meta 标签和结构化数据
 */
function extractPublishedDate(html: string): string | undefined {
  try {
    const $ = cheerio.load(html);
    
    // 尝试各种常见的日期 meta 标签
    const dateSelectors = [
      // Open Graph / Facebook
      'meta[property="article:published_time"]',
      'meta[property="og:article:published_time"]',
      // Schema.org
      'meta[itemprop="datePublished"]',
      // 通用
      'meta[name="pubdate"]',
      'meta[name="publishdate"]',
      'meta[name="date"]',
      'meta[name="DC.date.issued"]',
      'meta[name="article:published_time"]',
      // Twitter
      'meta[name="twitter:data1"]',
    ];
    
    for (const selector of dateSelectors) {
      const content = $(selector).attr('content');
      if (content) {
        const parsed = parseDate(content);
        if (parsed) return parsed;
      }
    }
    
    // 尝试从 time 标签提取
    const timeEl = $('time[datetime]').first();
    if (timeEl.length) {
      const datetime = timeEl.attr('datetime');
      if (datetime) {
        const parsed = parseDate(datetime);
        if (parsed) return parsed;
      }
    }
    
    // 尝试从 JSON-LD 结构化数据提取
    const jsonLdScripts = $('script[type="application/ld+json"]');
    for (let i = 0; i < jsonLdScripts.length; i++) {
      try {
        const jsonText = $(jsonLdScripts[i]).html();
        if (!jsonText) continue;
        const data = JSON.parse(jsonText);
        
        // 可能是数组或对象
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item.datePublished) {
            const parsed = parseDate(item.datePublished);
            if (parsed) return parsed;
          }
          // 有时候在 @graph 中
          if (item['@graph']) {
            for (const graphItem of item['@graph']) {
              if (graphItem.datePublished) {
                const parsed = parseDate(graphItem.datePublished);
                if (parsed) return parsed;
              }
            }
          }
        }
      } catch {
        // JSON 解析失败，忽略
      }
    }
    
    return undefined;
  } catch (error) {
    logger.warn('Failed to extract published date', { error });
    return undefined;
  }
}

/**
 * 解析日期字符串为 YYYY-MM-DD 格式
 */
function parseDate(dateStr: string): string | undefined {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return undefined;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // 验证年份合理性（1990-2100）
    if (year < 1990 || year > 2100) return undefined;
    
    return `${year}-${month}-${day}`;
  } catch {
    return undefined;
  }
}
