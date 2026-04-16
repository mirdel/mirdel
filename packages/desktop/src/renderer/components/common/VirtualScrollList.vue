<template>
  <div
    ref="scrollElementRef"
    class="min-h-0 overflow-y-auto overflow-x-hidden"
    @scroll.passive="handleScroll"
  >
    <div
      data-slot="viewport"
      class="relative w-full"
      :style="{ height: `${totalSize}px` }"
    >
      <div
        v-for="virtualItem in renderedVirtualItems"
        :key="virtualItem.key"
        :ref="measureVirtualItem"
        data-slot="item"
        :data-index="virtualItem.index"
        class="absolute left-0 top-0 w-full"
        :style="{ transform: `translateY(${virtualItem.start}px)` }"
      >
        <slot
          :item="items[virtualItem.index]"
          :index="virtualItem.index"
          :virtual-item="virtualItem"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { computed, ref, watch } from 'vue'
import {
  elementScroll,
  measureElement as defaultMeasureElement,
  observeElementOffset,
  useVirtualizer,
  type Rect,
  type VirtualItem,
  type Virtualizer
} from '@tanstack/vue-virtual'

type VirtualKey = VirtualItem['key']
type ScrollAlignment = 'start' | 'center' | 'end' | 'auto'
type VirtualScrollBehavior = 'auto' | 'smooth' | 'instant'

const props = withDefaults(defineProps<{
  items: T[]
  estimateSize: (index: number) => number
  getItemKey?: (index: number) => VirtualKey
  overscan?: number
  paddingStart?: number
  paddingEnd?: number
  resizePaused?: boolean
  resizeDebounceMs?: number
}>(), {
  overscan: 3,
  paddingStart: 0,
  paddingEnd: 0,
  resizePaused: false,
  resizeDebounceMs: 80
})

const emit = defineEmits<{
  scroll: [event: Event]
}>()

defineSlots<{
  default(props: { item: T, index: number, virtualItem: VirtualItem }): any
}>()

const scrollElementRef = ref<HTMLElement | null>(null)
const measuredSizeCache = new Map<VirtualKey, number>()

function getVirtualItemKey(index: number): VirtualKey {
  return props.getItemKey?.(index) ?? index
}

function readElementRect(element: Element): Rect {
  const htmlElement = element as HTMLElement
  return {
    width: Math.round(htmlElement.offsetWidth),
    height: Math.round(htmlElement.offsetHeight)
  }
}

function readObserverRect(entry: ResizeObserverEntry | undefined, element: Element): Rect {
  const box = entry?.borderBoxSize?.[0]
  if (box) {
    return {
      width: Math.round(box.inlineSize),
      height: Math.round(box.blockSize)
    }
  }

  return readElementRect(element)
}

function isSameRect(a: Rect | null, b: Rect) {
  return !!a && a.width === b.width && a.height === b.height
}

function observeElementRect(
  instance: Virtualizer<HTMLElement, HTMLElement>,
  callback: (rect: Rect) => void
) {
  const element = instance.scrollElement
  const targetWindow = instance.targetWindow
  if (!element || !targetWindow) return

  let lastEmittedRect: Rect | null = null
  let pendingRect: Rect | null = null
  let rafId: number | null = null
  let debounceTimeoutId: ReturnType<typeof setTimeout> | null = null

  function clearPendingFrame() {
    if (rafId !== null) {
      targetWindow.cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  function clearPendingDebounce() {
    if (debounceTimeoutId) {
      clearTimeout(debounceTimeoutId)
      debounceTimeoutId = null
    }
  }

  function emitRect(rect: Rect) {
    if (isSameRect(lastEmittedRect, rect)) return
    lastEmittedRect = rect
    callback(rect)
  }

  function flushPendingRect() {
    clearPendingFrame()
    clearPendingDebounce()

    if (!pendingRect) return
    const rect = pendingRect
    pendingRect = null
    emitRect(rect)
  }

  function scheduleFrameFlush() {
    if (rafId !== null) return

    rafId = targetWindow.requestAnimationFrame(() => {
      rafId = null
      flushPendingRect()
    })
  }

  function handleRect(rect: Rect) {
    if (props.resizePaused && lastEmittedRect && rect.height === lastEmittedRect.height) {
      pendingRect = rect
      return
    }

    if (
      props.resizeDebounceMs > 0 &&
      lastEmittedRect &&
      rect.width !== lastEmittedRect.width &&
      rect.height === lastEmittedRect.height
    ) {
      pendingRect = rect
      clearPendingDebounce()
      debounceTimeoutId = setTimeout(flushPendingRect, props.resizeDebounceMs)
      return
    }

    pendingRect = rect
    scheduleFrameFlush()
  }

  emitRect(readElementRect(element))

  const resizeObserver = new targetWindow.ResizeObserver((entries) => {
    handleRect(readObserverRect(entries[0], element))
  })

  resizeObserver.observe(element, { box: 'border-box' })

  const stopPausedWatch = watch(() => props.resizePaused, (paused, wasPaused) => {
    if (paused || !wasPaused) return

    pendingRect = readElementRect(element)
    clearPendingDebounce()
    targetWindow.requestAnimationFrame(() => {
      flushPendingRect()
      instance.measure()
    })
  })

  return () => {
    stopPausedWatch()
    clearPendingFrame()
    clearPendingDebounce()
    resizeObserver.unobserve(element)
  }
}

function measureElement(
  element: HTMLElement,
  entry: ResizeObserverEntry | undefined,
  instance: Virtualizer<HTMLElement, HTMLElement>
) {
  const index = instance.indexFromElement(element)
  const key = getVirtualItemKey(index)

  if (props.resizePaused) {
    const cachedSize = measuredSizeCache.get(key)
    if (cachedSize != null) return cachedSize
  }

  const size = defaultMeasureElement(element, entry, instance)
  measuredSizeCache.set(key, size)
  return size
}

const virtualizer = useVirtualizer<HTMLElement, HTMLElement>(computed(() => ({
  count: props.items.length,
  getScrollElement: () => scrollElementRef.value,
  estimateSize: props.estimateSize,
  getItemKey: getVirtualItemKey,
  overscan: props.overscan,
  paddingStart: props.paddingStart,
  paddingEnd: props.paddingEnd,
  observeElementRect,
  observeElementOffset,
  measureElement,
  scrollToFn: elementScroll,
  useAnimationFrameWithResizeObserver: true
})))

const renderedVirtualItems = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

function measureVirtualItem(element: Element | null) {
  virtualizer.value.measureElement(element as HTMLElement | null)
}

function handleScroll(event: Event) {
  emit('scroll', event)
}

function scrollToIndex(index: number, options?: { align?: ScrollAlignment, behavior?: VirtualScrollBehavior }) {
  virtualizer.value.scrollToIndex(index, options)
}

function scrollToOffset(offset: number, options?: { align?: ScrollAlignment, behavior?: VirtualScrollBehavior }) {
  virtualizer.value.scrollToOffset(offset, options)
}

function scrollToEnd(options?: { behavior?: VirtualScrollBehavior }) {
  const lastIndex = props.items.length - 1
  if (lastIndex < 0) return
  virtualizer.value.scrollToIndex(lastIndex, { align: 'end', behavior: options?.behavior })
}

function measure() {
  virtualizer.value.measure()
}

watch(() => props.items.map((_, index) => getVirtualItemKey(index)).join('|'), () => {
  measuredSizeCache.clear()
})

defineExpose({
  scrollToIndex,
  scrollToOffset,
  scrollToEnd,
  measure,
  get virtualizer() {
    return virtualizer.value
  },
  get $el() {
    return scrollElementRef.value
  }
})
</script>
