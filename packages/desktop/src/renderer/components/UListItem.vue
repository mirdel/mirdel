<template>
  <div
    :data-session-id="dataSessionId"
    :class="itemClass"
    :aria-disabled="disabled"
    :aria-selected="active"
    role="option"
    @click="handleClick"
  >
    <!-- 展开/折叠图标 -->
    <UIcon
      v-if="collapsible"
      name="i-lucide-chevron-right"
      :class="[
        'absolute left-px w-3.5 h-3.5 cursor-pointer transition-transform duration-200 ease-out',
        expanded ? 'rotate-90' : 'rotate-0'
      ]"
      @click.stop="handleToggle"
    />
    <div v-else-if="indent" class="w-5 flex-none" />
    
    <div :class="contentClass">
      <slot />
    </div>
    
    <div v-if="$slots.trailing" :class="trailingClass">
      <slot name="trailing" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  active?: boolean
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  collapsible?: boolean
  expanded?: boolean
  indent?: boolean
  dataSessionId?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  active: false,
  disabled: false,
  size: 'md',
  collapsible: false,
  expanded: false,
  indent: false
})

const emit = defineEmits<{
  click: [event: MouseEvent]
  toggle: []
}>()

const itemClass = computed(() => {
  const sizeClasses = {
    sm: 'px-1 py-1 min-h-7 text-sm gap-1.5',
    md: 'px-1.5 py-1.5 min-h-8 text-sm gap-2',
    lg: 'px-2 py-2 min-h-9 text-sm gap-2.5'
  }
  
  return [
    'relative group w-full flex items-center select-none outline-none rounded-md transition-colors',
    sizeClasses[props.size],
    props.disabled
      ? 'cursor-not-allowed opacity-50'
      : 'cursor-pointer',
    props.active && !props.disabled
      ? 'bg-accented font-medium'
      : !props.disabled
        ? 'hover:bg-elevated'
        : 'text-toned'
  ]
})

const contentClass = computed(() => 'flex-1 min-w-0 truncate')

const trailingClass = computed(() => 'flex items-center gap-1 shrink-0')

function handleClick(event: MouseEvent) {
  if (!props.disabled) {
    emit('click', event)
  }
}

function handleToggle() {
  emit('toggle')
}
</script>

