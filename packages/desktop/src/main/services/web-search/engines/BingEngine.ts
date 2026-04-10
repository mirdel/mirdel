/**
 * Bing Search Engine
 * 
 * 使用 PagePool 实现并行页面抓取
 * 使用 cheerio 在 Node.js 中解析搜索结果
 * 
 * 注意：网页内容抓取功能已移至独立的 PageFetcher 模块
 */

import * as cheerio from 'cheerio';
import type { SearchResultItem, SearchEngine } from '../types';
import { 
  sanitizeQuery, 
  cleanBingUrl 
} from '../utils';
import { getPagePool } from '../PagePool';
import { loggerServiceMain } from '@shared';

const logger = loggerServiceMain.withContext('BingEngine');

export class BingEngine implements SearchEngine {
  readonly name = 'bing';
  
  /**
   * 搜索 - 支持分页并发请求
   * 根据 limit 自动计算需要请求几页（每页10条）
   */
  async search(query: string, limit: number = 5): Promise<SearchResultItem[]> {
    const sanitizedQuery = sanitizeQuery(query);
    
    // 计算需要请求几页（每页10条，最多3页）
    const pagesNeeded = Math.min(3, Math.ceil(limit / 10));
    
    logger.info('Starting Bing search', { query: sanitizedQuery, limit, pagesNeeded });
    
    const startTime = Date.now();
    
    // 并发请求所有页面
    const pagePromises: Promise<SearchResultItem[]>[] = [];
    for (let i = 0; i < pagesNeeded; i++) {
      const first = i * 10 + 1; // 1, 11, 21
      pagePromises.push(this.searchSinglePage(sanitizedQuery, first));
    }
    
    // 等待所有结果（某页失败不影响其他页）
    const results = await Promise.allSettled(pagePromises);
    
    // 合并成功的结果
    const allResults: SearchResultItem[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      } else {
        logger.warn('Bing search page failed', {
          page: index + 1,
          first: index * 10 + 1,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        });
      }
    });
    
    // 截取前 limit 条
    const finalResults = allResults.slice(0, limit);
    
    logger.info('Bing search completed', {
      query: sanitizedQuery,
      pagesNeeded,
      totalFetched: allResults.length,
      resultCount: finalResults.length,
      duration: Date.now() - startTime
    });
    
    return finalResults;
  }
  
  /**
   * 搜索单页 - 使用 PagePool 中的一个 page
   * @param query 已经过 sanitize 的查询词
   * @param first 起始位置（1=第1页, 11=第2页, 21=第3页）
   */
  private async searchSinglePage(query: string, first: number): Promise<SearchResultItem[]> {
    const startTime = Date.now();
    const pool = getPagePool();
    let page = null;
    
    try {
      // 从池中获取一个页面
      page = await pool.acquire();
      
      // 构建搜索 URL（带分页参数）
      const params = new URLSearchParams({
        q: query,
        first: String(first),
        form: 'QBLH',
        sp: '-1',
        pq: query.toLowerCase(),
        sc: '8-' + query.length,
        qs: 'n',
      });
      
      const url = `https://www.bing.com/search?${params.toString()}`;
      await pool.loadPage(page, url);
      
      // 获取完整 HTML
      const html = await pool.getPageHtml(page);
      const pageTitle = pool.getPageTitle(page);
      const currentUrl = pool.getPageUrl(page);
      
      logger.info('Bing page loaded', {
        first,
        pageTitle,
        currentUrl,
        htmlLength: html.length
      });
      
      // 解析结果（每页最多10条）
      const results = this.parseBingResults(html, 10);
      
      logger.info('Bing single page search completed', {
        first,
        resultCount: results.length,
        duration: Date.now() - startTime
      });
      
      return results;
    } catch (error) {
      logger.error('Bing single page search failed', {
        first,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      });
      throw error;
    } finally {
      // 归还页面到池
      if (page) {
        pool.release(page);
      }
    }
  }
  
  /**
   * 使用 cheerio 解析 Bing 搜索结果
   * 参考 web-search-mcp 的实现
   */
  private parseBingResults(html: string, maxResults: number): SearchResultItem[] {
    const $ = cheerio.load(html);
    const results: SearchResultItem[] = [];
    
    // 记录页面结构用于调试
    const pageTitle = $('title').text();
    const b_content = $('#b_content');
    const b_results = $('#b_results');
    
    logger.info('Parsing Bing HTML', {
      pageTitle,
      htmlLength: html.length,
      b_content_exists: b_content.length > 0,
      b_results_exists: b_results.length > 0,
      b_results_children: b_results.children().length
    });
    
    // Bing 搜索结果选择器（参考开源库）
    const resultSelectors = [
      '.b_algo',     // 主要结果
      '.b_result',   // 备选格式
      '.b_card'      // 卡片格式
    ];
    
    // 记录每个选择器匹配的数量
    for (const selector of resultSelectors) {
      const count = $(selector).length;
      if (count > 0) {
        logger.info(`Found ${count} elements with selector "${selector}"`);
      }
    }
    
    // 遍历所有可能的结果选择器
    for (const selector of resultSelectors) {
      if (results.length >= maxResults) break;
      
      const elements = $(selector);
      if (elements.length === 0) continue;
      
      elements.each((_index, element) => {
        if (results.length >= maxResults) return false;
        
        const $element = $(element);
        
        // 标题选择器（参考开源库）
        const titleSelectors = [
          'h2 a',           // 标准格式
          '.b_title a',     // 备选格式
          'a[data-seid]'    // Bing 特有
        ];
        
        let title = '';
        let url = '';
        
        for (const titleSelector of titleSelectors) {
          const $titleElement = $element.find(titleSelector).first();
          if ($titleElement.length) {
            title = $titleElement.text().trim();
            url = $titleElement.attr('href') || '';
            break;
          }
        }
        
        // 验证并添加结果
        if (title && url && this.isValidSearchUrl(url)) {
          results.push({
            title,
            url: cleanBingUrl(url)
          });
        }
      });
    }
    
    // 如果没找到结果，打印 HTML 片段帮助调试
    if (results.length === 0) {
      const bodyChildren: string[] = [];
      $('body').children().each((_i, el) => {
        const $el = $(el);
        const tagName = el.tagName?.toLowerCase() || 'unknown';
        const id = $el.attr('id') || '';
        const className = $el.attr('class') || '';
        bodyChildren.push(`<${tagName} id="${id}" class="${className.substring(0, 50)}">`);
      });
      
      logger.warn('No results found, page structure:', {
        bodyChildren: bodyChildren.slice(0, 20),
        htmlSample: html.substring(0, 2000)
      });
    }
    
    return results;
  }
  
  /**
   * 验证 URL 是否有效
   */
  private isValidSearchUrl(url: string): boolean {
    return url.startsWith('http://') || 
           url.startsWith('https://') ||
           url.startsWith('//') ||
           url.length > 10;
  }
  
  /**
   * 销毁（PagePool 由单独管理，这里不需要处理）
   */
  destroy(): void {
    // PagePool 有单独的 destroyPagePool() 函数管理
  }
}

export const bingEngine = new BingEngine();
