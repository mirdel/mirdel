<template>
  <UModal 
    :open="open" 
    @update:open="$emit('update:open', $event)" 
    :title="t('chat.debug.title')"
    :ui="{ 
      content: 'max-w-3xl',
    }"
  >
    <template #body>
      <!-- 加载中 -->
      <div v-if="isLoading" class="p-8 text-center text-toned">
        <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin mx-auto mb-2" />
        {{ t("chat.debug.loading") }}
      </div>
      
      <!-- 无调试信息 -->
      <div v-else-if="!debugInfo" class="p-8 text-center text-toned">
        {{ t("chat.debug.empty") }}
      </div>
      
      <!-- 调试信息展示 -->
      <div v-else class="space-y-6">
        <!-- 基本参数 -->
        <div class="border border-default rounded-lg">
          <div class="p-3 border-b border-default flex items-center gap-2">
            <span class="text-sm font-medium">{{ t("chat.debug.basic") }}</span>
          </div>
          <div class="p-4 space-y-4">
            <!-- 模型 -->
            <div>
              <h4 class="text-xs font-medium text-toned mb-1">{{ t("chat.debug.model") }}</h4>
              <div class="text-sm">
                {{ modelDisplayName }}
                <span class="text-muted">| {{ debugInfo.meta.provider.name }}</span>
              </div>
            </div>
            
            <!-- 参数配置 -->
            <div>
              <h4 class="text-xs font-medium text-toned mb-1">{{ t("chat.debug.params") }}</h4>
              <div class="text-xs space-y-0.5 text-toned">
                <div v-if="debugInfo.meta.params.temperature !== undefined">
                  temperature: {{ debugInfo.meta.params.temperature }}
                </div>
                <div v-if="debugInfo.meta.params.topP !== undefined">
                  top_p: {{ debugInfo.meta.params.topP }}
                </div>
                <div v-if="debugInfo.meta.params.maxOutputTokens">
                  max_tokens: {{ debugInfo.meta.params.maxOutputTokens }}
                </div>
                <div v-if="debugInfo.meta.params.maxToolSteps">
                  max_tool_steps: {{ debugInfo.meta.params.maxToolSteps }}
                </div>
              </div>
            </div>
            
            <!-- MCP 服务器 -->
            <div v-if="debugInfo.meta.mcpServers && debugInfo.meta.mcpServers.length > 0">
              <h4 class="text-xs font-medium text-toned mb-1">
                {{ formatMcpServersTitle(debugInfo.meta.mcpServers.length, debugInfo.meta.mcpAggregationTime) }}
              </h4>
              <div class="text-xs text-toned space-y-1">
                <div
                  v-for="server in debugInfo.meta.mcpServers"
                  :key="server.id"
                  class="flex items-center gap-2"
                >
                  <span>{{ server.name }}</span>
                  <span class="text-muted">{{ server.toolsCount }} tools</span>
                  <span
                    class="px-1 py-0.5 text-xs rounded"
                    :class="{
                      'bg-green-100 text-green-700': server.fromCache,
                      'bg-yellow-100 text-yellow-700': !server.fromCache
                    }"
                  >
                    {{ server.fromCache ? t("chat.debug.cache") : t("chat.debug.build") }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 可用工具（可折叠） -->
            <UCollapsible v-if="debugInfo.meta.availableTools && debugInfo.meta.availableTools.length > 0">
              <div class="text-xs font-medium text-toned cursor-pointer">
                {{ t("chat.debug.availableTools", { count: debugInfo.meta.availableTools.length }) }}
              </div>
              <template #content>
                <div class="mt-2 text-xs text-toned space-y-1">
                  <div
                    v-for="tool in debugInfo.meta.availableTools"
                    :key="tool.name"
                    class="flex items-start gap-2"
                  >
                    <span class="font-mono text-toned">{{ formatToolName(tool.name) }}</span>
                    <span v-if="tool.description" class="text-muted truncate">- {{ tool.description }}</span>
                  </div>
                </div>
              </template>
            </UCollapsible>
          </div>
        </div>

        <!-- 历史对话记忆召回 -->
        <div
          v-if="debugInfo.meta.historicalMemory"
          class="border border-default rounded-lg"
        >
          <div class="p-3 border-b border-default flex items-center gap-2">
            <span class="text-sm font-medium">
              {{ t("chat.debug.historicalMemory") }}
            </span>
            <span class="text-xs text-muted">
              {{ t("chat.debug.historicalMemoryCount", { count: debugInfo.meta.historicalMemory.hits.length }) }}
            </span>
          </div>
          <div class="p-4 space-y-3">
            <div class="text-xs text-toned">
              {{ t("chat.debug.historicalMemoryQuery") }}:
              <span class="text-default">{{ debugInfo.meta.historicalMemory.query }}</span>
            </div>
            <div
              v-if="debugInfo.meta.historicalMemory.hits.length === 0"
              class="text-xs text-muted"
            >
              {{ t("chat.debug.historicalMemoryEmpty") }}
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="hit in debugInfo.meta.historicalMemory.hits"
                :key="hit.chunkId"
                class="p-3 bg-muted rounded border border-default space-y-2"
              >
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <span class="font-medium text-default">{{ hit.sessionTitle || hit.sessionId }}</span>
                  <span class="text-muted">{{ formatDateTime(hit.createdAt) }}</span>
                  <span class="text-muted">score {{ formatScore(hit.score) }}</span>
                  <span
                    v-for="reason in hit.reason"
                    :key="reason"
                    class="px-1.5 py-0.5 rounded border border-default text-muted"
                  >
                    {{ reason }}
                  </span>
                </div>
                <div class="text-xs text-muted">
                  vector {{ formatOptionalScore(hit.vectorScore) }} · keyword {{ formatOptionalScore(hit.keywordScore) }}
                </div>
                <pre class="text-xs text-toned whitespace-pre-wrap break-all">{{ hit.contentPreview }}</pre>
              </div>
            </div>
          </div>
        </div>

        <!-- 执行流程（ReAct 循环） -->
        <div class="border border-default rounded-lg">
          <div class="p-3 border-b border-default flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium">{{ t("chat.debug.execution") }}</span>
            </div>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              @click="toggleAllSteps"
            >
              {{ allStepsExpanded ? t("chat.debug.collapseAll") : t("chat.debug.expandAll") }}
            </UButton>
          </div>
          
          <div class="divide-y divide-gray-200">
            <!-- 遍历 Steps -->
            <template v-for="(step, stepIndex) in debugInfo.steps" :key="stepIndex">
              <!-- Step Header（多个 Step 时才显示） -->
              <UCollapsible 
                v-if="debugInfo.steps.length > 1"
                v-model:open="stepOpenStates[stepIndex]"
              >
                <div class="p-3 cursor-pointer hover:bg-muted flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium">Step {{ stepIndex + 1 }}</span>
                    <span class="text-xs text-toned">
                      {{ formatDuration(step.endTime - step.startTime) }}
                    </span>
                    <span v-if="step.usage" class="text-xs text-muted">
                      ({{ step.usage.inputTokens }} + {{ step.usage.outputTokens }} tokens)
                    </span>
                  </div>
                  <span class="text-xs text-muted">{{ step.finishReason }}</span>
                </div>
                
                <template #content>
                <div class="p-4 border-t border-default space-y-4">
                  <!-- Input Messages -->
                  <div>
                    <h5 class="text-xs font-medium text-toned mb-2">
                      Input ({{ step.inputMessages.length }} messages)
                    </h5>
                    <div class="space-y-2">
                      <div
                        v-for="(msg, msgIndex) in step.inputMessages"
                        :key="msgIndex"
                        class="p-2 bg-muted rounded border border-default"
                      >
                        <div class="flex items-center gap-2 mb-1">
                          <span
                            class="px-1.5 py-0.5 text-xs rounded font-medium"
                            :class="{
                              'bg-elevated text-toned': msg.role === 'system',
                              'bg-blue-200 text-blue-700': msg.role === 'user',
                              'bg-green-200 text-green-700': msg.role === 'assistant',
                              'bg-orange-200 text-orange-700': msg.role === 'tool'
                            }"
                          >
                            {{ msg.role }}
                          </span>
                        </div>
                        <pre class="text-xs text-toned overflow-x-auto whitespace-pre-wrap break-all">{{ formatMessageContent(msg.content ?? msg.parts) }}</pre>
                      </div>
                    </div>
                  </div>

                  <!-- Output Content -->
                  <div>
                    <h5 class="text-xs font-medium text-toned mb-2">Output</h5>
                    <pre class="text-xs p-2 bg-muted rounded border border-default overflow-x-auto whitespace-pre-wrap break-all">{{ formatMessageContent(step.outputContent) }}</pre>
                  </div>
                </div>
                </template>
              </UCollapsible>
              
              <!-- 单个 Step：不显示 Step Header，直接展示内容 -->
              <div v-else class="p-4 space-y-4">
                <!-- Input Messages -->
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <h5 class="text-xs font-medium text-toned">
                      Input ({{ step.inputMessages.length }} messages)
                    </h5>
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      @click="toggleAllInputMessages"
                    >
                      {{ allInputMessagesExpanded ? t("chat.debug.collapseAll") : t("chat.debug.expandAll") }}
                    </UButton>
                  </div>
                  <div class="space-y-2">
                    <UCollapsible
                      v-for="(msg, msgIndex) in step.inputMessages"
                      :key="msgIndex"
                      v-model:open="inputMessageOpenStates[msgIndex]"
                    >
                      <div class="p-2 bg-muted rounded border border-default cursor-pointer hover:bg-muted">
                        <span
                          class="px-1.5 py-0.5 text-xs rounded font-medium"
                          :class="{
                            'bg-elevated text-toned': msg.role === 'system',
                            'bg-blue-200 text-blue-700': msg.role === 'user',
                            'bg-green-200 text-green-700': msg.role === 'assistant',
                            'bg-orange-200 text-orange-700': msg.role === 'tool'
                          }"
                        >
                          {{ msg.role }}
                        </span>
                      </div>
                      <template #content>
                        <pre class="mt-1 p-2 text-xs text-toned bg-default border border-default rounded overflow-x-auto whitespace-pre-wrap break-all">{{ formatMessageContent(msg.content ?? msg.parts) }}</pre>
                      </template>
                    </UCollapsible>
                  </div>
                </div>

                <!-- Output Content -->
                <div>
                  <h5 class="text-xs font-medium text-toned mb-2">Output</h5>
                  <pre class="text-xs p-2 bg-muted rounded border border-default overflow-x-auto whitespace-pre-wrap break-all">{{ formatMessageContent(step.outputContent) }}</pre>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Token 统计 -->
        <div v-if="settingsStore.sessionPreferences.showTokenUsage" class="flex flex-wrap gap-2">
          <div class="flex-1 p-4 bg-blue-50 rounded-lg text-center">
            <div class="text-xs text-blue-600 mb-1">{{ t("chat.debug.inputTokens") }}</div>
            <div class="text-md font-bold text-blue-700 font-mono">
              {{ debugInfo.stats.totalInputTokens !== null ? debugInfo.stats.totalInputTokens.toLocaleString() : '-' }}
            </div>
          </div>
          <div class="flex-1 p-4 bg-green-50 rounded-lg text-center">
            <div class="text-xs text-green-600 mb-1">{{ t("chat.debug.outputTokens") }}</div>
            <div class="text-md font-bold text-green-700 font-mono">
              {{ debugInfo.stats.totalOutputTokens !== null ? debugInfo.stats.totalOutputTokens.toLocaleString() : '-' }}
            </div>
          </div>
          <div class="flex-1 p-4 bg-orange-50 rounded-lg text-center">
            <div class="text-xs text-orange-600 mb-1">{{ t("chat.debug.totalTokens") }}</div>
            <div class="text-md font-bold text-orange-700 font-mono">
              <template v-if="debugInfo.stats.totalInputTokens !== null && debugInfo.stats.totalOutputTokens !== null">
                {{ (debugInfo.stats.totalInputTokens + debugInfo.stats.totalOutputTokens).toLocaleString() }}
              </template>
              <span v-else>-</span>
            </div>
          </div>
          <div class="flex-1 p-4 bg-purple-50 rounded-lg text-center">
            <div class="text-xs text-purple-600 mb-1">{{ t("chat.debug.totalDuration") }}</div>
            <div class="text-md font-bold text-purple-700 font-mono">
              {{ (debugInfo.stats.totalDuration / 1000).toFixed(2) }}
            </div>
          </div>
        </div>

      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatDebugInfo } from '@shared'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { parseModelInfo } from '@/utils/modelInfo'

const props = defineProps<{
  open: boolean
  turnId?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t } = useI18n()
const settingsStore = useSettingsStore()

const isLoading = ref(false)
const debugInfo = ref<ChatDebugInfo | null>(null)
const stepOpenStates = ref<Record<number, boolean>>({})
const inputMessageOpenStates = ref<Record<number, boolean>>({})
const allStepsExpanded = ref(false)
const allInputMessagesExpanded = ref(false)

// 监听打开状态，加载调试信息
watch(() => props.open, async (isOpen) => {
  if (isOpen && props.turnId) {
    await loadDebugInfo()
  } else if (!isOpen) {
    // 关闭时仅重置展开状态，不重置 debugInfo，避免关闭动画期间闪现「无调试信息」
    stepOpenStates.value = {}
    inputMessageOpenStates.value = {}
    allStepsExpanded.value = false
    allInputMessagesExpanded.value = false
  }
})

async function loadDebugInfo() {
  if (!props.turnId) return
  
  isLoading.value = true
  try {
    const result = await window.ipc('messages:getDebugInfo', { turnId: props.turnId })
    if (result.ok) {
      debugInfo.value = result.debugInfo
      // 默认展开第一个 Step
      if (debugInfo.value && debugInfo.value.steps.length > 1) {
        stepOpenStates.value[0] = true
      }
    } else {
      debugInfo.value = null
    }
  } catch (error) {
    console.error('Failed to load debug info:', error)
    debugInfo.value = null
  } finally {
    isLoading.value = false
  }
}

// 模型显示名称
const modelDisplayName = computed(() => {
  if (!debugInfo.value?.meta.model) return '-'
  const info = parseModelInfo(debugInfo.value.meta.model)
  return info ? info.modelName : debugInfo.value.meta.model
})

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function formatDateTime(value: number) {
  return new Date(value).toLocaleString()
}

function formatScore(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : '-'
}

function formatOptionalScore(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '-'
}

function formatMcpServersTitle(count: number, aggregationTime?: number) {
  const suffix = aggregationTime
    ? t('chat.debug.mcpAggregationSuffix', { time: aggregationTime })
    : ''
  return t('chat.debug.mcpServers', { count, suffix })
}

function formatMessageContent(content: any) {
  if (content == null) return ''
  if (content && typeof content === 'object' && !Array.isArray(content) && 'content' in content) {
    return formatMessageContent((content as any).content)
  }
  if (Array.isArray(content) && content.length > 0) {
    const textParts = content
      .filter((part) => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim()
    if (textParts) return textParts
  }
  if (typeof content === 'string') return content
  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

// 格式化工具名称（去掉 serverId:: 前缀，显示为 toolName）
function formatToolName(fullName: string) {
  const parts = fullName.split('::')
  return parts.length > 1 ? parts[1] : fullName
}

function toggleAllSteps() {
  const stepsCount = debugInfo.value?.steps.length || 0
  const newState = !allStepsExpanded.value
  for (let i = 0; i < stepsCount; i++) {
    stepOpenStates.value[i] = newState
  }
  allStepsExpanded.value = newState
}

function toggleAllInputMessages() {
  const firstStep = debugInfo.value?.steps[0]
  const messagesCount = firstStep?.inputMessages.length || 0
  const newState = !allInputMessagesExpanded.value
  for (let i = 0; i < messagesCount; i++) {
    inputMessageOpenStates.value[i] = newState
  }
  allInputMessagesExpanded.value = newState
}
</script>
