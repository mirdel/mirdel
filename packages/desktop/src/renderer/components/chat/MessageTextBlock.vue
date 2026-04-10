<template>
  <div 
    ref="containerRef"
    @mousedown="handleMouseDown"
    @mouseup="handleTextSelection"
    @click="handleClick"
  >
    <MarkdownBlock
      :content="displayText"
      :is-streaming="isStreaming"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import MarkdownBlock from '../MarkdownBlock.vue'

// 将 [S1] 转为 [1](cite:1)，UI 上显示数字更简洁、适合圆形等展示
function preprocessCitations(text: string): string {
  return text.replace(/\[S(\d+)\](?!\()/g, '[$1](cite:$1)')
}

export interface TextPart {
  type: 'text'
  text: string
}

const props = defineProps<{
  part: TextPart
  isStreaming?: boolean
}>()

const displayText = computed(() => preprocessCitations(props.part.text))

const emit = defineEmits<{
  'text-selected': [text: string, position: { top: number; left: number }]
  'citation-click': [index: number]
}>()

const containerRef = ref<HTMLElement>()
let mousedownInContainer = false

function handleMouseDown() {
  // 记录鼠标按下时是否在容器内
  mousedownInContainer = true
}

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  
  // 检查是否点击了引用链接
  const citeLink = target.closest('[data-citation-index]') as HTMLElement | null
  if (citeLink) {
    e.preventDefault()
    e.stopPropagation()
    
    // 提取编号
    const rawIndex = citeLink.getAttribute('data-citation-index') || ''
    const index = parseInt(rawIndex, 10)
    if (!Number.isNaN(index)) {
      emit('citation-click', index)
    }
  }
}

function handleTextSelection(e: MouseEvent) {
  // 只有鼠标按下和抬起都在容器内才处理
  if (!mousedownInContainer) return
  mousedownInContainer = false
  
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return
  
  const text = selection.toString().trim()
  if (!text) return
  
  // 检查选区是否在当前容器内
  if (!containerRef.value) return
  const range = selection.getRangeAt(0)
  if (!containerRef.value.contains(range.commonAncestorContainer)) return
  
  // 获取选区位置
  const rect = range.getBoundingClientRect()
  const position = {
    top: rect.top - 40,  // 浮层显示在选区上方
    left: rect.left + rect.width / 2
  }
  
  emit('text-selected', text, position)
}
</script>
