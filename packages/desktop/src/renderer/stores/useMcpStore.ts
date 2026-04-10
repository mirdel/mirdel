import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loggerServiceRenderer } from '@shared'
import type { 
  McpServerConfig, 
  McpServerStatus, 
  McpServerRuntime,
  McpTool,
  McpPrompt,
  McpResource
} from '@shared'

const logger = loggerServiceRenderer.withContext('useMcpStore')

// 重新导出类型，供其他组件使用
export type { 
  McpServerConfig, 
  McpServerStatus, 
  McpServerRuntime,
  McpTool,
  McpPrompt,
  McpResource
}

export const useMcpStore = defineStore('mcp', () => {
  // ===== State =====
  const servers = ref<McpServerConfig[]>([])
  const serverRuntimes = ref<Map<string, McpServerRuntime>>(new Map())
  const isInitialized = ref(false)
  const isLoading = ref(false)
  
  // ===== Computed =====
  
  /**
   * 获取已启用的服务器列表
   */
  const enabledServers = computed(() => 
    servers.value.filter(s => s.enabled)
  )
  
  // ===== Actions =====
  
  /**
   * 初始化：加载所有 MCP 服务器配置
   */
  async function initialize() {
    if (isInitialized.value) {
      logger.info('already initialized, skip')
      return
    }
    
    logger.info('initializing mcp store...')
    isLoading.value = true
    try {
      await loadServers()
      isInitialized.value = true
      logger.info('mcp store initialized successfully')
    } catch (error) {
      logger.error('failed to initialize mcp store', { error })
      throw error
    } finally {
      isLoading.value = false
    }
  }
  
  /**
   * 加载服务器配置列表
   */
  async function loadServers() {
    logger.info('loading mcp servers')
    servers.value = await window.ipc('mcp:listServers')
    logger.info('mcp servers loaded', { count: servers.value.length })
  }
  
  /**
   * 加载服务器运行时信息
   */
  async function loadServerRuntime(serverId: string) {
    logger.info('loading server runtime', { serverId })
    const runtime = await window.ipc('mcp:getServerRuntime', { serverId })
    serverRuntimes.value.set(serverId, runtime)
    return runtime
  }
  
  /**
   * 创建服务器
   */
  async function createServer(config: Omit<McpServerConfig, 'id' | 'createdAt' | 'updatedAt' | 'enabled'>) {
    logger.info('creating mcp server', { name: config.name })
    const server = await window.ipc('mcp:createServer', config)
    await loadServers()
    return server
  }
  
  /**
   * 更新服务器配置
   */
  async function updateServer(id: string, updates: Partial<McpServerConfig>) {
    logger.info('updating mcp server', { id })
    await window.ipc('mcp:updateServer', { id, updates })
    await loadServers()
  }
  
  /**
   * 删除服务器
   */
  async function deleteServer(id: string) {
    logger.info('deleting mcp server', { id })
    await window.ipc('mcp:deleteServer', { id })
    await loadServers()
  }
  
  /**
   * 设置服务器启用状态
   * @param id 服务器 ID
   * @param enabled 是否启用
   */
  async function setEnabled(id: string, enabled: boolean) {
    logger.info('setting mcp server enabled', { id, enabled })
    await window.ipc('mcp:setEnabled', { id, enabled })
    await loadServers()
    if (enabled) {
      await loadServerRuntime(id)
    }
  }
  
  /**
   * 获取服务器日志
   */
  async function getServerLogs(id: string) {
    logger.info('getting server logs', { id })
    return await window.ipc('mcp:getServerLogs', { id })
  }
  
  /**
   * 清空服务器日志
   */
  async function clearServerLogs(id: string) {
    logger.info('clearing server logs', { id })
    await window.ipc('mcp:clearServerLogs', { id })
    await loadServerRuntime(id)
  }
  
  /**
   * 刷新所有数据
   */
  async function refresh() {
    logger.info('refreshing mcp store')
    await loadServers()
  }
  
  /**
   * 获取服务器状态
   */
  function getServerStatus(serverId: string): McpServerStatus {
    const runtime = serverRuntimes.value.get(serverId)
    return runtime?.status || 'stopped'
  }
  
  return {
    // State
    servers,
    serverRuntimes,
    isInitialized,
    isLoading,
    
    // Computed
    enabledServers,
    
    // Actions
    initialize,
    loadServers,
    loadServerRuntime,
    createServer,
    updateServer,
    deleteServer,
    setEnabled,
    getServerLogs,
    clearServerLogs,
    refresh,
    getServerStatus
  }
})
