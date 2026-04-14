<template>
  <div class="flex-1 min-h-0 flex overflow-y-auto">
    <div class="w-full m-auto flex flex-col items-center py-8">
      <!-- 标题 -->
      <div class="mb-8 text-center">
        <div class="flex items-center justify-center gap-2 mb-2">
          <UIcon 
            :name="isTemporary ? 'i-lucide-message-circle-dashed' : 'i-lucide-message-circle'" 
            class="w-6 h-6" 
          />
          <h1 class="text-2xl font-semibold text-default">
            {{ isTemporary ? t('chat.sessionList.tempSession') : t('chat.sessionList.newSession') }}
          </h1>
        </div>
        <div v-if="!isTemporary" class="mt-2 flex justify-center">
          <USelect
            v-model="selectedProjectId"
            :items="projectOptions"
            value-key="value"
            size="lg"
            variant="none"
            class="max-w-full text-left"
            :ui="{ content: 'min-w-fit' }"
            @update:model-value="handleProjectSelect"
          >
            <template #leading>
              <UIcon
                :name="selectedProjectDisplay.icon"
                class="w-4 h-4 shrink-0"
                :style="{ color: selectedProjectDisplay.color }"
              />
            </template>
            <template #item="{ item }">
              <div class="flex items-center gap-2 w-full">
                <UIcon
                  :name="item.icon || DEFAULT_ICON"
                  class="w-4 h-4 shrink-0"
                  :style="{ color: item.color || DEFAULT_COLOR }"
                />
                <span class="truncate">{{ item.label }}</span>
                <UIcon v-if="item.value === selectedProjectId" name="i-lucide-check" class="w-4 h-4 ml-auto" />
              </div>
            </template>
          </USelect>
        </div>
        <div v-if="isTemporary" class="text-sm mt-4 text-amber-600 dark:text-amber-400 max-w-md mx-auto leading-relaxed">
          {{ t('chat.newSession.temporaryHint') }}
        </div>
      </div>

      <div class="w-4xl max-w-full px-4 md:px-8 flex flex-col gap-8">
        <!-- 场景列表 - 横向滚动 -->
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-1.5">
            <span class="text-sm text-muted">{{ t('chat.newSession.selectScenario') }}</span>
            <UTooltip 
              :text="t('chat.newSession.scenarioHint')"
            >
              <UIcon 
                name="i-lucide-info" 
                class="w-3.5 h-3.5 text-muted hover:text-default cursor-help transition-colors" 
              />
            </UTooltip>
            <UTooltip :text="t('settings.scenario.create')">
              <UButton
                icon="i-lucide-plus"
                variant="ghost"
                color="neutral"
                size="xs"
                square
                class="-ms-0.5"
                @click="handleOpenCreateScenario"
              />
            </UTooltip>
          </div>
          <UInput
            v-model="scenarioSearchQuery"
            :placeholder="t('settings.scenario.listSearchPlaceholder')"
            icon="i-lucide-search"
            size="sm"
            :ui="{ root: 'w-60' }"
          />
          <div class="max-h-[240px]" ref="scenarioListContainer">
            <div
              v-if="showScenarioSearchEmpty"
              class="flex min-h-[160px] items-center justify-center"
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
              direction="horizontal"
              :selected-scenario-id="chatStore.selectedScenarioId"
              :search-query="scenarioSearchQuery"
              @click="handleScenarioSelect"
              @edit="handleScenarioEdit"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/useChatStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import ScenarioList from '@/components/ScenarioList.vue'
import emitter from '@/utils/emitter'
import {
  filterScenariosBySearchQuery,
  sortScenariosForList
} from '@/utils/scenarioSearch'
import { DEFAULT_COLOR, DEFAULT_ICON } from '@/config/project-icon-config'

const { t } = useI18n()
const chatStore = useChatStore()
const projectStore = useProjectStore()
const settingsStore = useSettingsStore()

const selectedProjectId = ref<string | null>(null)
const scenarioListContainer = ref<HTMLElement | null>(null)
const scenarioSearchQuery = ref('')

const showScenarioSearchEmpty = computed(() => {
  const q = scenarioSearchQuery.value.trim()
  if (!q) return false
  const sorted = sortScenariosForList(settingsStore.scenarios)
  return filterScenariosBySearchQuery(sorted, scenarioSearchQuery.value, settingsStore).length === 0
})

// 是否是临时会话
const isTemporary = computed(() => chatStore.isTemporarySession)

// 项目选项（包括未分类）
const projectOptions = computed(() => {
  return [
    { label: t('chat.projectPanel.fixed.uncategorized'), value: null, icon: 'i-lucide-folder-dot', color: DEFAULT_COLOR },
    ...projectStore.projects.map(p => ({
      label: p.name,
      value: p.id,
      icon: p.icon || DEFAULT_ICON,
      color: p.color || DEFAULT_COLOR
    }))
  ]
})

const selectedProjectDisplay = computed(() => {
  const selected = projectOptions.value.find(option => option.value === selectedProjectId.value)
  return {
    icon: selected?.icon || DEFAULT_ICON,
    color: selected?.color || DEFAULT_COLOR
  }
})

// 监听项目面板的选择变化，同步到新建会话的项目选择
watch(() => projectStore.currentProjectId, (newProjectId) => {
  // 全部会话、未分类、收藏 均为「无具体分类」上下文，新建会话默认未分类
  if (newProjectId === '__all__' || newProjectId === '__uncategorized__' || newProjectId === '__starred__' || newProjectId === '__archived__') {
    selectedProjectId.value = null
    chatStore.setProject(null)
  } else {
    selectedProjectId.value = newProjectId
    chatStore.setProject(newProjectId)
    
    // 如果该项目有绑定场景，自动选中该场景
    const project = projectStore.projects.find(p => p.id === newProjectId)
    if (project) {
      chatStore.setScenario(project.scenarioId)
      // 滚动到对应的场景卡片
      nextTick(() => {
        scrollToScenario(project.scenarioId)
      })
    }
  }
}, { immediate: true })

// 处理项目选择变化
function handleProjectSelect(projectId: string | null) {
  chatStore.setProject(projectId)
  
  if (projectId) {
    // 如果选中了具体项目，自动选中该项目绑定的场景
    const project = projectStore.projects.find(p => p.id === projectId)
    if (project) {
      chatStore.setScenario(project.scenarioId)
      // 滚动到对应的场景卡片
      nextTick(() => {
        scrollToScenario(project.scenarioId)
      })
    }
  } else {
    // 如果选中了未分类，自动选中默认场景
    chatStore.setScenario('default-scenario')
    // 滚动到默认场景卡片
    nextTick(() => {
      scrollToScenario('default-scenario')
    })
  }
}

// 处理场景选择
function handleScenarioSelect(scenarioId: string) {
  chatStore.setScenario(scenarioId)
  emitter.emit('chat:focus-input')
}

function handleScenarioEdit(scenarioId: string) {
  emitter.emit('scenario:open-detail', scenarioId)
}

function handleOpenCreateScenario() {
  emitter.emit('scenario:open-create-modal')
}

// 滚动到指定场景
function scrollToScenario(scenarioId: string) {
  if (!scenarioListContainer.value) return
  
  const scenarioCard = scenarioListContainer.value.querySelector(`[data-scenario-id="${scenarioId}"]`)
  if (scenarioCard) {
    scenarioCard.scrollIntoView({
      block: 'nearest',
      inline: 'center'
    })
  }
}
</script>
