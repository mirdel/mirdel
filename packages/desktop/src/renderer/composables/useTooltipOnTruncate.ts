import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

/**
 * 检测元素文本是否被截断，用于控制 tooltip 是否显示
 * @returns elementRef - 需要绑定到目标元素的 ref
 * @returns isTruncated - 是否被截断
 * @returns shouldShowTooltip - 是否应该显示 tooltip（与 isTruncated 相同，语义更清晰）
 * @returns checkTruncation - 手动触发检测的方法
 */
export function useTooltipOnTruncate() {
  const elementRef = ref<HTMLElement>()
  const isTruncated = ref(false)
  let resizeObserver: ResizeObserver | null = null

  /**
   * 检测元素是否被截断
   * 通过比较 scrollWidth 和 clientWidth 来判断
   */
  const checkTruncation = () => {
    if (!elementRef.value) return
    
    // scrollWidth 是内容的实际宽度（包括被隐藏的部分）
    // clientWidth 是元素的可见宽度
    isTruncated.value = elementRef.value.scrollWidth > elementRef.value.clientWidth
  }

  // 组件挂载时检测一次并设置 ResizeObserver
  onMounted(() => {
    checkTruncation()
    
    // 使用 ResizeObserver 监听元素自身大小变化
    // 这会响应所有导致元素大小改变的情况：窗口调整、splitpane 调整、容器大小变化等
    if (elementRef.value) {
      resizeObserver = new ResizeObserver(() => {
        checkTruncation()
      })
      resizeObserver.observe(elementRef.value)
    }
  })

  // 组件卸载时清理 ResizeObserver
  onBeforeUnmount(() => {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
  })

  return {
    elementRef,
    isTruncated: computed(() => isTruncated.value),
    shouldShowTooltip: computed(() => isTruncated.value),
    checkTruncation
  }
}

