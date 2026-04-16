<template>
  <div 
    class="h-full w-full bg-default rounded-r-xl flex flex-col overflow-hidden border-l border-default"
  >
    <!-- 标题栏 -->
    <div class="h-14 flex items-center justify-between px-4 py-3 border-b border-default shrink-0">
      <div class="text-sm font-medium text-default">{{ t("chat.toc.title") }}</div>
      <UButton
        icon="i-lucide-x"
        size="sm"
        color="neutral"
        variant="ghost"
        square
        @click="emit('close')"
      />
    </div>
    
    <!-- 导航列表 -->
    <div ref="tocListRef" class="flex-1 overflow-y-auto">
      <div
        v-for="(item, index) in tocItems"
        :key="item.id"
        :ref="el => setItemRef(index, el)"
        class="px-2 cursor-pointer"
        :class="item.type === 'user' ? 'flex justify-end' : ''"
        @click="handleItemClick(item)"
      >
        <!-- User 消息 -->
        <div 
          v-if="item.type === 'user'" 
          class="max-w-[90%] my-2 px-2 py-1.5 rounded-md transition-colors"
          :class="activeIndex === index ? 'bg-elevated' : 'bg-muted hover:bg-elevated'"
        >
          <div class="text-xs text-default line-clamp-2">
            {{ item.text }}
          </div>
        </div>
        
        <!-- Assistant 消息预览 -->
        <div 
          v-else-if="item.type === 'assistant'" 
          class="max-w-[90%] px-2 py-1.5 rounded-md transition-colors"
          :class="activeIndex === index ? 'bg-elevated' : 'hover:bg-muted'"
        >
          <div class="text-xs text-default line-clamp-2">
            {{ item.text }}
          </div>
        </div>
        
        <!-- Assistant 标题（扁平化的目录项） -->
        <div 
          v-else-if="item.type === 'heading'" 
          class="max-w-[90%] text-xs truncate px-2 py-1.5 rounded-md transition-colors"
          :class="activeIndex === index ? 'bg-elevated' : 'hover:bg-muted'"
          :style="{ marginLeft: `${(item.level - 1) * 12}px` }"
        >
          {{ item.text }}
        </div>
      </div>
      
      <!-- 空状态 -->
      <div v-if="tocItems.length === 0" class="px-4 py-8 text-center text-sm text-muted">
        {{ t("chat.toc.empty") }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Lexer, type Tokens } from 'marked'
import { useChatStore } from '@/stores/useChatStore'
import { groupMessages } from '@/utils/messageGrouper'
import emitter from '@/utils/emitter'

interface TocItem {
  id: string
  type: 'user' | 'assistant' | 'heading'
  text: string
  level: number
  messageId: string
  headingIndex?: number
  groupIndex: number
}

const emit = defineEmits<{
  close: []
}>()

const chatStore = useChatStore()
const { t } = useI18n()
const tocListRef = ref<HTMLElement>()
const activeIndex = ref(0)
const itemRefs = ref<Map<number, HTMLElement>>(new Map())

function setItemRef(index: number, el: any) {
  if (el) {
    itemRefs.value.set(index, el as HTMLElement)
  } else {
    itemRefs.value.delete(index)
  }
}

function extractTextPreview(message: { parts: any[] }): string {
  const textParts = message.parts.filter(p => p.type === 'text')
  if (textParts.length === 0) return '...'
  
  const fullText = textParts.map(p => (p as any).text || '').join(' ')
  const cleanText = fullText
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*|__/g, '')
    .replace(/\*|_/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  
  return cleanText.length > 100 ? cleanText.slice(0, 100) + '...' : cleanText || '...'
}

function extractHeadingsFromMarkdown(message: { parts: any[] }): { text: string; level: number }[] {
  const textParts = message.parts.filter(p => p.type === 'text')
  if (textParts.length === 0) return []

  const fullText = textParts.map(p => (p as any).text || '').join('\n')
  const tokens = Lexer.lex(fullText)

  const headings: { text: string; level: number }[] = []
  for (const token of tokens) {
    if (token.type === 'heading') {
      headings.push({ text: (token as Tokens.Heading).text, level: (token as Tokens.Heading).depth })
    }
  }

  if (headings.length === 0) return []

  const minLevel = Math.min(...headings.map(h => h.level))
  return headings.map(h => ({ text: h.text, level: h.level - minLevel + 1 }))
}

const turnMap = computed(() => new Map(chatStore.currentTurns.map((turn) => [turn.id, turn])))

const timelineGroups = computed(() => groupMessages(chatStore.messages, { turns: turnMap.value }))

// groupId -> 在 virtualItems 中的 index 映射
// virtualItems 中：如果有 system prompt 则 index 0 是 system prompt，后面才是 turnGroups
const groupIdToVirtualIndex = computed(() => {
  const hasSystemPrompt = !!chatStore.selectedScenario?.systemPrompt?.trim()
  const offset = hasSystemPrompt ? 1 : 0
  const map = new Map<string, number>()
  timelineGroups.value.forEach((group, i) => {
    map.set(group.id, i + offset)
  })
  return map
})

const tocItems = computed<TocItem[]>(() => {
  const items: TocItem[] = []

  for (const group of timelineGroups.value) {
    const groupIndex = groupIdToVirtualIndex.value.get(group.id) ?? -1

    if (group.type === 'user') {
      const message = group.primaryMessage
      if (message.isDeleted) continue
      items.push({
        id: `user-${group.id}`,
        type: 'user',
        text: extractTextPreview(message),
        level: 1,
        messageId: group.id,
        groupIndex
      })
      continue
    }

    const assistant = group.lastAssistantMessage || group.messages[group.messages.length - 1]
    if (!assistant || assistant.isDeleted) continue
    const headings = extractHeadingsFromMarkdown(assistant)
      
    if (headings.length > 0) {
      for (let i = 0; i < headings.length; i++) {
        items.push({
          id: `heading-${group.id}-${i}`,
          type: 'heading',
          text: headings[i].text,
          level: headings[i].level,
          messageId: group.id,
          headingIndex: i,
          groupIndex
        })
      }
    } else {
      items.push({
        id: `assistant-${group.id}`,
        type: 'assistant',
        text: group.displayText || extractTextPreview(assistant),
        level: 1,
        messageId: group.id,
        groupIndex
      })
    }
  }
  
  return items
})

function handleItemClick(item: TocItem) {
  emitter.emit('chat:navigate-to-group', {
    groupIndex: item.groupIndex,
    headingIndex: item.type === 'heading' ? item.headingIndex : undefined,
    smooth: true
  })
}

function scrollActiveItemIntoView() {
  const activeElement = itemRefs.value.get(activeIndex.value)
  if (activeElement && tocListRef.value) {
    const container = tocListRef.value
    const containerRect = container.getBoundingClientRect()
    const itemRect = activeElement.getBoundingClientRect()
    
    if (itemRect.top < containerRect.top || itemRect.bottom > containerRect.bottom) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }
}

function getScrollContainer(): HTMLElement | null {
  return document.querySelector('[data-chat-message-scroll]') as HTMLElement
}

function getVirtualItemElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll(':scope > [data-slot="viewport"] > [data-slot="item"][data-index]')
  ) as HTMLElement[]
}

function getVirtualItemIndex(element: HTMLElement): number | null {
  const rawIndex = element.getAttribute('data-index')
  if (!rawIndex) return null

  const index = Number(rawIndex)
  return Number.isFinite(index) ? index : null
}

function getCurrentVirtualIndex(container: HTMLElement, thresholdRatio = 0.2): number {
  const items = getVirtualItemElements(container)
  if (items.length === 0) return 0

  const containerRect = container.getBoundingClientRect()
  const threshold = containerRect.top + containerRect.height * thresholdRatio
  let currentIndex = getVirtualItemIndex(items[0]) ?? 0

  for (const item of items) {
    const itemIndex = getVirtualItemIndex(item)
    if (itemIndex == null) continue

    const rect = item.getBoundingClientRect()
    if (rect.top <= threshold) {
      currentIndex = itemIndex
    } else {
      break
    }
  }

  return currentIndex
}

function getTocIndexForVirtualIndex(virtualIndex: number): number {
  let tocIndex = 0

  for (let i = 0; i < tocItems.value.length; i++) {
    if (tocItems.value[i].groupIndex < virtualIndex) {
      tocIndex = i
      continue
    }

    if (tocItems.value[i].groupIndex === virtualIndex) {
      return i
    }

    break
  }

  return tocIndex
}

// 在 DOM 中查找消息内的第 n 个标题元素（仅用于已渲染的可见消息）
function findHeadingElement(messageId: string, headingIndex: number): HTMLElement | null {
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`)
  if (!messageElement) return null
  const headings = messageElement.querySelectorAll('h1, h2, h3, h4, h5, h6')
  return (headings[headingIndex] as HTMLElement) || null
}

function updateActiveIndex() {
  const container = getScrollContainer()
  if (!container || tocItems.value.length === 0) return
  
  const containerRect = container.getBoundingClientRect()
  const threshold = containerRect.top + containerRect.height * 0.2
  const currentVirtualIndex = getCurrentVirtualIndex(container)
  let newActiveIndex = getTocIndexForVirtualIndex(currentVirtualIndex)
  
  for (let i = tocItems.value.length - 1; i >= 0; i--) {
    const item = tocItems.value[i]
    if (item.groupIndex > currentVirtualIndex) continue

    let element: Element | null = null
    
    if (item.type === 'heading' && item.headingIndex != null) {
      element = findHeadingElement(item.messageId, item.headingIndex)
    } else {
      element = document.querySelector(`[data-message-group-id="${item.messageId}"]`)
    }
    
    if (element) {
      const rect = element.getBoundingClientRect()
      if (rect.top <= threshold) {
        newActiveIndex = i
        break
      }
    }
  }
  
  if (activeIndex.value !== newActiveIndex) {
    activeIndex.value = newActiveIndex
    nextTick(() => {
      scrollActiveItemIntoView()
    })
  }
}

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }) as T
}

const debouncedUpdateActiveIndex = debounce(updateActiveIndex, 50)

let scrollContainer: HTMLElement | null = null

onMounted(() => {
  scrollContainer = getScrollContainer()
  if (scrollContainer) {
    scrollContainer.addEventListener('scroll', debouncedUpdateActiveIndex)
    updateActiveIndex()
  }
})

onUnmounted(() => {
  if (scrollContainer) {
    scrollContainer.removeEventListener('scroll', debouncedUpdateActiveIndex)
  }
})

watch(() => chatStore.messages.length, () => {
  nextTick(() => {
    updateActiveIndex()
  })
})
</script>
