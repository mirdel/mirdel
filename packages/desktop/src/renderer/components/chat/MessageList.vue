<template>
  <!-- 无会话 / 空消息 -->
  <div v-if="!chatStore.currentSessionId" class="flex-1 bg-default" />
  <div v-else-if="chatStore.messages.length === 0 && !currentSystemPrompt" class="flex-1 bg-default" />

  <!-- 虚拟滚动消息列表 -->
  <VirtualScrollList
    v-else
    ref="scrollContainer"
    v-slot="{ item, index }"
    class="flex-1 bg-default"
    data-chat-message-scroll
    :items="virtualItems"
    :estimate-size="estimateVirtualItemSize"
    :get-item-key="getVirtualItemKey"
    :overscan="3"
    :padding-start="20"
    :padding-end="40"
    :resize-paused="props.layoutResizeActive"
    :resize-debounce-ms="80"
    @scroll="handleScroll"
  >
    <div class="w-4xl max-w-full mx-auto px-4 md:px-8">
      <!-- 系统提示词 -->
      <SystemPromptMessage
        v-if="item._isSystemPrompt"
        :content="currentSystemPrompt!"
        @edit="handleEditSystemPrompt"
      />

      <!-- 消息组 -->
      <template v-else>
        <div
          :data-message-group-id="item.id"
          :data-message-role="item.primaryMessage.role"
        >
          <TurnGroup :group="item" />
        </div>

        <BranchDivider v-if="groupContainsForkPoint(item)" />
      </template>
    </div>
  </VirtualScrollList>
</template>

<script setup lang="ts">
import { watch, useTemplateRef, onMounted, onUnmounted, nextTick, computed } from "vue";
import { useChatStore } from "@/stores/useChatStore";
import VirtualScrollList from "@/components/common/VirtualScrollList.vue";
import TurnGroup from "./TurnGroup.vue";
import BranchDivider from "./BranchDivider.vue";
import SystemPromptMessage from "./SystemPromptMessage.vue";
import emitter from "@/utils/emitter";
import { groupMessages, type MessageGroup as TurnGroupData } from "@/utils/messageGrouper";

const chatStore = useChatStore();
const scrollContainer = useTemplateRef('scrollContainer');

const props = withDefaults(defineProps<{
  layoutResizeActive?: boolean
}>(), {
  layoutResizeActive: false
})

const turnGroups = computed(() => {
  const turnMap = new Map(chatStore.currentTurns.map((turn) => [turn.id, turn]))
  return groupMessages(chatStore.messages, { turns: turnMap });
});

const currentSystemPrompt = computed(() => {
  const scenario = chatStore.selectedScenario;
  return scenario?.systemPrompt?.trim() || null;
});

type SystemPromptItem = { _isSystemPrompt: true; id: string; [key: string]: any }
type MessageGroupItem = TurnGroupData & { _isSystemPrompt?: false }
type VirtualItem = SystemPromptItem | MessageGroupItem

const SYSTEM_PROMPT_ITEM: SystemPromptItem = { _isSystemPrompt: true, id: '__system_prompt__' }

const hasSystemPrompt = computed(() => !!currentSystemPrompt.value)

const virtualItems = computed<VirtualItem[]>(() => {
  const groups = turnGroups.value as VirtualItem[]
  if (hasSystemPrompt.value) {
    return [SYSTEM_PROMPT_ITEM, ...groups]
  }
  return groups
})

function getVirtualItemKey(index: number) {
  return virtualItems.value[index]?.id ?? index
}

function estimateVirtualItemSize(index: number) {
  const item = virtualItems.value[index]
  if (!item) return 200
  if (item._isSystemPrompt) return 120
  const group = item as TurnGroupData
  return group.type === 'user' ? 80 : 400
}

// 构建 groupId -> virtualItems index 的快速映射
const groupIdToIndex = computed(() => {
  const map = new Map<string, number>()
  virtualItems.value.forEach((item, index) => {
    if ((item as any).id) {
      map.set((item as any).id, index)
    }
  })
  return map
})

// user group 在 virtualItems 中的 index 列表（用于轮次导航）
const userGroupIndices = computed(() => {
  const indices: number[] = []
  virtualItems.value.forEach((item, index) => {
    if (!item._isSystemPrompt && (item as TurnGroupData).type === 'user') {
      indices.push(index)
    }
  })
  return indices
})

function handleScroll() {
  emitter.emit('chat:message-list-scroll');
}

function handleEditSystemPrompt() {
  emitter.emit('scenario:edit-prompt');
}

function groupContainsForkPoint(group: TurnGroupData): boolean {
  const currentSession = chatStore.currentSession
  if (!currentSession?.rootSessionId) return false
  const forkPointId = currentSession.forkPointMessageId
  return forkPointId ? group.messages.some(m => m.id === forkPointId) : false
}

// --- 滚动操作 ---

function getScrollEl(): HTMLElement | null {
  return scrollContainer.value?.$el ?? null
}

function getVirtualizer() {
  return scrollContainer.value?.virtualizer ?? null
}

function isScrolledToBottom(): boolean {
  const el = getScrollEl();
  if (!el) return true;
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - scrollTop - clientHeight < 50;
}

const bottomScrollThreshold = 4
const bottomScrollRetryDelays = [50, 150, 350]

let bottomScrollRequestId = 0
let pendingBottomScrollSessionId: string | null = null
let activeBottomScrollSessionId: string | null = null
let initialBottomScrollSessionId: string | null = null
let completedInitialBottomScrollSessionId: string | null = null
let bottomScrollRafId: number | null = null
let bottomScrollTimeoutIds: ReturnType<typeof setTimeout>[] = []

function getDistanceFromBottom(): number {
  const el = getScrollEl()
  if (!el) return 0
  return el.scrollHeight - el.scrollTop - el.clientHeight
}

function clearBottomScrollTimers() {
  if (bottomScrollRafId !== null) {
    cancelAnimationFrame(bottomScrollRafId)
    bottomScrollRafId = null
  }

  for (const timeoutId of bottomScrollTimeoutIds) {
    clearTimeout(timeoutId)
  }
  bottomScrollTimeoutIds = []
}

function cancelBottomScrollRequest() {
  bottomScrollRequestId += 1
  pendingBottomScrollSessionId = null
  activeBottomScrollSessionId = null
  initialBottomScrollSessionId = null
  clearBottomScrollTimers()
}

function applyBottomScroll(behavior: ScrollBehavior = 'auto', forceNative = false): boolean {
  const virtualizer = getVirtualizer()
  const lastIndex = virtualItems.value.length - 1
  if (lastIndex < 0) return false

  if (virtualizer && lastIndex >= 0) {
    virtualizer.scrollToIndex(lastIndex, { align: 'end', behavior })
  }

  const el = getScrollEl()
  if (!el) return false

  if (!virtualizer || forceNative) {
    el.scrollTo({ top: el.scrollHeight, behavior })
  }

  return true
}

function correctBottomScroll(requestId: number, forceNative = false) {
  if (requestId !== bottomScrollRequestId) return
  if (activeBottomScrollSessionId && activeBottomScrollSessionId !== chatStore.currentSessionId) return
  if (getDistanceFromBottom() <= bottomScrollThreshold) return

  applyBottomScroll('auto', forceNative)
}

function scheduleBottomScrollCorrections(requestId: number) {
  clearBottomScrollTimers()

  bottomScrollRafId = requestAnimationFrame(() => {
    bottomScrollRafId = null
    correctBottomScroll(requestId)
  })

  bottomScrollTimeoutIds = bottomScrollRetryDelays.map((delay, index) =>
    setTimeout(() => {
      correctBottomScroll(requestId, index === bottomScrollRetryDelays.length - 1)
    }, delay)
  )
}

function runBottomScrollRequest(requestId: number): boolean {
  if (requestId !== bottomScrollRequestId) return false
  if (pendingBottomScrollSessionId && pendingBottomScrollSessionId !== chatStore.currentSessionId) return false

  const scrolled = applyBottomScroll()
  if (!scrolled) return false

  const sessionId = chatStore.currentSessionId
  if (sessionId && initialBottomScrollSessionId === sessionId) {
    completedInitialBottomScrollSessionId = sessionId
    initialBottomScrollSessionId = null
  }

  pendingBottomScrollSessionId = null
  scheduleBottomScrollCorrections(requestId)
  return true
}

function retryPendingBottomScroll() {
  if (!pendingBottomScrollSessionId) return
  void nextTick(() => {
    runBottomScrollRequest(bottomScrollRequestId)
  })
}

function scrollToTop() {
  cancelBottomScrollRequest()

  nextTick(() => {
    const virtualizer = getVirtualizer()
    if (virtualizer) {
      if (typeof virtualizer.scrollToOffset === 'function') {
        virtualizer.scrollToOffset(0, { behavior: 'smooth' })
      } else {
        virtualizer.scrollToIndex(0, { align: 'start' })
      }
      return
    }

    const el = getScrollEl()
    if (el) el.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function scrollToBottom() {
  clearBottomScrollTimers()
  bottomScrollRequestId += 1
  const requestId = bottomScrollRequestId
  pendingBottomScrollSessionId = chatStore.currentSessionId
  activeBottomScrollSessionId = chatStore.currentSessionId

  void nextTick(() => {
    runBottomScrollRequest(requestId)
  })
}

function scrollToIndex(
  index: number,
  align: 'start' | 'center' | 'end' | 'auto' = 'start',
  smooth?: boolean
) {
  cancelBottomScrollRequest()

  const virtualizer = getVirtualizer()
  if (virtualizer) {
    virtualizer.scrollToIndex(index, {
      align,
      behavior: smooth ? 'smooth' : 'auto'
    })
  }
}

function getSearchRootElement(): HTMLElement | null {
  return getScrollEl()
}

function hasPendingScrollTargetForCurrentSession(): boolean {
  const target = chatStore.pendingScrollTarget
  const sessionId = chatStore.currentSessionId
  return !!target && !!sessionId && target.sessionId === sessionId
}

function requestInitialBottomScroll(): boolean {
  const sessionId = chatStore.currentSessionId
  if (!sessionId) return false
  if (hasPendingScrollTargetForCurrentSession()) return false
  if (completedInitialBottomScrollSessionId === sessionId) return false
  if (initialBottomScrollSessionId === sessionId) return false

  initialBottomScrollSessionId = sessionId
  scrollToBottom()
  return true
}

function reconcileScrollAfterRender() {
  if (tryResolvePendingScrollTarget()) return
  if (requestInitialBottomScroll()) return
  retryPendingBottomScroll()
}

// 在 turnGroups 中按 messageId 查找对应的 virtualItems index
function findGroupIndexByMessageId(messageId: string): number {
  const directIndex = groupIdToIndex.value.get(messageId)
  if (directIndex !== undefined) return directIndex

  for (let i = 0; i < virtualItems.value.length; i++) {
    const item = virtualItems.value[i]
    if (!item._isSystemPrompt) {
      const group = item as TurnGroupData
      if (group.messages.some(m => m.id === messageId)) {
        return i
      }
    }
  }
  return -1
}

function tryResolvePendingScrollTarget(): boolean {
  const target = chatStore.pendingScrollTarget
  const sessionId = chatStore.currentSessionId
  if (!target || !sessionId || target.sessionId !== sessionId) {
    return false
  }

  const index = findGroupIndexByMessageId(target.messageId)
  if (index < 0) return false

  scrollToIndex(index, 'start')
  chatStore.clearPendingScrollTarget()
  return true
}

function scrollToMessage(messageId: string) {
  cancelBottomScrollRequest()

  const currentSessionId = chatStore.currentSessionId
  if (currentSessionId) {
    chatStore.setPendingScrollTarget({ sessionId: currentSessionId, messageId })
  }

  void nextTick(() => {
    tryResolvePendingScrollTarget()
  })
}

// 智能滚动
let smartScrollTimeoutId: ReturnType<typeof setTimeout> | null = null;
let scrollTopWhenScheduled = 0;

function scrollToBottomIfNeeded() {
  if (!isScrolledToBottom()) return;

  const el = getScrollEl();
  if (!el) return;

  scrollTopWhenScheduled = el.scrollTop;

  if (smartScrollTimeoutId) {
    clearTimeout(smartScrollTimeoutId);
  }

  smartScrollTimeoutId = setTimeout(() => {
    smartScrollTimeoutId = null;
    const el = getScrollEl();
    if (!el) return;

    if (el.scrollTop < scrollTopWhenScheduled - 10) return;

    scrollToBottom()
  }, 100);
}

// 导航到指定消息组（供 TOC / Navigation 使用）
function handleNavigateToGroup(payload: { groupIndex: number; headingIndex?: number; smooth?: boolean }) {
  const { groupIndex, headingIndex, smooth } = payload
  if (groupIndex < 0 || groupIndex >= virtualItems.value.length) return

  const scrollBehavior: ScrollBehavior = smooth ? 'smooth' : 'auto'

  scrollToIndex(groupIndex, 'start', smooth)

  if (headingIndex != null) {
    // heading 跳转需要等 DOM 渲染后精细定位
    setTimeout(() => {
      const item = virtualItems.value[groupIndex]
      if (!item || item._isSystemPrompt) return
      const group = item as TurnGroupData
      const messageElement = document.querySelector(`[data-message-id="${group.id}"]`) ||
        document.querySelector(`[data-message-group-id="${group.id}"]`)
      if (!messageElement) return
      const headings = messageElement.querySelectorAll('h1, h2, h3, h4, h5, h6')
      const target = headings[headingIndex] as HTMLElement | undefined
      if (target) {
        target.scrollIntoView({ behavior: scrollBehavior, block: 'start' })
      }
    }, 150)
  }
}

watch(
  () => ({
    sessionId: chatStore.currentSessionId,
    messageIds: turnGroups.value.map((group) => group.id).join('|')
  }),
  () => {
    void nextTick(() => {
      reconcileScrollAfterRender()
    })
  },
  { flush: 'post' }
)

onMounted(() => {
  emitter.on('chat:scroll-to-top', scrollToTop);
  emitter.on('chat:scroll-to-bottom', scrollToBottom);
  emitter.on('chat:scroll-to-bottom-if-needed', scrollToBottomIfNeeded);
  emitter.on('chat:scroll-to-message', scrollToMessage);
  emitter.on('chat:navigate-to-group', handleNavigateToGroup);

  void nextTick(() => {
    reconcileScrollAfterRender()
  })
});

onUnmounted(() => {
  emitter.off('chat:scroll-to-top', scrollToTop);
  emitter.off('chat:scroll-to-bottom', scrollToBottom);
  emitter.off('chat:scroll-to-bottom-if-needed', scrollToBottomIfNeeded);
  emitter.off('chat:scroll-to-message', scrollToMessage);
  emitter.off('chat:navigate-to-group', handleNavigateToGroup);

  if (smartScrollTimeoutId) {
    clearTimeout(smartScrollTimeoutId);
    smartScrollTimeoutId = null;
  }
  cancelBottomScrollRequest()
});

defineExpose({
  scrollToTop,
  scrollToBottom,
  scrollToBottomIfNeeded,
  getSearchRootElement,
  userGroupIndices,
  virtualItems,
  groupIdToIndex,
});
</script>
