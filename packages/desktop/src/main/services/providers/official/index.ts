/**
 * 本地模型 Provider
 *
 * 通过 model-server 子进程提供本地运行的模型服务
 * - 自动生成 API Key，可用于本机应用调用鉴权
 * - 始终启用，不可禁用（enabled 由 model-server 状态决定）
 * - 提供 OpenAI 兼容的 HTTP API
 */

import type { ProviderPublic, ProviderModel } from '@shared'
import { LOCAL_MODEL_SERVER_PORT, modelServerManager } from '../../model-server'
import { getProvider } from '../../models/ConfigManager'
import { getDb } from '../../db'
import { decrypt } from '../../crypto'
import { resolveProviderHelpLabel, resolveProviderModelConfigText, resolveProviderName } from '../configText'
import { LOCAL_EMBEDDING_MODEL_ID, LOCAL_PROVIDER_ID } from '../localModelConstants'

export { LOCAL_PROVIDER_ID } from '../localModelConstants'

function modelToProviderModel(m: ProviderModel): ProviderModel {
  return resolveProviderModelConfigText({
    id: m.id,
    modelType: m.modelType ?? "generative",
    inputModalities: m.inputModalities,
    outputModalities: m.outputModalities,
    imageTasks: m.imageTasks,
    image: m.image,
    imageOptionSchema: m.imageOptionSchema,
    video: m.video,
    videoOptionSchema: m.videoOptionSchema,
    providerOptionsDefaults: m.providerOptionsDefaults,
    thinking: m.thinking,
    nativeWebSearch: m.nativeWebSearch,
  })
}

/**
 * 获取本地模型 Provider（固定 baseUrl + 动态状态）
 */
export function getLocalProvider(): ProviderPublic {
  const baseUrl = `http://127.0.0.1:${LOCAL_MODEL_SERVER_PORT}/v1`
  const status = modelServerManager.getStatus()
  const configProvider = getProvider(LOCAL_PROVIDER_ID)
  let hasApiKey = false
  let apiKey: string | undefined
  try {
    const row = getDb()
      .prepare(`SELECT apiKey FROM builtin_provider_overrides WHERE id = ?`)
      .get(LOCAL_PROVIDER_ID) as { apiKey: string | null } | undefined
    hasApiKey = Boolean(row?.apiKey)
    apiKey = row?.apiKey ? decrypt(row.apiKey) : undefined
  } catch {
    hasApiKey = false
    apiKey = undefined
  }

  const models: ProviderModel[] = configProvider
    ? configProvider.models.map(modelToProviderModel)
    : [modelToProviderModel({ id: LOCAL_EMBEDDING_MODEL_ID, modelType: 'embedding' })]

  return {
    id: LOCAL_PROVIDER_ID,
    name: resolveProviderName({
      name: configProvider?.name ?? { default: "Local Models", zhCn: "本地模型" },
    }),
    logo: configProvider?.logo,
    type: 'openai-compatible',
    baseUrl,
    enabled: status.status === 'running',
    isBuiltin: true,
    models,
    hasApiKey,
    apiKey,
    helpUrl: configProvider?.helpUrl,
    helpLabel: resolveProviderHelpLabel({
      helpLabel: configProvider?.helpLabel,
      helpUrl: configProvider?.helpUrl,
    }),
    nativeWebSearchDefaults: configProvider?.nativeWebSearchDefaults,
    management: {
      canEditBaseUrl: false,
      canEditApiKey: false,
      canRegenerateApiKey: true,
      canToggleEnabled: false,
      modelActionsLocked: true,
      free: true,
    },
    createdAt: 0,
    updatedAt: 0,
  }
}
