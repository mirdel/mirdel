/**
 * system::web_scrape 工具
 * 获取指定网页的主内容
 */
import { tool } from 'ai';
import { z } from 'zod';
import { webSearchService } from '../../web-search';

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error('ABORTED'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(new Error('ABORTED'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise
      .then((value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      })
      .catch((error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      });
  });
}

/**
 * 创建 web_scrape 工具
 */
export function createWebScrape() {
  return tool({
    description: `Fetch the main content of a specific webpage URL.

Use this tool when you already have a concrete URL and need the page content directly, without searching first.
Supports pages that require JavaScript rendering.`,
    inputSchema: z.object({
      url: z.string().describe('Webpage URL')
    }),
    execute: async ({ url }, options: { abortSignal?: AbortSignal } = {}) => {
      let result;
      try {
        result = await raceWithAbort(webSearchService.fetchPageContent(url, { abortSignal: options.abortSignal }), options.abortSignal);
      } catch (error) {
        if ((error as Error)?.message === 'ABORTED') {
          return {
            content: [{ type: 'text' as const, text: 'Request aborted' }],
            isError: true
          };
        }
        throw error;
      }
      
      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: (result as { success: false; url: string; error: string }).error }],
          isError: true
        };
      }
      
      // 格式化内容
      const lines: string[] = [
        `[${result.title}]`,
        `URL: ${result.url}`,
      ];
      
      // 添加可选的元数据
      if (result.siteName) {
        lines.push(`Source: ${result.siteName}`);
      }
      if (result.byline) {
        lines.push(`Author: ${result.byline}`);
      }
      lines.push(`Word count: ${result.wordCount}`);
      
      lines.push('');
      lines.push('--- Main Content ---');
      lines.push('');
      lines.push(result.content);
      
      return {
        content: [{
          type: 'text' as const,
          text: lines.join('\n')
        }]
      };
    }
  });
}
