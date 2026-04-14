import { computed, onScopeDispose, ref, toValue, type CSSProperties, type MaybeRefOrGetter } from 'vue'
import { useEventListener, useStorage } from '@vueuse/core'

type ResizeSide = 'left' | 'right'

type UseResizableWidthOptions = {
  storageKey: string
  defaultWidth: number
  minWidth: MaybeRefOrGetter<number>
  maxWidth: MaybeRefOrGetter<number>
  collapsed?: MaybeRefOrGetter<boolean>
  collapsedWidth?: MaybeRefOrGetter<number>
  disabled?: MaybeRefOrGetter<boolean>
  side?: ResizeSide
  step?: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function toFiniteNumber(value: unknown, fallback: number) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function getDirectionalCursor(side: ResizeSide, direction: 'increase' | 'decrease') {
  if (side === 'right') {
    return direction === 'increase' ? 'e-resize' : 'w-resize'
  }

  return direction === 'increase' ? 'w-resize' : 'e-resize'
}

export function useResizableWidth(options: UseResizableWidthOptions) {
  const storedWidth = useStorage(options.storageKey, options.defaultWidth)
  const isDragging = ref(false)
  const side = options.side ?? 'right'
  const step = options.step ?? 16
  let stopActiveResize: (() => void) | null = null

  const minWidth = computed(() => toFiniteNumber(toValue(options.minWidth), options.defaultWidth))
  const maxWidth = computed(() => {
    const resolvedMax = toFiniteNumber(toValue(options.maxWidth), options.defaultWidth)
    return Math.max(resolvedMax, minWidth.value)
  })

  const width = computed({
    get() {
      return clamp(toFiniteNumber(storedWidth.value, options.defaultWidth), minWidth.value, maxWidth.value)
    },
    set(value: number) {
      storedWidth.value = clamp(value, minWidth.value, maxWidth.value)
    }
  })

  const collapsed = computed(() => !!toValue(options.collapsed))
  const collapsedWidth = computed(() => {
    return toFiniteNumber(toValue(options.collapsedWidth), minWidth.value)
  })
  const disabled = computed(() => collapsed.value || !!toValue(options.disabled))

  const activeWidth = computed(() => {
    return collapsed.value ? collapsedWidth.value : width.value
  })

  const widthStyle = computed<CSSProperties>(() => ({
    width: `${activeWidth.value}px`
  }))

  const cursor = computed(() => {
    if (disabled.value) return 'default'
    if (width.value <= minWidth.value) return getDirectionalCursor(side, 'increase')
    if (width.value >= maxWidth.value) return getDirectionalCursor(side, 'decrease')
    return 'col-resize'
  })

  function resizeBy(direction: number) {
    if (disabled.value) return
    width.value = width.value + direction * step
  }

  function resetWidth() {
    width.value = options.defaultWidth
  }

  function startResize(event: PointerEvent) {
    if (disabled.value || event.button !== 0) return

    event.preventDefault()
    stopActiveResize?.()

    const startX = event.clientX
    const startWidth = width.value
    const direction = side === 'right' ? 1 : -1
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    isDragging.value = true
    document.body.style.cursor = cursor.value
    document.body.style.userSelect = 'none'

    let stopMove: (() => void) | null = null
    let stopUp: (() => void) | null = null
    let stopCancel: (() => void) | null = null

    const stopResize = () => {
      isDragging.value = false
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      stopMove?.()
      stopUp?.()
      stopCancel?.()
      stopMove = null
      stopUp = null
      stopCancel = null
      stopActiveResize = null
    }
    stopActiveResize = stopResize

    stopMove = useEventListener(document, 'pointermove', (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      width.value = startWidth + (moveEvent.clientX - startX) * direction
      document.body.style.cursor = cursor.value
    })
    stopUp = useEventListener(document, 'pointerup', stopResize, { once: true })
    stopCancel = useEventListener(document, 'pointercancel', stopResize, { once: true })
  }

  onScopeDispose(() => {
    stopActiveResize?.()
  })

  return {
    width,
    minWidth,
    maxWidth,
    activeWidth,
    widthStyle,
    cursor,
    isDragging,
    startResize,
    resizeBy,
    resetWidth
  }
}
