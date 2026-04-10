<template>
  <UModal 
    v-model:open="isOpen" 
    :title="title"
    :ui="{ 
      content: 'min-h-[400px] max-h-[600px]',
    }"
  >
    <template #body>
      <div class="flex flex-col gap-3 min-h-0">
        <UInput
          v-model="searchQuery"
          :placeholder="t('settings.scenario.listSearchPlaceholder')"
          icon="i-lucide-search"
          size="md"
          :ui="{ root: 'w-full shrink-0' }"
        />
        <div
          v-if="showSearchEmpty"
          class="flex flex-1 min-h-[240px] items-center justify-center"
        >
          <UEmpty
            :title="t('common.listSearchNoResults')"
            icon="i-lucide-search"
            size="sm"
            variant="naked"
          />
        </div>
        <ScenarioList
          v-else
          class="flex-1 min-h-0 overflow-hidden"
          :selected-scenario-id="selectedScenarioId"
          :search-query="searchQuery"
          @click="handleSelectScenario"
          @edit="handleEditScenario"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/useSettingsStore'
import ScenarioList from './ScenarioList.vue'
import emitter from '@/utils/emitter'
import {
  filterScenariosBySearchQuery,
  sortScenariosForList
} from '@/utils/scenarioSearch'

const props = withDefaults(defineProps<{
  modelValue: boolean
  selectedScenarioId?: string
  title?: string
}>(), {
  title: undefined
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'select': [scenarioId: string]
}>()

const { t } = useI18n()
const settingsStore = useSettingsStore()

const title = computed(() => props.title || t('scenario.selector.title'))

const searchQuery = ref('')

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const showSearchEmpty = computed(() => {
  const q = searchQuery.value.trim()
  if (!q) return false
  const sorted = sortScenariosForList(settingsStore.scenarios)
  return filterScenariosBySearchQuery(sorted, searchQuery.value, settingsStore).length === 0
})

watch(isOpen, (open) => {
  if (!open) searchQuery.value = ''
})

const handleSelectScenario = (scenarioId: string) => {
  emit('select', scenarioId)
  isOpen.value = false
}

function handleEditScenario(scenarioId: string) {
  emitter.emit('scenario:open-detail', scenarioId)
  // 不关闭本弹窗：编辑弹窗叠在上层，关闭编辑后用户仍可继续切换场景
}
</script>
