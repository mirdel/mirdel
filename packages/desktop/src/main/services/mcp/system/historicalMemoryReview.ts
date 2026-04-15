/**
 * system::historical_memory_review 工具
 * 按时间范围回顾本地历史对话记忆，不做主题语义检索。
 */
import { tool } from 'ai';
import { z } from 'zod';
import {
  resolveHistoricalMemoryTimeRange,
  reviewHistoricalMemory,
  type HistoricalMemoryRangePreset,
} from '../../chat/historicalMemoryService';

const reviewRangeSchema = z.enum([
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'last_month',
  'this_month',
  'custom',
]);

function normalizeRange(input: {
  range: Exclude<HistoricalMemoryRangePreset, 'anytime'>;
  startDate?: string;
  endDate?: string;
}) {
  return resolveHistoricalMemoryTimeRange({
    range: input.range,
    startDate: input.startDate,
    endDate: input.endDate,
  });
}

export function createHistoricalMemoryReview(sessionId?: string) {
  return tool({
    description: `Review the user's local historical conversation memory within a time range.

Use this tool when the user asks what was discussed, worked on, decided, or happened during a period such as yesterday, last week, this month, or last month.
Use historical_memory_search instead when the user asks about a specific topic, entity, project, preference, fact, or decision.

Input rule:
- Choose a time range only. This tool intentionally has no query parameter.
- Use last_month/last_7_days/etc. for relative time periods; the app resolves them using the user's local timezone.
- The tool reads local non-temporary historical chats and excludes the current conversation.`,
    inputSchema: z.object({
      range: reviewRangeSchema.describe('The time range to review. Use custom only with startDate and/or endDate.'),
      startDate: z.string().optional().describe('Custom range start date, preferably YYYY-MM-DD in the user local timezone. Only used when range is custom.'),
      endDate: z.string().optional().describe('Custom range end date, preferably YYYY-MM-DD in the user local timezone. Date-only values are inclusive. Only used when range is custom.'),
      limit: z.number().int().min(1).max(30).optional().describe('Maximum number of memory snippets to return')
    }),
    execute: async ({ range, startDate, endDate, limit }) => {
      if (!sessionId) {
        return {
          content: [{ type: 'text' as const, text: 'Historical memory review failed: session context is unavailable' }],
          isError: true
        };
      }

      let timeRange;
      try {
        timeRange = normalizeRange({ range, startDate, endDate });
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Historical memory review failed: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }

      const hits = await reviewHistoricalMemory({
        sessionId,
        timeRange,
        limit: limit ?? 20,
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
        contentPreview: hit.content.length > 1000
          ? `${hit.content.slice(0, 1000).trimEnd()}...`
          : hit.content,
      }));

      if (displayHits.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No historical conversation memory was found for ${timeRange.label}.` }],
          _meta: {
            historicalMemory: {
              mode: 'review' as const,
              query: '',
              rangeLabel: timeRange.label,
              hits: displayHits,
            }
          }
        };
      }

      const lines: string[] = [
        `Historical conversation memory review for ${timeRange.label} (${displayHits.length} item(s)):`,
        ''
      ];
      for (const [index, hit] of displayHits.entries()) {
        lines.push(`[Memory ${index + 1}]`);
        lines.push(`Session: ${hit.sessionTitle || hit.sessionId}`);
        lines.push(`Time: ${new Date(hit.createdAt).toISOString()}`);
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
            mode: 'review' as const,
            query: '',
            rangeLabel: timeRange.label,
            hits: displayHits,
          }
        }
      };
    }
  });
}
