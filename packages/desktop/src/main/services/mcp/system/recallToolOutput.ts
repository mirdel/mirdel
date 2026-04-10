/**
 * system::recall_tool_output 工具
 * 回顾历史对话中工具调用的完整返回内容
 */
import { tool } from 'ai';
import { z } from 'zod';
import { getToolResultByCallId } from '../../chat/messageData';

/**
 * 将 tool_result 的 output 转换为文本
 */
function stringifyToolOutput(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output === null || output === undefined) return '';
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

/**
 * 创建 recall_tool_output 工具
 */
export function createRecallToolOutput(sessionId?: string) {
  return tool({
    description: `Retrieve the full output from a previous tool call in the conversation history.
Use this when a historical tool_result message says the result was omitted or truncated.
Find the toolCallId value in the tool_result message and pass it as the argument.
For real-time tools such as filesystem operations, prefer re-running the original tool when you need the latest state instead of relying on historical output.`,
    inputSchema: z.object({
      toolCallId: z.string().describe('Tool call ID from the truncated tool_result message'),
      mode: z.enum(['full', 'head', 'tail']).optional().describe('full = complete output, head = first 2000 characters, tail = last 2000 characters')
    }),
    execute: async ({ toolCallId, mode = 'full' }) => {
      if (!sessionId) {
        return {
          content: [{ type: 'text' as const, text: 'Error: session context is unavailable' }],
          isError: true
        };
      }
      
      const result = getToolResultByCallId(sessionId, toolCallId);
      
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: `Error: no tool result found for toolCallId="${toolCallId}"` }],
          isError: true
        };
      }
      
      const outputText = stringifyToolOutput(result.output);
      let responseText: string;
      
      if (mode === 'full') {
        responseText = outputText;
      } else if (mode === 'head') {
        const limit = 2000;
        if (outputText.length <= limit) {
          responseText = outputText;
        } else {
          responseText = outputText.slice(0, limit) + `\n\n... [truncated, total ${outputText.length} characters]`;
        }
      } else {
        const limit = 2000;
        if (outputText.length <= limit) {
          responseText = outputText;
        } else {
          responseText = `[truncated, total ${outputText.length} characters] ...\n\n` + outputText.slice(-limit);
        }
      }
      
      const meta = result._meta;
      const toolInfo = meta ? `${meta.serverName}::${meta.toolName}` : result.toolName;
      
      return {
        content: [{
          type: 'text' as const,
          text: `[Historical result for ${toolInfo}]\n\n${responseText}`
        }]
      };
    }
  });
}
