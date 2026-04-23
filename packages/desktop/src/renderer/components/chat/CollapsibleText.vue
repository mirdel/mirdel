<template>
  <div>
    <div class="relative overflow-hidden">
      <div
        ref="contentRef"
        class="transition-all duration-300 ease-in-out overflow-hidden"
        :style="{ maxHeight: contentMaxHeight }"
      >
        <slot />
      </div>

      <Transition
        enter-active-class="transition-opacity duration-300 ease-in-out"
        leave-active-class="transition-opacity duration-300 ease-in-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="!expanded && shouldShowToggle"
          class="absolute bottom-0 left-0 right-0 h-8 pointer-events-none bg-linear-to-t to-transparent"
          :class="fadeFromClass"
        />
      </Transition>
    </div>

    <div
      v-if="shouldShowToggle"
      class="mt-2 text-xs text-muted hover:text-default transition-colors cursor-pointer flex items-center gap-1 select-none"
      @click="toggleExpand"
    >
      <UIcon
        name="i-lucide-chevron-down"
        class="w-3 h-3 transition-transform duration-300"
        :class="{ 'rotate-180': expanded }"
      />
      <span>{{ expanded ? t('notes.common.collapse') : t('notes.common.expand') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    // 折叠态的最大高度（px）
    collapsedHeight?: number
    // 变化时触发重新测量的依赖项（比如文本内容）
    source?: unknown
    // 渐变遮罩起始色的 tailwind class，需与容器背景一致
    fadeFromClass?: string
  }>(),
  {
    collapsedHeight: 80,
    source: undefined,
    fadeFromClass: 'from-default',
  },
)

const { t } = useI18n()

const expanded = ref(false)
const measured = ref(false)
const fullHeight = ref(0)
const contentRef = ref<HTMLElement | null>(null)

const shouldShowToggle = computed(
  () => measured.value && fullHeight.value > props.collapsedHeight,
)

const contentMaxHeight = computed(() => {
  if (!measured.value) return `${props.collapsedHeight}px`
  if (!shouldShowToggle.value) return 'none'
  return expanded.value ? `${fullHeight.value}px` : `${props.collapsedHeight}px`
})

function toggleExpand() {
  expanded.value = !expanded.value
}

function measure() {
  nextTick(() => {
    if (contentRef.value) fullHeight.value = contentRef.value.scrollHeight
    measured.value = true
  })
}

onMounted(measure)

watch(() => props.source, measure)
</script>
