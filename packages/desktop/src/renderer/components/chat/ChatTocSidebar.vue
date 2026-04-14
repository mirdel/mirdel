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
          class="max-w-[90%] text-xs line-clamp-2 my-2 px-2 py-1.5 rounded-md transition-colors"
          :class="activeIndex === index ? 'bg-elevated' : 'bg-muted hover:bg-elevated'"
        >
          {{ item.text }}
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
import { Lexer, type Token, type Tokens } from 'marked'
import { useChatStore } from '@/stores/useChatStore'
import { groupMessages } from '@/utils/messageGrouper'

interface TocItem {
  id: string
  type: 'user' | 'assistant' | 'heading'
  text: string
  level: number
  messageId: string
  headingIndex?: number
}

const emit = defineEmits<{
  close: []
}>()

const chatStore = useChatStore()
const { t } = useI18n()
const tocListRef = ref<HTMLElement>()
const activeIndex = ref(0)
const itemRefs = ref<Map<number, HTMLElement>>(new Map())

// 设置 item ref
function setItemRef(index: number, el: any) {
  if (el) {
    itemRefs.value.set(index, el as HTMLElement)
  } else {
    itemRefs.value.delete(index)
  }
}

// 从消息内容中提取纯文本（用于预览，最多 100 字符）
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

// 用 marked Lexer 从 markdown 源文本中提取标题
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

// 在 DOM 中查找消息内的第 n 个标题元素
function findHeadingElement(messageId: string, headingIndex: number): HTMLElement | null {
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`)
  if (!messageElement) return null
  const headings = messageElement.querySelectorAll('h1, h2, h3, h4, h5, h6')
  return (headings[headingIndex] as HTMLElement) || null
}

const turnMap = computed(() => new Map(chatStore.currentTurns.map((turn) => [turn.id, turn]))
)

const timelineGroups = computed(() => groupMessages(chatStore.messages, { turns: turnMap.value }))

// 构建 TOC 项目列表（turn 驱动）
const tocItems = computed<TocItem[]>(() => {
  const items: TocItem[] = []

  for (const group of timelineGroups.value) {
    if (group.type === 'user') {
      const message = group.primaryMessage
      if (message.isDeleted) continue
      items.push({
        id: `user-${group.id}`,
        type: 'user',
        text: extractTextPreview(message),
        level: 1,
        messageId: group.id
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
          headingIndex: i
        })
      }
    } else {
      items.push({
        id: `assistant-${group.id}`,
        type: 'assistant',
        text: group.displayText || extractTextPreview(assistant),
        level: 1,
        messageId: group.id
      })
    }
  }
  
  return items
})

// 处理点击
function handleItemClick(item: TocItem) {
  if (item.type === 'heading' && item.headingIndex != null) {
    const element = findHeadingElement(item.messageId, item.headingIndex)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
  }
  const messageElement = document.querySelector(`[data-message-id="${item.messageId}"]`)
  if (messageElement) {
    messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// 滚动到当前激活项使其可见
function scrollActiveItemIntoView() {
  const activeElement = itemRefs.value.get(activeIndex.value)
  if (activeElement && tocListRef.value) {
    const container = tocListRef.value
    const containerRect = container.getBoundingClientRect()
    const itemRect = activeElement.getBoundingClientRect()
    
    // 检查是否在可视区域内
    if (itemRect.top < containerRect.top || itemRect.bottom > containerRect.bottom) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }
}

// 获取消息列表滚动容器
function getScrollContainer(): HTMLElement | null {
  return document.querySelector('[data-chat-message-scroll]') as HTMLElement
}

// 更新当前激活的导航项
function updateActiveIndex() {
  const container = getScrollContainer()
  if (!container || tocItems.value.length === 0) return
  
  const containerRect = container.getBoundingClientRect()
  const threshold = containerRect.top + containerRect.height * 0.2  // 上方 20% 区域
  
  let newActiveIndex = 0
  
  for (let i = tocItems.value.length - 1; i >= 0; i--) {
    const item = tocItems.value[i]
    let element: Element | null = null
    
    if (item.type === 'heading' && item.headingIndex != null) {
      element = findHeadingElement(item.messageId, item.headingIndex)
    } else {
      element = document.querySelector(`[data-message-id="${item.messageId}"]`)
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
    // 滚动导航列表使激活项可见
    nextTick(() => {
      scrollActiveItemIntoView()
    })
  }
}

// 防抖
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }) as T
}

const debouncedUpdateActiveIndex = debounce(updateActiveIndex, 50)

// 监听滚动
let scrollContainer: HTMLElement | null = null

onMounted(() => {
  scrollContainer = getScrollContainer()
  if (scrollContainer) {
    scrollContainer.addEventListener('scroll', debouncedUpdateActiveIndex)
    // 初始化
    updateActiveIndex()
  }
})

onUnmounted(() => {
  if (scrollContainer) {
    scrollContainer.removeEventListener('scroll', debouncedUpdateActiveIndex)
  }
})

// 监听消息变化，重新计算
watch(() => chatStore.messages.length, () => {
  nextTick(() => {
    updateActiveIndex()
  })
})
</script>
