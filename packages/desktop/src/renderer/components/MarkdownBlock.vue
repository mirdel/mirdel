<template>
  <Markdown
    :content="content"
    caret="block"
    :mode="mode"
    :node-renderers="nodeRenderers"
    :is-dark="isDark"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Markdown } from 'vue-stream-markdown'
import 'vue-stream-markdown/index.css'
import 'vue-stream-markdown/theme.css'
import { useAppColorModeState } from '@/composables/useAppColorModeState'
import StreamMarkdownLink from './StreamMarkdownLink.vue'
import StreamMarkdownImage from './StreamMarkdownImage.vue'

const props = defineProps<{
  content: string
  isStreaming?: boolean
}>()

const { isDark } = useAppColorModeState()

const mode = computed<'streaming' | 'static'>(() => (props.isStreaming ? 'streaming' : 'static'))
const nodeRenderers = {
  link: StreamMarkdownLink,
  image: StreamMarkdownImage,
}
</script>
