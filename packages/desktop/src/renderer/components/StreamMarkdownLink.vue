<template>
  <button
    v-if="isCitationLink"
    type="button"
    data-stream-markdown="link"
    :data-stream-markdown-loading="loading"
    :data-citation-index="citationIndex"
    class="citation-link"
  >
    <NodeList
      v-bind="nodeListProps"
      :parent-node="props.node"
      :nodes="props.node.children"
      :deep="props.deep + 1"
    />
  </button>
  <a
    v-else-if="safeHref"
    data-stream-markdown="link"
    :data-stream-markdown-loading="loading"
    class="text-primary underline cursor-pointer [overflow-wrap:anywhere] data-[stream-markdown-loading=true]:no-underline data-[stream-markdown-loading=true]:cursor-default data-[stream-markdown-loading=true]:pointer-events-none data-[stream-markdown-loading=true]:relative"
    :href="safeHref"
    rel="noreferrer"
    target="_blank"
  >
    <NodeList
      v-bind="nodeListProps"
      :parent-node="props.node"
      :nodes="props.node.children"
      :deep="props.deep + 1"
    />
  </a>
  <span
    v-else
    data-stream-markdown="link"
    :data-stream-markdown-loading="loading"
    class="[overflow-wrap:anywhere]"
  >
    <NodeList
      v-bind="nodeListProps"
      :parent-node="props.node"
      :nodes="props.node.children"
      :deep="props.deep + 1"
    />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NodeList, useContext, useSanitizers, type LinkNodeRendererProps } from 'vue-stream-markdown'

const props = defineProps<LinkNodeRendererProps>()

const { hardenOptions } = useContext()

const rawUrl = computed(() => props.node.url || '')
const isCitationLink = computed(() => /^cite:(\d+)$/i.test(rawUrl.value))
const citationIndex = computed(() => {
  const match = rawUrl.value.match(/^cite:(\d+)$/i)
  return match?.[1] ?? ''
})
const loading = computed(() => (
  !!props.node.loading
  || props.markdownParser.hasLoadingNode(props.node.children)
  || !rawUrl.value
))
const { transformedUrl } = useSanitizers({
  url: rawUrl,
  hardenOptions,
  loading,
})

const safeHref = computed(() => {
  if (isCitationLink.value) return null
  return transformedUrl.value
})

const nodeListProps = computed(() => ({
  markdownParser: props.markdownParser,
  nodeRenderers: props.nodeRenderers,
  blockIndex: props.blockIndex,
  prevNode: props.prevNode,
  nextNode: props.nextNode,
  nodeKey: props.nodeKey,
}))
</script>
