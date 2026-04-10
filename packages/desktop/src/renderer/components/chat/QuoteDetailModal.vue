<template>
  <UModal :open="open" @update:open="$emit('update:open', $event)" :title="t('chat.quote.title')">
    <template #body>
      <div v-if="quote?.parts" class="space-y-2">
        <!-- 文本内容 -->
        <div v-if="quoteText" class="whitespace-pre-wrap wrap-break-word">
          <MarkdownBlock :content="quoteText" :is-streaming="false" />
        </div>
        <!-- 图片内容 -->
        <div v-if="quoteImages.length > 0" class="flex flex-wrap gap-2">
          <div
            v-for="(image, index) in quoteImages"
            :key="index"
            class="relative group"
          >
            <div class="relative max-h-48 max-w-48 w-auto rounded-xl overflow-hidden flex items-center justify-center">
              <UImage
                :src="image"
                :alt="t('chat.quote.imageAlt', { index: index + 1 })"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="w-full flex justify-end gap-2">
        <UButton 
          color="neutral" 
          variant="outline"
          @click="$emit('update:open', false)"
        >
          {{ t("chat.quote.close") }}
        </UButton>
        <UButton 
          v-if="quote?.sourceMessageId"
          icon="i-lucide-arrow-up-right"
          @click="handleJumpToSource"
        >
          {{ t("chat.quote.jumpToSource") }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import emitter from '@/utils/emitter'
import MarkdownBlock from '../MarkdownBlock.vue'
import UImage from '../UImage.vue'
import { extractAnswerTextFromContent, extractImagesFromContent, type MessageContentPart } from '@/utils/messageContentUtils'

const props = defineProps<{
  open: boolean
  quote?: {
    parts: MessageContentPart[]
    sourceMessageId?: string
  }
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t } = useI18n()

// 解析引用内容
const quoteContent = computed(() => {
  if (!props.quote?.parts) return []
  return props.quote.parts
})

// 提取文本内容
const quoteText = computed(() => {
  return extractAnswerTextFromContent(quoteContent.value)
})

// 提取图片内容
const quoteImages = computed(() => {
  return extractImagesFromContent(quoteContent.value)
})

function handleJumpToSource() {
  if (props.quote?.sourceMessageId) {
    emitter.emit('chat:scroll-to-message', props.quote.sourceMessageId)
    // 关闭弹窗
    emit('update:open', false)
  }
}
</script>
