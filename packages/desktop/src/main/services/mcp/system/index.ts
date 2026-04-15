/**
 * 系统工具模块
 * 这些工具始终可用，不依赖用户选择的 MCP 服务器
 */
import { createWebSearch } from './webSearch';
import { createWebScrape } from './fetchWebpage';
import { createRunScript } from './skillTools';
import { createRunCommand } from './runCommand';
import { createHistoricalMemorySearch } from './historicalMemorySearch';

export interface SystemToolsOptions {
  /** 会话 ID（用于 run_command 工作目录与权限） */
  sessionId?: string;
  /** 网络搜索服务提供者 ID（用于 web_search 选择搜索服务） */
  webSearchProviderId?: string;
  /** 网络搜索来源起始序号（0=无知识库，用于统一 [S1] 编号） */
  citationStartIndex?: number;
}

/**
 * 构建所有系统工具
 * @param options 配置选项
 */
export function buildSystemTools(options?: SystemToolsOptions): Record<string, any> {
  const { sessionId, webSearchProviderId, citationStartIndex } = options || {};
  return {
    'system::web_search': createWebSearch(webSearchProviderId, citationStartIndex),
    'system::web_scrape': createWebScrape(),
    'system::historical_memory_search': createHistoricalMemorySearch(sessionId),
    'system::run_script': createRunScript(),
    'system::run_command': createRunCommand(sessionId),
  };
}
