#!/usr/bin/env node
/**
 * Built-in Shell MCP Server
 *
 * Exposes run_command for git, package managers, and other CLI tools.
 * File read/write should be done via FileSystem when available.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'node:child_process';

const RUN_COMMAND_DESCRIPTION = `Run a shell command. Use for git, package managers (npm, pnpm, pip), and other CLI tools.
For file read/write operations (reading files, listing directories, writing files), prefer using FileSystem tools (read_file, list_directory, write_file) when they are available.
cwd must be one of the allowed working directories (see scenario/session working dirs or [Paths & Tools]).`;

const TOOLS = [
  {
    name: 'run_command',
    description: RUN_COMMAND_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Working directory (required). Must be one of the allowed working directories.' },
        command: { type: 'string', description: 'Command or executable name (e.g. git, npm, python)' },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Arguments to the command (default: [])',
        },
      },
      required: ['cwd', 'command'],
    },
  },
];

function runCommand(params: { cwd: string; command: string; args?: string[] }): Promise<string> {
  return new Promise((resolve, reject) => {
    const { cwd, command, args = [] } = params;
    const child = spawn(command, args, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout?.on('data', (chunk) => chunks.push(chunk));
    child.stderr?.on('data', (chunk) => errChunks.push(chunk));
    child.on('error', (err) => reject(err));
    child.on('close', (code, signal) => {
      const stdout = Buffer.concat(chunks).toString('utf8');
      const stderr = Buffer.concat(errChunks).toString('utf8');
      const out = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');
      if (code !== 0) {
        resolve(`[exit ${code}${signal ? ` signal ${signal}` : ''}]\n${out}`);
      } else {
        resolve(out || '(no output)');
      }
    });
  });
}

const server = new Server(
  { name: 'builtin-shell', version: '1.0.0' },
  { capabilities: { tools: {}, prompts: {}, resources: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [] }));
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name !== 'run_command') {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
  const { cwd, command, args: cmdArgs } = (args || {}) as { cwd?: string; command?: string; args?: string[] };
  if (!cwd || typeof cwd !== 'string') {
    return { content: [{ type: 'text', text: 'Missing required parameter: cwd (working directory)' }], isError: true };
  }
  if (!command || typeof command !== 'string') {
    return { content: [{ type: 'text', text: 'Missing required parameter: command' }], isError: true };
  }
  try {
    const result = await runCommand({
      cwd,
      command,
      args: Array.isArray(cmdArgs) ? cmdArgs : [],
    });
    return { content: [{ type: 'text', text: result }] };
  } catch (error: any) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Built-in Shell MCP Server running on stdio');
}

main().catch(console.error);
