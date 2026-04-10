import { useSettingsStore } from '@/stores/useSettingsStore'

/**
 * 解析 selectedModel 字符串，返回模型名称和 provider 名称
 * @param selectedModel 格式：'providerId::modelId'
 * @returns { modelName: string, providerName: string, capabilities?: Record<string, boolean> } | null
 */
export function parseModelInfo(selectedModel: string | undefined) {
  if (!selectedModel) return null
  
  const [providerId, modelId] = selectedModel.split('::')
  if (!providerId || !modelId) return null
  
  const settingsStore = useSettingsStore()
  const provider = settingsStore.enabledProviders.find(p => p.id === providerId)
  if (!provider) return null
  
  const model = provider.models.find(m => m.id === modelId)
  if (!model) return null
  
  return {
    modelName: model.id,
    providerName: provider.name,
    capabilities: {}
  }
}

