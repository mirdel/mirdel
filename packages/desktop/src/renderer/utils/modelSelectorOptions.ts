import {
  resolveImageTaskCapabilities,
  type ImageTaskType,
  type ProviderModel,
  type ProviderPublic
} from '@shared'
import type { LocalModelRuntimeStatus } from '@/stores/useSettingsStore'

export const LOCAL_PROVIDER_ID = 'local'

export type ModelSelectorModelType = 'chat' | 'embedding' | 'rerank' | 'translate' | 'image-gen' | 'video-gen'
export type ModelSelectorImageIntent = 'generate' | 'edit'

type LocalModelRuntimeResolver = (modelId: string) => LocalModelRuntimeStatus | null
type ProviderModelSelectableResolver = (providerId: string, modelId: string) => boolean

type ModelSelectorOptions = {
  modelType: ModelSelectorModelType
  imageIntent?: ModelSelectorImageIntent
  getLocalModelRuntime: LocalModelRuntimeResolver
}

type ModelSelectorAvailabilityOptions = ModelSelectorOptions & {
  isProviderModelSelectable: ProviderModelSelectableResolver
}

type ModelSelectorSearchOptions = ModelSelectorOptions & {
  searchQuery?: string
}

export type ModelSelectorFavoriteItem = {
  provider: ProviderPublic
  model: ProviderModel
}

function normalizeImageTasks(model: ProviderModel): ImageTaskType[] {
  const raw = Array.isArray(model.imageTasks) ? model.imageTasks : []
  if (raw.length > 0) return raw

  const inputModalities = model.inputModalities || ['text']
  const outputModalities = model.outputModalities || ['text']
  if (!outputModalities.includes('image')) return []

  const tasks: ImageTaskType[] = ['text_to_image']
  if (inputModalities.includes('image')) {
    tasks.push('image_to_image', 'image_edit')
  }

  const editCaps = resolveImageTaskCapabilities(model.image, 'edit')
  if (inputModalities.includes('mask') || !!editCaps?.mask?.enabled) {
    tasks.push('inpaint')
  }

  return tasks
}

export function matchesModelSelectorType(
  model: ProviderModel,
  modelType: ModelSelectorModelType,
  imageIntent: ModelSelectorImageIntent = 'generate'
): boolean {
  const providerModelType = model.modelType || 'generative'
  const outputModalities = model.outputModalities || ['text']

  if (modelType === 'image-gen') {
    if (providerModelType !== 'generative' || !outputModalities.includes('image')) return false
    const imageTasks = normalizeImageTasks(model)
    const canGenerate = imageTasks.includes('text_to_image') || imageTasks.includes('image_to_image')
    const canEdit = imageTasks.includes('image_edit') || imageTasks.includes('inpaint')
    return imageIntent === 'edit' ? canEdit : canGenerate
  }

  if (modelType === 'video-gen') {
    return providerModelType === 'generative' && outputModalities.includes('video')
  }

  if (modelType === 'translate') return providerModelType === 'generative'
  if (modelType === 'chat') return providerModelType === 'generative' && outputModalities.includes('text')
  return providerModelType === modelType
}

export function isProviderModelVisibleInSelector(
  providerId: string,
  modelId: string,
  getLocalModelRuntime: LocalModelRuntimeResolver
): boolean {
  if (providerId !== LOCAL_PROVIDER_ID) return true

  const runtime = getLocalModelRuntime(modelId)
  if (!runtime) return false

  return runtime.state === 'downloaded' || runtime.state === 'loading' || runtime.state === 'loaded'
}

function matchesSearch(modelId: string, providerName: string, searchQuery?: string): boolean {
  const query = searchQuery?.trim().toLowerCase()
  if (!query) return true

  return modelId.toLowerCase().includes(query) || providerName.toLowerCase().includes(query)
}

export function isModelVisibleInSelector(
  providerId: string,
  model: ProviderModel,
  options: ModelSelectorSearchOptions
): boolean {
  return matchesModelSelectorType(model, options.modelType, options.imageIntent) &&
    isProviderModelVisibleInSelector(providerId, model.id, options.getLocalModelRuntime)
}

export function filterModelSelectorProviders(
  providers: ProviderPublic[],
  options: ModelSelectorSearchOptions
): ProviderPublic[] {
  return providers
    .map(provider => {
      const models = provider.models
        .filter(model => (
          isModelVisibleInSelector(provider.id, model, options) &&
          matchesSearch(model.id, provider.name, options.searchQuery)
        ))
        .sort((a, b) => a.id.localeCompare(b.id))

      return {
        ...provider,
        models
      }
    })
    .filter(provider => provider.models.length > 0)
}

export function listFavoriteModelSelectorItems(
  providers: ProviderPublic[],
  isModelFavorite: (providerId: string, modelId: string) => boolean,
  options: ModelSelectorSearchOptions
): ModelSelectorFavoriteItem[] {
  const list: ModelSelectorFavoriteItem[] = []

  for (const provider of providers) {
    for (const model of provider.models) {
      if (!isModelFavorite(provider.id, model.id)) continue
      if (!isModelVisibleInSelector(provider.id, model, options)) continue
      if (!matchesSearch(model.id, provider.name, options.searchQuery)) continue
      list.push({ provider, model })
    }
  }

  return list.sort((a, b) => a.model.id.localeCompare(b.model.id))
}

export function hasAvailableModelSelectorModels(
  providers: ProviderPublic[],
  options: ModelSelectorAvailabilityOptions
): boolean {
  return providers.some(provider => (
    provider.models.some(model => (
      isModelVisibleInSelector(provider.id, model, options) &&
      options.isProviderModelSelectable(provider.id, model.id)
    ))
  ))
}
