import type { ModelsConfig, Provider, Model } from '@shared'
import { loggerServiceMain } from '@shared'
import providersConfigData from '../../assets/providers-config.json'

const logger = loggerServiceMain.withContext('ConfigManager')

let currentConfig: ModelsConfig | null = null

function loadConfig(): ModelsConfig | null {
  try {
    const raw = providersConfigData as { version?: string; providers?: Provider[] }
    if (!raw?.version || !Array.isArray(raw.providers) || raw.providers.length === 0) {
      throw new Error('Invalid providers-config format')
    }
    const config: ModelsConfig = { version: raw.version, providers: raw.providers }
    logger.info('Config loaded', { version: config.version, providerCount: config.providers.length })
    return config
  } catch (error) {
    logger.error('Failed to load config', { error })
    return null
  }
}

export async function initializeConfigManager(): Promise<void> {
  logger.info('ConfigManager initializing...')
  const config = loadConfig()
  if (!config) {
    throw new Error('Cannot load config, application cannot start')
  }
  currentConfig = config
  logger.info('ConfigManager initialized', { version: config.version, providerCount: config.providers.length })
}

export function getConfig(): ModelsConfig {
  if (!currentConfig) {
    throw new Error('Config not initialized')
  }
  return currentConfig
}

export function getProvider(id: string): Provider | undefined {
  return currentConfig?.providers.find(p => p.id === id)
}

export function getAllProviders(): Provider[] {
  if (!currentConfig) return []
  return currentConfig.providers
}

export function getModel(providerId: string, modelId: string): Model | undefined {
  const provider = currentConfig?.providers.find(p => p.id === providerId)
  return provider?.models.find(m => m.id === modelId)
}

export function getModels(providerId: string): Model[] {
  const provider = currentConfig?.providers.find(p => p.id === providerId)
  return provider?.models || []
}
