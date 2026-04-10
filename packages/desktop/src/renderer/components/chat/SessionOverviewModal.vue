<template>
  <UModal 
    v-model:open="isOpen" 
    :title="t('chat.view.menu.sessionMap')"
    :ui="{
      content: 'w-[80vw] h-[80vh] max-w-[80vw] max-h-[80vw]',
      body: 'h-full'
    }"
  >
    <template #body>
      <div v-if="loading" class="flex items-center justify-center h-full">
        <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-muted" />
      </div>

      <div v-else-if="error" class="flex items-center justify-center h-full text-red-500">
        {{ error }}
      </div>

      <div v-else class="w-full h-full">
        <VueFlow
          ref="vueFlowRef"
          :nodes="nodes"
          :edges="edges"
          :nodes-draggable="false"
          :nodes-connectable="false"
          :elements-selectable="true"
          :pan-on-scroll="true"
          :zoom-on-scroll="true"
          :min-zoom="0.4"
          :max-zoom="1.5"
          :default-zoom="1"
          :fit-view-on-init="true"
          @node-click="handleNodeClick"
        >
          <template #node-message="{ data }">
            <MessageNode :data="data" />
          </template>
          
          <template #node-title="{ data }">
            <TitleNode :data="data" />
          </template>
        </VueFlow>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { VueFlow, Position, useVueFlow } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import type { MessagePublic } from '@/stores/useChatStore'
import { useChatStore } from '@/stores/useChatStore'
import emitter from '@/utils/emitter'
import MessageNode from './SessionOverviewMessageNode.vue'
import TitleNode from './SessionOverviewTitleNode.vue'

// 定义节点的 data 类型
type MessageNodeData = {
  messageId: string
  sessionId: string
  role: 'user' | 'assistant'
  parts: MessagePublic['parts']
  isDeleted?: boolean
}

type TitleNodeData = {
  sessionId: string
  title: string
  isMain: boolean
}

// 后端返回的数据类型
type SessionPathInfo = {
  sessionId: string
  title: string
  isMain: boolean
  messages: MessagePublic[]
  parentSessionId: string | null
  forkFromMessageId: string | null
  forkPointMessageId: string | null
}

type ForkPointInfo = {
  parentSessionId: string
  parentMessageId: string
  childSessionId: string
  childFirstMessageId: string
}

type SessionOverviewData = {
  sessions: SessionPathInfo[]
  forkPoints: ForkPointInfo[]
}

const props = defineProps<{
  modelValue: boolean
  rootSessionId: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const router = useRouter()
const chatStore = useChatStore()
const { t } = useI18n()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const loading = ref(false)
const error = ref<string | null>(null)
const nodes = ref<any[]>([])
const edges = ref<any[]>([])
const vueFlowRef = ref<InstanceType<typeof VueFlow>>()

watch(() => props.modelValue, (val) => {
  if (val && props.rootSessionId) {
    loadOverviewData()
  }
})

async function loadOverviewData() {
  if (!props.rootSessionId) return
  
  loading.value = true
  error.value = null
  
  try {
    const data = await window.ipc('sessions:getOverview', {
      rootSessionId: props.rootSessionId
    }) as SessionOverviewData
    
    buildFlowGraph(data)
    
    // 等待 DOM 更新后居中显示
    await nextTick()
    setTimeout(() => {
      vueFlowRef.value?.fitView({ padding: 0.2, duration: 300 })
    }, 100)
  } catch (e) {
    error.value = String(e)
    console.error('Failed to load session overview:', e)
  } finally {
    loading.value = false
  }
}

function buildFlowGraph(data: SessionOverviewData) {
  const COLUMN_WIDTH = 280
  const ROW_HEIGHT = 100
  const TITLE_HEIGHT = 40
  
  const newNodes: any[] = []
  const newEdges: any[] = []
  
  // 用于记录每个消息的 Y 坐标（用于分叉点对齐）
  const messageYMap = new Map<string, number>()
  
  // 判断是否存在分支关系（多于一个会话）
  const hasBranches = data.sessions.length > 1
  
  // 1. 布局每个会话
  data.sessions.forEach((session, colIndex) => {
    const x = colIndex * COLUMN_WIDTH
    let y = 0
    
    // 如果是分支会话，找到父会话中分叉点的 Y 坐标
    if (!session.isMain && session.forkFromMessageId) {
      const parentY = messageYMap.get(session.forkFromMessageId)
      if (parentY !== undefined) {
        // 从分叉点的下一行开始
        y = parentY + ROW_HEIGHT
      }
    }
    
    // 布局消息节点
    session.messages.forEach((msg, rowIndex) => {
      const nodeId = msg.id
      
      // 记录消息的 Y 坐标
      messageYMap.set(msg.id, y)
      
      // 创建消息节点
      newNodes.push({
        id: nodeId,
        type: 'message',
        position: { x, y },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: {
          messageId: msg.id,
          sessionId: msg.sessionId,
          role: msg.role,
          parts: msg.parts,
          isDeleted: msg.isDeleted
        }
      })
      
      // 创建同会话内的实线边
      if (rowIndex > 0) {
        const prevMsg = session.messages[rowIndex - 1]
        newEdges.push({
          id: `${prevMsg.id}-${msg.id}`,
          source: prevMsg.id,
          target: msg.id,
          type: 'smoothstep',
          style: { stroke: '#cbd5e0', strokeWidth: 1 }
        })
      }
      
      y += ROW_HEIGHT
    })
    
    // 添加标题节点（只在有分支时显示）
    if (session.messages.length > 0 && hasBranches) {
      newNodes.push({
        id: `${session.sessionId}-title`,
        type: 'title',
        position: { x, y },
        data: {
          sessionId: session.sessionId,
          title: session.title,
          isMain: session.isMain,
          hasBranches: hasBranches
        }
      })
    }
  })
  
  // 2. 添加分叉点的虚线边
  data.forkPoints.forEach(fp => {
    newEdges.push({
      id: `fork-${fp.parentMessageId}-${fp.childFirstMessageId}`,
      source: fp.parentMessageId,
      target: fp.childFirstMessageId,
      type: 'smoothstep',
      style: { 
        stroke: '#cbd5e0', 
        strokeWidth: 1, 
        strokeDasharray: '5,5'
      }
    })
  })
  
  nodes.value = newNodes
  edges.value = newEdges
}

async function handleNodeClick(event: { node: any }) {
  const node = event.node
  
  // 处理消息节点的点击
  if (node.type === 'message') {
    const data = node.data as MessageNodeData
    
    // 1. 切换会话（如果不是当前会话）
    if (chatStore.currentSessionId !== data.sessionId) {
      await chatStore.switchSession(data.sessionId)
    }
    
    // 2. 发送滚动事件（MessageList 会在消息加载后自动滚动）
    emitter.emit('chat:scroll-to-message', data.messageId)
    
    // 3. 关闭 Modal
    isOpen.value = false
  }
  
  // 处理标题节点的点击
  if (node.type === 'title') {
    const data = node.data as TitleNodeData
    
    // 切换会话（switchSession 内部会触发滚动到底部）
    if (chatStore.currentSessionId !== data.sessionId) {
      await chatStore.switchSession(data.sessionId)
    }
    
    // 关闭 Modal
    isOpen.value = false
  }
}
</script>

<style scoped>
/* 自定义 Vue Flow 样式 */
:deep(.vue-flow__node) {
  border-radius: 0;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

:deep(.vue-flow__handle) {
  opacity: 0;
}
</style>
