/**
 * 工具执行白名单：用户点击「加入白名单」后持久化
 * - MCP/系统普通工具：按 serverId::toolName 存
 * - 命令行（system::run_command）：按 command 存（不含 cwd）
 */
import { getDb } from '../db';

export type ToolAllowlistEntry = { type: 'tool'; key: string } | { type: 'shell'; key: string };

export function getToolAllowlist(): ToolAllowlistEntry[] {
  const d = getDb();
  const rows = d.prepare('SELECT type, key FROM tool_allowlist ORDER BY createdAt DESC').all() as { type: string; key: string }[];
  return rows.map(r => ({ type: r.type as 'tool' | 'shell', key: r.key }));
}

export function addToolAllowlistEntry(entry: ToolAllowlistEntry): void {
  const d = getDb();
  const now = Date.now();
  d.prepare('INSERT OR IGNORE INTO tool_allowlist (type, key, createdAt) VALUES (?, ?, ?)').run(entry.type, entry.key, now);
}

export function removeToolAllowlistEntry(entry: ToolAllowlistEntry): void {
  const d = getDb();
  d.prepare('DELETE FROM tool_allowlist WHERE type = ? AND key = ?').run(entry.type, entry.key);
}

export function clearToolAllowlist(): void {
  const d = getDb();
  d.prepare('DELETE FROM tool_allowlist').run();
}

export function isInToolAllowlist(serverId: string, toolName: string, args: { command?: string } | undefined): boolean {
  const d = getDb();
  const isRunCommandTool = serverId === 'system' && toolName === 'run_command';
  if (isRunCommandTool && args?.command != null) {
    const key = String(args.command).trim();
    const row = d.prepare('SELECT 1 FROM tool_allowlist WHERE type = ? AND key = ?').get('shell', key);
    return !!row;
  }
  const key = `${serverId}::${toolName}`;
  const row = d.prepare('SELECT 1 FROM tool_allowlist WHERE type = ? AND key = ?').get('tool', key);
  return !!row;
}
