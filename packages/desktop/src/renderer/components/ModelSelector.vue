<template>
  <UPopover 
    v-model:open="isOpen" 
    :content="{ 
      side: placement === 'bottom' ? 'bottom' : 'top',
      align: align === 'left' ? 'start' : 'end',
      sideOffset: 4
    }"
    :ui="{
      content: 'z-100'
    }"
  >
    <div 
      :class="[
        'group flex items-center gap-1.5 w-fit pl-2 pr-2.5 h-8.5 text-xs border rounded-md transition-colors cursor-pointer select-none',
        ghost 
          ? 'border-transparent bg-transparent hover:bg-elevated/50'
          : 'border-accented'
      ]"
      tabindex="0"
    >
      <ModelLogo v-if="selectedModel && !selectedModel.unconfigured" :model-id="selectedModel.id" size="sm" />
      <ModelUnconfiguredLogo v-else />
      <div v-if="selectedModel" class="flex-1 min-w-0 flex items-center gap-1">
        <span class="flex-1 truncate">{{ selectedModel.id }}</span>
        <span
          v-if="selectedModelTag"
          class="shrink-0 rounded border border-default px-1 py-0 text-[10px] leading-4 text-muted"
        >
          {{ selectedModelTag }}
        </span>
      </div>
      <span v-else class="flex-1 text-muted">{{ placeholderText }}</span>
      <div class="relative ml-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <UIcon
          name="i-lucide-chevrons-up-down"
          :class="[
            'absolute w-3.5 h-3.5 text-muted transition-opacity',
            canClearModelSelection ? 'group-hover:opacity-0 group-hover:pointer-events-none' : ''
          ]"
        />
        <div
          v-if="canClearModelSelection"
          class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
        >
          <UTooltip :text="t('model.selector.clear')">
            <UButton
              type="button"
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              size="xs"
              square
              class="shrink-0"
              @click.stop="clearModelSelection"
            />
          </UTooltip>
        </div>
      </div>
    </div>

    <template #content>
      <div class="w-[360px] max-h-[450px] flex flex-col bg-default rounded-md shadow-sm ring ring-default">
        <!-- 搜索框 -->
        <div class="p-2 border-b border-default">
          <UInput
            v-model="searchQuery"
            :placeholder="t('model.selector.search')"
            icon="i-lucide-search"
            size="sm"
            :ui="{
              root: 'w-full'
            }"
          />
        </div>

        <!-- 模型列表 -->
        <UScrollArea class="flex-1 p-1.5 select-none">
          <div class="flex flex-col gap-2">
            <!-- 特殊模型选项 -->
            <div v-if="props.showDefault" class="flex flex-col gap-1">
              <!-- chat 类型：场景模型 -->
              <div
                v-if="modelType === 'chat' && props.scenarioId"
                @click="selectSpecialModel(SCENARIO_MODEL_PLACEHOLDER)"
                class="group relative flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded hover:bg-elevated/50 cursor-pointer transition-colors"
                :class="{ 'bg-elevated': props.modelValue === SCENARIO_MODEL_PLACEHOLDER }"
              >
                <ModelLogo v-if="scenarioModelInfo && !scenarioModelInfo.unconfigured" :model-id="scenarioModelInfo.model?.id ?? ''" size="sm" />
                <ModelUnconfiguredLogo v-else />
                <ModelSelectItem
                  :prefix="t('model.selector.special.scenario')"
                  :model-name="scenarioModelInfo?.displayName ?? t('model.selector.unconfigured')"
                  :model-tag="resolveLocalModelTag(scenarioModelInfo?.provider?.id)"
                  :provider-name="scenarioModelInfo?.provider?.name"
                  :show-provider="!!scenarioModelInfo?.provider"
                  :show-favorite="false"
                  :capabilities="{}"
                  show-action
                  action-icon="i-lucide-settings"
                  :action-tooltip="t('model.selector.jumpToScenario')"
                  @action-click="handleScenarioSettings"
                />
              </div>
              
              <!-- chat 类型：默认通用模型 -->
              <div
                v-if="modelType === 'chat'"
                @click="selectSpecialModel(DEFAULT_MODEL_PLACEHOLDER)"
                class="group relative flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded hover:bg-elevated/50 cursor-pointer transition-colors"
                :class="{ 'bg-elevated': props.modelValue === DEFAULT_MODEL_PLACEHOLDER }"
              >
                <ModelLogo v-if="!defaultModelInfo.unconfigured" :model-id="defaultModelInfo.model?.id ?? ''" size="sm" />
                <ModelUnconfiguredLogo v-else />
                <ModelSelectItem
                  :prefix="t('model.selector.special.defaultChat')"
                  :model-name="defaultModelInfo.displayName"
                  :model-tag="resolveLocalModelTag(defaultModelInfo.provider?.id)"
                  :provider-name="defaultModelInfo.provider?.name"
                  :show-provider="!!defaultModelInfo.provider"
                  :show-favorite="false"
                  :capabilities="{}"
                  show-action
                  action-icon="i-lucide-settings"
                  :action-tooltip="t('model.selector.jumpToDefaultModel')"
                  @action-click="handleDefaultModelSettings"
                />
              </div>
              
              <!-- translate 类型：默认翻译模型 -->
              <div
                v-if="modelType === 'translate'"
                @click="selectSpecialModel(DEFAULT_MODEL_PLACEHOLDER)"
                class="group relative flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded hover:bg-elevated/50 cursor-pointer transition-colors"
                :class="{ 'bg-elevated': props.modelValue === DEFAULT_MODEL_PLACEHOLDER }"
              >
                <ModelLogo v-if="!defaultTranslateModelInfo.unconfigured" :model-id="defaultTranslateModelInfo.model?.id ?? ''" size="sm" />
                <ModelUnconfiguredLogo v-else />
                <ModelSelectItem
                  :prefix="t('model.selector.special.defaultTranslate')"
                  :model-name="defaultTranslateModelInfo.displayName"
                  :model-tag="resolveLocalModelTag(defaultTranslateModelInfo.provider?.id)"
                  :provider-name="defaultTranslateModelInfo.provider?.name"
                  :show-provider="!!defaultTranslateModelInfo.provider"
                  :show-favorite="false"
                  :capabilities="{}"
                  show-action
                  action-icon="i-lucide-settings"
                  :action-tooltip="t('model.selector.jumpToDefaultModel')"
                  @action-click="handleDefaultModelSettings"
                />
              </div>

              <!-- embedding 类型：默认嵌入模型 -->
              <div
                v-if="modelType === 'embedding'"
                @click="selectSpecialModel(DEFAULT_MODEL_PLACEHOLDER)"
                class="group relative flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded hover:bg-elevated/50 cursor-pointer transition-colors"
                :class="{ 'bg-elevated': props.modelValue === DEFAULT_MODEL_PLACEHOLDER }"
              >
                <ModelLogo v-if="!defaultEmbeddingModelInfo.unconfigured" :model-id="defaultEmbeddingModelInfo.model?.id ?? ''" size="sm" />
                <ModelUnconfiguredLogo v-else />
                <ModelSelectItem
                  :prefix="t('model.selector.special.defaultEmbedding')"
                  :model-name="defaultEmbeddingModelInfo.displayName"
                  :model-tag="resolveLocalModelTag(defaultEmbeddingModelInfo.provider?.id)"
                  :provider-name="defaultEmbeddingModelInfo.provider?.name"
                  :show-provider="!!defaultEmbeddingModelInfo.provider"
                  :show-favorite="false"
                  :capabilities="{}"
                  show-action
                  action-icon="i-lucide-settings"
                  :action-tooltip="t('model.selector.jumpToDefaultModel')"
                  @action-click="handleDefaultModelSettings"
                />
              </div>

              <!-- image-gen 类型：默认图片模型 -->
              <div
                v-if="modelType === 'image-gen'"
                @click="selectSpecialModel(DEFAULT_MODEL_PLACEHOLDER)"
                class="group relative flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded hover:bg-elevated/50 cursor-pointer transition-colors"
                :class="{ 'bg-elevated': props.modelValue === DEFAULT_MODEL_PLACEHOLDER }"
              >
                <ModelLogo v-if="!defaultImageModelInfo.unconfigured" :model-id="defaultImageModelInfo.model?.id ?? ''" size="sm" />
                <ModelUnconfiguredLogo v-else />
                <ModelSelectItem
                  :prefix="defaultImageModelPrefix"
                  :model-name="defaultImageModelInfo.displayName"
                  :model-tag="resolveLocalModelTag(defaultImageModelInfo.provider?.id)"
                  :provider-name="defaultImageModelInfo.provider?.name"
                  :show-provider="!!defaultImageModelInfo.provider"
                  :show-favorite="false"
                  :capabilities="{}"
                  show-action
                  action-icon="i-lucide-settings"
                  :action-tooltip="t('model.selector.jumpToDefaultModel')"
                  @action-click="handleDefaultModelSettings"
                />
              </div>
              
              <!-- 分隔线 -->
              <div v-if="hasSpecialModelRows" class="border-t border-default my-1"></div>
            </div>

            <!-- 已收藏 -->
            <div v-if="favoriteModels.length > 0" class="flex flex-col gap-0.5">
              <div class="px-1.5 py-0.5 text-xs font-medium text-muted">
                {{ t('model.selector.favorites') }}
              </div>
              <UTooltip
                v-for="item in favoriteModels"
                :key="`favorite:${item.provider.id}:${item.model.id}`"
                :text="resolveModelDisabledTooltip(item.provider.id, item.model.id) || ''"
                :disabled="!resolveModelDisabledTooltip(item.provider.id, item.model.id)"
              >
                <div
                  @click="handleModelRowClick(item.provider.id, item.model.id)"
                  class="group relative flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded transition-colors"
                  :class="[
                    isModelSelectable(item.provider.id, item.model.id)
                      ? 'hover:bg-elevated/50 cursor-pointer'
                      : 'opacity-65 cursor-not-allowed',
                    { 'bg-elevated': isSelected(item.provider.id, item.model.id) }
                  ]"
                >
                  <ModelLogo :model-id="item.model.id" size="sm" />
                  <ModelSelectItem
                    :model-name="item.model.id"
                    :model-tag="resolveLocalModelTag(item.provider.id)"
                    :provider-name="item.provider.name"
                    :show-provider="true"
                    :show-favorite="true"
                    :is-favorite="true"
                    :capabilities="{}"
                    @toggle-favorite="toggleModelFavorite(item.provider.id, item.model.id)"
                  />
                </div>
              </UTooltip>
            </div>

            <!-- 分隔线 -->
            <div v-if="favoriteModels.length > 0 && filteredProviders.length > 0" class="border-t border-default my-1"></div>

            <!-- 按供应商分组 -->
            <div
              v-for="provider in filteredProviders"
              :key="provider.id"
              class="flex flex-col gap-0.5"
            >
              <div class="group/provider px-1.5 py-0.5 text-xs font-medium text-muted flex items-center gap-1.5">
                <span>{{ provider.name }}</span>
                <UTooltip :text="t('model.selector.jumpToProvider')">
                  <UIcon
                    name="i-lucide-settings"
                    class="w-3 h-3 shrink-0 text-muted hover:text-default opacity-0 group-hover/provider:opacity-100 transition-opacity cursor-pointer"
                    @click.stop="handleProviderSettings(provider.id)"
                  />
                </UTooltip>
              </div>
              <UTooltip
                v-for="model in provider.models"
                :key="model.id"
                :text="resolveModelDisabledTooltip(provider.id, model.id) || ''"
                :disabled="!resolveModelDisabledTooltip(provider.id, model.id)"
              >
                <div
                  @click="handleModelRowClick(provider.id, model.id)"
                  class="group relative flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded transition-colors"
                  :class="[
                    isModelSelectable(provider.id, model.id)
                      ? 'hover:bg-elevated/50 cursor-pointer'
                      : 'opacity-65 cursor-not-allowed',
                    { 'bg-elevated': isSelected(provider.id, model.id) }
                  ]"
                >
                  <ModelLogo :model-id="model.id" size="sm" />
                  <ModelSelectItem
                    :model-name="model.id"
                    :model-tag="resolveLocalModelTag(provider.id)"
                    :show-provider="false"
                    :show-favorite="true"
                    :is-favorite="settingsStore.isModelFavorite(provider.id, model.id)"
                    :capabilities="{}"
                    @toggle-favorite="toggleModelFavorite(provider.id, model.id)"
                  />
                </div>
              </UTooltip>
            </div>

            <!-- 无结果提示 -->
            <div v-if="filteredProviders.length === 0 && favoriteModels.length === 0" class="px-2 py-6 text-center text-xs text-muted">
              {{ t('model.selector.empty') }}
            </div>
          </div>
        </UScrollArea>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { DEFAULT_MODEL_PLACEHOLDER, SCENARIO_MODEL_PLACEHOLDER } from '@/stores/useChatStore'
import emitter from '@/utils/emitter'
import {
  filterModelSelectorProviders,
  isProviderModelVisibleInSelector,
  listFavoriteModelSelectorItems,
  LOCAL_PROVIDER_ID,
  type ModelSelectorImageIntent,
  type ModelSelectorModelType
} from '@/utils/modelSelectorOptions'
import ModelSelectItem from './ModelSelectItem.vue'
import ModelLogo from './ModelLogo.vue'
import ModelUnconfiguredLogo from './ModelUnconfiguredLogo.vue'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  placement?: 'bottom' | 'top'
  align?: 'left' | 'right'
  showDefault?: boolean
  scenarioId?: string  // 用于显示场景模型选项
  ghost?: boolean  // 幽灵样式（透明背景）
  modelType?: ModelSelectorModelType  // 按模型类型筛选
  imageIntent?: ModelSelectorImageIntent
}>(), {
  placeholder: undefined,
  placement: 'bottom',
  align: 'left',
  showDefault: true,
  ghost: false,
  modelType: 'chat',
  imageIntent: 'generate'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const router = useRouter()
const { t } = useI18n()
const settingsStore = useSettingsStore()
const isOpen = ref(false)
const searchQuery = ref('')
const placeholderText = computed(() => props.placeholder || t('model.selector.placeholder'))

type SpecialModelInfo = {
  provider?: any
  model?: any
  displayName: string
  unconfigured: boolean
}

function clearModelSelection() {
  emit('update:modelValue', '')
}

function resolveProviderModel(providerId: string, modelId: string, options?: { requireSelectable?: boolean }) {
  const provider = settingsStore.enabledProviders.find((item) => item.id === providerId)
  if (!provider) return null
  const model = provider.models.find((item) => item.id === modelId)
  if (!model) return null
  if (options?.requireSelectable && !settingsStore.isProviderModelSelectable(provider.id, model.id)) {
    return null
  }
  return { provider, model }
}

function resolveLocalModelTag(providerId?: string | null): string | undefined {
  return providerId === LOCAL_PROVIDER_ID ? t('model.selector.local.tag') : undefined
}

function getLocalRuntime(providerId: string, modelId: string) {
  if (providerId !== LOCAL_PROVIDER_ID) return null
  return settingsStore.getLocalModelRuntime(modelId)
}

function isProviderModelVisible(providerId: string, modelId: string): boolean {
  return isProviderModelVisibleInSelector(providerId, modelId, settingsStore.getLocalModelRuntime)
}

function isModelSelectable(providerId: string, modelId: string): boolean {
  return settingsStore.isProviderModelSelectable(providerId, modelId)
}

function resolveModelDisabledTooltip(providerId: string, modelId: string): string | null {
  if (providerId !== LOCAL_PROVIDER_ID) return null
  const runtime = getLocalRuntime(providerId, modelId)
  if (!runtime) return null
  if (runtime.state === 'loading') return t('model.selector.local.loadingTooltip')
  return null
}

function unconfiguredSpecialModel(): SpecialModelInfo {
  return {
    displayName: t('model.selector.unconfigured'),
    unconfigured: true
  }
}

function resolveSpecialModelInfo(modelRef?: { providerId?: string; modelId?: string } | null): SpecialModelInfo {
  if (!modelRef?.providerId || !modelRef?.modelId) return unconfiguredSpecialModel()

  const resolved = resolveProviderModel(modelRef.providerId, modelRef.modelId, { requireSelectable: true })
  if (!resolved) return unconfiguredSpecialModel()

  return {
    provider: resolved.provider,
    model: resolved.model,
    displayName: resolved.model.id,
    unconfigured: false
  }
}

// 获取默认通用模型信息（chat 类型）
const defaultModelInfo = computed(() => {
  return resolveSpecialModelInfo(settingsStore.defaultModel)
})

// 获取默认翻译模型信息
const defaultTranslateModelInfo = computed(() => {
  return resolveSpecialModelInfo(settingsStore.defaultModels?.translate)
})

// 获取默认嵌入模型信息
const defaultEmbeddingModelInfo = computed(() => {
  return resolveSpecialModelInfo(settingsStore.defaultModels?.embedding)
})

// 获取默认图片模型信息
const defaultImageModelInfo = computed(() => {
  const imageModel = props.imageIntent === 'edit'
    ? settingsStore.defaultModels?.imageEdit
    : settingsStore.defaultModels?.imageGenerate
  return resolveSpecialModelInfo(imageModel)
})

const defaultImageModelPrefix = computed(() => (
  props.imageIntent === 'edit'
    ? t('model.selector.special.defaultImageEdit')
    : t('model.selector.special.defaultImageGenerate')
))

// 获取场景模型信息
const scenarioModelInfo = computed(() => {
  if (!props.scenarioId) return null
  
  const scenario = settingsStore.scenarios.find(s => s.id === props.scenarioId)
  if (!scenario) return unconfiguredSpecialModel()
  
  // 解析场景的 selectedModel
  let modelToShow = scenario.selectedModel
  
  // 如果场景配置的是默认模型，则解析为具体的默认模型
  if (modelToShow === DEFAULT_MODEL_PLACEHOLDER) {
    const defaultModel = settingsStore.defaultModel
    if (!defaultModel?.providerId || !defaultModel?.modelId) return unconfiguredSpecialModel()
    modelToShow = `${defaultModel.providerId}::${defaultModel.modelId}`
  }
  
  // 解析为具体的 provider 和 model
  const [providerId, modelId] = modelToShow.split('::')
  if (!providerId || !modelId) return unconfiguredSpecialModel()

  const resolved = resolveProviderModel(providerId, modelId, { requireSelectable: true })
  if (!resolved) return unconfiguredSpecialModel()
  
  return {
    provider: resolved.provider,
    model: resolved.model,
    displayName: resolved.model.id,
    unconfigured: false
  }
})

const hasSpecialModelRows = computed(() => {
  if (!props.showDefault) return false
  return props.modelType === 'chat'
    || props.modelType === 'embedding'
    || props.modelType === 'translate'
    || props.modelType === 'image-gen'
})

function buildSpecialSelectedLabel(prefix: string, info: SpecialModelInfo): string {
  return info.unconfigured ? `${prefix}（${info.displayName}）` : info.displayName
}

// 获取当前选中的模型
const selectedModel = computed(() => {
  if (!props.modelValue) return null
  
  // 如果选中的是"使用默认"
  if (props.modelValue === DEFAULT_MODEL_PLACEHOLDER) {
    // embedding 类型使用默认嵌入模型
    if (props.modelType === 'embedding') {
      if (defaultEmbeddingModelInfo.value.unconfigured) {
        return {
          id: buildSpecialSelectedLabel(t('model.selector.special.defaultEmbedding'), defaultEmbeddingModelInfo.value),
          unconfigured: true
        }
      }
      return {
        ...defaultEmbeddingModelInfo.value.model!,
        name: defaultEmbeddingModelInfo.value.displayName
      }
    }
    // translate 类型使用默认翻译模型
    if (props.modelType === 'translate') {
      if (defaultTranslateModelInfo.value.unconfigured) {
        return {
          id: buildSpecialSelectedLabel(t('model.selector.special.defaultTranslate'), defaultTranslateModelInfo.value),
          unconfigured: true
        }
      }
      return {
        ...defaultTranslateModelInfo.value.model!,
        name: defaultTranslateModelInfo.value.displayName
      }
    }
    // image-gen 类型使用默认图片模型
    if (props.modelType === 'image-gen') {
      if (defaultImageModelInfo.value.unconfigured) {
        return {
          id: buildSpecialSelectedLabel(defaultImageModelPrefix.value, defaultImageModelInfo.value),
          unconfigured: true
        }
      }
      return {
        ...defaultImageModelInfo.value.model!,
        name: defaultImageModelInfo.value.displayName
      }
    }
    // chat 类型使用默认通用模型
    if (defaultModelInfo.value.unconfigured) {
      return {
        id: buildSpecialSelectedLabel(t('model.selector.special.defaultChat'), defaultModelInfo.value),
        unconfigured: true
      }
    }
    return {
      ...defaultModelInfo.value.model!,
      name: defaultModelInfo.value.displayName
    }
  }
  
  // 如果选中的是"使用场景模型"
  if (props.modelValue === SCENARIO_MODEL_PLACEHOLDER) {
    if (!scenarioModelInfo.value) return null
    if (scenarioModelInfo.value.unconfigured) {
      return {
        id: buildSpecialSelectedLabel(t('model.selector.special.scenario'), scenarioModelInfo.value),
        unconfigured: true
      }
    }
    return {
      ...scenarioModelInfo.value.model!,
      name: scenarioModelInfo.value.displayName
    }
  }
  
  const [providerId, modelId] = props.modelValue.split('::')
  if (!providerId || !modelId) return null

  const resolved = resolveProviderModel(providerId, modelId, { requireSelectable: true })
  if (!resolved) return null
  if (!isProviderModelVisible(providerId, modelId)) return null
  return resolved.model
})

const selectedModelTag = computed(() => {
  if (!props.modelValue) return undefined

  if (props.modelValue === DEFAULT_MODEL_PLACEHOLDER) {
    if (props.modelType === 'embedding') {
      return resolveLocalModelTag(defaultEmbeddingModelInfo.value.provider?.id)
    }
    if (props.modelType === 'translate') {
      return resolveLocalModelTag(defaultTranslateModelInfo.value.provider?.id)
    }
    if (props.modelType === 'image-gen') {
      return resolveLocalModelTag(defaultImageModelInfo.value.provider?.id)
    }
    return resolveLocalModelTag(defaultModelInfo.value.provider?.id)
  }

  if (props.modelValue === SCENARIO_MODEL_PLACEHOLDER) {
    return resolveLocalModelTag(scenarioModelInfo.value?.provider?.id)
  }

  const [providerId] = props.modelValue.split('::')
  return resolveLocalModelTag(providerId)
})

const canClearModelSelection = computed(() => selectedModel.value != null)

// 过滤后的供应商列表
const filteredProviders = computed(() => {
  return filterModelSelectorProviders(settingsStore.enabledProviders, {
    modelType: props.modelType,
    imageIntent: props.imageIntent,
    searchQuery: searchQuery.value,
    getLocalModelRuntime: settingsStore.getLocalModelRuntime
  })
})

const favoriteModels = computed(() => {
  return listFavoriteModelSelectorItems(
    settingsStore.enabledProviders,
    settingsStore.isModelFavorite,
    {
      modelType: props.modelType,
      imageIntent: props.imageIntent,
      searchQuery: searchQuery.value,
      getLocalModelRuntime: settingsStore.getLocalModelRuntime
    }
  )
})

// 判断是否选中
const isSelected = (providerId: string, modelId: string) => {
  if (props.modelValue !== `${providerId}::${modelId}`) return false
  if (providerId === LOCAL_PROVIDER_ID) {
    return isModelSelectable(providerId, modelId)
  }
  return true
}

// 选择特殊模型（默认通用/翻译/嵌入模型或场景模型）
const selectSpecialModel = (placeholder: string) => {
  emit('update:modelValue', placeholder)
  isOpen.value = false
}

// 选择模型
const selectModel = (providerId: string, modelId: string) => {
  emit('update:modelValue', `${providerId}::${modelId}`)
  isOpen.value = false
}

const handleModelRowClick = (providerId: string, modelId: string) => {
  if (!isModelSelectable(providerId, modelId)) return
  selectModel(providerId, modelId)
}

const toggleModelFavorite = async (providerId: string, modelId: string) => {
  try {
    await settingsStore.toggleModelFavorite(providerId, modelId)
  } catch {
    // no-op
  }
}

// 跳转到供应商设置
const handleProviderSettings = (providerId: string) => {
  router.push({
    path: '/settings/model-service',
    query: { provider: providerId }
  })
  isOpen.value = false
}

// 跳转到默认模型设置
const handleDefaultModelSettings = () => {
  router.push('/settings/default-model')
  isOpen.value = false
}

// 打开当前场景设置
const handleScenarioSettings = () => {
  if (!props.scenarioId) return
  emitter.emit('scenario:open-detail', props.scenarioId)
  isOpen.value = false
}

onMounted(() => {
  settingsStore.startLocalModelRuntimePolling()
})

onBeforeUnmount(() => {
  settingsStore.stopLocalModelRuntimePolling()
})
</script>
