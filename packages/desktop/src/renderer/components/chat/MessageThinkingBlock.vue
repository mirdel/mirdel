<template>
  <UCollapsible 
    v-model:open="expanded"
    class="mb-2"
  >
    <!-- 标题：浅灰小字，箭头在右边 -->
    <div class="flex items-center gap-2 text-sm text-muted cursor-pointer transition-colors select-none py-1">
      <UIcon name="i-lucide-brain" class="w-3.5 h-3.5 shrink-0" />
      <WaveSweep :active="isStreaming" class="min-w-0">
        <span class="wave-sweep-text">{{ title }}</span>
      </WaveSweep>
      <UIcon 
        name="i-lucide-chevron-right"
        class="w-3.5 h-3.5 transition-transform duration-200"
        :class="{ 'rotate-90': expanded }"
      />
    </div>
    
    <!-- 思考内容 -->
    <template #content>
      <div
        ref="thinkingContentRef"
        class="mt-2 text-sm"
        :class="contentClass"
        @scroll="handleThinkingScroll"
      >
        <MarkdownBlock 
          :content="part.text" 
          :is-streaming="part.state === 'streaming'"
          class="text-dimmed!"
        />
      </div>
      
      <!-- 复制按钮 -->
      <div v-if="part.state === 'done'" class="mt-2 flex justify-end">
        <UTooltip :text="isCopied ? t('chat.thinking.copied') : t('chat.thinking.copy')">
          <UButton
            :icon="isCopied ? 'i-lucide-check' : 'i-lucide-copy'"
            size="xs"
            color="neutral"
            variant="ghost"
            @click="handleCopy"
          />
        </UTooltip>
      </div>
    </template>
  </UCollapsible>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { copyToClipboard } from '@/utils/clipboard'
import MarkdownBlock from '@/components/MarkdownBlock.vue'
import WaveSweep from '@/components/common/WaveSweep.vue'

export interface ThinkingPart {
  type: 'reasoning'
  text: string
  state?: 'streaming' | 'done'
  startTime?: number
  endTime?: number
}

const props = defineProps<{
  part: ThinkingPart
}>()

const { t } = useI18n()
const expanded = ref(false)
const isCopied = ref(false)
const thinkingContentRef = ref<HTMLElement | null>(null)
const shouldAutoScroll = ref(true)
const showTopMask = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | null = null
const isStreaming = computed(() => props.part.state === 'streaming')

const contentClass = computed(() => {
  const base = isStreaming.value
    ? 'max-h-[200px] overflow-y-auto pr-1 pt-2'
    : 'overflow-visible'

  if (!showTopMask.value) return base
  return `${base} [mask-image:linear-gradient(transparent,_rgb(0_0_0)_24px)]`
})

// 计算思考用时
const duration = computed(() => {
  if (typeof props.part.startTime === 'number' && typeof props.part.endTime === 'number' && props.part.endTime >= props.part.startTime) {
    const seconds = Math.round((props.part.endTime - props.part.startTime) / 1000)
    return Math.max(1, seconds)
  }
  return null
})

// 标题
const title = computed(() => {
  if (props.part.state === 'streaming') {
    return t('chat.thinking.inProgress')
  }
  
  if (duration.value !== null) {
    return t('chat.thinking.completedWithDuration', { seconds: duration.value })
  }
  return t('chat.thinking.completed')
})

// 监听 state 状态，自动展开/收起
watch(
  () => props.part.state,
  (streaming) => {
    if (streaming === 'streaming') {
      // 思考中，自动展开
      expanded.value = true
      shouldAutoScroll.value = true
      void scrollThinkingToBottom(true)
    } else if (props.part.text) {
      // 思考完成且有内容，收起
      expanded.value = false
      showTopMask.value = false
    }
  },
  { immediate: true }
)

watch(
  () => props.part.text,
  () => {
    void scrollThinkingToBottom(false)
  },
  { flush: 'post' }
)

watch(expanded, (open) => {
  if (open) {
    syncAutoScrollState()
    void scrollThinkingToBottom(false)
  }
})

function isNearBottom(el: HTMLElement) {
  const threshold = 24
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}

function syncAutoScrollState() {
  const el = thinkingContentRef.value
  if (!el) return
  shouldAutoScroll.value = isNearBottom(el)
  syncTopMaskState()
}

function handleThinkingScroll() {
  if (!isStreaming.value) return
  syncAutoScrollState()
}

function syncTopMaskState() {
  const el = thinkingContentRef.value
  if (!el || !isStreaming.value || !expanded.value) {
    showTopMask.value = false
    return
  }

  const hasOverflow = el.scrollHeight - el.clientHeight > 4
  const hasHiddenAbove = el.scrollTop > 2
  showTopMask.value = hasOverflow && hasHiddenAbove
}

async function scrollThinkingToBottom(force = false) {
  if (!isStreaming.value || !expanded.value) return

  await nextTick()

  requestAnimationFrame(() => {
    if (!isStreaming.value || !expanded.value) return
    const el = thinkingContentRef.value
    if (!el) return
    if (!force && !shouldAutoScroll.value) return
    el.scrollTop = el.scrollHeight
    shouldAutoScroll.value = true
    syncTopMaskState()
  })
}

// 复制
async function handleCopy() {
  if (!props.part.text) return
  
  const success = await copyToClipboard(props.part.text)
  if (success) {
    isCopied.value = true
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => {
      isCopied.value = false
    }, 1500)
  }
}
</script>
