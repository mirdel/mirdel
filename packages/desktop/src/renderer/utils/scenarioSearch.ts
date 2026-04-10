import type { Scenario } from '@/stores/useSettingsStore'
import { DEFAULT_MODEL_PLACEHOLDER } from '@/stores/useChatStore'

/** 场景搜索所需 store 片段（解析默认模型下的 modelId） */
export type ScenarioSearchStore = {
  defaultModel: { providerId?: string; modelId?: string } | null | undefined
}

/**
 * 用于搜索匹配的模型 id（小写）：显式 `provider::modelId` 取 modelId；`__default__` 取当前默认模型的 modelId。
 */
export function getScenarioModelIdForSearch(
  selectedModel: string,
  store: ScenarioSearchStore
): string {
  const raw = String(selectedModel ?? '').trim()
  if (!raw) return ''
  if (raw === DEFAULT_MODEL_PLACEHOLDER) {
    const modelId = store.defaultModel?.modelId
    return modelId ? modelId.toLowerCase() : ''
  }
  const parts = raw.split('::')
  const modelId = parts[1]?.trim()
  return modelId ? modelId.toLowerCase() : ''
}

export function sortScenariosForList(list: Scenario[]): Scenario[] {
  return [...list].sort((a, b) => {
    if (a.id === 'default-scenario') return -1
    if (b.id === 'default-scenario') return 1
    return b.updatedAt - a.updatedAt
  })
}

export function filterScenariosBySearchQuery(
  scenarios: Scenario[],
  query: string,
  store: ScenarioSearchStore
): Scenario[] {
  const q = query.trim().toLowerCase()
  if (!q) return scenarios

  return scenarios.filter((s) => {
    if (s.name.toLowerCase().includes(q)) return true
    if (s.id.toLowerCase().includes(q)) return true
    if (s.description?.toLowerCase().includes(q)) return true
    if (s.systemPrompt?.toLowerCase().includes(q)) return true
    const mid = getScenarioModelIdForSearch(s.selectedModel, store)
    if (mid && mid.includes(q)) return true
    return false
  })
}
