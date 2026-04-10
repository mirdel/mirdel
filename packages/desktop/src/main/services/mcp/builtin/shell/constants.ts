/**
 * Shell MCP Server - Constants
 */

export const SERVER_ID = 'builtin:shell';
export const SERVER_NAME = 'Shell';
export const SERVER_DESCRIPTION = 'Run shell commands (e.g. git, npm, python). For file read/write, prefer FileSystem when available.';
export const SERVER_USE_CASES = [
  'Run git commands (clone, status, add, commit, push)',
  'Run package managers (npm, pnpm, pip)',
  'Run scripts and CLI tools',
  'Execute system commands that are not file I/O',
];
export const SERVER_SCRIPT_PATH = 'shell.cjs';
