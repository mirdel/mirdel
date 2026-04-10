/**
 * system::web_search 工具
 * 搜索互联网获取实时信息
 */
import { tool } from 'ai';
import { z } from 'zod';
import { webSearchService } from '../../web-search';
import { loggerServiceMain } from '@shared';

const logger = loggerServiceMain.withContext('webSearch');

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
 * 提取域名
 */
function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * 创建 web_search 工具
 * @param providerId 指定使用的搜索服务提供者 ID（可选，默认使用全局激活的）
 * @param citationStartIndex 来源起始序号（0=无前置知识库，N=前 N 条为知识库，本条起用 [S(N+1)]）
 */
export function createWebSearch(providerId?: string, citationStartIndex: number = 0) {
  // 同一轮内工具可能被多次调用，需连续编号避免 [Sx] 冲突。
  let nextCitationIndex = Math.max(1, citationStartIndex + 1);

  return tool({
    description: `Search the web for real-time information and recent updates.

Use this tool for:
• Current news, recent events, and trending topics
• Recent information about specific people, companies, or products
• Time-sensitive facts such as dates, prices, and scores
• Questions about an "event", "news", or recent "updates"
• Cases where you need additional sources or fact verification

Input rule:
- The request must be self-contained.
- If the user is asking a follow-up question, rewrite it into a complete request before calling this tool.
- Do not pass vague references like "that", "it", or "the previous one" without the missing entity.

Execution behavior:
- This tool will internally generate 1 to 6 search queries from the request.
- It then runs the searches, merges and deduplicates results, and returns the usable sources.

[Citation Rules]
The first search results in this turn are numbered as [S${citationStartIndex + 1}], [S${citationStartIndex + 2}], ... to align with other references. If this tool is called multiple times in the same turn, numbering continues sequentially.
Cite sources at the end of the relevant sentence or paragraph, for example [S${citationStartIndex + 1}]. Multiple sources can be cited together, for example [S${citationStartIndex + 1}][S${citationStartIndex + 2}]. Do not cite unused sources.`,
    inputSchema: z.object({
      request: z.string().describe('A self-contained research request')
    }),
    execute: async ({ request }, options: { abortSignal?: AbortSignal } = {}) => {
      // 防御性检查
      if (!request || typeof request !== 'string') {
        logger.warn('web_search missing request parameter', { request });
        return {
          content: [{ type: 'text' as const, text: 'Search failed: missing request parameter' }],
          isError: true
        };
      }
      
      // 根据 providerId 选择搜索服务
      let result;
      try {
        result = await raceWithAbort(
          webSearchService.searchByRequest(request, providerId, options.abortSignal),
          options.abortSignal
        );
      } catch (error) {
        if ((error as Error)?.message === 'ABORTED') {
          return {
            content: [{ type: 'text' as const, text: 'Search aborted' }],
            isError: true
          };
        }
        throw error;
      }
      
      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: (result as { success: false; error: string }).error }],
          isError: true
        };
      }
      
      // 只保留成功抓取到正文的结果
      const validResults = result.results.filter(item => item.fetchSuccess);
      
      if (validResults.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No usable content was retrieved for "${request}". Try a different request.` }],
          isError: true
        };
      }
      
      // 格式化搜索结果（同轮连续编号）
      const lines: string[] = [
        `Search results for "${request}" (source: ${result.source}, ${validResults.length} item(s)):`,
        ''
      ];
      
      const batchStartIndex = nextCitationIndex;

      validResults.forEach((item, index) => {
        const num = batchStartIndex + index;
        const sid = `S${num}`;
        lines.push(`[${sid}]`);
        lines.push(`Source: ${item.siteName || extractHostname(item.realUrl || item.url)}`);
        lines.push(`URL: ${item.url}`);
        if (item.byline) {
          lines.push(`Author: ${item.byline}`);
        }
        if (item.publishedDate) {
          lines.push(`Published: ${item.publishedDate}`);
        }
        lines.push('');
        lines.push('Content:');
        lines.push(item.content);
        lines.push('');
        lines.push('---');
        lines.push('');
      });
      
      // 构建结构化的来源数据（与统一引用格式一致：id, index）
      const sources = validResults.map((item, index) => {
        const url = item.realUrl || item.url;
        const hostname = extractHostname(url);
        const num = batchStartIndex + index;
        return {
          index: num,
          id: `S${num}`,
          kind: 'web' as const,
          url,
          title: item.title,
          content: item.content,
          source: item.siteName || hostname,
          siteName: item.siteName || hostname,
          favicon: `https://${hostname}/favicon.ico`
        };
      });
      
      // 下一次调用从当前批次末尾继续编号。
      nextCitationIndex = batchStartIndex + validResults.length;

      return {
        content: [{
          type: 'text' as const,
          text: lines.join('\n')
        }],
        _meta: {
          sources,
          plan: result.plan
        }
      };
    }
  });
}
