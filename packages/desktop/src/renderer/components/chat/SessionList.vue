<template>
  <section 
    :style="widthStyle"
    class="relative h-full"
    :class="{ 'transition-[width] duration-200 ease-out': !isDragging }"
  >
    <div class="h-full bg-default rounded-r-xl overflow-hidden flex flex-col">
      <div class="px-2 pt-3 pb-2">
        <!-- 标题栏：分类名称 + 切换按钮 -->
        <div 
          class="mb-3 text-sm font-medium text-default flex items-center"
          :class="isCollapsed ? 'justify-center' : 'justify-between'"
        >
          <!-- 标题文字（收起时隐藏） -->
          <span 
            v-if="!isCollapsed"
            class="ml-3 select-none whitespace-nowrap"
          >
            {{ currentCategoryName }}
          </span>
          
          <!-- 切换按钮 -->
          <UTooltip
            :text="isCollapsed ? t('notes.common.expand') : t('notes.common.collapse')"
            :kbds="['meta', 'b']"
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

        <!-- 新的会话按钮 -->
        <UTooltip :text="t('chat.sessionList.newSession')" :kbds="['meta', 'n']" :disabled="!isCollapsed" :content="{ side: 'right' }">
          <UButton 
            :block="!isCollapsed" 
            size="lg" 
            variant="ghost" 
            color="neutral" 
            :class="isCollapsed ? 'w-full justify-center' : 'justify-start w-full'"
            @click="handleCreate"
          >
            <UIcon name="i-lucide-message-circle" class="w-4 h-4 shrink-0" />
            <span 
              v-if="!isCollapsed"
              class="whitespace-nowrap transition-all duration-100"
              :style="{ transitionDelay: '100ms' }"
            >{{ t("chat.sessionList.newSession") }}</span>
          </UButton>
        </UTooltip>
        
        <!-- 临时会话按钮 -->
        <UTooltip :text="t('chat.sessionList.tempSession')" :kbds="['meta', 'shift', 'n']" :disabled="!isCollapsed" :content="{ side: 'right' }">
          <UButton 
            :block="!isCollapsed" 
            size="lg" 
            variant="ghost" 
            color="neutral" 
            :class="isCollapsed ? 'w-full justify-center' : 'justify-start w-full'"
            @click="handleCreateTemporary"
          >
            <UIcon name="i-lucide-message-circle-dashed" class="w-4 h-4 shrink-0" />
            <span 
              v-if="!isCollapsed"
              class="whitespace-nowrap transition-all duration-100"
              :style="{ transitionDelay: '100ms' }"
            >{{ t("chat.sessionList.tempSession") }}</span>
          </UButton>
        </UTooltip>
      </div>
      <!-- 会话列表（收起时隐藏） -->
      <UList
        v-show="!isCollapsed && sessionsWithChildren.length > 0"
        :items="sessionsWithChildren"
        :model-value="chatStore.currentSessionId"
        value-key="id"
        label-key="title"
        :collapsible="true"
        children-key="branches"
        padding="md"
        gap="none"
        size="lg"
        class="flex-1"
        :virtualize="virtualizeOptions"
        @select="handleSelect"
        @toggle="handleToggle"
        ref="listRef"
      >
        <template #item="{ item }">
          <SessionItem
            :item="item"
            :is-editing="editingSessionId === item.id"
            :is-streaming="chatStore.isSessionStreaming(item.id)"
            class="pl-1.5"
            @save="handleSaveTitle(item.id, $event)"
            @cancel="handleCancelEdit"
            @toggle-favorite="handleToggleFavorite(item.id)"
          />
        </template>
        
        <template #item-trailing="{ item }">
          <div v-if="editingSessionId !== item.id" class="relative flex items-center justify-end">
            <div
              class="flex items-center transition-opacity group-hover:opacity-0"
              :class="{ 'opacity-0': isSessionMenuOpen(item.id) }"
            >
              <span
                v-if="chatStore.hasCompletedUnreadSession(item.id)"
                class="w-2 h-2 rounded-full bg-emerald-500"
              />
              <span v-else class="text-xs text-muted tabular-nums">
                {{ formatCompactListUpdatedAt(item.updatedAt) }}
              </span>
            </div>

            <div
              class="absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity"
              :class="{ 'opacity-100': isSessionMenuOpen(item.id) }"
            >
              <UDropdownMenu
                :items="getSessionMenuItems(item.id)"
                size="md"
                @update:open="setSessionMenuOpen(item.id, $event)"
              >
                <template #project-category-leading="{ item, active, ui }">
                  <UIcon
                    v-if="item.icon"
                    :name="item.icon"
                    :class="ui.itemLeadingIcon({ class: item.ui?.itemLeadingIcon, color: item?.color, active })"
                    :style="item.projectColor ? { color: item.projectColor } : undefined"
                  />
                </template>
                <UButton
                  icon="i-lucide-more-horizontal"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  square
                  @click.stop
                />
              </UDropdownMenu>
            </div>
          </div>
        </template>
        
        <template #child-item="{ item }">
          <SessionItem
            :item="item"
            :is-editing="editingSessionId === item.id"
            :is-branch="true"
            :is-streaming="chatStore.isSessionStreaming(item.id)"
            @save="handleSaveTitle(item.id, $event)"
            @cancel="handleCancelEdit"
            @toggle-favorite="handleToggleFavorite(item.id)"
          />
        </template>
        
        <template #child-item-trailing="{ item }">
          <div v-if="editingSessionId !== item.id" class="relative flex items-center justify-end w-[60px]">
            <div
              class="flex items-center transition-opacity group-hover:opacity-0"
              :class="{ 'opacity-0': isSessionMenuOpen(item.id) }"
            >
              <span
                v-if="chatStore.hasCompletedUnreadSession(item.id)"
                class="w-2 h-2 rounded-full bg-emerald-500"
              />
              <span v-else class="text-xs text-muted tabular-nums">
                {{ formatCompactListUpdatedAt(item.updatedAt) }}
              </span>
            </div>

            <div
              class="absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity"
              :class="{ 'opacity-100': isSessionMenuOpen(item.id) }"
            >
              <UDropdownMenu
                :items="getSessionMenuItems(item.id)"
                size="md"
                @update:open="setSessionMenuOpen(item.id, $event)"
              >
                <template #project-category-leading="{ item, active, ui }">
                  <UIcon
                    v-if="item.icon"
                    :name="item.icon"
                    :class="ui.itemLeadingIcon({ class: item.ui?.itemLeadingIcon, color: item?.color, active })"
                    :style="item.projectColor ? { color: item.projectColor } : undefined"
                  />
                </template>
                <UButton
                  icon="i-lucide-more-horizontal"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  square
                  @click.stop
                />
              </UDropdownMenu>
            </div>
          </div>
        </template>
      </UList>
      
      <!-- 空状态（收起时隐藏） -->
      <UEmpty
        v-show="!isCollapsed && sessionsWithChildren.length === 0"
        :title="t('chat.sessionList.empty')"
        icon="i-lucide-message-square"
        variant="naked"
        size="sm"
        class="flex-1 flex flex-col items-center justify-center text-center"
      />
    </div>

    <PanelResizeHandle
      variant="gap"
      :active="isDragging"
      :disabled="isCollapsed"
      :value="width"
      :min="minWidth"
      :max="maxWidth"
      :cursor="resizeCursor"
      @resize-start="startResize"
      @resize-by="resizeBy"
      @reset="resetWidth"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/useChatStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useMyToast } from '@/composables/useMyToast'
import { useSessionDelete } from '@/composables/useSessionDelete'
import { useResizableWidth } from '@/composables/useResizableWidth'
import { formatCompactListUpdatedAt } from '@/utils/timeFormat'
import { useRouter } from 'vue-router'
import { DEFAULT_COLOR } from '@/config/project-icon-config'
import { buildSessionTree } from './sessionCategoryViewModel'
import PanelResizeHandle from '../PanelResizeHandle.vue'
import UList from '../UList.vue'
import SessionItem from './SessionItem.vue'

const chatStore = useChatStore()
const projectStore = useProjectStore()
const router = useRouter()
const toast = useMyToast()
const { deleteSession } = useSessionDelete()
const { t } = useI18n()
const listRef = ref()
const openMenuSessionId = ref<string | null>(null)
const hasAppliedDefaultExpand = ref(false)

// 收起/展开状态
const COLLAPSE_KEY = 'session-list-collapsed'
const isCollapsed = ref(
  localStorage.getItem(COLLAPSE_KEY) === 'true'
)

const {
  width,
  minWidth,
  maxWidth,
  widthStyle,
  cursor: resizeCursor,
  isDragging,
  startResize,
  resizeBy,
  resetWidth
} = useResizableWidth({
  storageKey: 'session-list-width',
  defaultWidth: 256,
  minWidth: 220,
  maxWidth: 420,
  collapsed: isCollapsed,
  collapsedWidth: 56,
  side: 'right',
  step: 16
})

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
  localStorage.setItem(COLLAPSE_KEY, String(isCollapsed.value))
}

defineShortcuts({
  meta_b: {
    usingInput: true,
    handler: () => {
      toggleCollapse()
    }
  },
  meta_n: {
    usingInput: true,
    handler: () => {
      handleCreate()
    }
  },
  meta_shift_n: {
    usingInput: true,
    handler: () => {
      handleCreateTemporary()
    }
  }
})

// 标题编辑状态
const editingSessionId = ref<string | null>(null)

// 将主会话和子分支转换为带 children 的数据结构（扁平化）
const sessionsWithChildren = computed(() =>
  buildSessionTree(chatStore.sessions, projectStore.currentProjectId as any)
)

const virtualizeOptions = { estimateSize: 36, overscan: 15 }

// 当前分类名称
const currentCategoryName = computed(() => {
  const currentProjectId = projectStore.currentProjectId
  
  if (currentProjectId === '__all__') {
    return t('chat.sessionList.category.all')
  } else if (currentProjectId === '__uncategorized__') {
    return t('chat.sessionList.category.uncategorized')
  } else if (currentProjectId === '__starred__') {
    return t('chat.sessionList.category.starred')
  } else if (currentProjectId === '__archived__') {
    return t('chat.sessionList.category.archived')
  } else if (projectStore.currentProject) {
    return projectStore.currentProject.name
  }
  
  return t('chat.sessionList.category.all')
})

function handleCreate() {
  chatStore.createNewSession()
  // store 的 watch 会自动同步路由
}

async function handleCreateTemporary() {
  await chatStore.createTemporarySession()
}

function handleSelect(session: { id: string }) {
  router.push({ name: 'chat', params: { sessionId: session.id } })
}

function handleToggle(item: any, expanded: boolean) {
  // 可以在这里添加额外的展开/折叠逻辑
}

async function expandBranchRootsByDefault() {
  if (hasAppliedDefaultExpand.value) return

  const rootIds = sessionsWithChildren.value
    .filter(session => session.branches.length > 0)
    .map(session => session.id)

  if (rootIds.length === 0) return

  await nextTick()
  if (!listRef.value) return

  rootIds.forEach(rootId => {
    listRef.value.expand(rootId)
  })

  hasAppliedDefaultExpand.value = true
}

async function handleDelete(sessionId: string) {
  await deleteSession(sessionId)
}

function getProjectDisplayName(projectId: string | null) {
  if (!projectId) return t('chat.sessionList.category.uncategorized')
  return projectStore.projects.find(project => project.id === projectId)?.name || t('chat.sessionList.category.uncategorized')
}

function getMoveCategoryItems(sessionId: string) {
  const session = chatStore.sessionById.get(sessionId)
  if (!session) return []

  const currentProjectId = session.projectId ?? null
  const targets = [
    { id: null as string | null, label: t('chat.sessionList.category.uncategorized'), icon: 'i-lucide-folder-dot', color: DEFAULT_COLOR },
    ...projectStore.projects.map(project => ({
      id: project.id,
      label: project.name,
      icon: project.icon || 'i-lucide-folder',
      color: project.color || DEFAULT_COLOR
    }))
  ]

  return targets.map(target => ({
    label: target.label,
    icon: target.icon,
    slot: 'project-category',
    projectColor: target.color,
    type: "checkbox" as const,
    checked: target.id === currentProjectId,
    onUpdateChecked: (checked: boolean) => {
      if (!checked) return
      handleMoveSession(sessionId, target.id)
    }
  }))
}

async function handleMoveSession(sessionId: string, targetProjectId: string | null) {
  const session = chatStore.sessionById.get(sessionId)
  if (!session) return

  const currentProjectId = session.projectId ?? null
  if (currentProjectId === targetProjectId) return

  try {
    const movedCount = await chatStore.moveSessionToProject(sessionId, targetProjectId)
    const targetLabel = getProjectDisplayName(targetProjectId)
    if (movedCount > 1) {
      toast.success(t('chat.sessionList.toast.movedMany', { count: movedCount, target: targetLabel }))
    } else {
      toast.success(t('chat.sessionList.toast.movedOne', { target: targetLabel }))
    }
  } catch (error) {
    toast.error({
      title: t('chat.sessionList.toast.moveFailed'),
      description: String(error)
    })
  } finally {
    openMenuSessionId.value = null
  }
}

function getSessionMenuItems(sessionId: string) {
  const session = chatStore.sessionById.get(sessionId)
  const moveCategoryItems = getMoveCategoryItems(sessionId)
  const isFavorite = !!session?.isFavorite

  const editGroup: any[] = [
    {
      label: t("chat.sessionList.menu.editTitle"),
      icon: "i-lucide-pencil",
      onSelect: () => {
        handleEditTitle(sessionId)
      }
    },
    {
      label: t("chat.sessionList.menu.generateTitle"),
      icon: "i-lucide-sparkles",
      onSelect: () => {
        handleRegenerateTitle(sessionId)
      }
    }
  ]

  const favoriteAndMoveGroup: any[] = [
    {
      label: isFavorite ? t("chat.sessionList.menu.unfavorite") : t("chat.sessionList.menu.favorite"),
      icon: isFavorite ? "i-lucide-star-off" : "i-lucide-star",
      onSelect: () => {
        handleToggleFavorite(sessionId)
      }
    }
  ]
  favoriteAndMoveGroup.push({
    label: t("chat.sessionList.menu.moveToCategory"),
    icon: "i-lucide-folder-input",
    children: moveCategoryItems
  })

  const isArchived = !!session?.isArchived

  return [
    editGroup,
    favoriteAndMoveGroup,
    [
      {
        label: isArchived ? t("chat.sessionList.menu.resume") : t("chat.sessionList.menu.complete"),
        icon: isArchived ? "i-lucide-rotate-ccw" : "i-lucide-check",
        onSelect: () => {
          handleToggleArchive(sessionId)
        }
      },
      {
        label: t("chat.sessionList.menu.delete"),
        icon: "i-lucide-trash-2",
        color: "error",
        onSelect: () => {
          handleDelete(sessionId)
        }
      }
    ]
  ]
}

async function handleToggleFavorite(sessionId: string) {
  const session = chatStore.sessionById.get(sessionId)
  if (!session) return
  const next = !session.isFavorite
  await chatStore.updateSessionFavorite(sessionId, next)
  toast.success(next ? t('chat.sessionList.toast.favorited') : t('chat.sessionList.toast.unfavorited'))
  openMenuSessionId.value = null
}

async function handleToggleArchive(sessionId: string) {
  const session = chatStore.sessionById.get(sessionId)
  if (!session) return
  const next = !session.isArchived
  await chatStore.updateSessionArchive(sessionId, next)
  toast.success(next ? t('chat.sessionList.toast.completed') : t('chat.sessionList.toast.resumed'))
  openMenuSessionId.value = null
}

function isSessionMenuOpen(sessionId: string) {
  return openMenuSessionId.value === sessionId
}

function setSessionMenuOpen(sessionId: string, open: boolean) {
  if (open) {
    openMenuSessionId.value = sessionId
    return
  }

  if (openMenuSessionId.value === sessionId) {
    openMenuSessionId.value = null
  }
}

async function handleEditTitle(sessionId: string) {
  const session = chatStore.sessionById.get(sessionId)
  if (!session) return
  
  editingSessionId.value = sessionId

  // 关闭菜单
  openMenuSessionId.value = null
}

async function handleSaveTitle(sessionId: string, newTitle: string) {
  const trimmed = newTitle.trim()
  
  // 如果标题为空，直接退出编辑（恢复原标题）
  if (!trimmed) {
    editingSessionId.value = null
    return
  }
  
  const session = chatStore.sessionById.get(sessionId)
  if (!session) {
    editingSessionId.value = null
    return
  }
  
  // 标题没变化，直接退出编辑
  if (trimmed === session.title) {
    editingSessionId.value = null
    return
  }
  
  try {
    await chatStore.updateSessionTitle(sessionId, trimmed)
    toast.success(t('chat.sessionList.toast.titleUpdated'))
  } catch (error) {
    toast.error({
      title: t('chat.sessionList.toast.updateFailed'),
      description: String(error)
    })
  } finally {
    editingSessionId.value = null
  }
}

function handleCancelEdit() {
  editingSessionId.value = null
}

async function handleRegenerateTitle(sessionId: string) {
  try {
    const messages = await window.ipc('messages:getDisplayMessages', { sessionId })
    
    // 只取前 3 条 user 消息
    const userMessages = messages
      .filter((m: any) => m.role === 'user')
      .slice(0, 3)
    
    if (userMessages.length === 0) {
      toast.error({
        title: t('chat.sessionList.toast.cannotGenerateTitle'),
        description: t('chat.sessionList.toast.noUserMessages')
      })
      return
    }
    
    const parts = userMessages.flatMap((m: any, index: number) => {
      const parts = Array.isArray(m.parts) ? m.parts : []
      return index > 0 ? [{ type: 'text', text: '\n' }, ...parts] : parts
    })
    if (parts.length === 0) {
      toast.error({
        title: t('chat.sessionList.toast.cannotGenerateTitle'),
        description: t('chat.sessionList.toast.noUsableMessages')
      })
      return
    }

    const result = await window.ipc('sessions:generateTitle', { parts })
    
    if (result?.ok && result?.title) {
      await chatStore.updateSessionTitle(sessionId, result.title.trim())
      toast.success(t('chat.sessionList.toast.titleUpdated'))
    } else {
      toast.error({
        title: t('chat.sessionList.toast.generateFailed'),
        description: result?.error || t('chat.sessionList.toast.invalidGeneratedTitle')
      })
    }
  } catch (error) {
    toast.error({
      title: t('chat.sessionList.toast.generateFailed'),
      description: String(error)
    })
  }
}

// 滚动到指定会话
function scrollToSession(sessionId: string) {
  if (!listRef.value) return
  
  const currentSession = chatStore.sessionById.get(sessionId)
  if (!currentSession) return
  
  // 如果是分支会话，需要滚动到父主会话，然后再滚动到具体分支
  if (currentSession.rootSessionId) {
    // 找到父主会话的索引
    const mainIndex = sessionsWithChildren.value.findIndex(
      s => s.id === currentSession.rootSessionId
    )
    
    if (mainIndex === -1) return
    
    // 先滚动到主会话（使用虚拟滚动的 scrollToIndex）
    // 使用 'auto' align，让虚拟滚动决定最小滚动距离
    listRef.value.scrollToIndex(mainIndex, { align: 'auto' })
    
    // 等待滚动完成后，使用 DOM 查询滚动到具体分支
    setTimeout(() => {
      const listElement = listRef.value?.$el
      if (!listElement) return
      
      const branchElement = listElement.querySelector(`[data-session-id="${sessionId}"]`)
      if (branchElement) {
        // 使用 'nearest' 策略：只在不可见时才滚动
        branchElement.scrollIntoView({
          block: 'nearest'
        })
      }
    }, 300)
  } else {
    // 主会话，直接滚动到对应索引
    const mainIndex = sessionsWithChildren.value.findIndex(s => s.id === sessionId)
    
    if (mainIndex !== -1) {
      // 使用 'auto' align，让虚拟滚动决定最小滚动距离
      listRef.value.scrollToIndex(mainIndex, { align: 'auto' })
    }
  }
}

// 监听当前会话ID变化，自动展开和滚动
watch(() => chatStore.currentSessionId, async (newSessionId) => {
  if (!newSessionId) return
  
  const currentSession = chatStore.sessionById.get(newSessionId)
  if (!currentSession) return
  
  // 如果是分支会话，自动展开主会话
  if (currentSession.rootSessionId) {
    const rootId = currentSession.rootSessionId
    
    // 使用 nextTick 确保 DOM 已更新
    await nextTick()
    
    // 展开主会话
    if (listRef.value) {
      listRef.value.expand(rootId)
    }
    
    // 等待展开动画完成后滚动到当前会话
    await nextTick()
    setTimeout(() => {
      scrollToSession(newSessionId)
    }, 300) // 等待折叠动画完成
  } else {
    // 主会话，直接滚动
    await nextTick()
    scrollToSession(newSessionId)
  }
})

onMounted(() => {
  void expandBranchRootsByDefault()
})

watch(sessionsWithChildren, () => {
  void expandBranchRootsByDefault()
})

watch(() => projectStore.currentProjectId, () => {
  hasAppliedDefaultExpand.value = false
  void expandBranchRootsByDefault()
})
</script>
