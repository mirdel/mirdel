import { loggerServiceMain } from '@shared';
import { getOrCreateAiSdkMcpClient, closeAiSdkMcpClient } from './aiSdkMcpClient';
import { getMcpServer } from './mcpData';
import type { experimental_MCPClient as MCPClient } from '@ai-sdk/mcp';

const logger = loggerServiceMain.withContext('LazyMcpManager');

/**
 * MCP 服务器管理器
 * 
 * 特性：
 * 1. 手动启动/停止（通过 enabled 状态控制）
 * 2. 并发安全：防止重复启动
 * 3. 不再自动停止（由用户手动控制）
 */
export class LazyMcpManager {
  private activeServers = new Map<string, {
    startPromise: Promise<MCPClient> | null;
    client: MCPClient | null;
  }>();
  
  /**
   * 使用 MCP 服务器执行操作
   * 
   * @param serverId MCP 服务器 ID
   * @param fn 要执行的操作（接收 MCPClient 实例）
   * @returns 操作的返回值
   * 
   * @example
   * const result = await lazyMcpManager.use('server-id', async (client) => {
   *   const tools = await client.tools();
   *   return tools;
   * });
   */
  async use<T>(serverId: string, fn: (client: MCPClient) => Promise<T>): Promise<T> {
    const client = await this.ensureStarted(serverId);
    return await fn(client);
  }
  
  /**
   * 确保 MCP 服务器已启动
   * 如果未启动，会自动启动；如果正在启动，会等待启动完成
   * 
   * @param serverId MCP 服务器 ID
   * @returns MCPClient 实例
   */
  private async ensureStarted(serverId: string): Promise<MCPClient> {
    const entry = this.activeServers.get(serverId);
    
    if (entry) {
      // 如果正在启动，等待启动完成
      if (entry.startPromise) {
        return await entry.startPromise;
      }
      
      // 已启动
      return entry.client!;
    }
    
    // 启动新的 MCP 服务器
    return await this.startServer(serverId);
  }
  
  /**
   * 启动 MCP 服务器（防止并发启动）
   */
  private async startServer(serverId: string): Promise<MCPClient> {
    // 创建启动 Promise
    const startPromise = (async () => {
      try {
        logger.info("Starting MCP server", { serverId });
        
        // 获取服务器配置
        const config = getMcpServer(serverId);
        if (!config) {
          throw new Error(`MCP server config does not exist: ${serverId}`);
        }

        logger.info("MCP server startup config", {
          serverId,
          type: config.type,
          command: config.command,
          args: config.args,
          cwd: config.cwd,
          nodePath: config.env?.NODE_PATH
        });
        
        // 创建并启动客户端（createMCPClient 内部会自动调用 transport.start()）
        const client = await getOrCreateAiSdkMcpClient(config);
        
        logger.info("MCP server started", { serverId });
        return client;
      } catch (error) {
        logger.error("Failed to start MCP server", { serverId, error });
        this.activeServers.delete(serverId);
        throw error;
      }
    })();
    
    // 记录启动状态
    this.activeServers.set(serverId, {
      startPromise,
      client: null
    });
    
    // 等待启动完成
    const client = await startPromise;
    
    // 更新为已启动状态
    const entry = this.activeServers.get(serverId);
    if (entry) {
      entry.startPromise = null;
      entry.client = client;
    }
    
    return client;
  }
  
  /**
   * 手动启动 MCP 服务器
   */
  async manualStart(serverId: string): Promise<void> {
    await this.ensureStarted(serverId);
  }
  
  /**
   * 手动停止 MCP 服务器
   */
  async manualStop(serverId: string): Promise<void> {
    const entry = this.activeServers.get(serverId);
    
    if (entry) {
      // 关闭客户端
      await closeAiSdkMcpClient(serverId);
      this.activeServers.delete(serverId);
      
      logger.info("MCP server stopped manually", { serverId });
    }
  }
  
  /**
   * 检查 MCP 服务器是否正在运行
   */
  isRunning(serverId: string): boolean {
    const entry = this.activeServers.get(serverId);
    return !!entry && !entry.startPromise;
  }
  
  /**
   * 检查 MCP 服务器是否正在启动
   */
  isStarting(serverId: string): boolean {
    const entry = this.activeServers.get(serverId);
    return !!entry && !!entry.startPromise;
  }
  
  /**
   * 获取 MCP 客户端实例（如果已启动）
   */
  getClient(serverId: string): MCPClient | null {
    const entry = this.activeServers.get(serverId);
    return entry?.client || null;
  }
  
  /**
   * 获取活跃服务器列表（用于调试）
   */
  getActiveServers(): Array<{
    serverId: string;
    isStarting: boolean;
  }> {
    return Array.from(this.activeServers.entries()).map(([serverId, entry]) => ({
      serverId,
      isStarting: !!entry.startPromise
    }));
  }
  
  /**
   * 停止所有 MCP 服务器（应用退出时调用）
   */
  async stopAll(): Promise<void> {
    logger.info("Stopping all MCP servers");
    
    const stopPromises: Promise<void>[] = [];
    
    for (const [serverId] of this.activeServers) {
      stopPromises.push(
        closeAiSdkMcpClient(serverId).catch(error => {
          logger.error("Failed to stop MCP server", { serverId, error });
        })
      );
    }
    
    await Promise.all(stopPromises);
    this.activeServers.clear();
  }
}

// 全局单例
export const lazyMcpManager = new LazyMcpManager();
