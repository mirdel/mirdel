<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="chatStore.tempAskOpen"
        class="fixed inset-0 z-50 flex items-end justify-end p-4"
        @click.self="handleCloseClick"
      >
        <!-- 遮罩 -->
        <div class="absolute inset-0 bg-black/40" />
        
        <!-- 浮层内容 -->
        <div
          class="relative w-full max-w-md h-[70vh] rounded-xl border border-default bg-default shadow-xl flex flex-col overflow-hidden"
          @click.stop
        >
          <!-- 标题栏 -->
          <div class="shrink-0">
            <div class="flex items-center justify-between px-4 py-2.5 border-b border-default">
              <div class="flex items-center gap-1.5">
                <span class="text-sm font-medium">{{ t("chat.tempAsk.title") }}</span>
                <UTooltip :text="t('chat.tempAsk.hint')">
                  <span class="text-muted cursor-help">
                    <UIcon name="i-lucide-help-circle" class="size-3.5" />
                  </span>
                </UTooltip>
              </div>
              <UButton
                icon="i-lucide-x"
                size="sm"
                color="neutral"
                variant="ghost"
                square
                @click="handleCloseClick"
              />
            </div>
            <div class="px-4 py-1.5 bg-amber-50 dark:bg-amber-100/50 border-b border-amber-100 dark:border-amber-300/50 text-xs text-amber-800 dark:text-amber-200">
              {{ t("chat.tempAsk.banner") }}
            </div>
          </div>
          
          <!-- 消息列表 -->
          <div ref="messagesContainerRef" class="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            <div class="text-xs text-toned pb-2 text-center">
              {{ t("chat.tempAsk.contextHint") }}
            </div>
            <template v-for="msg in chatStore.tempAskMessages" :key="msg.id">
              <div v-if="msg.role === 'user'" class="flex justify-end">
                <div class="max-w-[85%] px-3 py-2 rounded-xl bg-accented text-sm">
                  <div class="whitespace-pre-wrap wrap-break-word">{{ extractText(msg.parts) }}</div>
                </div>
              </div>
              <div v-else-if="msg.role === 'assistant'" class="flex justify-start">
                <div class="max-w-[85%] space-y-2">
                  <template v-for="(part, idx) in msg.parts" :key="idx">
                    <div v-if="part.type === 'text' && part.text" class="text-sm">
                      <MarkdownBlock :content="preprocessCitations(part.text)" :is-streaming="msg.status === 'streaming' && idx === msg.parts.length - 1" />
                    </div>
                    <div v-else-if="part.type === 'reasoning'" class="text-xs text-toned italic">
                      {{ part.text || t("chat.tempAsk.thinking") }}
                    </div>
                    <div v-else-if="part.type === 'dynamic-tool' || (typeof part.type === 'string' && part.type.startsWith('tool-'))" class="text-xs text-muted">
                      {{ t("chat.tempAsk.toolCall", { name: (part as any).toolName || part.type }) }}
                    </div>
                  </template>
                  <div v-if="msg.status === 'streaming' && !msg.parts.some(p => p.type === 'text')" class="text-sm text-muted">
                    {{ t("chat.tempAsk.loading") }}
                  </div>
                </div>
              </div>
            </template>
          </div>
          
          <!-- 输入区域 -->
          <div class="p-3 border-t border-default shrink-0">
            <div class="flex gap-2 items-end">
              <UTextarea
                ref="textareaRef"
                v-model="inputText"
                :placeholder="t('chat.tempAsk.placeholder')"
                size="sm"
                :rows="1"
                :maxrows="6"
                variant="outline"
                autoresize
                class="flex-1 min-w-0"
                :disabled="chatStore.isTempAskStreaming"
                @keydown="handleKeydown"
              />
              <div class="flex flex-col gap-1 shrink-0">
                <UTooltip :text="chatStore.isTempAskStreaming ? t('chat.tempAsk.abort') : t('chat.tempAsk.send')">
                  <UButton
                    :icon="chatStore.isTempAskStreaming ? 'i-lucide-square' : 'i-lucide-arrow-up'"
                    size="sm"
                    square
                    :disabled="isSendButtonDisabled"
                    @click="chatStore.isTempAskStreaming ? chatStore.abortTempAsk() : handleSend()"
                  />
                </UTooltip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/useChatStore'
import { useConfirm } from '@/composables/useConfirm'
import MarkdownBlock from '../MarkdownBlock.vue'
import { extractAnswerTextFromContent } from '@/utils/messageContentUtils'

const chatStore = useChatStore()
const { confirm } = useConfirm()
const { t } = useI18n()
const inputText = ref('')
const messagesContainerRef = ref<HTMLElement>()
const textareaRef = ref<{ $el?: HTMLElement } | null>(null)

watch(() => chatStore.tempAskOpen, (open) => {
  if (open) {
    nextTick(() => {
      const el = textareaRef.value?.$el
      const textarea = el?.querySelector?.('textarea') ?? el
      if (textarea instanceof HTMLTextAreaElement) textarea.focus()
    })
  }
}, { immediate: true, flush: 'post' })

watch(() => chatStore.tempAskMessages.length, () => {
  nextTick(() => {
    messagesContainerRef.value?.scrollTo({ top: messagesContainerRef.value.scrollHeight, behavior: 'smooth' })
  })
})

function extractText(content: any[]) {
  return extractAnswerTextFromContent(content || [])
}

function preprocessCitations(text: string) {
  return text.replace(/\[S(\d+)\](?!\()/g, '[$1](cite:$1)')
}

const canSend = computed(() => {
  const t = inputText.value.trim()
  return t.length > 0 && !chatStore.isTempAskStreaming
})

// 流式时可点（中止），非流式时无输入则禁用（发送）
const isSendButtonDisabled = computed(() => {
  if (chatStore.isTempAskStreaming) return false
  return inputText.value.trim().length === 0
})

async function handleCloseClick() {
  if (chatStore.tempAskMessages.length === 0) {
    await chatStore.closeTempAsk()
    return
  }
  const confirmed = await confirm({
    title: t('chat.tempAsk.confirmCloseTitle'),
    content: t('chat.tempAsk.confirmCloseContent'),
    confirmText: t('chat.quote.close'),
    cancelText: t('notes.modal.cancel')
  })
  if (confirmed) await chatStore.closeTempAsk()
}

function handleSend() {
  if (!canSend.value) return
  const text = inputText.value
  inputText.value = ''
  chatStore.sendTempAsk(text)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>
