/**
 * AI SDK MCP Client Wrapper
 * 使用 @ai-sdk/mcp 替代手动转换
 */
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import type { experimental_MCPClient as MCPClient } from '@ai-sdk/mcp';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { loggerServiceMain } from '@shared';
import type { McpServerConfig } from '@shared';

const logger = loggerServiceMain.withContext('AiSdkMcpClient');

/**
 * MCP 客户端实例映射
 */
const mcpClients = new Map<string, MCPClient>();

/**
 * 创建 MCP 传输层
 */
function createTransport(config: McpServerConfig) {
  switch (config.type) {
    case 'stdio':
      return new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: {
          ...process.env,
          ...(config.env || {}),
        }
      });

    case 'streamable-http':
      return new StreamableHTTPClientTransport(
        new URL(config.url),
        {
          requestInit: {
            headers: config.headers
          }
        }
      );

    case 'http-sse':
      return new SSEClientTransport(
        new URL(config.url),
        {
          requestInit: {
            headers: config.headers
          }
        }
      );

    default:
      throw new Error(`Unsupported MCP server type: ${(config as any).type}`);
  }
}

/**
 * 获取或创建 MCP 客户端
 */
export async function getOrCreateAiSdkMcpClient(config: McpServerConfig): Promise<MCPClient> {
  const existing = mcpClients.get(config.id);
  if (existing) {
    logger.debug('Reusing existing MCP client', { serverId: config.id });
    return existing;
  }

  logger.info('Creating new AI SDK MCP client', {
    serverId: config.id,
    name: config.name,
    type: config.type
  });

  const transport = createTransport(config);
  const client = await createMCPClient({ transport });

  mcpClients.set(config.id, client);

  logger.info('AI SDK MCP client created', { serverId: config.id });
  return client;
}

/**
 * 关闭 MCP 客户端
 */
export async function closeAiSdkMcpClient(serverId: string): Promise<void> {
  const client = mcpClients.get(serverId);
  if (!client) {
    logger.debug('No client to close', { serverId });
    return;
  }

  logger.info('Closing AI SDK MCP client', { serverId });
  
  try {
    await client.close();
    mcpClients.delete(serverId);
    logger.info('AI SDK MCP client closed', { serverId });
  } catch (error) {
    logger.error('Failed to close MCP client', { serverId, error });
    throw error;
  }
}

/**
 * 获取已存在的客户端（不创建）
 */
export function getExistingMcpClient(serverId: string): MCPClient | undefined {
  return mcpClients.get(serverId);
}

/**
 * 关闭所有 MCP 客户端
 */
export async function closeAllAiSdkMcpClients(): Promise<void> {
  logger.info('Closing all AI SDK MCP clients', { count: mcpClients.size });
  
  const closePromises = Array.from(mcpClients.keys()).map(serverId =>
    closeAiSdkMcpClient(serverId).catch(error => {
      logger.error('Failed to close client', { serverId, error });
    })
  );

  await Promise.all(closePromises);
  logger.info('All AI SDK MCP clients closed');
}
