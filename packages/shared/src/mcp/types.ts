// MCP (Model Context Protocol) 相关类型定义

export type McpTransportType = 'stdio' | 'streamable-http' | 'http-sse'

export type McpServerStatus = 'running' | 'stopped' | 'starting' | 'error'

export interface McpServerConfig {
  id: string
  name: string
  description?: string
  useCases?: string[]
  type: McpTransportType
  timeout: number
  
  // stdio 特有配置
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  
  // http 特有配置
  url?: string
  headers?: Record<string, string>
  
  // 是否启用（启用 = 运行中）
  enabled: boolean
  
  // 是否为内置服务器（内置服务器不可禁用、不可删除）
  isBuiltin?: boolean
  
  createdAt: number
  updatedAt: number
}

export interface McpTool {
  name: string
  description?: string
  inputSchema: any  // JSON Schema
}

export interface McpPrompt {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
}

export interface McpResource {
  uri: string
  name: string
  mimeType?: string
  description?: string
}

export interface McpServerRuntime {
  id: string
  status: McpServerStatus
  tools: McpTool[]
  prompts: McpPrompt[]
  resources: McpResource[]
  logs: Array<{
    timestamp: number
    level: 'info' | 'debug' | 'warn' | 'error'
    message: string
  }>
  lastError?: string
}

export interface McpServerCreateInput {
  name: string
  description?: string
  useCases?: string[]
  type: McpTransportType
  timeout: number
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
}

export interface McpServerUpdateInput {
  name?: string
  description?: string
  useCases?: string[]
  type?: McpTransportType
  timeout?: number
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  enabled?: boolean
}
