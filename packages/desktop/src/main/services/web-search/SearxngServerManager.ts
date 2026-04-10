/**
 * SearXNG Server Manager
 *
 * 管理本地 SearXNG 子进程生命周期：
 * - 启动/停止
 * - 健康检查
 * - 异常退出自动重启
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { app } from 'electron';
import { loggerServiceMain } from '@shared';
import { getProxySettings } from '../settings/settingsData';

const logger = loggerServiceMain.withContext('SearxngServerManager');

const DEFAULT_PORT = 18888;
const STARTUP_TIMEOUT_MS = 45000;
const HEALTH_CHECK_INTERVAL_MS = 30000;
const MAX_RESTART_ATTEMPTS = 3;

export type SearxngServerStatus = 'stopped' | 'starting' | 'running' | 'error';

interface ServerState {
  status: SearxngServerStatus;
  port: number | null;
  error: string | null;
  restartCount: number;
  process: ChildProcessWithoutNullStreams | null;
}

class SearxngServerManager {
  private state: ServerState = {
    status: 'stopped',
    port: null,
    error: null,
    restartCount: 0,
    process: null,
  };

  private startupPromise: Promise<number> | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;

  getStatus(): { status: SearxngServerStatus; port: number | null; error: string | null } {
    return {
      status: this.state.status,
      port: this.state.port,
      error: this.state.error,
    };
  }

  getBaseUrl(): string | null {
    if (this.state.status !== 'running' || !this.state.port) {
      return null;
    }
    return `http://127.0.0.1:${this.state.port}`;
  }

  async start(): Promise<number> {
    if (this.startupPromise) {
      return this.startupPromise;
    }

    if (this.state.status === 'running' && this.state.port) {
      return this.state.port;
    }

    this.startupPromise = this.doStart();
    try {
      return await this.startupPromise;
    } finally {
      this.startupPromise = null;
    }
  }

  async stop(): Promise<void> {
    this.stopHealthCheck();

    const proc = this.state.process;
    this.state.status = 'stopped';
    this.state.error = null;
    this.state.port = null;
    this.state.restartCount = 0;
    this.state.process = null;

    if (!proc) return;

    logger.info('Stopping SearXNG process');
    proc.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 5000);

      proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private async doStart(): Promise<number> {
    this.state.status = 'starting';
    this.state.error = null;

    const runtimeRoot = this.resolveRuntimeRoot();
    const sourceRoot = path.join(runtimeRoot, 'source');
    const webappPath = path.join(sourceRoot, 'searx', 'webapp.py');
    const sourceSettingsPath = path.join(runtimeRoot, 'settings.yml');
    const pythonExecutable = this.resolveBundledPythonExecutable();

    this.ensurePathExists(runtimeRoot, 'SearXNG runtime root');
    this.ensurePathExists(sourceRoot, 'SearXNG source directory');
    this.ensurePathExists(webappPath, 'SearXNG webapp.py');
    this.ensurePathExists(sourceSettingsPath, 'SearXNG settings.yml');
    this.ensurePathExists(pythonExecutable, 'SearXNG bundled Python executable');

    const settingsPath = this.writeRuntimeSettingsFile(sourceSettingsPath);

    const port = await this.resolvePort(DEFAULT_PORT);

    logger.info('Starting SearXNG process', {
      runtimeRoot,
      sourceRoot,
      webappPath,
      settingsPath,
      pythonExecutable,
      port,
      platform: process.platform,
      arch: process.arch,
    });

    return new Promise<number>((resolve, reject) => {
      let settled = false;
      let healthPoll: NodeJS.Timeout | null = null;
      const cleanup = () => {
        clearTimeout(timeout);
        if (healthPoll) {
          clearInterval(healthPoll);
          healthPoll = null;
        }
      };
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        this.state.status = 'error';
        this.state.error = `SearXNG startup timeout (${STARTUP_TIMEOUT_MS}ms)`;
        this.state.process?.kill('SIGKILL');
        reject(new Error(this.state.error));
      }, STARTUP_TIMEOUT_MS);

      const child = spawn(pythonExecutable, ['-m', 'searx.webapp'], {
        cwd: sourceRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          SEARXNG_SETTINGS_PATH: settingsPath,
          SEARXNG_BIND_ADDRESS: '127.0.0.1',
          SEARXNG_PORT: String(port),
          SEARXNG_LIMITER: 'false',
          SEARXNG_PUBLIC_INSTANCE: 'false',
          SEARXNG_SECRET: `mirdel-${randomUUID()}`,
          PYTHONUTF8: '1',
        },
      });

      this.state.process = child;
      this.state.port = port;

      child.stdout.on('data', (chunk: Buffer) => {
        const message = chunk.toString().trim();
        if (message) {
          logger.debug('[searxng]', { stdout: message });
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const message = chunk.toString().trim();
        if (message) {
          logger.warn('[searxng]', { stderr: message });
        }
      });

      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        this.state.status = 'error';
        this.state.error = error.message;
        this.state.process = null;
        reject(error);
      });

      child.once('exit', (code, signal) => {
        const wasRunning = this.state.status === 'running';

        logger.info('SearXNG process exited', { code, signal, wasRunning });
        this.state.process = null;

        if (settled) {
          if (wasRunning) {
            this.handleUnexpectedExit();
          }
          return;
        }

        settled = true;
        cleanup();
        this.state.status = 'error';
        this.state.error = `SearXNG exited before ready: code=${code}, signal=${signal}`;
        reject(new Error(this.state.error));
      });

      healthPoll = setInterval(async () => {
        if (settled) return;
        const ok = await this.checkHealth(port);
        if (!ok) return;

        settled = true;
        cleanup();
        this.state.status = 'running';
        this.state.error = null;
        this.state.restartCount = 0;
        this.startHealthCheck();
        resolve(port);
      }, 500);
    });
  }

  private handleUnexpectedExit(): void {
    this.stopHealthCheck();
    this.state.status = 'error';
    this.state.port = null;

    if (this.state.restartCount >= MAX_RESTART_ATTEMPTS) {
      this.state.error = 'SearXNG max restart attempts reached';
      logger.error(this.state.error);
      return;
    }

    this.state.restartCount += 1;
    logger.warn('SearXNG crashed, restarting...', {
      attempt: this.state.restartCount,
      maxAttempts: MAX_RESTART_ATTEMPTS,
    });

    setTimeout(() => {
      this.start().catch((error) => {
        logger.error('Failed to restart SearXNG', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, 1000);
  }

  private startHealthCheck(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(() => {
      const port = this.state.port;
      if (!port || this.state.status !== 'running') return;

      this.checkHealth(port).then((ok) => {
        if (!ok) {
          logger.warn('SearXNG health check failed', { port });
        }
      }).catch((error) => {
        logger.warn('SearXNG health check error', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private stopHealthCheck(): void {
    if (!this.healthCheckTimer) return;
    clearInterval(this.healthCheckTimer);
    this.healthCheckTimer = null;
  }

  private async checkHealth(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private resolveRuntimeRoot(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'searxng');
    }
    return path.join(app.getAppPath(), 'searxng');
  }

  private resolveRuntimeConfigRoot(): string {
    return path.join(app.getPath('userData'), 'searxng');
  }

  private resolveRuntimeSettingsPath(): string {
    return path.join(this.resolveRuntimeConfigRoot(), 'settings.runtime.yml');
  }

  private resolveBundledPythonRoot(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, '.runtime', 'python');
    }
    return path.join(app.getAppPath(), '.runtime', 'python');
  }

  private resolveBundledPythonExecutable(): string {
    const pythonRoot = this.resolveBundledPythonRoot();
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'darwin' && arch === 'arm64') {
      return path.join(pythonRoot, 'darwin-arm64', 'bin', 'python3');
    }
    if (platform === 'darwin' && arch === 'x64') {
      return path.join(pythonRoot, 'darwin-x64', 'bin', 'python3');
    }
    if (platform === 'win32' && arch === 'x64') {
      return path.join(pythonRoot, 'win32-x64', 'python.exe');
    }
    if (platform === 'win32' && arch === 'arm64') {
      return path.join(pythonRoot, 'win32-arm64', 'python.exe');
    }

    throw new Error(`Unsupported platform/arch for bundled SearXNG runtime: ${platform}/${arch}`);
  }

  private ensurePathExists(targetPath: string, label: string): void {
    if (fs.existsSync(targetPath)) return;
    throw new Error(`${label} not found: ${targetPath}`);
  }

  private writeRuntimeSettingsFile(sourceSettingsPath: string): string {
    const runtimeSettingsPath = this.resolveRuntimeSettingsPath();
    const runtimeConfigRoot = this.resolveRuntimeConfigRoot();
    const sourceContent = fs.readFileSync(sourceSettingsPath, 'utf8');
    const nextContent = this.buildRuntimeSettingsContent(sourceContent);

    fs.mkdirSync(runtimeConfigRoot, { recursive: true });
    fs.writeFileSync(runtimeSettingsPath, nextContent, 'utf8');

    return runtimeSettingsPath;
  }

  private buildRuntimeSettingsContent(sourceContent: string): string {
    const proxySettings = getProxySettings();
    const normalizedSource = sourceContent.replace(/\r\n/g, '\n');
    const customServer = proxySettings.mode === 'custom' ? proxySettings.server.trim() : '';
    if (!customServer) {
      return normalizedSource;
    }

    const lines = normalizedSource.split('\n');
    const outgoingIndex = lines.findIndex((line) => line.trim() === 'outgoing:');
    if (outgoingIndex < 0) {
      logger.warn('SearXNG base settings missing outgoing block, using template content without proxy override');
      return normalizedSource;
    }

    let insertIndex = lines.length;
    for (let index = outgoingIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      if (!line.startsWith(' ')) {
        insertIndex = index;
        break;
      }
    }

    const proxyBlock = [
      '  proxies:',
      '    all://:',
      `      - ${customServer}`,
    ];

    const nextLines = [
      ...lines.slice(0, insertIndex),
      ...proxyBlock,
      ...lines.slice(insertIndex),
    ];

    logger.info('Prepared SearXNG runtime proxy config', {
      mode: proxySettings.mode,
      server: customServer,
    });

    return nextLines.join('\n');
  }

  private async resolvePort(preferredPort: number): Promise<number> {
    if (await this.isPortAvailable(preferredPort)) {
      return preferredPort;
    }

    return new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.once('error', (error) => reject(error));
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close(() => reject(new Error('Failed to allocate SearXNG port')));
          return;
        }
        const { port } = address;
        server.close(() => resolve(port));
      });
    });
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });
    });
  }
}

export const searxngServerManager = new SearxngServerManager();
