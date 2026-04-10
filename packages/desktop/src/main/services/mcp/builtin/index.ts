/**
 * Built-in MCP Servers Registry
 * 
 * Manages built-in MCP servers that are bundled with the application.
 * These servers cannot be disabled by users.
 */

import * as path from 'node:path';
import { app } from 'electron';
import type { McpServerConfig } from '@shared';

// Import server metadata from each built-in server
import {
  SERVER_ID as FILESYSTEM_ID,
  SERVER_NAME as FILESYSTEM_NAME,
  SERVER_DESCRIPTION as FILESYSTEM_DESCRIPTION,
  SERVER_USE_CASES as FILESYSTEM_USE_CASES,
  SERVER_SCRIPT_PATH as FILESYSTEM_SCRIPT_PATH,
} from './filesystem/constants';

/**
 * Built-in server definition
 */
export interface BuiltinServerDefinition {
  id: string;
  name: string;
  description: string;
  useCases: string[];
  /** Relative path from the builtin-servers directory */
  scriptPath: string;
}

/**
 * Registry of all built-in MCP servers
 */
export const BUILTIN_SERVERS: BuiltinServerDefinition[] = [
  {
    id: FILESYSTEM_ID,
    name: FILESYSTEM_NAME,
    description: FILESYSTEM_DESCRIPTION,
    useCases: FILESYSTEM_USE_CASES,
    scriptPath: FILESYSTEM_SCRIPT_PATH,
  },
];

/**
 * Get the absolute path to the built-in servers directory
 */
export function getBuiltinServersDir(): string {
  if (app.isPackaged) {
    // In production, builtin servers are in resources/builtin-servers
    return path.join(process.resourcesPath, 'builtin-servers');
  } else {
    // In development, builtin servers are in dist/main/builtin-servers/
    // __dirname is dist/main/ when running from compiled output
    return path.join(__dirname, 'builtin-servers');
  }
}

/**
 * Get the absolute path to a built-in server script
 */
export function getBuiltinServerPath(serverDef: BuiltinServerDefinition): string {
  return path.join(getBuiltinServersDir(), serverDef.scriptPath);
}

/**
 * Check if a server ID is a built-in server
 */
export function isBuiltinServer(serverId: string): boolean {
  return serverId.startsWith('builtin:');
}

/**
 * Get built-in server definition by ID
 */
export function getBuiltinServerDefinition(serverId: string): BuiltinServerDefinition | undefined {
  return BUILTIN_SERVERS.find(s => s.id === serverId);
}

/**
 * Get the Node runtime executable for built-in MCP servers.
 * Use Electron binary itself and run it as Node.js runtime.
 */
function getNodeExecutable(): string {
  return process.execPath;
}

function getBuiltinServerNodePath(): string | undefined {
  const paths = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'app.asar', 'node_modules'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
        path.join(process.resourcesPath, 'node_modules'),
      ]
    : [
        path.join(app.getAppPath(), 'node_modules'),
      ];

  const merged = [...paths, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  return merged || undefined;
}

/**
 * Convert built-in server definition to McpServerConfig format
 */
export function builtinToConfig(def: BuiltinServerDefinition): McpServerConfig {
  const nodePath = getBuiltinServerNodePath();
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    useCases: def.useCases,
    type: 'stdio',
    timeout: 30000,
    command: getNodeExecutable(),
    args: [getBuiltinServerPath(def)],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      ...(nodePath ? { NODE_PATH: nodePath } : {}),
    },
    enabled: true, // Built-in servers are always enabled
    isBuiltin: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

/**
 * Get all built-in server configs
 */
export function getAllBuiltinConfigs(): McpServerConfig[] {
  return BUILTIN_SERVERS.map(builtinToConfig);
}

/** When a skill is active, these servers are auto-included so the skill has file capability. */
export const BUILTIN_SKILL_REQUIRED_SERVER_IDS: string[] = [FILESYSTEM_ID];
