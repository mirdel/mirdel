<template>
  <div
    role="separator"
    aria-orientation="vertical"
    :aria-label="label || 'Resize panel'"
    :aria-disabled="disabled"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="value"
    :tabindex="disabled ? -1 : 0"
    :style="handleStyle"
    class="group absolute top-0 z-20 h-full select-none outline-none"
    :class="[handleClass, { 'pointer-events-none opacity-0': disabled }]"
    @pointerdown="handlePointerDown"
    @dblclick.prevent="emit('reset')"
    @keydown.left.prevent="handleKeyboardResize('left')"
    @keydown.right.prevent="handleKeyboardResize('right')"
    @keydown.home.prevent="emit('reset')"
  >
    <div
      class="absolute rounded-full opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      :class="[indicatorClass, { 'opacity-100': active }]"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type ResizeHandleVariant = 'edge' | 'gap'
type ResizeHandleSide = 'left' | 'right'

const props = withDefaults(defineProps<{
  label?: string
  variant?: ResizeHandleVariant
  side?: ResizeHandleSide
  active?: boolean
  disabled?: boolean
  value?: number
  min?: number
  max?: number
  cursor?: string
}>(), {
  variant: 'edge',
  side: 'right',
  cursor: 'col-resize'
})

const emit = defineEmits<{
  resizeStart: [event: PointerEvent]
  reset: []
  resizeBy: [direction: number]
}>()

function handlePointerDown(event: PointerEvent) {
  if (props.disabled || event.button !== 0) return
  emit('resizeStart', event)
}

function handleKeyboardResize(direction: 'left' | 'right') {
  if (props.side === 'left') {
    emit('resizeBy', direction === 'left' ? 1 : -1)
    return
  }

  emit('resizeBy', direction === 'right' ? 1 : -1)
}

const handleClass = computed(() => [
  props.side === 'right' ? 'right-0' : 'left-0',
  props.variant === 'gap'
    ? (props.side === 'right' ? 'w-[6px] translate-x-[6px]' : 'w-[6px] -translate-x-[6px]')
    : (props.side === 'right' ? 'w-2 translate-x-1/2' : 'w-2 -translate-x-1/2')
])

const indicatorClass = computed(() => {
  if (props.variant === 'gap') {
    return 'left-1/2 top-3 bottom-3 w-0.5 -translate-x-1/2 bg-neutral-300'
  }

  return 'left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-primary'
})

const handleStyle = computed(() => ({
  cursor: props.cursor
}))
</script>
