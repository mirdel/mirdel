/**
 * system::historical_memory_search 工具
 * 从本地历史对话记忆中检索相关片段。
 */
import { tool } from 'ai';
import { z } from 'zod';
import { searchHistoricalMemory } from '../../chat/historicalMemoryService';

function compactQuery(query: string, keywords?: string[]): string {
  const keywordText = Array.isArray(keywords)
    ? keywords.map((item) => String(item || '').trim()).filter(Boolean).join(' ')
    : '';
  return [query.trim(), keywordText].filter(Boolean).join('\n');
}

export function createHistoricalMemorySearch(sessionId?: string) {
  return tool({
    description: `Search the user's local historical conversation memory.

Use this tool when the user asks about previous chats, recent work, past projects, prior decisions, preferences, tasks, or anything that may depend on local conversation history.
Do not use it for general world knowledge or current events.

Input rule:
- Write a focused semantic search query based on the user's intent, not a blind copy of the full user message.
- Include important entity names, project names, dates, or keywords when available.
- The tool searches local non-temporary historical chats and excludes the current conversation.`,
    inputSchema: z.object({
      query: z.string().describe('A focused semantic search query for local conversation history'),
      keywords: z.array(z.string()).optional().describe('Optional important keywords or entity names to strengthen keyword matching'),
      limit: z.number().int().min(1).max(10).optional().describe('Maximum number of memory snippets to return')
    }),
    execute: async ({ query, keywords, limit }) => {
      if (!sessionId) {
        return {
          content: [{ type: 'text' as const, text: 'Historical memory search failed: session context is unavailable' }],
          isError: true
        };
      }

      const searchQuery = compactQuery(query, keywords);
      if (!searchQuery) {
        return {
          content: [{ type: 'text' as const, text: 'Historical memory search failed: missing query' }],
          isError: true
        };
      }

      const hits = await searchHistoricalMemory({
        sessionId,
        query: searchQuery,
        limit: limit ?? 3,
        excludeSessionId: sessionId,
      });

      const displayHits = hits.map((hit) => ({
        chunkId: hit.id,
        sessionId: hit.sessionId,
        sessionTitle: hit.sessionTitle,
        turnId: hit.turnId,
        score: hit.score,
        vectorScore: hit.vectorScore,
        keywordScore: hit.keywordScore,
        reason: hit.reason,
        createdAt: hit.createdAt,
        updatedAt: hit.updatedAt,
        contentPreview: hit.content.length > 1200
          ? `${hit.content.slice(0, 1200).trimEnd()}...`
          : hit.content,
      }));

      if (displayHits.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No historical conversation memory was found for "${query}".` }],
          _meta: {
            historicalMemory: {
              mode: 'tool' as const,
              query: searchQuery,
              hits: displayHits,
            }
          }
        };
      }

      const lines: string[] = [
        `Historical conversation memory for "${query}" (${displayHits.length} item(s)):`,
        ''
      ];
      for (const [index, hit] of displayHits.entries()) {
        lines.push(`[Memory ${index + 1}]`);
        lines.push(`Session: ${hit.sessionTitle || hit.sessionId}`);
        lines.push(`Time: ${new Date(hit.createdAt).toISOString()}`);
        lines.push(`Reason: ${hit.reason.join(', ')}`);
        lines.push('');
        lines.push(hit.contentPreview);
        lines.push('');
        lines.push('---');
        lines.push('');
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
        _meta: {
          historicalMemory: {
            mode: 'tool' as const,
            query: searchQuery,
            hits: displayHits,
          }
        }
      };
    }
  });
}
