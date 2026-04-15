<template>
  <div
    v-if="isHistoricalMemorySearch"
    :class="[
      'border rounded-lg my-2 overflow-hidden',
      statusClass,
      { 'cursor-pointer': historicalMemoryRecall }
    ]"
    @click="openHistoricalMemoryModal"
  >
    <div class="flex items-center justify-between px-3 py-1.5">
      <div class="flex items-center gap-2">
        <UIcon :name="toolIcon" :class="['w-3.5 h-3.5', statusIconClass]" />
        <span :class="['text-xs font-medium', statusTextClass]">
          {{ displayText }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <UIcon
          v-if="isLoading"
          name="i-lucide-loader"
          class="w-3.5 h-3.5 animate-spin"
        />
        <UIcon
          v-else-if="isError"
          name="i-lucide-triangle-alert"
          class="w-3.5 h-3.5 text-error-500"
        />
        <UIcon
          v-else-if="isAborted"
          name="i-lucide-square"
          class="w-3.5 h-3.5 text-toned"
        />
        <UIcon
          v-else
          name="i-lucide-circle-check"
          class="w-3.5 h-3.5 text-success-500"
        />
        <span :class="['text-[11px] font-medium', statusLabelClass]">
          {{ statusLabel }}
        </span>
        <UIcon
          v-if="historicalMemoryRecall"
          name="i-lucide-chevron-right"
          :class="['w-3.5 h-3.5', statusChevronClass]"
        />
      </div>
    </div>
  </div>

  <div
    v-else
    :class="[
      'border rounded-lg my-2 overflow-hidden',
      statusClass
    ]"
  >
    <!-- Header 作为 Collapsible 的 trigger，点击只展开/收起详情 -->
    <UCollapsible v-model:open="isOpen" class="contents">
      <div class="flex items-center justify-between px-3 py-1.5 cursor-pointer">
        <div class="flex items-center gap-2">
          <UIcon :name="toolIcon" :class="['w-3.5 h-3.5', statusIconClass]" />
          <span :class="['text-xs font-medium', statusTextClass]">
            {{ displayText }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <UIcon
            v-if="isPendingConfirmation"
            name="i-lucide-shield-alert"
            class="w-3.5 h-3.5 text-amber-500"
          />
          <UIcon
            v-else-if="isAwaitingExecution"
            name="i-lucide-hourglass"
            class="w-3.5 h-3.5"
          />
          <UIcon
            v-else-if="isLoading"
            name="i-lucide-loader"
            class="w-3.5 h-3.5 animate-spin"
          />
          <UIcon
            v-else-if="isError"
            name="i-lucide-triangle-alert"
            class="w-3.5 h-3.5 text-error-500"
          />
          <UIcon
            v-else-if="isAborted"
            name="i-lucide-square"
            class="w-3.5 h-3.5 text-toned"
          />
          <UIcon
            v-else
            name="i-lucide-circle-check"
            class="w-3.5 h-3.5 text-success-500"
          />
          <span :class="['text-[11px] font-medium', statusLabelClass]">
            {{ statusLabel }}
          </span>
          <UIcon
            name="i-lucide-chevron-right"
            :class="[
              'w-3.5 h-3.5 transition-transform duration-200',
              statusChevronClass,
              { 'rotate-90': isOpen }
            ]"
          />
        </div>
      </div>

      <!-- 详情部分：仅含参数与结果，收起时隐藏 -->
      <template #content>
        <div class="px-3 pb-3 text-xs text-toned space-y-3">
          <div v-if="hasInput" class="pt-3">
            <div class="text-default font-medium mb-1">{{ t("chat.toolBlock.params") }}</div>
            <pre class="bg-default p-2 rounded-lg border border-default overflow-x-auto">{{ formattedInput }}</pre>
          </div>

          <div v-if="showResultBlock">
            <div class="text-default font-medium mb-1">{{ t("chat.toolBlock.result") }}</div>
            <template v-if="isError">
              <div class="bg-default p-2 rounded-lg border border-error-200 text-error-700">
                {{ errorMessage }}
              </div>
              <details v-if="hasDetails" class="mt-2">
                <summary class="cursor-pointer text-toned hover:text-toned">{{ t("chat.toolBlock.viewDetails") }}</summary>
                <pre class="bg-default p-2 rounded-lg border border-default overflow-x-auto max-h-48 mt-1">{{ formattedDetails }}</pre>
              </details>
            </template>
            <template v-else>
              <pre class="bg-default p-2 rounded-lg border border-default overflow-x-auto max-h-48">{{ formattedOutput }}</pre>
            </template>
          </div>

        </div>
      </template>
    </UCollapsible>

    <!-- 底部操作区：待确认时固定显示，不参与收起；会话已完成时隐藏 -->
    <div
      v-if="isPendingConfirmation && !isSessionArchived"
      class="px-3 py-2 border-t border-amber-200/80 bg-amber-50/80 flex items-center justify-between gap-2 flex-wrap"
    >
      <span class="text-xs font-medium text-amber-700">{{ t("chat.toolBlock.confirmRequired") }}</span>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="xs"
          :disabled="isSubmittingApproval"
          @click="handleConfirm('allow')"
        >
          {{ t("chat.toolBlock.allowOnce") }}
        </UButton>
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          :disabled="isSubmittingApproval"
          @click="handleConfirm('allow-and-whitelist')"
        >
          {{ t("chat.toolBlock.allowAndWhitelist") }}
        </UButton>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="isSubmittingApproval"
          @click="handleConfirm('reject')"
        >
          {{ t("chat.toolBlock.reject") }}
        </UButton>
      </div>
    </div>
  </div>

  <HistoricalMemoryRecallModal
    v-if="isHistoricalMemorySearch"
    v-model:open="showHistoricalMemoryModal"
    :recall="historicalMemoryRecall"
  />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DynamicToolPart, HistoricalMemoryRecall } from '@shared'
import { useChatStore } from '@/stores/useChatStore'
import HistoricalMemoryRecallModal from './HistoricalMemoryRecallModal.vue'

const props = defineProps<{
  toolCall: DynamicToolPart
  toolResult?: DynamicToolPart
}>()

const chatStore = useChatStore()
const { t } = useI18n()
const isSessionArchived = computed(() => !!chatStore.currentSession?.isArchived)
const isOpen = ref(false)
const showHistoricalMemoryModal = ref(false)

// ===== 状态计算 =====

const resultPart = computed(() => {
  if (props.toolResult) return props.toolResult as any
  const state = (props.toolCall as any)?.state
  if (state === 'output-available' || state === 'output-error' || state === 'aborted') {
    return props.toolCall as any
  }
  return undefined
})

const isPendingConfirmation = computed(() => {
  return !resultPart.value &&
    (props.toolCall as any)?.state === 'approval-requested' &&
    !!(props.toolCall as any)?.approval?.id
})

const isAwaitingExecution = computed(() => {
  return !resultPart.value && (props.toolCall as any)?.state === 'approval-responded'
})

const isSubmittingApproval = computed(() => {
  return chatStore.isSubmittingApproval
})

// 是否正在 loading（执行中/等待执行）
const isLoading = computed(() => {
  if (resultPart.value || isPendingConfirmation.value) return false
  const state = (props.toolCall as any)?.state
  return isAwaitingExecution.value || state === 'input-streaming' || state === 'input-available'
})

const isAborted = computed(() => {
  const part = resultPart.value as any
  if (!part) return false

  if (part?.state === 'aborted') return true

  const textCandidates: string[] = []
  if (typeof part?.errorText === 'string') textCandidates.push(part.errorText)

  const output = part?.output as any
  if (typeof output?.error === 'string') textCandidates.push(output.error)
  if (Array.isArray(output?.content)) {
    const textPart = output.content.find((c: any) => c?.type === 'text')
    if (typeof textPart?.text === 'string') textCandidates.push(textPart.text)
  }

  const merged = textCandidates.join(' ').toLowerCase()
  return merged.includes('中止') || merged.includes('终止') || merged.includes('abort')
})

// 是否有错误
const isError = computed(() => {
  if (!resultPart.value) return false
  if (isAborted.value) return false
  const state = (resultPart.value as any)?.state
  const output = (resultPart.value as any)?.output as any
  return state === 'output-error' || output?.isError === true
})

const showResultBlock = computed(() => {
  if (!resultPart.value) return false
  return !isLoading.value && !isPendingConfirmation.value && !isAwaitingExecution.value && !isAborted.value
})

// 是否是网络搜索工具
const isWebSearch = computed(() => props.toolCall.toolName === 'system::web_search')
const isWebScrape = computed(() => props.toolCall.toolName === 'system::web_scrape')
const isHistoricalMemorySearch = computed(() => props.toolCall.toolName === 'system::historical_memory_search')
const isShellCommand = computed(() => props.toolCall.toolName === 'system::run_command')

// 工具图标
const toolIcon = computed(() => {
  if (isWebSearch.value || isWebScrape.value) {
    return 'i-lucide-globe'
  }
  if (isHistoricalMemorySearch.value) {
    return 'i-lucide-brain'
  }
  return 'i-lucide-wrench'
})

// ===== 显示名称 =====

// 显示用的服务器名称（优先使用 _meta.serverName）
const displayServerName = computed(() => {
  if (props.toolCall._meta?.serverName) {
    return props.toolCall._meta.serverName
  }
  // 回退：从 toolName 中解析
  const parts = props.toolCall.toolName.split('::')
  return parts.length > 1 ? parts[0] : ''
})

// 显示用的工具名称（优先使用 _meta.toolName）
const displayToolName = computed(() => {
  if (props.toolCall._meta?.toolName) {
    return props.toolCall._meta.toolName
  }
  // 回退：从 toolName 中解析
  const parts = props.toolCall.toolName.split('::')
  return parts.length > 1 ? parts[1] : props.toolCall.toolName
})

// ===== 状态样式 =====

const statusClass = computed(() => {
  if (isPendingConfirmation.value) {
    return 'border-amber-200 bg-amber-50'
  }
  if (isLoading.value) {
    return 'border-default bg-elevated'
  }
  if (isAborted.value) {
    return 'border-default bg-muted'
  }
  if (isError.value) {
    return 'border-error-200 bg-error-50'
  }
  return 'border-success-200 bg-success-50'
})

const statusIconClass = computed(() => {
  if (isPendingConfirmation.value) return 'text-amber-600'
  if (isLoading.value) return 'text-default'
  if (isAborted.value) return 'text-toned'
  if (isError.value) return 'text-error-600'
  return 'text-success-600'
})

const statusTextClass = computed(() => {
  if (isPendingConfirmation.value) return 'text-amber-700'
  if (isLoading.value) return 'text-default'
  if (isAborted.value) return 'text-toned'
  if (isError.value) return 'text-error-700'
  return 'text-success-700'
})

const statusChevronClass = computed(() => {
  if (isPendingConfirmation.value) return 'text-amber-500'
  if (isLoading.value) return 'text-default'
  if (isAborted.value) return 'text-toned'
  if (isError.value) return 'text-error-500'
  return 'text-success-500'
})

const statusLabel = computed(() => {
  if (isPendingConfirmation.value) return t('chat.toolBlock.status.pendingConfirmation')
  if (isAwaitingExecution.value) return t('chat.toolBlock.status.awaitingExecution')
  if (isLoading.value) return t('chat.toolBlock.status.running')
  if (isAborted.value) return t('chat.toolBlock.status.aborted')
  if (isError.value) return t('chat.toolBlock.status.failed')
  return t('chat.toolBlock.status.success')
})

const statusLabelClass = computed(() => {
  if (isPendingConfirmation.value) return 'text-amber-600'
  if (isLoading.value || isAwaitingExecution.value) return 'text-default'
  if (isAborted.value) return 'text-toned'
  if (isError.value) return 'text-error-600'
  return 'text-success-600'
})

// 显示文本
const displayText = computed(() => {
  if (isShellCommand.value) {
    return t('chat.toolBlock.callTool', { tool: shellCommandPreview.value || 'run_command' })
  }
  if (isWebSearch.value) {
    return t('chat.toolBlock.webSearch')
  }
  if (isWebScrape.value) {
    return t('chat.toolBlock.callTool', { tool: 'web_scrape' })
  }
  if (isHistoricalMemorySearch.value) {
    if (isLoading.value) return t('chat.toolBlock.memorySearch.running')
    if (isError.value) return t('chat.toolBlock.memorySearch.failed')
    const count = historicalMemoryRecall.value?.hits.length ?? 0
    return t('chat.toolBlock.memorySearch.done', { count })
  }
  return t('chat.toolBlock.callTool', { tool: displayToolName.value })
})

const shellCommandPreview = computed(() => {
  if (!isShellCommand.value) return ''
  const input = (props.toolCall as any)?.input as any
  return typeof input?.command === 'string' ? input.command.trim() : ''
})

// ===== 参数格式化 =====

const hasInput = computed(() => {
  if (!props.toolCall.input) return false
  if (typeof props.toolCall.input === 'object') {
    return Object.keys(props.toolCall.input as object).length > 0
  }
  return true
})

const formattedInput = computed(() => {
  return JSON.stringify(props.toolCall.input, null, 2)
})

// ===== 结果格式化 =====

const errorMessage = computed(() => {
  if (!resultPart.value) return ''
  const part = resultPart.value as any
  if (typeof part?.errorText === 'string' && part.errorText) return part.errorText
  const output = part.output as any
  // 优先使用 error 字段（自定义格式，来自 tool-error 事件）
  if (output?.error) return output.error
  // 尝试从 MCP 标准格式的 content 中提取文本
  if (output?.content && Array.isArray(output.content)) {
    const textPart = output.content.find((c: any) => c.type === 'text')
    if (textPart?.text) return textPart.text
  }
  return t('chat.toolBlock.unknownError')
})

const hasDetails = computed(() => {
  if (!resultPart.value) return false
  const output = (resultPart.value as any).output as any
  return output?.details !== undefined
})

const formattedDetails = computed(() => {
  if (!resultPart.value) return ''
  const output = (resultPart.value as any).output as any
  return JSON.stringify(output?.details, null, 2)
})

const formattedOutput = computed(() => {
  if (!resultPart.value) return ''
  const output = (resultPart.value as any).output
  if (typeof output === 'string') {
    return output
  }
  return JSON.stringify(output, null, 2)
})

const historicalMemoryRecall = computed<HistoricalMemoryRecall | null>(() => {
  const output = (resultPart.value as any)?.output as any
  const fromOutput = output?._meta?.historicalMemory
  const fromProvider = (resultPart.value as any)?.callProviderMetadata?.mirdel?.historicalMemory
  const recall = fromOutput || fromProvider
  if (!recall || !Array.isArray(recall.hits)) return null
  return {
    mode: 'tool',
    query: String(recall.query || ''),
    hits: recall.hits,
  }
})

function openHistoricalMemoryModal() {
  if (!historicalMemoryRecall.value) return
  showHistoricalMemoryModal.value = true
}

function handleConfirm(action: 'allow' | 'allow-and-whitelist' | 'reject') {
  const sessionId = chatStore.currentSessionId
  const approvalId = (props.toolCall as any)?.approval?.id
  if (!sessionId || !approvalId) {
    chatStore.confirmToolExecution(props.toolCall.toolCallId, action)
    return
  }
  chatStore.confirmToolExecution(props.toolCall.toolCallId, action, {
    sessionId,
    approvalId,
    toolName: props.toolCall.toolName,
    input: props.toolCall.input
  })
}
</script>
