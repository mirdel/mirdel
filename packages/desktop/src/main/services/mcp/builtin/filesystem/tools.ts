/**
 * Filesystem MCP Server - Tool Definitions
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MAX_BATCH_FILES, MAX_BATCH_PATTERNS } from './constants';

export const TOOLS: Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file. Supports offset/limit for large files. Returns truncated content with metadata if file exceeds size limit.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        offset: { type: 'number', description: 'Line number to start reading from (1-based)' },
        limit: { type: 'number', description: 'Maximum number of lines to read' },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_many',
    description: 'Read multiple files in a single request. Reduces round trips. Each file result includes truncation info.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of absolute file paths to read',
          maxItems: MAX_BATCH_FILES,
        },
      },
      required: ['paths'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file. Creates parent directories if needed. Overwrites existing file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Edit a file by replacing specific text. Supports multiple replacements in one call.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              oldText: { type: 'string', description: 'Text to find and replace' },
              newText: { type: 'string', description: 'Replacement text' },
            },
            required: ['oldText', 'newText'],
          },
          description: 'Array of edits to apply',
        },
        dryRun: { type: 'boolean', description: 'If true, return diff without applying changes' },
      },
      required: ['path', 'edits'],
    },
  },
  {
    name: 'apply_edits_batch',
    description: 'Apply edits to multiple files in a single request. Reduces round trips for refactoring.',
    inputSchema: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Absolute path to the file' },
              oldText: { type: 'string', description: 'Text to find and replace' },
              newText: { type: 'string', description: 'Replacement text' },
            },
            required: ['path', 'oldText', 'newText'],
          },
          description: 'Array of file edits',
        },
        dryRun: { type: 'boolean', description: 'If true, return diff without applying changes' },
      },
      required: ['edits'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and directories in a path. Returns file names with type indicators.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the directory' },
      },
      required: ['path'],
    },
  },
  {
    name: 'directory_tree',
    description: 'Get a tree view of directory structure. Uses fast-glob for efficiency.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the directory' },
        depth: { type: 'number', description: 'Maximum depth to traverse (default: 3)' },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description: 'Glob patterns to ignore (default: node_modules, .git, etc.)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Search for files by name pattern using glob. Returns matching file paths.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Base directory to search in' },
        pattern: { type: 'string', description: 'Glob pattern to match (e.g., "**/*.ts")' },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description: 'Glob patterns to ignore',
        },
      },
      required: ['path', 'pattern'],
    },
  },
  {
    name: 'grep',
    description: 'Search file contents using ripgrep. Supports regex patterns, context lines, and result limiting.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory or file to search in' },
        pattern: { type: 'string', description: 'Search pattern (regex supported)' },
        contextLines: { type: 'number', description: 'Lines of context before/after match (default: 2)' },
        ignoreCase: { type: 'boolean', description: 'Case-insensitive search' },
        glob: { type: 'string', description: 'Only search files matching this glob pattern' },
        maxMatches: { type: 'number', description: 'Maximum matches to return' },
      },
      required: ['path', 'pattern'],
    },
  },
  {
    name: 'grep_many',
    description: 'Search for multiple patterns in a single request. Efficient for finding related code.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to search in' },
        patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of search patterns',
          maxItems: MAX_BATCH_PATTERNS,
        },
        contextLines: { type: 'number', description: 'Lines of context before/after match' },
        ignoreCase: { type: 'boolean', description: 'Case-insensitive search' },
        glob: { type: 'string', description: 'Only search files matching this glob pattern' },
      },
      required: ['path', 'patterns'],
    },
  },
  {
    name: 'get_file_info',
    description: 'Get file or directory metadata (size, modified time, permissions).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file or directory' },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_directory',
    description: 'Create a directory and any necessary parent directories.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the directory to create' },
      },
      required: ['path'],
    },
  },
  {
    name: 'move_file',
    description: 'Move or rename a file or directory.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source path' },
        destination: { type: 'string', description: 'Destination path' },
      },
      required: ['source', 'destination'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file or empty directory.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to delete' },
      },
      required: ['path'],
    },
  },
];
