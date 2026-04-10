<template>
  <UPopover 
    v-if="tooltip" 
    mode="hover"
    :open-delay="300"
    :close-delay="200"
    v-model:open="popoverOpen"
  >
    <div 
      ref="elementRef" 
      :class="[truncate && 'truncate', contentClass]"
    >
      <span :class="textClass">{{ text }}</span>
    </div>
    <template #content>
      <div :class="['p-2 max-w-80 break-words text-sm', popoverClass]">
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
import { ref, watch, nextTick } from 'vue'
import { useTooltipOnTruncate } from '@/composables/useTooltipOnTruncate'

interface UTextProps {
  text: string
  truncate?: boolean
  tooltip?: boolean
  tooltipText?: string
  contentClass?: string
  textClass?: string
  popoverClass?: string
}

const props = withDefaults(defineProps<UTextProps>(), {
  truncate: true,
  tooltip: true,
  contentClass: '',
  textClass: '',
  popoverClass: ''
})

const { elementRef, shouldShowTooltip, checkTruncation } = useTooltipOnTruncate()

const popoverOpen = ref(false)

watch(popoverOpen, (val) => {
  if (val && !shouldShowTooltip.value) {
    popoverOpen.value = false
  }
})

watch(() => props.text, () => {
  nextTick(() => {
    checkTruncation()
  })
})
</script>
