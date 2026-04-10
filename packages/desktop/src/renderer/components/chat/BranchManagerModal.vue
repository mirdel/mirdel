<template>
  <UModal 
    v-model:open="isOpen" 
    :title="t('chat.branchManager.title')"
    :ui="{
      content: 'max-w-2xl'
    }"
  >
    <template #body>
      <div v-if="loading" class="flex items-center justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-muted" />
      </div>

      <div v-else-if="branchesInfo.length > 0" class="space-y-3">
        <div
          v-for="(branchInfo, index) in branchesInfo"
          :key="branchInfo.session.id"
          class="border rounded-lg p-4"
          :class="[
            { 'bg-elevated border-2': branchInfo.session.id === currentSessionId },
            { 'ml-4': index > 0 }
          ]"
        >
          <!-- 头部：图标 + 标题 + 标签 -->
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-start gap-3 flex-1 min-w-0">
              <UBadge
                :icon="index === 0 ? 'i-lucide-home' : 'i-lucide-git-branch'"
                :color="index === 0 ? 'success' : 'info'"
                size="lg"
                variant="subtle"
                square
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <!-- 编辑模式 -->
                  <UInput
                    v-if="editingSessionId === branchInfo.session.id"
                    :ref="(el) => { if (el) editInputRef = el }"
                    v-model="editingTitle"
                    variant="none"
                    size="sm"
                    class="flex-1"
                    :ui="{
                      base: 'px-0 py-0.5 text-sm font-medium'
                    }"
                    @blur="handleSaveTitle(branchInfo.session.id)"
                    @keydown.enter="handleSaveTitle(branchInfo.session.id)"
                    @keydown.esc="handleCancelEdit"
                  />
                  <!-- 显示模式 -->
                  <template v-else>
                    <div class="text-sm font-medium truncate">{{ branchInfo.session.title }}</div>
                    <UBadge
                      v-if="branchInfo.session.id === currentSessionId"
                      variant="outline"
                      size="sm"
                    >
                      {{ t("chat.branchManager.current") }}
                    </UBadge>
                  </template>
                </div>
                
                <!-- 分支信息 -->
                <div class="flex items-center text-xs gap-1 text-toned">
                  <!-- 分叉来源 -->
                  <div v-if="index > 0 && branchInfo.parentSessionTitle">
                    <span v-html="t('chat.branchManager.forkedFrom', { title: branchInfo.parentSessionTitle })" /> ·
                  </div>
                  <div>{{ t("chat.branchManager.messageCount", { count: branchInfo.messageCount }) }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 分叉点消息预览 -->
          <div v-if="index > 0 && branchInfo.forkPointMessage" class="mt-3 pl-8">
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
              <div class="flex items-start gap-2">
                <UIcon name="i-lucide-corner-left-up" class="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-amber-900 mb-1">{{ t("chat.branchManager.forkPoint") }}</div>
                  <div
                    v-if="branchInfo.forkPointMessage.isDeleted"
                    class="text-muted"
                  >
                    {{ t("chat.sessionOverview.messageDeleted") }}
                  </div>
                  <MessagePreview 
                    v-else
                    :content="branchInfo.forkPointMessage.parts"
                    :lines="2"
                    class="text-toned"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 分叉后首条消息预览 -->
          <div v-if="index > 0 && branchInfo.firstNewMessage" class="mt-3 pl-8">
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <div class="flex items-start gap-2">
                <UIcon name="i-lucide-message-square" class="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-blue-900 mb-1">{{ t("chat.branchManager.firstAfterFork") }}</div>
                  <div
                    v-if="branchInfo.firstNewMessage.isDeleted"
                    class="text-muted"
                  >
                    {{ t("chat.sessionOverview.messageDeleted") }}
                  </div>
                  <MessagePreview 
                    v-else
                    :content="branchInfo.firstNewMessage.parts"
                    :lines="2"
                    class="text-toned"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="flex items-center gap-2 mt-4 pl-8">
            <UButton
              v-if="branchInfo.session.id !== currentSessionId"
              size="sm"
              variant="solid"
              icon="i-lucide-arrow-right"
              @click="handleSwitch(branchInfo.session.id)"
            >
              {{ t("chat.branchManager.switchToBranch") }}
            </UButton>
            <UButton
              size="sm"
              variant="soft"
              icon="i-lucide-pencil"
              @click="handleRename(branchInfo.session)"
            >
              {{ t("chat.branchManager.rename") }}
            </UButton>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-12 text-toned">
        {{ t("chat.branchManager.empty") }}
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <div class="text-xs text-toned">
          {{ t("chat.branchManager.summary", { count: branchesInfo.length - 1 }) }}
        </div>
        <div class="flex items-center gap-2">
          <UButton
            variant="soft"
            icon="i-lucide-map"
            @click="handleOpenSessionOverview"
          >
            {{ t("chat.view.menu.sessionMap") }}
          </UButton>
          <UButton
            color="neutral"
            @click="isOpen = false"
          >
            {{ t("chat.sources.close") }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/useChatStore'
import { useMyToast } from '@/composables/useMyToast'
import { useSessionDelete } from '@/composables/useSessionDelete'
import MessagePreview from './MessagePreview.vue'

import type { MessageContentPart } from '@/utils/messageContentUtils'

type BranchInfo = {
  session: {
    id: string
    title: string
    rootSessionId: string | null
    parentSessionId: string | null
    forkFromMessageId: string | null
    forkPointMessageId: string | null
    createdAt: number
    updatedAt: number
    selectedModel: string
    scenarioId: string
  }
  messageCount: number
  forkPointMessage: {
    id: string
    parts: MessageContentPart[]
    role: string
    isDeleted?: boolean
  } | null
  firstNewMessage: {
    id: string
    parts: MessageContentPart[]
    role: string
    isDeleted?: boolean
  } | null
  parentSessionTitle?: string
}

const props = defineProps<{
  modelValue: boolean
  rootSessionId: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'openSessionOverview': []
}>()

const router = useRouter()
const chatStore = useChatStore()
const toast = useMyToast()
const { deleteSession } = useSessionDelete()
const { t } = useI18n()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const loading = ref(false)
const branchesInfo = ref<BranchInfo[]>([])
const editingSessionId = ref<string | null>(null)
const editingTitle = ref('')
const editInputRef = ref<any>(null)

// 使用 computed 确保实时获取当前会话ID
const currentSessionId = computed(() => chatStore.currentSessionId)

// 监听编辑状态变化，自动聚焦和选中
watch(editingSessionId, (newVal) => {
  if (newVal) {
    nextTick(() => {
      if (editInputRef.value) {
        const inputElement = editInputRef.value.inputRef as HTMLInputElement
        if (inputElement) {
          inputElement.select()
        }
      }
    })
  }
})

watch(() => props.modelValue, (val) => {
  if (val && props.rootSessionId) {
    loadBranchesInfo()
  }
})

async function loadBranchesInfo() {
  if (!props.rootSessionId) return
  
  loading.value = true
  try {
    branchesInfo.value = await window.ipc('sessions:getBranchesInfo', {
      rootSessionId: props.rootSessionId
    })
  } catch (error) {
    toast.error({
      title: t('chat.branchManager.loadFailed'),
      description: String(error)
    })
  } finally {
    loading.value = false
  }
}

function handleSwitch(sessionId: string) {
  router.push({ name: 'chat', params: { sessionId } })
  isOpen.value = false
}

function handleRename(session: BranchInfo['session']) {
  editingSessionId.value = session.id
  editingTitle.value = session.title
}

async function handleSaveTitle(sessionId: string) {
  // 如果当前没有在编辑这个会话，直接返回（防止重复触发）
  if (editingSessionId.value !== sessionId) {
    return
  }
  
  const trimmed = editingTitle.value.trim()
  
  // 如果标题为空，直接退出编辑（恢复原标题）
  if (!trimmed) {
    editingSessionId.value = null
    return
  }
  
  const branch = branchesInfo.value.find(b => b.session.id === sessionId)
  if (!branch) {
    editingSessionId.value = null
    return
  }
  
  // 标题没变化，直接退出编辑
  if (trimmed === branch.session.title) {
    editingSessionId.value = null
    return
  }
  
  // 立即退出编辑状态，防止 blur 事件重复触发
  editingSessionId.value = null
  
  try {
    await chatStore.updateSessionTitle(sessionId, trimmed)
    toast.success(t('chat.sessionList.toast.titleUpdated'))
    // 重新加载分支信息
    await loadBranchesInfo()
  } catch (error) {
    toast.error({
      title: t('chat.sessionList.toast.updateFailed'),
      description: String(error)
    })
  }
}

function handleCancelEdit() {
  editingSessionId.value = null
  editingTitle.value = ''
}

async function handleDelete(session: BranchInfo['session']) {
  await deleteSession(session.id)
  // 重新加载
  await loadBranchesInfo()
}

function handleOpenSessionOverview() {
  // 先关闭当前 modal
  isOpen.value = false
  // 触发事件通知父组件打开会话地图
  emit('openSessionOverview')
}
</script>
