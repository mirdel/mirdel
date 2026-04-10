import { getDb } from "../db";
import { nanoid } from "nanoid";
import { loggerServiceMain } from "@shared";
import type { McpServerConfig, McpServerCreateInput, McpServerUpdateInput } from "@shared";
import { getAllBuiltinConfigs, isBuiltinServer, getBuiltinServerDefinition, builtinToConfig } from "./builtin";

const logger = loggerServiceMain.withContext("mcpData");

interface McpServerRow {
  id: string
  name: string
  description: string | null
  useCases: string | null
  type: string
  timeout: number
  command: string | null
  args: string | null
  env: string | null
  cwd: string | null
  url: string | null
  headers: string | null
  enabled: number
  createdAt: number
  updatedAt: number
}

function rowToConfig(row: McpServerRow): McpServerConfig {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    useCases: row.useCases ? JSON.parse(row.useCases) : undefined,
    type: row.type as any,
    timeout: row.timeout,
    command: row.command || undefined,
    args: row.args ? JSON.parse(row.args) : undefined,
    env: row.env ? JSON.parse(row.env) : undefined,
    cwd: row.cwd || undefined,
    url: row.url || undefined,
    headers: row.headers ? JSON.parse(row.headers) : undefined,
    enabled: row.enabled === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function listMcpServers(): McpServerConfig[] {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM mcp_servers 
      ORDER BY updatedAt DESC
    `).all() as McpServerRow[];
    
    // Combine built-in servers with user-configured servers
    const builtinConfigs = getAllBuiltinConfigs();
    const userConfigs = rows.map(rowToConfig);
    
    return [...builtinConfigs, ...userConfigs];
  } catch (error) {
    logger.error("Failed to list MCP servers", { error });
    throw error;
  }
}

export function listEnabledMcpServers(): McpServerConfig[] {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM mcp_servers 
      WHERE enabled = 1
      ORDER BY updatedAt DESC
    `).all() as McpServerRow[];
    
    // Built-in servers are always enabled
    const builtinConfigs = getAllBuiltinConfigs();
    const userConfigs = rows.map(rowToConfig);
    
    return [...builtinConfigs, ...userConfigs];
  } catch (error) {
    logger.error("Failed to list enabled MCP servers", { error });
    throw error;
  }
}

export function getMcpServer(id: string): McpServerConfig | null {
  // Check if it's a built-in server first
  if (isBuiltinServer(id)) {
    const def = getBuiltinServerDefinition(id);
    return def ? builtinToConfig(def) : null;
  }
  
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT * FROM mcp_servers WHERE id = ?
    `).get(id) as McpServerRow | undefined;
    
    return row ? rowToConfig(row) : null;
  } catch (error) {
    logger.error("Failed to get MCP server", { error, id });
    throw error;
  }
}

export function createMcpServer(input: McpServerCreateInput): McpServerConfig {
  try {
    const db = getDb();
    const now = Date.now();
    const id = nanoid();
    
    db.prepare(`
      INSERT INTO mcp_servers (
        id, name, description, useCases, type, timeout,
        command, args, env, cwd, url, headers,
        enabled, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      input.description || null,
      input.useCases ? JSON.stringify(input.useCases) : null,
      input.type,
      input.timeout,
      input.command || null,
      input.args ? JSON.stringify(input.args) : null,
      input.env ? JSON.stringify(input.env) : null,
      input.cwd || null,
      input.url || null,
      input.headers ? JSON.stringify(input.headers) : null,
      0, // enabled 默认为 false
      now,
      now
    );
    
    const server = getMcpServer(id);
    if (!server) throw new Error("Failed to create MCP server");
    
    logger.info("Created MCP server", { id, name: input.name });
    return server;
  } catch (error) {
    logger.error("Failed to create MCP server", { error, input });
    throw error;
  }
}

export function updateMcpServer(id: string, updates: McpServerUpdateInput): void {
  // Built-in servers cannot be updated
  if (isBuiltinServer(id)) {
    logger.warn("Cannot update built-in server", { id });
    return;
  }
  
  try {
    const db = getDb();
    const existing = getMcpServer(id);
    if (!existing) {
      throw new Error(`MCP server not found: ${id}`);
    }
    
    const now = Date.now();
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description || null);
    }
    if (updates.useCases !== undefined) {
      fields.push('useCases = ?');
      values.push(updates.useCases ? JSON.stringify(updates.useCases) : null);
    }
    if (updates.type !== undefined) {
      fields.push('type = ?');
      values.push(updates.type);
    }
    if (updates.timeout !== undefined) {
      fields.push('timeout = ?');
      values.push(updates.timeout);
    }
    if (updates.command !== undefined) {
      fields.push('command = ?');
      values.push(updates.command || null);
    }
    if (updates.args !== undefined) {
      fields.push('args = ?');
      values.push(updates.args ? JSON.stringify(updates.args) : null);
    }
    if (updates.env !== undefined) {
      fields.push('env = ?');
      values.push(updates.env ? JSON.stringify(updates.env) : null);
    }
    if (updates.cwd !== undefined) {
      fields.push('cwd = ?');
      values.push(updates.cwd || null);
    }
    if (updates.url !== undefined) {
      fields.push('url = ?');
      values.push(updates.url || null);
    }
    if (updates.headers !== undefined) {
      fields.push('headers = ?');
      values.push(updates.headers ? JSON.stringify(updates.headers) : null);
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }
    
    fields.push('updatedAt = ?');
    values.push(now);
    values.push(id);
    
    if (fields.length > 1) { // > 1 因为至少有 updatedAt
      db.prepare(`
        UPDATE mcp_servers SET ${fields.join(', ')} WHERE id = ?
      `).run(...values);
      
      logger.info("Updated MCP server", { id });
    }
  } catch (error) {
    logger.error("Failed to update MCP server", { error, id, updates });
    throw error;
  }
}

export function deleteMcpServer(id: string): void {
  // Built-in servers cannot be deleted
  if (isBuiltinServer(id)) {
    throw new Error("Cannot delete built-in server");
  }
  
  try {
    const db = getDb();
    const result = db.prepare(`
      DELETE FROM mcp_servers WHERE id = ?
    `).run(id);
    
    if (result.changes === 0) {
      throw new Error(`MCP server not found: ${id}`);
    }
    
    logger.info("Deleted MCP server", { id });
  } catch (error) {
    logger.error("Failed to delete MCP server", { error, id });
    throw error;
  }
}

// ===== 日志相关 =====

export interface McpServerLog {
  id?: number
  serverId: string
  timestamp: number
  level: 'info' | 'debug' | 'warn' | 'error'
  message: string
}

export function addMcpServerLog(log: Omit<McpServerLog, 'id'>): void {
  // 内置服务器不在数据库中，跳过持久化（日志仍保存在内存中）
  if (isBuiltinServer(log.serverId)) {
    return;
  }
  
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO mcp_server_logs (serverId, timestamp, level, message)
      VALUES (?, ?, ?, ?)
    `).run(log.serverId, log.timestamp, log.level, log.message);
  } catch (error) {
    logger.error("Failed to add MCP server log", { error, log });
  }
}

export function getMcpServerLogs(serverId: string, limit: number = 100): McpServerLog[] {
  // 内置服务器日志只存在内存中，这里返回空
  if (isBuiltinServer(serverId)) {
    return [];
  }
  
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM mcp_server_logs 
      WHERE serverId = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(serverId, limit) as McpServerLog[];
    
    return rows.reverse(); // 返回时按时间正序
  } catch (error) {
    logger.error("Failed to get MCP server logs", { error, serverId });
    return [];
  }
}

export function clearMcpServerLogs(serverId: string): void {
  // 内置服务器日志只存在内存中，这里直接返回
  if (isBuiltinServer(serverId)) {
    return;
  }
  
  try {
    const db = getDb();
    db.prepare(`
      DELETE FROM mcp_server_logs WHERE serverId = ?
    `).run(serverId);
    
    logger.info("Cleared MCP server logs", { serverId });
  } catch (error) {
    logger.error("Failed to clear MCP server logs", { error, serverId });
    throw error;
  }
}
