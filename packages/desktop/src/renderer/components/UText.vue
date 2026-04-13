<template>
  <UPopover 
    v-if="tooltip" 
    mode="hover"
    :open-delay="300"
    :close-delay="0"
    :ui="{ content: 'pointer-events-none select-none' }"
    :open="popoverOpen"
    @update:open="handlePopoverOpenChange"
  >
    <div 
      ref="elementRef" 
      :class="[truncate && 'truncate', contentClass]"
      @mouseleave="handleTriggerMouseLeave"
    >
      <span :class="textClass">{{ text }}</span>
    </div>
    <template #content>
      <div :class="['p-2 max-w-80 break-words text-sm', popoverClass, 'pointer-events-none select-none']">
        {{ tooltipText || text }}
      </div>
    </template>
  </UPopover>
  <div 
    v-else 
    :class="[truncate && 'truncate', contentClass]"
  >
    <span :class="textClass">{{ text }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface UTextProps {
  text: string
  truncate?: boolean
  tooltip?: boolean
  tooltipText?: string
  contentClass?: string
  textClass?: string
  popoverClass?: string
}

withDefaults(defineProps<UTextProps>(), {
  truncate: true,
  tooltip: true,
  contentClass: '',
  textClass: '',
  popoverClass: ''
})

const elementRef = ref<HTMLElement>()
const popoverOpen = ref(false)

const isElementTruncated = () => {
  const element = elementRef.value
  if (!element) {
    return false
  }

  return element.scrollWidth > element.clientWidth
}

const handlePopoverOpenChange = (open: boolean) => {
  popoverOpen.value = open && isElementTruncated()
}

const handleTriggerMouseLeave = () => {
  popoverOpen.value = false
}
</script>
