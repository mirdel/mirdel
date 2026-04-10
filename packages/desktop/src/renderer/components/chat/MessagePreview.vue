<template>
  <div
    class="overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-box-orient:vertical]"
    :style="lineClampStyle"
  >
    {{ previewText }}
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { hasImages, type MessageContentPart } from '../../utils/messageContentUtils'

interface MessagePreviewProps {
  content: MessageContentPart[]
  lines?: number
}

const props = withDefaults(defineProps<MessagePreviewProps>(), {
  lines: 1
})
const { t } = useI18n()

const lineClampStyle = computed(() => {
  return {
    '-webkit-line-clamp': String(props.lines)
  }
})

const previewText = computed(() => {
  const hasImage = hasImages(props.content)
  
  // 只提取纯文本，忽略工具调用和工具结果
  const textParts = props.content.filter(p => p.type === 'text')
  const text = textParts.map(p => (p as any).text).join('').trim()
  
  if (hasImage && text) {
    return `${t('chat.message.imagePrefix')} ${text}`
  } else if (hasImage) {
    return t('chat.message.imagePrefix')
  } else if (text) {
    return text
  } else {
    // 如果没有文本，检查是否有工具调用或工具结果
    const toolCallPart = props.content.find(p => p.type === 'dynamic-tool' || (typeof p.type === 'string' && p.type.startsWith('tool-')))
    if (toolCallPart && 'toolName' in toolCallPart) {
      return t('chat.messagePreview.toolCall', { name: (toolCallPart as any).toolName })
    }
    
    const toolResultPart = props.content.find(p => p.type === 'dynamic-tool' && (p as any).state?.startsWith('output-'))
    if (toolResultPart) {
      return t('chat.messagePreview.toolResult')
    }
    
    return ''
  }
})
</script>
