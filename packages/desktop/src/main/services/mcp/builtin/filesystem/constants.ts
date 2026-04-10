/**
 * Filesystem MCP Server - Constants
 */

// ============================================================================
// Server Metadata
// ============================================================================

export const SERVER_ID = 'builtin:filesystem';
export const SERVER_NAME = 'FileSystem';
export const SERVER_DESCRIPTION = 'Built-in file system operations with grep, batch operations, and smart truncation.';
export const SERVER_USE_CASES = [
  'Read and write files',
  'Search file contents with ripgrep',
  'Navigate directory structures',
  'Batch file operations',
];
export const SERVER_SCRIPT_PATH = 'filesystem.cjs';

// ============================================================================
// Runtime Constants
// ============================================================================

/** Maximum response size in bytes (100KB) */
export const MAX_RESPONSE_SIZE = 100 * 1024;

/** Default context lines for grep */
export const DEFAULT_GREP_CONTEXT = 2;

/** Maximum number of files to read in batch */
export const MAX_BATCH_FILES = 50;

/** Maximum number of grep patterns in batch */
export const MAX_BATCH_PATTERNS = 20;
