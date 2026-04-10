<template>
  <section 
    ref="panelRef"
    class="h-full rounded-xl rounded-r-none overflow-hidden flex flex-col bg-muted"
  >
    <!-- 顶部标题栏 -->
    <div class="px-2 pt-3">
      <div 
        class="mb-3 text-sm font-medium text-default flex items-center"
        :class="isCollapsed ? 'justify-center' : 'justify-between'"
      >
        <!-- 标题文字（收起时隐藏） -->
        <span 
          v-if="!isCollapsed"
          class="ml-3 select-none whitespace-nowrap"
        >
          {{ t("chat.projectPanel.title") }}
        </span>
        
        <!-- 切换按钮 -->
        <UTooltip
          :text="isCollapsed ? t('notes.common.expand') : t('notes.common.collapse')"
        >
          <UButton
            icon="i-lucide-panel-left"
            variant="ghost"
            color="neutral"
            size="sm"
            square
            class="shrink-0"
            @click="toggleCollapse"
          />
        </UTooltip>
      </div>
    </div>
    
    <div class="flex flex-col px-1 overflow-x-hidden">
      <!-- 固定项列表 -->
      <UList
        :items="fixedItems"
        v-model="projectStore.currentProjectId"
        value-key="id"
        label-key="label"
        size="lg"
        gap="none"
        padding="none"
        @select="handleSelect"
      >
        <template #item="{ item }">
          <UTooltip 
            :text="item.label"
            :content="{ side: 'right' }"
            :disabled="!isCollapsed"
          >
            <div class="flex justify-center items-center gap-2 flex-1 min-w-0">
              <UIcon
                :name="item.icon"
                class="w-4 h-4 shrink-0"
              />
              
              <!-- 文字动画 -->
              <span 
                v-if="!isCollapsed"
                class="text-sm flex-1 min-w-0 whitespace-nowrap overflow-hidden transition-all duration-100"
                :style="{ 
                  transitionDelay: '100ms'
                }"
              >
                {{ item.label }}
              </span>
            </div>
          </UTooltip>
        </template>
        
        <template v-if="!isCollapsed" #item-trailing="{ item }">
          <span 
            v-if="item.count !== undefined"
            class="text-xs text-muted tabular-nums"
          >
            {{ item.count }}
          </span>
        </template>
      </UList>

      <!-- 分隔线 -->
      <USeparator class="my-2" />

      <!-- 分类标题栏 -->
      <div 
        class="overflow-hidden transition-all duration-100 group/category-header"
        :class="isCollapsed ? 'opacity-0 h-0' : 'opacity-100'"
        :style="{ 
          pointerEvents: isCollapsed ? 'none' : 'auto',
          transitionDelay: isCollapsed ? '0ms' : '100ms'
        }"
      >
        <div class="pl-2 pr-1 py-1 flex items-center justify-between">
          <div class="flex items-center gap-1">
            <span class="text-xs text-toned font-medium">{{ t("chat.projectPanel.title") }}</span>
            <span class="text-xs text-muted">({{ projectStore.projects.length }})</span>
          </div>
          <UTooltip :text="t('projectForm.createTitle')">
            <UButton
              icon="i-lucide-plus"
              variant="ghost"
              color="neutral"
              size="xs"
              square
              @click="showCreateModal = true"
            />
          </UTooltip>
        </div>
      </div>
    </div>

    <!-- 项目列表（可滚动区域） -->
    <div class="flex-1 overflow-y-auto overflow-x-hidden px-1 pb-2">
      <UList
        :items="projectItemsWithCount"
        v-model="projectStore.currentProjectId"
        value-key="id"
        label-key="name"
        size="lg"
        gap="none"
        padding="none"
        @select="handleSelect"
      >
        <template #item="{ item }">
          <UTooltip 
            :text="item.name"
            :content="{ side: 'right' }"
            :disabled="!isCollapsed"
          >
            <div class="flex justify-center items-center gap-2 flex-1 min-w-0">
              <UIcon
                :name="item.icon || DEFAULT_ICON"
                class="w-4 h-4 shrink-0"
                :style="{ color: item.color || DEFAULT_COLOR }"
              />
              
              <!-- 文字动画 -->
              <div
                v-if="!isCollapsed"
                class="flex-1 min-w-0 transition-all duration-100"
                :style="{ 
                  transitionDelay: '100ms'
                }"
              >
                <UText :text="item.name" class="text-sm whitespace-nowrap overflow-hidden" />
              </div>
            </div>
          </UTooltip>
        </template>
        
        <template v-if="!isCollapsed" #item-trailing="{ item }">
          <div class="relative flex items-center justify-end">
            <div
              class="text-xs text-muted tabular-nums transition-opacity"
              :class="{ 'opacity-0': isProjectMenuOpen(item.id), 'group-hover:opacity-0': true }"
            >
              {{ item.sessionCount }}
            </div>

            <div
              class="absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity"
              :class="{ 'opacity-100': isProjectMenuOpen(item.id) }"
              @click.stop
            >
              <UDropdownMenu
                :items="getProjectMenuItems(item)"
                size="md"
                @update:open="setProjectMenuOpen(item.id, $event)"
              >
                <UButton
                  icon="i-lucide-more-horizontal"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  square
                />
              </UDropdownMenu>
            </div>
          </div>
        </template>
      </UList>
    </div>

    <!-- 底部已归档入口 -->
    <div class="shrink-0 px-1 pb-2">
      <UList
        :items="archivedItem"
        v-model="projectStore.currentProjectId"
        value-key="id"
        label-key="label"
        size="lg"
        gap="none"
        padding="none"
        @select="handleSelect"
      >
        <template #item="{ item }">
          <UTooltip 
            :text="item.label"
            :content="{ side: 'right' }"
            :disabled="!isCollapsed"
          >
            <div class="flex justify-center items-center gap-2 flex-1 min-w-0">
              <UIcon
                :name="item.icon"
                class="w-4 h-4 shrink-0"
              />
              <span 
                v-if="!isCollapsed"
                class="text-sm flex-1 min-w-0 whitespace-nowrap overflow-hidden transition-all duration-100"
                :style="{ transitionDelay: '100ms' }"
              >
                {{ item.label }}
              </span>
            </div>
          </UTooltip>
        </template>
        
        <template v-if="!isCollapsed" #item-trailing="{ item }">
          <span 
            v-if="item.count !== undefined"
            class="text-xs text-muted tabular-nums"
          >
            {{ item.count }}
          </span>
        </template>
      </UList>
    </div>

    <!-- 创建项目 Modal -->
    <ProjectFormModal v-model="showCreateModal" />

    <!-- 编辑项目 Modal -->
    <ProjectFormModal 
      v-model="showEditModal" 
      :project="editingProject" 
    />
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMotion } from '@vueuse/motion'
import { useProjectStore } from '@/stores/useProjectStore'
import { useChatStore } from '@/stores/useChatStore'
import { useConfirm } from '@/composables/useConfirm'
import { useMyToast } from '@/composables/useMyToast'
import { DEFAULT_COLOR, DEFAULT_ICON } from '@/config/project-icon-config'
import { buildProjectSessionStats } from './sessionCategoryViewModel'
import ProjectFormModal from './ProjectFormModal.vue'
import UList from '../UList.vue'
import UText from '../UText.vue'
import type { Project } from '@/stores/useProjectStore'

// 定义 props
const props = defineProps<{
  inPopover?: boolean
}>()

// 定义 emits
const emit = defineEmits<{
  itemSelected: []
}>()

const projectStore = useProjectStore()
const chatStore = useChatStore()
const { confirm } = useConfirm()
const toast = useMyToast()
const { t } = useI18n()

// 收起/展开状态
const COLLAPSE_KEY = 'project-panel-collapsed'
const isCollapsed = ref(
  localStorage.getItem(COLLAPSE_KEY) === 'true'
)

// 面板容器 ref
const panelRef = ref<HTMLElement>()

// 初始化动画
const motionInstance = useMotion(panelRef, {
  initial: {
    width: isCollapsed.value ? 44 : 184
  },
  enter: {
    width: isCollapsed.value ? 44 : 184,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30
    }
  }
})

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
  localStorage.setItem(COLLAPSE_KEY, String(isCollapsed.value))
}

// 监听状态变化，应用动画
watch(isCollapsed, (collapsed) => {
  if (motionInstance) {
    motionInstance.apply({
      width: collapsed ? 44 : 184,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 30
      }
    })
  }
})

const showCreateModal = ref(false)
const showEditModal = ref(false)
const editingProject = ref<Project | null>(null)

// 记录哪些项目的菜单是打开的
const openMenus = ref<Set<string>>(new Set())

function isProjectMenuOpen(projectId: string): boolean {
  return openMenus.value.has(projectId)
}

function setProjectMenuOpen(projectId: string, isOpen: boolean) {
  if (isOpen) {
    openMenus.value.add(projectId)
  } else {
    openMenus.value.delete(projectId)
  }
}

const projectSessionStats = computed(() => buildProjectSessionStats(chatStore.sessions))

const activeSessions = computed(() => projectSessionStats.value.activeSessions)
const sessionCountByProjectId = computed(() => projectSessionStats.value.sessionCountByProjectId)
const favoriteCount = computed(() => projectSessionStats.value.favoriteCount)
const archivedCount = computed(() => projectSessionStats.value.archivedCount)

const archivedItem = computed(() => [
  {
    id: '__archived__',
    label: t('chat.projectPanel.fixed.archived'),
    icon: 'i-lucide-folder-check',
    count: archivedCount.value
  }
])

const projectItemsWithCount = computed(() =>
  projectStore.projects.map(project => ({
    ...project,
    sessionCount: sessionCountByProjectId.value.get(project.id) ?? 0
  }))
)

// 固定项列表（全部会话 + 未分类 + 收藏）
const fixedItems = computed(() => [
  { 
    id: '__all__', 
    label: t('chat.projectPanel.fixed.all'),
    icon: 'i-lucide-messages-square',
    count: activeSessions.value.length
  },
  { 
    id: '__uncategorized__', 
    label: t('chat.projectPanel.fixed.uncategorized'),
    icon: 'i-lucide-folder-dot',
    count: sessionCountByProjectId.value.get(null) ?? 0
  },
  { 
    id: '__starred__', 
    label: t('chat.projectPanel.fixed.starred'),
    icon: 'i-lucide-star',
    count: favoriteCount.value
  }
])

function handleSelect(item: any) {
  projectStore.selectProject(item.id)
  
  // 如果在浮层中，通知父组件关闭浮层
  if (props.inPopover) {
    emit('itemSelected')
  }
}

function handleEdit(project: Project) {
  editingProject.value = project
  showEditModal.value = true
}

async function handleDelete(project: Project) {
  const confirmed = await confirm({
    title: t('chat.projectPanel.confirmDeleteTitle'),
    content: t('chat.projectPanel.confirmDeleteContent', { name: project.name }),
    confirmText: t('chat.projectPanel.menu.delete'),
    cancelText: t('notes.modal.cancel'),
    confirmColor: 'error',
    confirmIcon: 'i-lucide-trash-2'
  })
  if (!confirmed) return
  try {
    await projectStore.deleteProject(project.id)
    await chatStore.loadSessions()
    toast.success(t('chat.projectPanel.toast.deleteSuccess'))
  } catch (error) {
    toast.error({ title: t('chat.projectPanel.toast.deleteFailed'), description: String(error) })
  }
}

function getProjectMenuItems(project: Project) {
  return [
    [
      {
        label: t('chat.projectPanel.menu.edit'),
        icon: 'i-lucide-pencil',
        onSelect: () => handleEdit(project)
      },
      {
        label: t('chat.projectPanel.menu.delete'),
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: () => handleDelete(project)
      }
    ]
  ]
}

onMounted(async () => {
  await projectStore.init()
})
</script>
