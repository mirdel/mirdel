/**
 * MCP Server Manager - 管理 MCP 服务器的运行时信息
 * 注意：实际的客户端管理已移至 LazyMcpManager 和 aiSdkMcpClient
 */
import { EventEmitter } from 'node:events';
import { loggerServiceMain } from '@shared';
import type { McpServerRuntime, McpServerStatus } from '@shared';
import * as mcpData from './mcpData';
import { lazyMcpManager } from './LazyMcpManager';

const logger = loggerServiceMain.withContext('McpServerManager');

class McpServerManager extends EventEmitter {
  private maxLogsPerServer = 200;
  // 运行时信息缓存（tools, prompts, resources）
  private runtimeCache = new Map<string, {
    tools: any[];
    prompts: any[];
    resources: any[];
    logs: McpServerRuntime["logs"];
  }>();
  
  constructor() {
    super();
  }
  
  /**
   * 获取服务器运行时信息
   */
  getServerRuntime(serverId: string): McpServerRuntime | null {
    // 从 LazyMcpManager 获取运行状态
    const isRunning = lazyMcpManager.isRunning(serverId);
    const isStarting = lazyMcpManager.isStarting(serverId);
    
    let status: McpServerStatus = 'stopped';
    if (isStarting) {
      status = 'starting';
    } else if (isRunning) {
      status = 'running';
    }
    
    // 获取缓存的运行时信息
    const cached = this.runtimeCache.get(serverId);
    
    // 获取持久化的日志
    const persistedLogs = mcpData.getMcpServerLogs(serverId).map(log => ({
      timestamp: log.timestamp,
      level: log.level,
      message: log.message
    }));
    
    return {
      id: serverId,
      status,
      tools: cached?.tools || [],
      prompts: cached?.prompts || [],
      resources: cached?.resources || [],
      logs: cached?.logs || persistedLogs
    };
  }
  
  /**
   * 加载服务器能力（从 AI SDK MCP 客户端）
   */
  async loadServerCapabilities(serverId: string): Promise<void> {
    try {
      await lazyMcpManager.use(serverId, async (client) => {
        const clientAny = client as any;
        const [listToolsResult, listPromptsResult, listResourcesResult] = await Promise.all([
          clientAny.listTools ? clientAny.listTools() : Promise.resolve({ tools: [] }),
          clientAny.listPrompts ? clientAny.listPrompts() : Promise.resolve({ prompts: [] }),
          clientAny.listResources ? clientAny.listResources() : Promise.resolve({ resources: [] })
        ]);
        
        // 转换为旧格式以保持兼容性
        const tools = (listToolsResult as any).tools || [];
        const prompts = (listPromptsResult as any).prompts || [];
        const resources = (listResourcesResult as any).resources || [];
        
        // 更新缓存
        const cached = this.runtimeCache.get(serverId) || { tools: [], prompts: [], resources: [], logs: [] };
        cached.tools = tools;
        cached.prompts = prompts;
        cached.resources = resources;
        this.runtimeCache.set(serverId, cached);
        
        logger.info('Loaded server capabilities', { 
          serverId, 
          toolsCount: tools.length,
          promptsCount: prompts.length,
          resourcesCount: resources.length
        });
        
        this.addLog(serverId, 'info', 
          `Loaded capabilities: ${tools.length} tools, ${prompts.length} prompts, ${resources.length} resources`
        );
      });
    } catch (error) {
      logger.error('Failed to load server capabilities', { serverId, error });
      this.addLog(serverId, 'error', `Failed to load capabilities: ${error}`);
      throw error;
    }
  }
  
  /**
   * 添加日志
   */
  addLog(serverId: string, level: 'info' | 'debug' | 'warn' | 'error', message: string): void {
    const log = {
      timestamp: Date.now(),
      level,
      message
    };
    
    // 添加到内存缓存
    let cached = this.runtimeCache.get(serverId);
    if (!cached) {
      cached = { tools: [], prompts: [], resources: [], logs: [] };
      this.runtimeCache.set(serverId, cached);
    }
    
    cached.logs.push(log);
    
    // 限制日志数量
    if (cached.logs.length > this.maxLogsPerServer) {
      cached.logs.shift();
    }
    
    // 持久化到数据库
    mcpData.addMcpServerLog({
      serverId,
      ...log
    });
    
    // 触发事件
    this.emit('log', { serverId, ...log });
  }
  
  /**
   * 清空服务器日志
   */
  clearServerLogs(serverId: string): void {
    const cached = this.runtimeCache.get(serverId);
    if (cached) {
      cached.logs = [];
    }
    
    mcpData.clearMcpServerLogs(serverId);
    logger.info('Cleared server logs', { serverId });
  }
  
  /**
   * 清空服务器能力缓存（用于刷新）
   */
  clearServerCapabilitiesCache(serverId: string): void {
    const cached = this.runtimeCache.get(serverId);
    if (cached) {
      cached.tools = [];
      cached.prompts = [];
      cached.resources = [];
    }
    logger.info('Cleared server capabilities cache', { serverId });
  }
}

// 单例
export const mcpServerManager = new McpServerManager();
