#!/usr/bin/env node
/**
 * Built-in Filesystem MCP Server
 * 
 * Provides file system operations with optimizations for AI assistants:
 * - Content search (grep) using ripgrep
 * - Batch operations to reduce round trips
 * - Response truncation with cursor-based pagination
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import fg from 'fast-glob';

import { MAX_RESPONSE_SIZE, MAX_BATCH_FILES, MAX_BATCH_PATTERNS, DEFAULT_GREP_CONTEXT } from './constants';
import { TOOLS } from './tools';
import type { TruncatedResult, GrepMatch, GrepResult } from './types';

// ============================================================================
// Utilities
// ============================================================================

function getRipgrepPath(): string {
  try {
    const rgPath = require('@vscode/ripgrep').rgPath;
    if (fsSync.existsSync(rgPath)) {
      return rgPath;
    }
  } catch {
    // Package not available
  }
  return 'rg';
}

function truncateContent(content: string, maxSize: number = MAX_RESPONSE_SIZE): TruncatedResult {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes <= maxSize) {
    return { content, truncated: false };
  }

  let truncateAt = maxSize;
  const buffer = Buffer.from(content, 'utf8');
  const truncatedBuffer = buffer.slice(0, maxSize);
  const truncatedStr = truncatedBuffer.toString('utf8');
  
  const lastNewline = truncatedStr.lastIndexOf('\n');
  if (lastNewline > maxSize * 0.8) {
    truncateAt = lastNewline;
  }

  return {
    content: content.slice(0, truncateAt),
    truncated: true,
    totalSize: bytes,
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function executeRipgrep(
  pattern: string,
  searchPath: string,
  options: { contextLines?: number; maxMatches?: number; ignoreCase?: boolean; glob?: string } = {}
): Promise<GrepResult> {
  const rgPath = getRipgrepPath();
  const args: string[] = ['--json', '--line-number'];

  if (options.contextLines !== undefined) args.push('-C', String(options.contextLines));
  if (options.maxMatches) args.push('-m', String(options.maxMatches));
  if (options.ignoreCase) args.push('-i');
  if (options.glob) args.push('-g', options.glob);
  args.push(pattern, searchPath);

  return new Promise((resolve) => {
    const matches: GrepMatch[] = [];
    let matchCount = 0;
    let truncated = false;
    let outputSize = 0;

    const rg: any = spawn(rgPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';

    rg.stdout.on('data', (data: Buffer) => {
      if (truncated) return;
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.type === 'match') {
            matchCount++;
            const matchStr = JSON.stringify(json);
            if (outputSize + matchStr.length > MAX_RESPONSE_SIZE) {
              truncated = true;
              return;
            }
            outputSize += matchStr.length;
            matches.push({
              file: json.data.path.text,
              line: json.data.line_number,
              content: json.data.lines.text.replace(/\n$/, ''),
            });
          }
        } catch { /* ignore */ }
      }
    });

    rg.on('close', () => resolve({ pattern, matches, matchCount, truncated }));
    rg.on('error', () => resolve({ pattern, matches: [], matchCount: 0, truncated: false }));
  });
}

// ============================================================================
// Tool Handlers
// ============================================================================

async function handleReadFile(args: { path: string; offset?: number; limit?: number }): Promise<string> {
  const content = await fs.readFile(args.path, 'utf-8');
  
  if (args.offset || args.limit) {
    const lines = content.split('\n');
    const start = (args.offset || 1) - 1;
    const end = args.limit ? start + args.limit : lines.length;
    const sliced = lines.slice(start, end).join('\n');
    const result = truncateContent(sliced);
    if (result.truncated) {
      return `[Truncated: showing ${formatSize(Buffer.byteLength(result.content))} of ${formatSize(result.totalSize!)}]\n\n${result.content}`;
    }
    return sliced;
  }

  const result = truncateContent(content);
  if (result.truncated) {
    return `[Truncated: showing ${formatSize(Buffer.byteLength(result.content))} of ${formatSize(result.totalSize!)}]\n\n${result.content}`;
  }
  return content;
}

async function handleReadMany(args: { paths: string[] }): Promise<string> {
  const results: string[] = [];
  let totalSize = 0;
  const maxPerFile = Math.floor(MAX_RESPONSE_SIZE / Math.min(args.paths.length, 10));

  for (const filePath of args.paths.slice(0, MAX_BATCH_FILES)) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const truncated = truncateContent(content, maxPerFile);
      let fileResult = `=== ${filePath} ===\n`;
      if (truncated.truncated) fileResult += `[Truncated: ${formatSize(truncated.totalSize!)}]\n`;
      fileResult += truncated.content;
      
      totalSize += Buffer.byteLength(fileResult);
      if (totalSize > MAX_RESPONSE_SIZE) {
        results.push(`\n[Response truncated: ${args.paths.length - results.length} files not shown]`);
        break;
      }
      results.push(fileResult);
    } catch (error: any) {
      results.push(`=== ${filePath} ===\n[Error: ${error.message}]`);
    }
  }
  return results.join('\n\n');
}

async function handleWriteFile(args: { path: string; content: string }): Promise<string> {
  await fs.mkdir(path.dirname(args.path), { recursive: true });
  await fs.writeFile(args.path, args.content, 'utf-8');
  return `Successfully wrote ${formatSize(Buffer.byteLength(args.content))} to ${args.path}`;
}

async function handleEditFile(args: { path: string; edits: Array<{ oldText: string; newText: string }>; dryRun?: boolean }): Promise<string> {
  let content = await fs.readFile(args.path, 'utf-8');
  const originalContent = content;
  const appliedEdits: string[] = [];
  const failedEdits: string[] = [];

  for (const edit of args.edits) {
    if (content.includes(edit.oldText)) {
      content = content.replace(edit.oldText, edit.newText);
      appliedEdits.push(`✓ Replaced: "${edit.oldText.slice(0, 50)}${edit.oldText.length > 50 ? '...' : ''}"`);
    } else {
      failedEdits.push(`✗ Not found: "${edit.oldText.slice(0, 50)}${edit.oldText.length > 50 ? '...' : ''}"`);
    }
  }

  if (args.dryRun) {
    return `[Dry Run]\n\nApplied: ${appliedEdits.length}\nFailed: ${failedEdits.length}\n\n${appliedEdits.join('\n')}\n${failedEdits.join('\n')}`;
  }

  if (appliedEdits.length > 0 && content !== originalContent) {
    await fs.writeFile(args.path, content, 'utf-8');
  }
  return `Applied: ${appliedEdits.length}, Failed: ${failedEdits.length}\n\n${appliedEdits.join('\n')}\n${failedEdits.join('\n')}`;
}

async function handleApplyEditsBatch(args: { edits: Array<{ path: string; oldText: string; newText: string }>; dryRun?: boolean }): Promise<string> {
  const editsByFile = new Map<string, Array<{ oldText: string; newText: string }>>();
  for (const edit of args.edits) {
    const existing = editsByFile.get(edit.path) || [];
    existing.push({ oldText: edit.oldText, newText: edit.newText });
    editsByFile.set(edit.path, existing);
  }

  const results: string[] = [];
  for (const [filePath, fileEdits] of editsByFile) {
    const result = await handleEditFile({ path: filePath, edits: fileEdits, dryRun: args.dryRun });
    results.push(`=== ${filePath} ===\n${result}`);
  }
  return results.join('\n\n');
}

async function handleListDirectory(args: { path: string }): Promise<string> {
  const entries = await fs.readdir(args.path, { withFileTypes: true });
  const formatted = entries.map(entry => {
    if (entry.isDirectory()) return `📁 ${entry.name}/`;
    if (entry.isSymbolicLink()) return `🔗 ${entry.name}`;
    return `📄 ${entry.name}`;
  });

  const result = truncateContent(formatted.join('\n'));
  if (result.truncated) {
    return `[Truncated: ${entries.length} entries, showing partial list]\n\n${result.content}`;
  }
  return formatted.join('\n');
}

async function handleDirectoryTree(args: { path: string; depth?: number; ignore?: string[] }): Promise<string> {
  const maxDepth = args.depth || 3;
  const defaultIgnore = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/.next/**'];
  const ignore = args.ignore || defaultIgnore;

  const pattern = `${args.path}/**`;
  const entries = await fg(pattern, { onlyFiles: false, deep: maxDepth, ignore, markDirectories: true, stats: false });

  const tree: string[] = [args.path];
  for (const entry of entries.sort()) {
    const relative = path.relative(args.path, entry);
    const depth = relative.split(path.sep).length;
    const indent = '  '.repeat(depth);
    const isDir = entry.endsWith('/');
    const name = path.basename(entry.replace(/\/$/, ''));
    tree.push(`${indent}${isDir ? '📁 ' : '📄 '}${name}`);
  }

  const result = truncateContent(tree.join('\n'));
  if (result.truncated) return `[Truncated tree]\n\n${result.content}`;
  return tree.join('\n');
}

async function handleSearchFiles(args: { path: string; pattern: string; ignore?: string[] }): Promise<string> {
  const defaultIgnore = ['**/node_modules/**', '**/.git/**'];
  const ignore = args.ignore || defaultIgnore;
  const fullPattern = path.join(args.path, args.pattern);
  const files = await fg(fullPattern, { ignore });

  if (files.length === 0) return 'No files found matching the pattern.';

  const result = truncateContent(files.join('\n'));
  if (result.truncated) return `[Found ${files.length} files, showing partial list]\n\n${result.content}`;
  return `Found ${files.length} files:\n\n${files.join('\n')}`;
}

async function handleGrep(args: { path: string; pattern: string; contextLines?: number; ignoreCase?: boolean; glob?: string; maxMatches?: number }): Promise<string> {
  const result = await executeRipgrep(args.pattern, args.path, {
    contextLines: args.contextLines ?? DEFAULT_GREP_CONTEXT,
    ignoreCase: args.ignoreCase,
    glob: args.glob,
    maxMatches: args.maxMatches,
  });

  if (result.matches.length === 0) return `No matches found for pattern: ${args.pattern}`;

  const lines: string[] = [`Found ${result.matchCount} matches${result.truncated ? ' (truncated)' : ''}:`, ''];
  for (const match of result.matches) {
    lines.push(`${match.file}:${match.line}: ${match.content}`);
  }
  return lines.join('\n');
}

async function handleGrepMany(args: { path: string; patterns: string[]; contextLines?: number; ignoreCase?: boolean; glob?: string }): Promise<string> {
  const results: string[] = [];
  
  for (const pattern of args.patterns.slice(0, MAX_BATCH_PATTERNS)) {
    const result = await executeRipgrep(pattern, args.path, {
      contextLines: args.contextLines ?? DEFAULT_GREP_CONTEXT,
      ignoreCase: args.ignoreCase,
      glob: args.glob,
      maxMatches: 50,
    });

    results.push(`=== Pattern: ${pattern} ===`);
    if (result.matches.length === 0) {
      results.push('No matches found.');
    } else {
      results.push(`Found ${result.matchCount} matches${result.truncated ? ' (truncated)' : ''}:`);
      for (const match of result.matches) {
        results.push(`${match.file}:${match.line}: ${match.content}`);
      }
    }
    results.push('');
  }

  const content = results.join('\n');
  const truncated = truncateContent(content);
  if (truncated.truncated) return `[Response truncated]\n\n${truncated.content}`;
  return content;
}

async function handleGetFileInfo(args: { path: string }): Promise<string> {
  const stats = await fs.stat(args.path);
  return JSON.stringify({
    path: args.path,
    type: stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other',
    size: stats.size,
    sizeFormatted: formatSize(stats.size),
    created: stats.birthtime.toISOString(),
    modified: stats.mtime.toISOString(),
    accessed: stats.atime.toISOString(),
    mode: stats.mode.toString(8),
  }, null, 2);
}

async function handleCreateDirectory(args: { path: string }): Promise<string> {
  await fs.mkdir(args.path, { recursive: true });
  return `Directory created: ${args.path}`;
}

async function handleMoveFile(args: { source: string; destination: string }): Promise<string> {
  await fs.rename(args.source, args.destination);
  return `Moved ${args.source} to ${args.destination}`;
}

async function handleDeleteFile(args: { path: string }): Promise<string> {
  const stats = await fs.stat(args.path);
  if (stats.isDirectory()) {
    await fs.rmdir(args.path);
  } else {
    await fs.unlink(args.path);
  }
  return `Deleted: ${args.path}`;
}

// ============================================================================
// Server Setup
// ============================================================================

const server = new Server(
  { name: 'builtin-filesystem', version: '1.0.0' },
  { capabilities: { tools: {}, prompts: {}, resources: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [] }));
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;
    switch (name) {
      case 'read_file': result = await handleReadFile(args as any); break;
      case 'read_many': result = await handleReadMany(args as any); break;
      case 'write_file': result = await handleWriteFile(args as any); break;
      case 'edit_file': result = await handleEditFile(args as any); break;
      case 'apply_edits_batch': result = await handleApplyEditsBatch(args as any); break;
      case 'list_directory': result = await handleListDirectory(args as any); break;
      case 'directory_tree': result = await handleDirectoryTree(args as any); break;
      case 'search_files': result = await handleSearchFiles(args as any); break;
      case 'grep': result = await handleGrep(args as any); break;
      case 'grep_many': result = await handleGrepMany(args as any); break;
      case 'get_file_info': result = await handleGetFileInfo(args as any); break;
      case 'create_directory': result = await handleCreateDirectory(args as any); break;
      case 'move_file': result = await handleMoveFile(args as any); break;
      case 'delete_file': result = await handleDeleteFile(args as any); break;
      default: throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: result }] };
  } catch (error: any) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }
});

// ============================================================================
// Start Server
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Built-in Filesystem MCP Server running on stdio');
}

main().catch(console.error);
