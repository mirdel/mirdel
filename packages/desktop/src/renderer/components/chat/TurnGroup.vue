<template>
  <div class="message-group">
    <!-- User 消息：直接渲染 -->
    <MessageItem 
      v-if="group.type === 'user'" 
      :message="group.primaryMessage" 
    />
    
    <!-- Response 组：AI 回复（可能包含多条 assistant/tool 消息） -->
    <div v-else-if="group.type === 'response'" class="response-group mt-2 mb-4">
      <!-- 组级别 header：头像 + 模型名 + loading/时间 -->
      <div class="mb-2 flex items-center gap-2.5">
        <ModelLogo :model-id="modelInfo?.modelName ?? ''" size="md" />
        
        <div class="flex items-center gap-2 text-xs select-none">
          <!-- 模型名：始终显示（只要有） -->
          <template v-if="!isDeleted && modelInfo">
            <span class="truncate">{{ modelInfo.modelName }}</span>
            <USeparator orientation="vertical" class="h-3" />
            <span class="text-muted truncate">{{ modelInfo.providerName }}</span>
          </template>

          <template v-if="activeSkillLabel">
            <USeparator v-if="!isDeleted && modelInfo" orientation="vertical" class="h-3" />
            <span class="text-muted truncate">{{ activeSkillLabel }}</span>
          </template>
          
          <!-- 时间：完成后显示 -->
          <template v-if="displayTime">
            <USeparator v-if="!isDeleted && modelInfo" orientation="vertical" class="h-3" />
            <UTooltip :text="fullTime">
              <span class="text-muted">{{ formattedTime }}</span>
            </UTooltip>
          </template>
        </div>
      </div>
      
      <!-- 渲染所有消息内容，全部使用 grouped 模式（过滤掉 tool 消息，其内容已整合到 assistant 消息的工具调用块中） -->
      <div 
        ref="responseContentRef"
        class="space-y-0" 
        @mouseover="handleCitationMouseOver"
        @mouseout="handleCitationMouseOut"
      >
        <MessageItem 
          v-for="msg in filteredMessages" 
          :key="msg.id"
          :message="msg"
          :tool-result-map="toolResultMap"
          mode="grouped"
          @citation-click="handleCitationClick"
        />
        <div v-if="showTailLoading" class="pt-3 pb-2 flex items-center gap-1.5 text-muted">
          <span class="w-1.5 h-1.5 bg-accented rounded-full animate-pulse" style="animation-delay: 0ms"></span>
          <span class="w-1.5 h-1.5 bg-accented rounded-full animate-pulse" style="animation-delay: 150ms"></span>
          <span class="w-1.5 h-1.5 bg-accented rounded-full animate-pulse" style="animation-delay: 300ms"></span>
        </div>
      </div>

      <MessageMindmapBlock
        v-if="settingsStore.sessionPreferences.showMindmap && isComplete && !isDeleted"
        :markdown="mindmapMarkdown"
      />
      
      <!-- 组级别 toolbar：完成后显示 -->
      <div 
        v-if="isComplete && !isDeleted"
        class="mt-4 flex items-center justify-between"
      >
        <!-- 左侧操作按钮组 -->
        <div class="flex items-center gap-1">
          <!-- 复制按钮 -->
          <UTooltip :text="isCopied ? t('chat.thinking.copied') : t('chat.thinking.copy')">
            <UButton
              :icon="isCopied ? 'i-lucide-check' : 'i-lucide-copy'"
              size="sm"
              color="neutral"
              variant="ghost"
              square
              @click="handleCopy"
            />
          </UTooltip>

          <!-- 朗读按钮 -->
          <div
            v-if="isReadAloudAvailable"
            class="group/read-aloud flex items-center rounded-md overflow-hidden transition-colors"
            :class="(isReadAloudPending || isReadingAloud) ? 'bg-elevated/70' : ''"
          >
            <UTooltip :text="isReadingAloud ? t('chat.turnGroup.stopReading') : t('chat.turnGroup.readAloud')">
              <UButton
                :icon="
                  isReadAloudPending
                    ? 'i-lucide-loader-circle'
                    : (isReadingAloud ? 'i-lucide-square' : 'i-lucide-volume-2')
                "
                :loading="isReadAloudPending"
                size="sm"
                color="neutral"
                variant="ghost"
                square
                class="rounded-r-none transition-colors group-hover/read-aloud:bg-elevated/70 hover:bg-elevated"
                @click="handleReadAloud"
              />
            </UTooltip>

            <UPopover
              mode="click"
              :content="{ side: 'top', align: 'start', sideOffset: 8 }"
              :ui="{ content: 'w-72 p-3' }"
            >
              <UButton
                icon="i-lucide-chevron-down"
                size="sm"
                color="neutral"
                variant="ghost"
                class="rounded-l-none px-0 min-w-0 border-l border-default/20 transition-colors group-hover/read-aloud:bg-elevated/70 hover:bg-elevated"
              />
              <template #content>
                <div class="space-y-2">
                  <UFormField :label="t('chat.turnGroup.readAloudVoiceLabel')" size="sm">
                    <USelect
                      :model-value="readAloudTtsSettings.voice"
                      :items="readAloudVoiceOptions"
                      value-key="value"
                      label-key="label"
                      size="sm"
                      class="w-full"
                      @update:model-value="handleReadAloudVoiceChange"
                    />
                  </UFormField>
                  <UFormField
                    :label="t('chat.turnGroup.readAloudRateLabel')"
                    :description="readAloudRateDisplay"
                    size="sm"
                  >
                    <USlider
                      :model-value="readAloudRateValue"
                      :min="READ_ALOUD_RATE_MIN_X"
                      :max="READ_ALOUD_RATE_MAX_X"
                      :step="READ_ALOUD_RATE_STEP_X"
                      size="xs"
                      @update:model-value="handleReadAloudRateChange"
                      @change="handleReadAloudRateCommit"
                    />
                  </UFormField>
                  <UFormField
                    :label="t('chat.turnGroup.readAloudPitchLabel')"
                    :description="readAloudPitchDisplay"
                    size="sm"
                  >
                    <USlider
                      :model-value="readAloudPitchValue"
                      :min="READ_ALOUD_PITCH_MIN_HZ"
                      :max="READ_ALOUD_PITCH_MAX_HZ"
                      :step="READ_ALOUD_PITCH_STEP_HZ"
                      size="xs"
                      @update:model-value="handleReadAloudPitchChange"
                      @change="handleReadAloudPitchCommit"
                    />
                  </UFormField>
                </div>
              </template>
            </UPopover>
          </div>
          
          <!-- 引用按钮：会话已完成时隐藏 -->
          <UTooltip v-if="!isSessionArchived" :text="t('chat.message.askAboutThis')">
            <UButton
              icon="i-lucide-quote"
              size="sm"
              color="neutral"
              variant="ghost"
              square
              @click="handleQuote"
            />
          </UTooltip>
          
          <!-- 重新生成按钮：会话已完成时隐藏 -->
          <UDropdownMenu v-if="showRegenerateMenu" :items="regenerateMenuItems" :content="{ align: 'start', side: 'top' }">
            <UTooltip :text="t('chat.turnGroup.regenerate')">
              <UButton
                icon="i-lucide-refresh-cw"
                size="sm"
                color="neutral"
                variant="ghost"
                square
                :loading="isRegenerating"
              />
            </UTooltip>
          </UDropdownMenu>
          
          <!-- 创建分支按钮：临时会话或会话已完成时不显示 -->
          <UTooltip v-if="!chatStore.isTemporarySession && !isSessionArchived" :text="t('chat.turnGroup.createBranch')">
            <UButton
              icon="i-lucide-git-branch-plus"
              size="sm"
              color="neutral"
              variant="ghost"
              square
              :loading="isCreatingBranch"
              @click="handleCreateBranch"
            />
          </UTooltip>
          
          <!-- 临时问按钮：仅最后一条回复组显示，会话已完成时隐藏 -->
          <UTooltip v-if="isLastResponseGroup && !chatStore.isTemporarySession && !isSessionArchived" :text="t('chat.turnGroup.tempAsk')">
            <UButton
              icon="i-lucide-message-circle-dashed"
              size="sm"
              color="neutral"
              variant="ghost"
              square
              @click="handleTempAsk"
            />
          </UTooltip>
          
          <!-- 更多操作菜单（含编辑、删除等） -->
          <UDropdownMenu :items="moreMenuItems" :content="{ align: 'start', side: 'top' }">
            <UTooltip :text="t('chat.message.more')">
              <UButton
                icon="i-lucide-more-horizontal"
                size="sm"
                color="neutral"
                variant="ghost"
                square
              />
            </UTooltip>
          </UDropdownMenu>
          
          <!-- 本回答参考了 N 条资料 -->
          <UButton
            v-if="citedSourcesFiltered.length > 0"
            variant="ghost"
            color="neutral"
            size="sm"
            class="flex items-center gap-1.5"
            @click="showSourcesDrawer = true"
            >
            <UAvatarGroup :max="3" size="3xs">
              <UAvatar
                v-for="s in citedSourcesFiltered"
                :key="s.index"
                :src="s.favicon"
                :alt="s.source || s.siteName"
                icon="i-lucide-file-text"
              />
            </UAvatarGroup>
            <span class="text-xs text-muted">{{ t('chat.turnGroup.citedSources', { count: citedSourcesFiltered.length }) }}</span>
          </UButton>

          <UButton
            v-if="autoHistoricalMemoryRecall && autoHistoricalMemoryRecall.hits.length > 0"
            variant="ghost"
            color="neutral"
            size="sm"
            class="flex items-center gap-1.5"
            @click="showHistoricalMemoryModal = true"
          >
            <span>
              <UIcon name="i-lucide-brain-cog" size="14" />
            </span>
            <span class="text-xs text-muted">
              {{ t('chat.turnGroup.historicalMemoryRecall', { count: autoHistoricalMemoryRecall.hits.length }) }}
            </span>
          </UButton>
        </div>
        
        <!-- 统计信息（右侧） -->
        <div 
          v-if="settingsStore.sessionPreferences.showTokenUsage && tokenUsage && (tokenUsage.inputTokens !== null || tokenUsage.outputTokens !== null)"
          class="flex items-center"
        >
          <UPopover
            mode="click"
            :content="{ side: 'top', align: 'end', sideOffset: 8 }"
            :ui="{ content: 'w-56 p-2' }"
          >
            <UTooltip :text="t('chat.turnGroup.tokens.statisticsLabel')">
              <UButton
                icon="i-lucide-info"
                size="sm"
                color="neutral"
                variant="ghost"
                square
                :aria-label="t('chat.turnGroup.tokens.statisticsLabel')"
              />
            </UTooltip>
            <template #content>
              <div class="flex flex-wrap gap-2">
                <div class="w-[calc(50%-0.25rem)] rounded-lg bg-blue-50 p-3 text-center">
                  <div class="text-xs text-blue-600">{{ t("chat.debug.inputTokens") }}</div>
                  <div class="mt-2 text-sm font-bold font-mono text-blue-700">{{ formatTokenCount(tokenUsage.inputTokens) }}</div>
                </div>
                <div class="w-[calc(50%-0.25rem)] rounded-lg bg-green-50 p-3 text-center">
                  <div class="text-xs text-green-600">{{ t("chat.debug.outputTokens") }}</div>
                  <div class="mt-2 text-sm font-bold font-mono text-green-700">{{ formatTokenCount(tokenUsage.outputTokens) }}</div>
                </div>
                <div class="w-[calc(50%-0.25rem)] rounded-lg bg-orange-50 p-3 text-center">
                  <div class="text-xs text-orange-600">{{ t("chat.debug.totalTokens") }}</div>
                  <div class="mt-2 text-sm font-bold font-mono text-orange-700">{{ formatTokenCount(totalTokenCount) }}</div>
                </div>
                <div class="w-[calc(50%-0.25rem)] rounded-lg bg-purple-50 p-3 text-center">
                  <div class="text-xs text-purple-600">{{ t("chat.debug.totalDuration") }}</div>
                  <div class="mt-2 text-sm font-bold font-mono text-purple-700">{{ formatDurationSeconds(totalDurationMs) }}</div>
                </div>
              </div>
            </template>
          </UPopover>
        </div>
      </div>

      <!-- 追问建议：仅最后一轮且有建议时显示，位于工具栏下方 -->
      <SuggestionsBlock
        v-if="settingsStore.sessionPreferences.generateSuggestions && groupSuggestions.length > 0"
        :items="groupSuggestions"
      />
    </div>
  </div>
  
  <!-- 高级重新生成选项 Modal -->
  <UModal v-model:open="showAdvancedRegenerateModal" :title="t('chat.turnGroup.regenerate')">
    <template #body>
      <div class="space-y-6">
        <!-- 内容风格 -->
        <div>
          <label class="text-sm font-medium mb-2 block">{{ t('chat.turnGroup.style') }}</label>
          <URadioGroup 
            v-model="advancedRegenerateOptions.style"
            :items="styleOptions"
            variant="card"
          />
          
          <!-- 自定义风格输入框 -->
          <UInput
            v-if="advancedRegenerateOptions.style === 'custom'"
            ref="customStyleInput"
            v-model="advancedRegenerateOptions.customStylePrompt"
            :placeholder="t('chat.turnGroup.customStylePlaceholder')"
            class="w-full mt-3"
          />
        </div>

        <!-- 模型选择 -->
        <div>
          <label class="text-sm font-medium mb-2 block">{{ t('chat.turnGroup.switchModel') }}</label>
          <ModelSelector 
            v-model="advancedRegenerateOptions.model"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="w-full flex justify-end gap-2">
        <UButton 
          color="neutral" 
          variant="outline"
          @click="showAdvancedRegenerateModal = false"
        >
          {{ t('common.cancel') }}
        </UButton>
        <UButton 
          v-if="canRegenerateOverwrite"
          @click="handleAdvancedRegenerateOverwrite"
        >
          {{ t('chat.turnGroup.overwriteGenerate') }}
        </UButton>
        <UButton 
          v-if="canRegenerateInBranch"
          @click="handleAdvancedRegenerateBranch"
        >
          {{ t('chat.turnGroup.generateInBranch') }}
        </UButton>
      </div>
    </template>
  </UModal>
  
  <!-- 调试详情弹窗 -->
  <MessageDebugModal
    v-model:open="showDebugModal"
    :turn-id="group.turnId"
  />
  
  <!-- 写入知识库弹窗 -->
  <WriteToKbModal
    v-model:open="showWriteToKbModal"
    :content-md="assistantText"
  />
  
  <!-- 来源抽屉（仅显示被引用的来源） -->
  <SourcesDrawer
    v-model:open="showSourcesDrawer"
    :sources="citedSourcesFiltered"
    @source-click="handleSourceActivate"
  />

  <HistoricalMemoryRecallModal
    v-model:open="showHistoricalMemoryModal"
    :recall="autoHistoricalMemoryRecall"
  />

  <UModal
    v-model:open="showKnowledgeSourceDetail"
    :title="knowledgeSourceModalTitle"
    :ui="{ width: 'max-w-lg' }"
  >
    <template #body>
      <div v-if="activeKnowledgeSource" class="space-y-4">
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs uppercase tracking-wide text-muted mb-1">{{ t('chat.turnGroup.knowledgeSource.kb') }}</div>
          <div class="text-sm font-medium text-default">
            {{ activeKnowledgeSource.kbName || activeKnowledgeSource.source || t('chat.turnGroup.knowledgeSource.defaultTitle') }}
          </div>
          <div
            v-if="activeKnowledgeSource.kbItemTitle || activeKnowledgeSource.title"
            class="text-sm text-toned mt-1"
          >
            {{ t('chat.turnGroup.knowledgeSource.item') }}{{ activeKnowledgeSource.kbItemTitle || activeKnowledgeSource.title }}
          </div>
          <div
            v-if="activeKnowledgeSource.kbItemType"
            class="text-xs text-muted mt-1"
          >
            {{ t('chat.turnGroup.knowledgeSource.type') }}{{ activeKnowledgeSource.kbItemType }}
          </div>
          <div
            v-if="activeKnowledgeSource.chunkId"
            class="text-xs text-muted mt-1"
          >
            {{ t('chat.turnGroup.knowledgeSource.chunk') }}#{{ activeKnowledgeSource.chunkId }}
          </div>
          <div
            v-if="isLegacyKnowledgeSource(activeKnowledgeSource)"
            class="text-xs text-muted mt-2"
          >
            {{ t('chat.turnGroup.knowledgeSource.legacyHint') }}
          </div>
          <div
            v-if="activeKnowledgeSource.url"
            class="text-xs text-muted mt-2 break-all"
          >
            {{ t('chat.turnGroup.knowledgeSource.originalUrl') }}{{ activeKnowledgeSource.url }}
          </div>
        </div>

        <div v-if="activeKnowledgeSource.content" class="rounded-lg border border-default p-3">
          <div class="text-xs uppercase tracking-wide text-muted mb-2">{{ t('chat.turnGroup.knowledgeSource.retrievedChunk') }}</div>
          <div class="text-sm whitespace-pre-wrap break-words text-default">
            {{ activeKnowledgeSource.content }}
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="w-full flex justify-end gap-2">
        <UButton
          v-if="activeKnowledgeSource?.url"
          color="neutral"
          variant="ghost"
          @click="window.webPreview?.open(activeKnowledgeSource.url)"
        >
          {{ t('chat.turnGroup.knowledgeSource.openOriginalUrl') }}
        </UButton>
        <UButton color="neutral" variant="outline" @click="showKnowledgeSourceDetail = false">
          {{ t('globalSearch.close') }}
        </UButton>
      </div>
    </template>
  </UModal>
  
  <!-- 引用预览浮层 -->
  <Teleport to="body">
    <div
      v-if="hoverSource"
      class="citation-preview"
      :style="{ 
        top: hoverPosition.top + 'px', 
        left: hoverPosition.left + 'px' 
      }"
      @mouseenter="handlePreviewMouseEnter"
      @mouseleave="handlePreviewMouseLeave"
    >
      <SourceCard 
        :source="hoverSource" 
        :show-index="false" 
        :compact="true"
        :clickable="hoverSource ? isSourceActionable(hoverSource) : false"
        @click="handleSourceActivate"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MessageGroup as TurnGroupData } from '@/utils/messageGrouper'
import type { MessagePublic } from '@/stores/useChatStore'
import type { CitationSource, CitationSourceKind, HistoricalMemoryRecall } from '@shared'
import MessageItem from './MessageItem.vue'
import SuggestionsBlock from '../generative-ui/SuggestionsBlock.vue'
import ModelLogo from '../ModelLogo.vue'
import ModelSelector from '../ModelSelector.vue'
import MessageDebugModal from './MessageDebugModal.vue'
import WriteToKbModal from './WriteToKbModal.vue'
import SourcesDrawer from './SourcesDrawer.vue'
import SourceCard from './SourceCard.vue'
import HistoricalMemoryRecallModal from './HistoricalMemoryRecallModal.vue'
import MessageMindmapBlock from './MessageMindmapBlock.vue'
import { formatMessageTime } from '@/utils/timeFormat'
import { parseModelInfo } from '@/utils/modelInfo'
import { extractFinalOutput } from '@/utils/messageGrouper'
import { extractAnswerTextFromContent } from '@/utils/messageContentUtils'
import { copyToClipboard } from '@/utils/clipboard'
import { useChatStore } from '@/stores/useChatStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useSkillStore } from '@/stores/useSkillStore'
import { useConfirm } from '@/composables/useConfirm'
import { useContentExport } from '@/composables/useContentExport'
import { useMyToast } from '@/composables/useMyToast'
import { useReadAloud } from '@/composables/useReadAloud'
import emitter from '@/utils/emitter'

const props = defineProps<{
  group: TurnGroupData
}>()

const { t, locale } = useI18n()
const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const isSessionArchived = computed(() => !!chatStore.currentSession?.isArchived)
const skillStore = useSkillStore()
const { confirm } = useConfirm()
const contentExport = useContentExport()
const toast = useMyToast()
const {
  isAvailable: isReadAloudAvailable,
  isSpeakingMessage,
  isPendingMessage,
  speakMessage,
  stopSpeaking,
  readAloudTtsSettings,
  ensureReadAloudSettingsLoaded,
  updateReadAloudSettings,
} = useReadAloud()

// ===== 状态 =====
const isCopied = ref(false)
const isRegenerating = ref(false)
const isCreatingBranch = ref(false)
const showAdvancedRegenerateModal = ref(false)
const showDebugModal = ref(false)
const showSourcesDrawer = ref(false)
const showHistoricalMemoryModal = ref(false)
const showWriteToKbModal = ref(false)
const showKnowledgeSourceDetail = ref(false)
const responseContentRef = ref<HTMLElement | null>(null)
const customStyleInput = ref<any>(null)
const activeKnowledgeSource = ref<CitationSource | null>(null)

const advancedRegenerateOptions = ref({
  style: 'default',
  customStylePrompt: '',
  model: undefined as string | undefined
})

// ===== 计算属性 =====

// 组内第一条 assistant 消息（用于获取模型信息，最可靠）
const firstAssistantMessage = computed(() => {
  return props.group.firstAssistantMessage
    || props.group.messages.find(m => m.role === 'assistant')
    || props.group.messages[0]
})

// 组内最后一条 assistant 消息（用于获取时间、编辑等）
const lastAssistantMessage = computed(() => {
  return props.group.lastAssistantMessage
    || [...props.group.messages].reverse().find(m => m.role === 'assistant')
    || props.group.messages[0]
})

// 关联的 user 消息（用于获取 contextSources 等）
const userMessage = computed(() => {
  if (props.group.userMessage) return props.group.userMessage
  if (!props.group.userMessageId) return null
  const msgs = chatStore.messages
  return msgs.find(m => m.id === props.group.userMessageId)
})

const currentTurn = computed(() => {
  if (props.group.turn) return props.group.turn
  const turnId = firstAssistantMessage.value?.turnId || props.group.turnId
  return chatStore.getTurnById(turnId)
})

const activeSkillLabel = computed(() => {
  const skillId = currentTurn.value?.skillId
  if (!skillId) return ''
  const skill = skillStore.skills.find(s => s.id === skillId)
  return t('chat.turnGroup.skillLabel', { name: skill?.name ?? skillId })
})

// 模型信息（从 turn 获取）
const modelInfo = computed(() => {
  const selectedModel = currentTurn.value?.selectedModel
  if (selectedModel) {
    return parseModelInfo(selectedModel)
  }
  return null
})

// 是否已删除
const isDeleted = computed(() => {
  return props.group.messages.some(m => m.isDeleted)
})

// 是否正在流式输出（含 pending：等待 RAG/连接 时也显示 loading）
const isStreaming = computed(() => {
  if (currentTurn.value) {
    if (currentTurn.value.status === 'pending' || currentTurn.value.status === 'streaming' || currentTurn.value.status === 'awaiting_approval') {
      return true
    }
  }
  return props.group.messages.some(m =>
    m.status === 'streaming' ||
    m.status === 'pending' ||
    m.parts.some((p: any) =>
      p?.type === 'dynamic-tool' &&
      (p?.state === 'approval-requested' || p?.state === 'approval-responded' || p?.state === 'input-streaming' || p?.state === 'input-available')
    )
  )
})

const hasPendingApprovals = computed(() => {
  if (currentTurn.value?.status === 'awaiting_approval') return true
  return props.group.messages.some(m =>
    m.parts.some((p: any) => p?.type === 'dynamic-tool' && p?.state === 'approval-requested')
  )
})

const showTailLoading = computed(() => {
  // 待审批时工具块本身已有强提示，不重复显示末尾 loading。
  return isStreaming.value && !hasPendingApprovals.value
})

// 是否已完成（所有消息都是 success / aborted / error）
const isComplete = computed(() => {
  if (currentTurn.value) {
    return currentTurn.value.status === 'success' || currentTurn.value.status === 'aborted' || currentTurn.value.status === 'error'
  }
  if (hasPendingApprovals.value) return false
  const hasActiveTools = props.group.messages.some(m =>
    m.parts.some((p: any) =>
      p?.type === 'dynamic-tool' &&
      (p?.state === 'approval-responded' || p?.state === 'input-streaming' || p?.state === 'input-available')
    )
  )
  if (hasActiveTools) return false
  return props.group.messages.every(m => m.status === 'success' || m.status === 'aborted' || m.status === 'error')
})

// 追问建议（仅最后一轮且有建议时 getSuggestions 才返回非空）
const groupSuggestions = computed(() => {
  const turnId = props.group.turnId
  if (!turnId) return []
  const sessionId = props.group.messages[0]?.sessionId ?? chatStore.currentSessionId
  return chatStore.getSuggestions(turnId, sessionId ?? undefined)
})

// 仅保留 assistant 消息（所有工具信息都在 assistant content 的 dynamic-tool 中）
const filteredMessages = computed(() => {
  return props.group.messages.filter(m => m.role === 'assistant')
})

// 构建 toolResultMap：toolCallId -> dynamic-tool(output)
const toolResultMap = computed(() => {
  const map = new Map<string, any>()
  
  for (const msg of props.group.messages) {
    for (const part of msg.parts) {
      if (part.type === 'dynamic-tool' && part.toolCallId && part.state === 'output-available') {
        map.set(part.toolCallId, part)
      }
    }
  }
  
  return map
})

// 显示时间（streaming 时不显示，完成后使用最后一条 assistant 消息的 updatedAt）
const displayTime = computed(() => {
  if (isStreaming.value) return null
  if (currentTurn.value?.endedAt) return currentTurn.value.endedAt
  
  // 从后往前找第一条有 updatedAt 的 assistant 消息
  for (let i = props.group.messages.length - 1; i >= 0; i--) {
    const msg = props.group.messages[i]
    if (msg.role === 'assistant' && msg.updatedAt) {
      return msg.updatedAt
    }
  }
  return null
})

const formattedTime = computed(() => formatMessageTime(displayTime.value))

const fullTime = computed(() => {
  if (!displayTime.value) return ''
  return new Date(displayTime.value).toLocaleString(locale.value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
})

// 判断是否是最后一个 response 组（用组内最后一条 assistant 与全局最后一条比较，支持含 tool 调用的多 assistant 组）
const isLastResponseGroup = computed(() => {
  if (typeof props.group.isLastResponseGroup === 'boolean') {
    return props.group.isLastResponseGroup
  }
  return chatStore.checkIfLastAssistantMessage?.(lastAssistantMessage.value.id) ?? false
})

const canRegenerateOverwrite = computed(() => isLastResponseGroup.value && !isSessionArchived.value)
const canRegenerateInBranch = computed(() => !chatStore.isTemporarySession && !isSessionArchived.value)
const showRegenerateMenu = computed(() => canRegenerateOverwrite.value || canRegenerateInBranch.value)

// Token 统计（从最后一条 assistant 消息获取）
const tokenUsage = computed(() => {
  return currentTurn.value?.tokenUsage ?? lastAssistantMessage.value?.tokenUsage
})

const totalTokenCount = computed(() => {
  const input = tokenUsage.value?.inputTokens
  const output = tokenUsage.value?.outputTokens
  if (input === null || input === undefined || output === null || output === undefined) {
    return null
  }
  return input + output
})

const totalDurationMs = computed(() => {
  const startedAt = currentTurn.value?.startedAt
  const endedAt = currentTurn.value?.endedAt
  if (typeof startedAt !== 'number' || typeof endedAt !== 'number' || endedAt < startedAt) {
    return null
  }
  return endedAt - startedAt
})

// ===== 统一引用来源（知识库 contextSources + 网络搜索 tool _meta.sources） =====

function parseCitationIndexFromId(id: string | undefined): number {
  if (!id) return 0
  const match = id.match(/^S(\d+)$/i)
  if (!match) return 0
  const num = parseInt(match[1], 10)
  return Number.isFinite(num) ? num : 0
}

function getHostname(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

function getSourceDedupKey(source: CitationSource): string {
  if (source.id?.trim()) return `id:${source.id.trim()}`
  const normalizedUrl = (source.url || '').trim()
  const normalizedTitle = (source.title || '').trim()
  if (normalizedUrl || normalizedTitle) {
    return `url-title:${normalizedUrl}|${normalizedTitle}`
  }
  return `index-source:${source.index}|${(source.source || source.siteName || '').trim()}`
}

function inferCitationKind(source: CitationSource): CitationSourceKind {
  if (source.kind === 'knowledge' || source.kind === 'web') {
    return source.kind
  }
  if (source.kbId || source.kbItemId || source.kbName) {
    return 'knowledge'
  }
  if (source.url) {
    return 'web'
  }
  return 'knowledge'
}

function normalizeCitationSource(source: CitationSource): CitationSource {
  const kind = inferCitationKind(source)
  if (kind === 'web') {
    return {
      ...source,
      kind,
      source: source.source ?? source.siteName ?? getHostname(source.url)
    }
  }
  return {
    ...source,
    kind,
    kbName: source.kbName ?? source.source,
    kbItemTitle: source.kbItemTitle ?? source.title
  }
}

function dedupeAndSortSources(sources: CitationSource[]): CitationSource[] {
  const map = new Map<string, CitationSource>()
  for (const source of sources) {
    const normalized = normalizeCitationSource(source)
    const key = getSourceDedupKey(normalized)
    if (!map.has(key)) {
      map.set(key, normalized)
    }
  }

  return [...map.values()].sort((a, b) => {
    const aIndexed = a.index > 0
    const bIndexed = b.index > 0
    if (aIndexed && bIndexed) return a.index - b.index
    if (aIndexed) return -1
    if (bIndexed) return 1
    return a.id.localeCompare(b.id)
  })
}

const citedSources = computed<CitationSource[]>(() => {
  const list: CitationSource[] = []
  const userMsg = userMessage.value
  if (userMsg?.contextSources?.length) {
    list.push(...userMsg.contextSources.map(normalizeCitationSource))
  }
  for (const msg of props.group.messages) {
    for (const part of msg.parts) {
      // 标准 source part（AI SDK 原生）也纳入来源池，和 _meta.sources 统一展示与去重。
      if (part.type === 'source-url') {
        const p = part as any
        const inferredIndex = parseCitationIndexFromId(p.sourceId)
        const siteName = getHostname(p.url)
        list.push({
          index: inferredIndex,
          id: p.sourceId || `url:${p.url || p.title || 'unknown'}`,
          kind: 'web',
          title: p.title,
          source: siteName,
          content: '',
          url: p.url,
          siteName
        })
      } else if (part.type === 'source-document') {
        const p = part as any
        const inferredIndex = parseCitationIndexFromId(p.sourceId)
        list.push({
          index: inferredIndex,
          id: p.sourceId || `doc:${p.title || p.filename || 'unknown'}`,
          kind: 'knowledge',
          title: p.title,
          source: p.filename || 'document',
          content: '',
          kbItemTitle: p.title,
        })
        continue
      }

      if (part.type !== 'dynamic-tool') continue
      const toolName = (part as any).toolName || ''
      if (!toolName.includes('web_search')) continue
      const partAny = part as any
      const meta = partAny._meta || partAny.output?._meta
      if (meta?.sources && Array.isArray(meta.sources)) {
        for (const s of meta.sources) {
          list.push({
            index: s.index,
            id: s.id ?? `S${s.index}`,
            kind: s.kind,
            title: s.title,
            source: s.source ?? s.siteName,
            content: s.content,
            url: s.url,
            siteName: s.siteName,
            favicon: s.favicon,
            kbId: s.kbId,
            kbName: s.kbName,
            kbItemId: s.kbItemId,
            kbItemType: s.kbItemType,
            kbItemTitle: s.kbItemTitle,
            chunkId: s.chunkId
          })
        }
      }
    }
  }
  return dedupeAndSortSources(list)
})

// 从回答文本中提取被引用的序号（支持 [S1]、[1](cite:1)、[1] 等）
function extractCitations(text: string): number[] {
  const indices = new Set<number>()
  let match
  const sPattern = /\[S(\d+)\](?!\()/g
  while ((match = sPattern.exec(text)) !== null) {
    const num = parseInt(match[1], 10)
    if (!isNaN(num)) indices.add(num)
  }
  const linkPattern = /\[(?:S)?(\d+)\]\(cite:\d+\)/g
  while ((match = linkPattern.exec(text)) !== null) {
    const num = parseInt(match[1], 10)
    if (!isNaN(num)) indices.add(num)
  }
  const legacyPattern = /\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g
  while ((match = legacyPattern.exec(text)) !== null) {
    match[1].split(',').map(n => parseInt(n.trim(), 10)).forEach(n => {
      if (!isNaN(n)) indices.add(n)
    })
  }
  return Array.from(indices).sort((a, b) => a - b)
}

const assistantText = computed(() => {
  return props.group.messages
    .filter(m => m.role === 'assistant')
    .map(m => extractAnswerTextFromContent(m.parts))
    .join('\n')
})

const mindmapMarkdown = computed(() => extractFinalOutput(props.group.messages))
const isReadingAloud = computed(() => isSpeakingMessage(lastAssistantMessage.value?.id))
const isReadAloudPending = computed(() => isPendingMessage(lastAssistantMessage.value?.id))
const READ_ALOUD_RATE_MIN_X = 0.5
const READ_ALOUD_RATE_MAX_X = 2
const READ_ALOUD_RATE_STEP_X = 0.1
const READ_ALOUD_PITCH_MIN_HZ = -50
const READ_ALOUD_PITCH_MAX_HZ = 50
const READ_ALOUD_PITCH_STEP_HZ = 5

const readAloudVoiceOptions = computed(() => [
  { label: 'zh-CN-XiaoxiaoNeural', value: 'zh-CN-XiaoxiaoNeural' },
  { label: 'zh-CN-YunxiNeural', value: 'zh-CN-YunxiNeural' },
  { label: 'zh-CN-XiaoyiNeural', value: 'zh-CN-XiaoyiNeural' },
  { label: 'en-US-JennyNeural', value: 'en-US-JennyNeural' },
  { label: 'en-US-AriaNeural', value: 'en-US-AriaNeural' },
  { label: 'en-US-GuyNeural', value: 'en-US-GuyNeural' },
  { label: 'en-GB-SoniaNeural', value: 'en-GB-SoniaNeural' },
  { label: 'en-GB-RyanNeural', value: 'en-GB-RyanNeural' },
])
const readAloudRateValue = computed(() => parseRateSettingToMultiplier(readAloudTtsSettings.value.rate))
const readAloudPitchValue = computed(() => parsePitchSettingToHz(readAloudTtsSettings.value.pitch))
const readAloudRateDisplay = computed(() => `${formatMultiplier(readAloudRateValue.value)}x`)
const readAloudPitchDisplay = computed(() => `${formatSignedNumber(readAloudPitchValue.value)}Hz`)

const citedSourcesFiltered = computed<CitationSource[]>(() => {
  if (citedSources.value.length === 0) return []
  const citedIndices = extractCitations(assistantText.value)
  if (citedIndices.length === 0) return []
  return citedSources.value.filter(s => citedIndices.includes(s.index))
})

const autoHistoricalMemoryRecall = computed<HistoricalMemoryRecall | null>(() => {
  const recall = lastAssistantMessage.value?.historicalMemory
  if (!recall || !Array.isArray(recall.hits)) return null
  return recall
})

const knowledgeSourceModalTitle = computed(() => {
  if (!activeKnowledgeSource.value) return t('chat.turnGroup.knowledgeSource.defaultTitle')
  return t('chat.turnGroup.knowledgeSource.titleWithId', { id: activeKnowledgeSource.value.id })
})

// ===== 引用预览浮层 =====
const hoverSource = ref<CitationSource | null>(null)
const hoverPosition = ref({ top: 0, left: 0 })
let hoverTimeout: ReturnType<typeof setTimeout> | null = null

function handleCitationMouseOver(e: MouseEvent) {
  const target = e.target as HTMLElement
  
  // 检查是否 hover 到引用链接
  const citeLink = target.closest('[data-citation-index]') as HTMLElement | null
  if (!citeLink) return
  
  // 清除之前的定时器
  if (hoverTimeout) {
    clearTimeout(hoverTimeout)
    hoverTimeout = null
  }
  
  // 提取编号
  const rawIndex = citeLink.getAttribute('data-citation-index') || ''
  const index = parseInt(rawIndex, 10)
  if (Number.isNaN(index)) return
  const source = citedSources.value.find(s => s.index === index)
  if (!source) return
  
  // 延迟显示，避免快速移动时闪烁
  hoverTimeout = setTimeout(() => {
    const rect = citeLink.getBoundingClientRect()
    const previewWidth = 380
    const previewHeight = 140 // 估算高度
    const gap = 8
    const padding = 16
    
    // 默认显示在链接下方
    let top = rect.bottom + gap
    let left = rect.left
    
    // 右边界检测：如果超出右侧，向左偏移
    if (left + previewWidth > window.innerWidth - padding) {
      left = window.innerWidth - previewWidth - padding
    }
    
    // 左边界检测：确保不小于 padding
    if (left < padding) {
      left = padding
    }
    
    // 底部边界检测：如果下方空间不够，显示在上方
    if (top + previewHeight > window.innerHeight - padding) {
      top = rect.top - previewHeight - gap
    }
    
    // 顶部边界检测：确保不小于 padding
    if (top < padding) {
      top = padding
    }
    
    hoverPosition.value = { top, left }
    hoverSource.value = source
  }, 200)
}

function isSourceActionable(source: CitationSource): boolean {
  const normalized = normalizeCitationSource(source)
  if (inferCitationKind(normalized) === 'web') {
    return !!normalized.url
  }
  return true
}

function isLegacyKnowledgeSource(source: CitationSource): boolean {
  const normalized = normalizeCitationSource(source)
  if (inferCitationKind(normalized) !== 'knowledge') return false
  return !normalized.kbItemId && !normalized.kbId
}

function openKnowledgeSourceDetail(source: CitationSource) {
  activeKnowledgeSource.value = normalizeCitationSource(source)
  showKnowledgeSourceDetail.value = true
}

function handleSourceActivate(source: CitationSource) {
  const normalized = normalizeCitationSource(source)
  if (inferCitationKind(normalized) === 'web' && normalized.url) {
    window.webPreview?.open(normalized.url)
    return
  }
  openKnowledgeSourceDetail(normalized)
}

function handleCitationClick(index: number) {
  const source = citedSources.value.find((item) => item.index === index)
  if (source) {
    handleSourceActivate(source)
    return
  }
  showSourcesDrawer.value = true
}

function handleCitationMouseOut() {
  // 清除定时器
  if (hoverTimeout) {
    clearTimeout(hoverTimeout)
    hoverTimeout = null
  }
  
  // 延迟隐藏，让用户有时间移动到浮层上
  hoverTimeout = setTimeout(() => {
    if (!isHoveringPreview) {
      hoverSource.value = null
    }
  }, 150)
}

// 浮层内的鼠标事件
let isHoveringPreview = false

function handlePreviewMouseEnter() {
  isHoveringPreview = true
  // 清除隐藏定时器
  if (hoverTimeout) {
    clearTimeout(hoverTimeout)
    hoverTimeout = null
  }
}

function handlePreviewMouseLeave() {
  isHoveringPreview = false
  // 延迟隐藏
  hoverTimeout = setTimeout(() => {
    hoverSource.value = null
  }, 100)
}

// 格式化 token 数量显示
function formatTokenCount(count: number | null): string {
  if (count === null) return '-'
  return count.toLocaleString()
}

function formatDurationSeconds(durationMs: number | null): string {
  if (durationMs === null) return '-'
  return (durationMs / 1000).toFixed(2)
}

// 风格选项
const styleOptions = computed(() => [
  { value: 'default', label: t('chat.turnGroup.styleOption.default') },
  { value: 'detailed', label: t('chat.turnGroup.styleOption.detailed') },
  { value: 'concise', label: t('chat.turnGroup.styleOption.concise') },
  { value: 'professional', label: t('chat.turnGroup.styleOption.professional') },
  { value: 'casual', label: t('chat.turnGroup.styleOption.casual') },
  { value: 'custom', label: t('chat.turnGroup.styleOption.custom') }
])

// 重新生成菜单项
const regenerateMenuItems = computed(() => {
  const items = []
  
  if (canRegenerateOverwrite.value) {
    items.push({
      label: t('chat.turnGroup.regenerateOverwrite'),
      icon: 'i-lucide-replace',
      onSelect: handleRegenerateOverwrite
    })
  }
  
  if (canRegenerateInBranch.value) {
    items.push({
      label: t('chat.turnGroup.regenerateBranch'),
      icon: 'i-lucide-git-branch-plus',
      onSelect: handleRegenerateBranch
    })
  }

  if (!items.length) return []
  
  return [
    items,
    [{
      label: t('chat.message.more'),
      icon: 'i-lucide-ellipsis',
      onSelect: openAdvancedRegenerateModal
    }]
  ]
})

// 更多操作菜单（编辑、删除、调试信息等）
const moreMenuItems = computed(() => {
  const groups: any[][] = [
    [{
        label: t('chat.message.appendToNote'),
        icon: 'i-lucide-notebook-pen',
        onSelect: () => handleAppendToNote()
    }],
    [
      {
        label: t('chat.turnGroup.saveTo'),
        icon: 'i-lucide-save',
        children: [
          {
            label: t('chat.turnGroup.newNote'),
            icon: 'i-lucide-notebook-pen',
            onSelect: () => handleSaveToNewNote()
          },
          {
            label: t('nav.knowledge'),
            icon: 'i-lucide-book-search',
            onSelect: () => { showWriteToKbModal.value = true }
          }
        ]
      },
      {
        label: t('notes.menu.copyAs'),
        icon: 'i-lucide-copy',
        children: [
          {
            label: t('notes.menu.plainText'),
            icon: 'i-lucide-file-text',
            onSelect: () => handleCopyAs('plain')
          },
          {
            label: t('chat.turnGroup.image'),
            icon: 'i-lucide-image',
            onSelect: () => handleCopyAs('image')
          }
        ]
      },
      {
        label: t('notes.menu.exportAs'),
        icon: 'i-lucide-download',
        children: [
          {
            label: 'Markdown',
            icon: 'i-lucide-file-code',
            onSelect: () => handleExportAs('markdown')
          },
          {
            label: t('notes.menu.plainText'),
            icon: 'i-lucide-file-text',
            onSelect: () => handleExportAs('plain')
          },
          {
            label: 'Word',
            icon: 'i-lucide-file-text',
            onSelect: () => handleExportAs('word')
          },
          {
            label: 'PDF',
            icon: 'i-lucide-file-text',
            onSelect: () => handleExportAs('pdf')
          },
          {
            label: t('chat.turnGroup.image'),
            icon: 'i-lucide-image',
            onSelect: () => handleExportAs('image')
          }
        ]
      }
    ],
    [
      ...(!isSessionArchived.value ? [{
        label: t('notes.menu.edit'),
        icon: 'i-lucide-square-pen',
        onSelect: () => handleEdit()
      }] : []),
      {
        label: t('common.delete'),
        icon: 'i-lucide-trash-2',
        color: 'error' as const,
        onSelect: () => handleDelete()
      }
    ]
  ]

  if (props.group.turnId && settingsStore.sessionPreferences.showDebugEntry) {
    groups.push([
      {
        label: t('chat.message.debugInfo'),
        icon: 'i-lucide-bug',
        onSelect: () => {
          showDebugModal.value = true
        }
      }
    ])
  }

  return groups
})

onMounted(() => {
  void ensureReadAloudSettingsLoaded()
})

// ===== 方法 =====

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseSliderNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value) && typeof value[0] === 'number' && Number.isFinite(value[0])) {
    return value[0]
  }
  return fallback
}

function formatMultiplier(value: number): string {
  const normalized = Math.round(value * 100) / 100
  return normalized.toFixed(2).replace(/\.?0+$/, '')
}

function formatSignedNumber(value: number): string {
  const normalized = Math.round(value)
  return `${normalized >= 0 ? '+' : ''}${normalized}`
}

function parseRateSettingToMultiplier(rate: string): number {
  const value = String(rate || '').trim()
  if (!value) return 1

  const percentMatch = value.match(/^([+-]?\d+(?:\.\d+)?)%$/i)
  if (percentMatch) {
    const percent = Number(percentMatch[1])
    if (Number.isFinite(percent)) {
      return clampNumber(1 + percent / 100, READ_ALOUD_RATE_MIN_X, READ_ALOUD_RATE_MAX_X)
    }
  }

  const multiplierMatch = value.match(/^([+-]?\d+(?:\.\d+)?)x$/i)
  if (multiplierMatch) {
    const multiplier = Number(multiplierMatch[1])
    if (Number.isFinite(multiplier)) {
      return clampNumber(multiplier, READ_ALOUD_RATE_MIN_X, READ_ALOUD_RATE_MAX_X)
    }
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 1
  const multiplier = numeric > 0 && numeric <= 4 ? numeric : 1 + numeric / 100
  return clampNumber(multiplier, READ_ALOUD_RATE_MIN_X, READ_ALOUD_RATE_MAX_X)
}

function rateMultiplierToSetting(multiplier: number): string {
  const clamped = clampNumber(multiplier, READ_ALOUD_RATE_MIN_X, READ_ALOUD_RATE_MAX_X)
  const percent = Math.round((clamped - 1) * 100)
  return `${percent >= 0 ? '+' : ''}${percent}%`
}

function parsePitchSettingToHz(pitch: string): number {
  const value = String(pitch || '').trim()
  if (!value) return 0

  const hzMatch = value.match(/^([+-]?\d+(?:\.\d+)?)Hz$/i)
  if (hzMatch) {
    const hz = Number(hzMatch[1])
    if (Number.isFinite(hz)) {
      return clampNumber(hz, READ_ALOUD_PITCH_MIN_HZ, READ_ALOUD_PITCH_MAX_HZ)
    }
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return clampNumber(numeric, READ_ALOUD_PITCH_MIN_HZ, READ_ALOUD_PITCH_MAX_HZ)
}

function pitchHzToSetting(hz: number): string {
  const clamped = Math.round(clampNumber(hz, READ_ALOUD_PITCH_MIN_HZ, READ_ALOUD_PITCH_MAX_HZ))
  return `${clamped >= 0 ? '+' : ''}${clamped}Hz`
}

function normalizeSelectString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).value ?? '')
  }
  return String(value ?? '')
}

function handleReadAloudVoiceChange(value: unknown) {
  const voice = normalizeSelectString(value).trim()
  if (!voice) return
  updateReadAloudSettings({ voice }, { immediate: true })
}

function handleReadAloudRateChange(value: unknown) {
  const multiplier = parseSliderNumber(value, readAloudRateValue.value)
  updateReadAloudSettings({ rate: rateMultiplierToSetting(multiplier) })
}

function handleReadAloudRateCommit() {
  updateReadAloudSettings({ rate: readAloudTtsSettings.value.rate }, { immediate: true })
}

function handleReadAloudPitchChange(value: unknown) {
  const hz = parseSliderNumber(value, readAloudPitchValue.value)
  updateReadAloudSettings({ pitch: pitchHzToSetting(hz) })
}

function handleReadAloudPitchCommit() {
  updateReadAloudSettings({ pitch: readAloudTtsSettings.value.pitch }, { immediate: true })
}

// 复制（聚合整个回复组的所有 assistant 文本）
async function handleCopy() {
  const text = extractFinalOutput(props.group.messages)
  const success = await copyToClipboard(text)
  
  if (success) {
    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 1500)
  }
}

async function handleReadAloud() {
  const messageId = lastAssistantMessage.value?.id
  if (!messageId) return

  if (isReadingAloud.value) {
    stopSpeaking()
    return
  }

  const resolved = await speakMessage({
    messageId,
    markdown: mindmapMarkdown.value,
    tts: {
      voice: readAloudTtsSettings.value.voice,
      rate: readAloudTtsSettings.value.rate,
      pitch: readAloudTtsSettings.value.pitch,
    },
    onError: (detail) => {
      toast.error({
        title: t('chat.turnGroup.readAloudFailed'),
        description: detail,
      })
    },
  })

  if (!resolved.ok) {
    if (resolved.reason === 'empty') {
      toast.error({ title: t('chat.turnGroup.readAloudEmpty') })
    } else if (resolved.reason === 'playback_failed' && resolved.detail) {
      toast.error({
        title: t('chat.turnGroup.readAloudFailed'),
        description: resolved.detail,
      })
    } else {
      toast.error({ title: t('chat.turnGroup.readAloudUnavailable') })
    }
  }
}

// 复制为指定格式
async function handleCopyAs(format: 'plain' | 'image') {
  const md = extractFinalOutput(props.group.messages)
  if (format === 'plain') {
    await contentExport.copyAsPlainText(md)
  } else if (format === 'image') {
    const el = responseContentRef.value
    if (!el) return
    await contentExport.copyAsImage(el)
  }
}

// 导出为指定格式
function getExportTitle() {
  const session = chatStore.currentSession
  return session?.title || t('chat.turnGroup.exportTitleFallback')
}

async function handleExportAs(format: 'markdown' | 'plain' | 'word' | 'pdf' | 'image') {
  const md = extractFinalOutput(props.group.messages)
  const title = getExportTitle()
  if (format === 'markdown') {
    await contentExport.exportAsFile(title, md, 'markdown')
  } else if (format === 'plain') {
    await contentExport.exportAsFile(title, md, 'plain')
  } else if (format === 'word') {
    await contentExport.exportAsWord(title, md)
  } else if (format === 'pdf') {
    await contentExport.exportAsPdf(title, md)
  } else if (format === 'image') {
    const el = responseContentRef.value
    if (!el) return
    await contentExport.exportAsImage(el, title)
  }
}

// 引用（使用聚合后的文本，关联最后一条消息的 ID）
function handleQuote() {
  const text = extractFinalOutput(props.group.messages)
  if (text) {
    // 构造纯文本 content，关联最后一条 assistant 消息的 ID
    const quoteContent = [{ type: 'text' as const, text }]
    const msg = lastAssistantMessage.value
    chatStore.setQuote(quoteContent, msg?.id)
  }
}

// 追加到会话笔记
function handleAppendToNote() {
  const text = extractFinalOutput(props.group.messages)
  if (text) {
    emitter.emit('session:append-to-note', text)
  }
}

// 保存为新笔记
async function handleSaveToNewNote() {
  const contentMd = extractFinalOutput(props.group.messages)
  if (!contentMd?.trim()) {
    toast.error({ title: t('chat.turnGroup.emptyContentCannotSave') })
    return
  }
  const firstLine = contentMd.trim().split('\n')[0]?.replace(/^#+\s*/, '').trim()
  const title = (firstLine && firstLine.length <= 50) ? firstLine : t('chat.turnGroup.untitledNote')
  try {
    await window.ipc('notes:create', { title, contentMd: contentMd.trim() })
    toast.success({ title: t('chat.turnGroup.savedAsNewNote') })
  } catch (error) {
    toast.error({ title: t('chat.turnGroup.saveFailed'), description: String(error) })
  }
}

// 编辑（触发最后一条 assistant 消息的编辑）
function handleEdit() {
  const msg = lastAssistantMessage.value
  if (msg) {
    emitter.emit('message:start-edit', msg.id)
  }
}

// 临时问
function handleTempAsk() {
  chatStore.openTempAsk()
}

// 删除
async function handleDelete() {
  const confirmed = await confirm({
    title: t('chat.message.confirmDeleteTitle'),
    content: t('chat.turnGroup.confirmDeleteContent'),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    confirmColor: 'error',
    confirmIcon: 'i-lucide-trash-2'
  })

  if (confirmed && props.group.turnId) {
    await chatStore.deleteMessagesByTurnId(props.group.turnId, props.group.messages)
  }
}

// 覆盖重新生成
async function handleRegenerateOverwrite() {
  if (isRegenerating.value || !chatStore.currentSessionId || !canRegenerateOverwrite.value) return
  
  try {
    isRegenerating.value = true
    await chatStore.regenerateAndOverwrite(firstAssistantMessage.value.id)
    emitter.emit('chat:scroll-to-bottom')
  } catch (error) {
    console.error('Failed to regenerate and overwrite:', error)
  } finally {
    isRegenerating.value = false
  }
}

// 分支重新生成
async function handleRegenerateBranch() {
  if (isRegenerating.value || !chatStore.currentSessionId || !canRegenerateInBranch.value) return
  
  try {
    isRegenerating.value = true
    await chatStore.regenerateInBranch(firstAssistantMessage.value.id)
    emitter.emit('chat:scroll-to-bottom')
  } catch (error) {
    console.error('Failed to regenerate in branch:', error)
  } finally {
    isRegenerating.value = false
  }
}

// 创建分支
async function handleCreateBranch() {
  if (isCreatingBranch.value || !chatStore.currentSessionId) return
  
  try {
    isCreatingBranch.value = true
    // 使用组内最后一条消息作为分叉点，确保复制整个回复组（包括 tool 消息）
    const lastMessage = props.group.messages[props.group.messages.length - 1]
    await chatStore.createBranch(lastMessage.id)
  } catch (error) {
    console.error('Failed to create branch:', error)
  } finally {
    isCreatingBranch.value = false
  }
}

// 打开高级选项 Modal
function openAdvancedRegenerateModal() {
  advancedRegenerateOptions.value = {
    style: 'default',
    customStylePrompt: '',
    model: currentTurn.value?.selectedModel || undefined
  }
  showAdvancedRegenerateModal.value = true
}

// 监听风格选择
watch(() => advancedRegenerateOptions.value.style, async (newStyle) => {
  if (newStyle === 'custom') {
    await nextTick()
    if (customStyleInput.value) {
      const inputElement = customStyleInput.value.inputRef as HTMLInputElement
      if (inputElement) {
        inputElement.focus()
      }
    }
  }
})

// 根据风格生成提示词
function getStylePrompt(options: typeof advancedRegenerateOptions.value): string {
  const guidanceSuffix = 'Return only the improved full response. Do not add acknowledgements like "Okay", "Sure", or "Understood". Start directly with the revised answer.'
  
  switch (options.style) {
    case 'detailed':
      return `Rewrite the answer above to be more detailed and comprehensive, adding useful information and missing details. ${guidanceSuffix}`
    case 'concise':
      return `Rewrite the answer above to be more concise and tighter while preserving the core points. ${guidanceSuffix}`
    case 'professional':
      return `Rewrite the answer above to be more professional and formal, using more precise terminology. ${guidanceSuffix}`
    case 'casual':
      return `Rewrite the answer above to be easier to understand and more conversational, lowering the comprehension barrier. ${guidanceSuffix}`
    case 'custom':
      const customPrompt = options.customStylePrompt?.trim() || ''
      return customPrompt ? `${customPrompt}. ${guidanceSuffix}` : ''
    default:
      return ''
  }
}

// 高级重新生成 - 覆盖模式
async function handleAdvancedRegenerateOverwrite() {
  if (isRegenerating.value || !chatStore.currentSessionId || !canRegenerateOverwrite.value) return
  
  try {
    isRegenerating.value = true
    showAdvancedRegenerateModal.value = false
    
    const stylePrompt = getStylePrompt(advancedRegenerateOptions.value)
    const options = {
      stylePrompt: stylePrompt || undefined,
      model: advancedRegenerateOptions.value.model
    }
    
    await chatStore.regenerateAndOverwrite(firstAssistantMessage.value.id, options)
    emitter.emit('chat:scroll-to-bottom')
  } catch (error) {
    console.error('Failed to regenerate with advanced overwrite options:', error)
  } finally {
    isRegenerating.value = false
  }
}

// 高级重新生成 - 分支模式
async function handleAdvancedRegenerateBranch() {
  if (isRegenerating.value || !chatStore.currentSessionId || !canRegenerateInBranch.value) return
  
  try {
    isRegenerating.value = true
    showAdvancedRegenerateModal.value = false
    
    const stylePrompt = getStylePrompt(advancedRegenerateOptions.value)
    const options = {
      stylePrompt: stylePrompt || undefined,
      model: advancedRegenerateOptions.value.model
    }
    
    await chatStore.regenerateInBranch(firstAssistantMessage.value.id, options)
    emitter.emit('chat:scroll-to-bottom')
  } catch (error) {
    console.error('Failed to regenerate in branch with advanced options:', error)
  } finally {
    isRegenerating.value = false
  }
}

// 监听消息状态变化
watch(() => props.group.messages.map(m => m.status), (statuses) => {
  if (statuses.includes('streaming')) {
    isRegenerating.value = false
  }
})
</script>
