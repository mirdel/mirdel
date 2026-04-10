<template>
  <UScrollArea 
    :class="direction === 'horizontal' ? 'w-full' : 'h-full'"
    :orientation="direction === 'horizontal' ? 'horizontal' : 'vertical'"
  >
    <div
      :class="[
        'flex gap-3',
        direction === 'horizontal' ? 'flex-row' : 'flex-col'
      ]"
    >
      <div
        v-for="scenario in scenarios"
        :key="scenario.id"
        :data-scenario-id="scenario.id"
        @click="handleClick(scenario.id)"
        :class="[
          'group relative p-4 border border-default hover:border-accented rounded-lg cursor-pointer transition-all',
          {
            'border-accented bg-muted': scenario.id === selectedScenarioId,
            'min-w-[300px]': direction === 'horizontal'
          }
        ]"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-2">
              <div class="text-sm font-semibold truncate">{{ scenario.name }}</div>
              <UBadge v-if="scenario.id === 'default-scenario'" variant="outline" size="sm">{{ t("scenario.list.default") }}</UBadge>
            </div>
            
            <div v-if="scenario.description" class="text-sm text-muted mb-3">
              {{ scenario.description }}
            </div>

            <div class="flex flex-col gap-2 text-xs">
              <!-- 显示使用的模型 -->
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-cpu" class="w-3.5 h-3.5 text-muted" />
                <span class="text-muted">{{ t("scenario.list.model") }}</span>
                <span class="font-medium text-muted">{{ getModelDisplayName(scenario.selectedModel) }}</span>
              </div>

              <!-- 显示温度参数 -->
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-thermometer" class="w-3.5 h-3.5 text-muted" />
                <span class="text-muted">{{ t("scenario.list.temperature") }}</span>
                <span class="font-medium text-muted">{{ scenario.temperature ?? t("scenario.form.useModelDefault") }}</span>
              </div>

              <!-- 显示是否有系统提示词 -->
              <div v-if="scenario.systemPrompt" class="flex items-center gap-2">
                <UIcon name="i-lucide-message-square" class="w-3.5 h-3.5 text-muted" />
                <span class="text-muted">{{ t("scenario.list.systemPromptConfigured") }}</span>
              </div>
            </div>
          </div>

          <!-- 选中标识 -->
          <div v-if="scenario.id === selectedScenarioId" class="shrink-0">
            <UIcon name="i-lucide-check" class="w-5 h-5" />
          </div>
        </div>

        <div
          class="absolute bottom-3 right-3 z-10 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto"
        >
          <UTooltip :text="t('scenario.list.editScenario')">
            <UButton
              icon="i-lucide-pencil"
              variant="ghost"
              color="neutral"
              size="sm"
              square
              @click.stop="emit('edit', scenario.id)"
            />
          </UTooltip>
        </div>
      </div>
    </div>
  </UScrollArea>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { DEFAULT_MODEL_PLACEHOLDER } from '@/stores/useChatStore'
import {
  filterScenariosBySearchQuery,
  sortScenariosForList
} from '@/utils/scenarioSearch'

const props = withDefaults(defineProps<{
  selectedScenarioId?: string
  direction?: 'vertical' | 'horizontal'
  searchQuery?: string
}>(), {
  direction: 'vertical',
  searchQuery: ''
})

const emit = defineEmits<{
  'click': [scenarioId: string]
  'edit': [scenarioId: string]
}>()

const settingsStore = useSettingsStore()
const { t } = useI18n()

// 排序后按搜索关键字筛选（与设置页、切换场景弹窗共用规则）
const scenarios = computed(() => {
  const sorted = sortScenariosForList(settingsStore.scenarios)
  return filterScenariosBySearchQuery(sorted, props.searchQuery, settingsStore)
})

// 获取模型显示名称
const getModelDisplayName = (selectedModel: string) => {
  const raw = String(selectedModel ?? '')
  if (!raw.trim()) {
    return t('scenario.list.noModelSelected')
  }
  if (raw === DEFAULT_MODEL_PLACEHOLDER) {
    const defaultModel = settingsStore.defaultModel
    if (!defaultModel?.providerId || !defaultModel?.modelId) {
      return t('scenario.list.defaultModelMissing')
    }
    
    const provider = settingsStore.enabledProviders.find(p => p.id === defaultModel.providerId)
    if (!provider) return t('scenario.list.defaultModel')
    
    const model = provider.models.find(m => m.id === defaultModel.modelId)
    return model ? `${model.id} ${t('scenario.list.defaultSuffix')}` : t('scenario.list.defaultModel')
  }
  
  const [providerId, modelId] = raw.split('::')
  if (!providerId || !modelId) return t('scenario.list.unknownModel')
  
  const provider = settingsStore.enabledProviders.find(p => p.id === providerId)
  if (!provider) return modelId
  
  const model = provider.models.find(m => m.id === modelId)
  return model ? model.id : modelId
}

const handleClick = (scenarioId: string) => {
  emit('click', scenarioId)
}
</script>
