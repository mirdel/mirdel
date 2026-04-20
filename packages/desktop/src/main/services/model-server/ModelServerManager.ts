/**
 * Model Server Manager
 *
 * 管理 llama-server 子进程生命周期
 *
 * 功能：
 * - 启动 llama-server（router mode）
 * - 固定端口 + API key 鉴权
 * - 模型加载/卸载（/models/load, /models/unload）
 * - 健康检查与崩溃自动重启
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { loggerServiceMain } from '@shared'
import { listLocalModelCatalog } from './localModelCatalog'

const logger = loggerServiceMain.withContext('ModelServerManager')

// 配置
const MAX_RESTART_ATTEMPTS = 3
const STARTUP_TIMEOUT_MS = 30000 // 30 秒启动超时
const STARTUP_HEALTH_PROBE_INTERVAL_MS = 300 // 启动阶段健康探测间隔
const HEALTH_CHECK_INTERVAL_MS = 30000 // 30 秒健康检查间隔
export const LOCAL_MODEL_SERVER_PORT = 39391

function shouldSkipModelServerStdoutLog(message: string): boolean {
  const normalized = message.toLowerCase()
  if (normalized.includes('error') || normalized.includes('failed')) return false

  return (
    normalized.includes('get /health') ||
    normalized.includes('get /v1/health') ||
    normalized.includes('get /models') ||
    normalized.includes('/v1/embeddings') ||
    normalized.includes('/embeddings')
  )
}

export type ServerStatus = 'stopped' | 'starting' | 'running' | 'error'

interface ServerState {
  status: ServerStatus
  port: number | null
  error: string | null
  restartCount: number
  process: ChildProcess | null
}

class ModelServerManager {
  private state: ServerState = {
    status: 'stopped',
    port: null,
    error: null,
    restartCount: 0,
    process: null
  }

  private healthCheckTimer: NodeJS.Timeout | null = null
  private startupPromise: Promise<number> | null = null
  private localApiKey: string | null = null
  private stopping = false

  /**
   * 获取服务器状态
   */
  getStatus(): { status: ServerStatus; port: number | null; error: string | null } {
    return {
      status: this.state.status,
      port: this.state.port,
      error: this.state.error
    }
  }

  /**
   * 获取服务 base URL（不含 /v1 前缀）
   * 使用 OpenAI 兼容 API 时需手动拼接 /v1
   */
  getBaseUrl(): string | null {
    if (this.state.status === 'running' && this.state.port) {
      return `http://127.0.0.1:${this.state.port}`
    }
    return null
  }

  /**
   * 获取本地模型目录（持久化目录，重启后不变）
   */
  getModelsDirPath(): string {
    return path.join(app.getPath('userData'), 'model-server', 'models')
  }

  getModelFilePath(fileName: string): string {
    return path.join(this.getModelsDirPath(), fileName)
  }

  async fetchServerStatus(): Promise<Record<string, unknown> | null> {
    const baseUrl = await this.ensureBaseUrl()
    if (!baseUrl) return null

    try {
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) return null

      const payload = await response.json() as {
        data?: Array<{
          id?: string
          status?: {
            value?: string
          }
        }>
      }

      const list = Array.isArray(payload?.data) ? payload.data : []
      const models: Record<string, { state: string; rawStatus?: string }> = {}

      for (const item of list) {
        const modelId = String(item?.id || '').trim()
        if (!modelId) continue
        const rawStatus = String(item?.status?.value || '').trim()
        models[modelId] = {
          state: mapRouterStatusToRuntimeState(rawStatus),
          ...(rawStatus ? { rawStatus } : {}),
        }
      }

      return { models }
    } catch (error) {
      logger.warn('Failed to fetch model server status', { error: error instanceof Error ? error.message : String(error) })
      return null
    }
  }

  async preloadModel(modelId: string): Promise<void> {
    const normalizedModelId = String(modelId || '').trim()
    if (!normalizedModelId) throw new Error('modelId is required')
    await this.requestModelControl('/models/load', normalizedModelId)
  }

  async unloadModel(modelId: string): Promise<void> {
    const normalizedModelId = String(modelId || '').trim()
    if (!normalizedModelId) throw new Error('modelId is required')
    await this.requestModelControl('/models/unload', normalizedModelId)
  }

  /**
   * 启动服务器
   * @returns Promise<number> 服务器端口
   */
  async start(options?: { apiKey?: string }): Promise<number> {
    if (options?.apiKey) {
      this.localApiKey = options.apiKey
    }

    // 如果正在启动，返回现有的 Promise
    if (this.startupPromise) {
      return this.startupPromise
    }

    // 如果已经在运行，直接返回端口
    if (this.state.status === 'running' && this.state.port) {
      return this.state.port
    }

    this.startupPromise = this.doStart()

    try {
      const port = await this.startupPromise
      return port
    } finally {
      this.startupPromise = null
    }
  }

  /**
   * 旋转本地服务 API Key，并重启服务使其立即生效
   */
  async rotateApiKey(apiKey: string): Promise<number> {
    this.localApiKey = apiKey

    if (this.startupPromise) {
      try {
        await this.startupPromise
      } catch {
        // ignore startup error; restart below
      }
    }

    if (this.state.status !== 'stopped' || this.state.process) {
      await this.stop()
    }

    return this.start({ apiKey })
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    this.stopHealthCheck()

    if (this.state.process) {
      logger.info('Stopping model server...')
      this.stopping = true

      // 发送关闭信号
      this.state.process.kill('SIGTERM')

      // 等待进程退出（最多 5 秒）
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.state.process) {
            logger.warn('Force killing model server process')
            this.state.process.kill('SIGKILL')
          }
          resolve()
        }, 5000)

        if (this.state.process) {
          this.state.process.once('exit', () => {
            clearTimeout(timeout)
            resolve()
          })
        } else {
          clearTimeout(timeout)
          resolve()
        }
      })
    }

    this.stopping = false
    this.state = {
      status: 'stopped',
      port: null,
      error: null,
      restartCount: 0,
      process: null
    }

    logger.info('Model server stopped')
  }

  // ==================== 私有方法 ====================

  private async doStart(): Promise<number> {
    this.state.status = 'starting'
    this.state.error = null

    const serverPath = this.getServerPath()
    const modelsDir = this.getModelsDirPath()

    if (!fs.existsSync(serverPath)) {
      this.state.status = 'error'
      this.state.error = `llama-server binary not found: ${serverPath}`
      throw new Error(`llama-server binary not found: ${serverPath}`)
    }

    fs.mkdirSync(modelsDir, { recursive: true })
    const presetPath = await this.writeModelsPresetFile()
    const args = this.getServerArgs(presetPath)

    logger.info('Starting model server...', { serverPath, modelsDir, presetPath, args })

    return new Promise<number>((resolve, reject) => {
      let probeTimer: NodeJS.Timeout | null = null
      const timeout = setTimeout(() => {
        this.state.status = 'error'
        this.state.error = 'Startup timeout'
        if (this.state.process) {
          this.state.process.kill('SIGKILL')
          this.state.process = null
        }
        reject(new Error('Model server startup timeout'))
      }, STARTUP_TIMEOUT_MS)

      let settled = false
      let probing = false
      const cleanup = () => {
        clearTimeout(timeout)
        if (probeTimer) {
          clearInterval(probeTimer)
          probeTimer = null
        }
      }

      const settleReject = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        this.state.status = 'error'
        this.state.error = error.message
        reject(error)
      }

      const settleResolve = (port: number) => {
        if (settled) return
        settled = true
        cleanup()
        this.state.status = 'running'
        this.state.port = port
        this.state.restartCount = 0
        this.state.error = null
        this.startHealthCheck()
        resolve(port)
      }

      try {
        const child = spawn(serverPath, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
          }
        })

        this.state.process = child

        child.stdout?.on('data', (data: Buffer) => {
          const message = data.toString().trim()
          if (message && !shouldSkipModelServerStdoutLog(message)) {
            logger.debug('[model-server]', { stdout: message })
          }
        })

        child.stderr?.on('data', (data: Buffer) => {
          const message = data.toString().trim()
          if (message && !shouldSkipModelServerStdoutLog(message)) {
            logger.warn('[model-server]', { stderr: message })
          }
        })

        child.on('exit', (code, signal) => {
          const wasStarting = this.state.status === 'starting'
          this.state.process = null
          logger.info('Model server process exited', { code, signal })

          if (wasStarting && !settled) {
            settleReject(new Error(`Model server exited unexpectedly during startup: code=${code}, signal=${signal}`))
            return
          }

          if (this.stopping) {
            return
          }

          if (this.state.status === 'running') {
            this.handleUnexpectedExit()
          }
        })

        child.on('error', (err) => {
          logger.error('Model server process error', { error: err.message })
          this.state.process = null
          if (!settled) {
            settleReject(err)
          }
        })
      } catch (err) {
        settleReject(err instanceof Error ? err : new Error(String(err)))
      }

      probeTimer = setInterval(async () => {
        if (settled || probing) return
        probing = true
        try {
          const healthy = await this.probeHealth(2000)
          if (healthy) {
            settleResolve(LOCAL_MODEL_SERVER_PORT)
          }
        } finally {
          probing = false
        }
      }, STARTUP_HEALTH_PROBE_INTERVAL_MS)
    })
  }

  private handleUnexpectedExit(): void {
    this.stopHealthCheck()
    this.state.status = 'error'
    this.state.port = null

    if (this.state.restartCount < MAX_RESTART_ATTEMPTS) {
      this.state.restartCount++
      logger.info(`Model server crashed, attempting restart (${this.state.restartCount}/${MAX_RESTART_ATTEMPTS})...`)

      // 延迟 1 秒后重启
      setTimeout(() => {
        this.start().catch(err => {
          logger.error('Failed to restart model server', { error: err.message })
        })
      }, 1000)
    } else {
      this.state.error = 'Max restart attempts reached'
      logger.error('Model server max restart attempts reached')
    }
  }

  private getRuntimeRootPath(): string {
    if (app.isPackaged) {
      // 生产环境：resources/.runtime/model-server/
      return path.join(process.resourcesPath, '.runtime', 'model-server')
    }

    // 开发环境：packages/desktop/.runtime/model-server/<platform-arch>/
    return path.join(app.getAppPath(), '.runtime', 'model-server', `${process.platform}-${process.arch}`)
  }

  private getServerPath(): string {
    const binName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
    return path.join(this.getRuntimeRootPath(), binName)
  }

  private getServerArgs(presetPath: string): string[] {
    const args: string[] = [
      '--host', '127.0.0.1',
      '--port', String(LOCAL_MODEL_SERVER_PORT),
      '--models-preset', presetPath,
      '--jinja',
      '--no-models-autoload',
      '--no-webui',
    ]

    const apiKey = String(this.localApiKey || '').trim()
    if (apiKey) {
      args.push('--api-key', apiKey)
    }

    return args
  }

  private async writeModelsPresetFile(): Promise<string> {
    const presetPath = path.join(app.getPath('userData'), 'model-server', 'models-preset.ini')
    await fsp.mkdir(path.dirname(presetPath), { recursive: true })

    const lines: string[] = [
      '; generated by ModelServerManager',
      '[*]',
      'host = 127.0.0.1',
      `port = ${LOCAL_MODEL_SERVER_PORT}`,
      '',
    ]

    const catalog = listLocalModelCatalog()
    for (const model of catalog) {
      const modelPath = this.getModelFilePath(model.fileName).replace(/\\/g, '/')
      lines.push(`[${model.id}]`)
      lines.push(`model = ${modelPath}`)
      if (model.projector) {
        const mmprojPath = this.getModelFilePath(model.projector.fileName).replace(/\\/g, '/')
        lines.push(`mmproj = ${mmprojPath}`)
      }
      lines.push('load-on-startup = false')
      if (model.modelType === 'embedding') {
        lines.push('embeddings = true')
      }
      lines.push('')
    }

    await fsp.writeFile(presetPath, `${lines.join('\n')}\n`, 'utf8')
    return presetPath
  }

  private startHealthCheck(): void {
    if (this.healthCheckTimer) return

    this.healthCheckTimer = setInterval(() => {
      this.checkHealth()
    }, HEALTH_CHECK_INTERVAL_MS)
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  private async probeHealth(timeoutMs: number): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${LOCAL_MODEL_SERVER_PORT}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      })
      return response.ok
    } catch {
      return false
    }
  }

  private async checkHealth(): Promise<void> {
    if (this.state.status !== 'running' || !this.state.port) {
      return
    }

    try {
      const response = await fetch(`http://127.0.0.1:${this.state.port}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })

      if (!response.ok) {
        logger.warn('Model server health check failed', { status: response.status })
      }
    } catch (err) {
      logger.warn('Model server health check error', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  private getAuthHeaders(): Record<string, string> {
    const apiKey = String(this.localApiKey || '').trim()
    if (!apiKey) return {}
    return { Authorization: `Bearer ${apiKey}` }
  }

  private async ensureBaseUrl(): Promise<string | null> {
    if (this.state.status !== 'running' || !this.state.port) {
      try {
        await this.start()
      } catch (error) {
        logger.warn('Failed to ensure model server started', { error: error instanceof Error ? error.message : String(error) })
        return null
      }
    }
    return this.getBaseUrl()
  }

  private async requestModelControl(pathname: '/models/load' | '/models/unload', modelId: string): Promise<void> {
    const baseUrl = await this.ensureBaseUrl()
    if (!baseUrl) {
      throw new Error('Model server is not running')
    }

    const response = await fetch(`${baseUrl}${pathname}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ model: modelId }),
      signal: AbortSignal.timeout(20000),
    })

    if (!response.ok) {
      let detail = ''
      try {
        detail = await response.text()
      } catch {
        detail = ''
      }
      throw new Error(`Model control failed (${pathname}) status=${response.status}${detail ? ` body=${detail}` : ''}`)
    }
  }
}

function mapRouterStatusToRuntimeState(rawStatus: string): string {
  switch (rawStatus) {
    case 'loaded':
      return 'ready'
    case 'loading':
      return 'loading'
    default:
      return 'unloaded'
  }
}

// 导出单例
export const modelServerManager = new ModelServerManager()
