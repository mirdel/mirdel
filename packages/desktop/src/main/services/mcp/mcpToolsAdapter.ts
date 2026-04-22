/**
 * MCP Tools Adapter (使用 @ai-sdk/mcp)
 * 负责聚合所有 MCP 服务器的工具，直接从运行中的服务器实时获取
 */
import * as path from 'node:path';
import { loggerServiceMain, type ToolApprovalMode } from '@shared';
import { getMcpServer, updateMcpServer } from './mcpData';
import { lazyMcpManager } from './LazyMcpManager';
import { mcpServerManager } from './mcpServerManager';
import { getEffectiveWorkingDirs } from '../chat/sessionData';
import { isInToolAllowlist } from '../chat/toolAllowlistData';
import { SERVER_ID as FILESYSTEM_SERVER_ID } from './builtin/filesystem/constants';
import { buildSystemTools } from './system';

const logger = loggerServiceMain.withContext('McpToolsAdapter');

/**
 * 需要校验路径的 filesystem 工具参数字段
 */
const FILESYSTEM_PATH_PARAMS: Record<string, string[]> = {
  'read_file': ['path'],
  'read_many': ['paths'],
  'write_file': ['path'],
  'edit_file': ['path'],
  'apply_edits_batch': ['edits'],  // edits[].path
  'list_directory': ['path'],
  'directory_tree': ['path'],
  'search_files': ['path'],
  'grep': ['path'],
  'grep_many': ['path'],
  'get_file_info': ['path'],
  'create_directory': ['path'],
  'move_file': ['source', 'destination'],
  'delete_file': ['path'],
};

/**
 * 校验路径是否在允许的目录内
 */
function validatePath(requestedPath: string, allowedDirs: string[]): { valid: boolean; error?: string } {
  if (!allowedDirs || allowedDirs.length === 0) {
    return { valid: false, error: 'No working directory is configured. Add an allowed directory in the scenario settings.' };
  }

  // 解析为绝对路径
  const absolutePath = path.resolve(requestedPath);

  // 检查是否在允许目录内
  const isAllowed = allowedDirs.some(dir => {
    const allowedDir = path.resolve(dir);
    return absolutePath === allowedDir || absolutePath.startsWith(allowedDir + path.sep);
  });

  if (!isAllowed) {
    return {
      valid: false,
      error: `Path "${requestedPath}" is outside the allowed working directories. Allowed directories: ${allowedDirs.join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * 从工具参数中提取需要校验的路径
 */
function extractPathsFromArgs(toolName: string, args: any): string[] {
  const paramNames = FILESYSTEM_PATH_PARAMS[toolName];
  if (!paramNames) return [];

  const paths: string[] = [];
  for (const param of paramNames) {
    if (param === 'paths' && Array.isArray(args.paths)) {
      paths.push(...args.paths);
    } else if (param === 'edits' && Array.isArray(args.edits)) {
      for (const edit of args.edits) {
        if (edit.path) paths.push(edit.path);
      }
    } else if (args[param]) {
      paths.push(args[param]);
    }
  }
  return paths;
}

/**
 * 包装 filesystem 工具，添加路径校验
 */
function wrapFilesystemTool(tool: any, toolName: string, sessionId: string | undefined): any {
  const originalExecute = tool.execute;

  return {
    ...tool,
    execute: async (args: any, options: any) => {
      // 获取有效工作目录
      const allowedDirs = sessionId ? getEffectiveWorkingDirs(sessionId) : [];
      // 提取需要校验的路径
      const pathsToValidate = extractPathsFromArgs(toolName, args);
      for (const p of pathsToValidate) {
        const result = validatePath(p, allowedDirs);
        if (!result.valid) {
          logger.warn('Filesystem path validation failed', { toolName, path: p, error: result.error });
          return {
            content: [{ type: 'text', text: result.error }],
            isError: true
          };
        }
      }
      return originalExecute(args, options);
    }
  };
}

/**
 * 给需要确认的工具添加 needsApproval：白名单内不弹确认，否则由 AI SDK 产出 tool-approval-request
 */
function wrapToolWithNeedsApproval(tool: any, serverId: string, toolName: string, toolApprovalMode: ToolApprovalMode): any {
  return {
    ...tool,
    needsApproval: async (args: any) => toolApprovalMode !== 'auto' && !isInToolAllowlist(serverId, toolName, args)
  };
}

/**
 * 给工具添加 serverId 前缀
 * 用于区分不同 MCP 服务器的同名工具
 * 
 * @param tools 原始工具对象
 * @param serverId 服务器 ID
 * @param sessionId 会话 ID（用于获取工作目录配置）
 * @returns 带前缀的工具对象
 */
function prefixToolsWithServerId(
  tools: Record<string, any>,
  serverId: string,
  toolApprovalMode: ToolApprovalMode,
  sessionId?: string
): Record<string, any> {
  const prefixedTools: Record<string, any> = {};
  const isFilesystemServer = serverId === FILESYSTEM_SERVER_ID;

  for (const [toolName, tool] of Object.entries(tools)) {
    const prefixedName = `${serverId}::${toolName}`;
    let wrapped = tool;
    if (isFilesystemServer && FILESYSTEM_PATH_PARAMS[toolName]) {
      wrapped = wrapFilesystemTool(tool, toolName, sessionId);
    }
    prefixedTools[prefixedName] = wrapToolWithNeedsApproval(wrapped, serverId, toolName, toolApprovalMode);
  }
  return prefixedTools;
}

/**
 * MCP 服务器统计信息
 */
export interface McpServerStat {
  serverId: string;
  serverName: string;
  toolsCount: number;
  fetchTime: number;
  status: 'running' | 'started' | 'error';
  error?: string;
}

/**
 * 聚合 MCP 工具的返回结果
 */
export interface AggregatedMcpToolsResult {
  tools: Record<string, any>;
  stats: McpServerStat[];
}

/**
 * 聚合 MCP 工具的选项
 */
export interface AggregateMcpToolsOptions {
  /** MCP 服务器 ID 列表 */
  serverIds: string[];
  /** 会话 ID（用于获取工作目录配置，进行 filesystem 路径校验） */
  sessionId?: string;
  /** 工具审批模式；auto 只跳过确认，不绕过工具自身校验 */
  toolApprovalMode?: ToolApprovalMode;
  /** 网络搜索服务提供者 ID（用于 web_search 选择搜索服务） */
  webSearchProviderId?: string;
  /** 网络搜索来源起始序号（0=无知识库，N=前 N 条为知识库，用于统一 [S1] 编号） */
  citationStartIndex?: number;
}

/**
 * 聚合多个 MCP 服务器的工具
 * 直接从运行中的服务器实时获取，如果服务器未运行则自动启动
 * 
 * @param options 聚合选项
 * @returns 聚合后的工具对象和统计信息
 */
export async function aggregateMcpTools(options: AggregateMcpToolsOptions): Promise<AggregatedMcpToolsResult> {
  const { serverIds, sessionId, toolApprovalMode = 'default', webSearchProviderId, citationStartIndex } = options;
  const startTime = Date.now();
  
  logger.info('Aggregating MCP tools', {
    serverIds,
    serverCount: serverIds.length
  });

  const allTools: Record<string, any> = {};
  const stats: McpServerStat[] = [];

  for (const serverId of serverIds) {
    const serverStartTime = Date.now();
    
    try {
      const config = getMcpServer(serverId);
      if (!config) {
        logger.warn('Server config not found', { serverId });
        continue;
      }

      // 检查服务器是否正在运行
      const wasRunning = lazyMcpManager.isRunning(serverId);
      
      // 从服务器实时获取工具（如果未运行会自动启动）
      const rawTools = await lazyMcpManager.use(serverId, async (client) => {
        return await client.tools();
      });
      
      // 如果服务器是刚刚启动的，需要更新 enabled 状态并加载能力
      if (!wasRunning) {
        logger.info('Server was started automatically, updating enabled status', { serverId });
        // 更新数据库 enabled 状态
        updateMcpServer(serverId, { enabled: true });
        // 加载服务器能力到 runtimeCache
        await mcpServerManager.loadServerCapabilities(serverId);
      }
      
      // 给工具添加 serverId:: 前缀，避免多服务器同名工具冲突
      // 对于 filesystem 服务器，会额外包装工具以进行路径校验
      const prefixedTools = prefixToolsWithServerId(rawTools, serverId, toolApprovalMode, sessionId);
      
      Object.assign(allTools, prefixedTools);

      const toolsCount = Object.keys(rawTools).length;

      stats.push({
        serverId,
        serverName: config.name,
        toolsCount,
        fetchTime: Date.now() - serverStartTime,
        status: wasRunning ? 'running' : 'started'
      });

      logger.info('Tools fetched from server', {
        serverId,
        toolCount: toolsCount,
        wasRunning
      });
    } catch (error) {
      logger.error('Failed to fetch tools from server', {
        serverId,
        error
      });

      // 启动失败，更新 enabled 为 false
      try {
        updateMcpServer(serverId, { enabled: false });
      } catch (updateError) {
        logger.error('Failed to update enabled status after error', { serverId, updateError });
      }

      const config = getMcpServer(serverId);
      stats.push({
        serverId,
        serverName: config?.name || serverId,
        toolsCount: 0,
        fetchTime: Date.now() - serverStartTime,
        status: 'error',
        error: String(error)
      });
    }
  }

  // 注入系统工具（始终可用，不依赖用户选择），同样需要执行确认包装
  const rawSystemTools = buildSystemTools({ sessionId, webSearchProviderId, citationStartIndex });
  const systemServerId = 'system';
  for (const [name, tool] of Object.entries(rawSystemTools)) {
    const toolName = name.includes('::') ? name.split('::')[1] : name;
    allTools[name] = wrapToolWithNeedsApproval(tool, systemServerId, toolName, toolApprovalMode);
  }

  const totalTime = Date.now() - startTime;
  const totalToolCount = Object.keys(allTools).length;

  logger.info('MCP tools aggregation completed', {
    totalToolCount,
    totalTime,
    serverCount: serverIds.length,
    systemToolsCount: Object.keys(rawSystemTools).length
  });

  return {
    tools: allTools,
    stats
  };
}
