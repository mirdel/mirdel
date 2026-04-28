<template>
  <div ref="rootRef" class="py-2 bg-default" :style="rootPlaceholderStyle">
    <!-- 与消息列表相同的宽度限制 -->
    <div class="w-4xl max-w-full mx-auto px-4 md:px-8">
      <!-- 圆角边框阴影的外层容器 -->
      <div ref="inputPlaceholderRef" :style="inputPlaceholderStyle">
        <div 
          ref="inputContainerRef"
          :class="[
            'rounded-3xl bg-default overflow-hidden transition-[height] duration-300',
            'border border-muted',
            chatStore.isTemporarySession && 'border-dashed',
            isDragOver && 'border-primary',
            isExpanded ? 'fixed z-50 border-accented' : 'relative z-10',
            { 'border-accented': isFocused && !isExpanded }
          ]"
          :style="expandedInputStyle"
          @dragenter.prevent="handleDragEnter"
          @dragover.prevent="handleDragOver"
          @dragleave.prevent="handleDragLeave"
          @drop.prevent="handleDropFiles"
        >
        <!-- 右上角交互区域 -->
        <div class="relative">
          <!-- 小弧度 - 圆形边框的右上角弧线 -->
          <UTooltip :text="isExpanded ? '收起' : '展开'" :kbds="['meta', 'e']" :content="{ side: 'top' }">
            <div 
              class="group absolute w-3.5 h-3.5 cursor-pointer z-10 overflow-hidden"
              :class="isExpanded ? 'top-2 right-2' : 'top-1 right-1'"
              role="button"
              tabindex="0"
              @click="handleExpandArcClick"
              @keydown.enter.prevent="handleExpandArcClick"
              @keydown.space.prevent="handleExpandArcClick"
            >
              <div 
                class="absolute -bottom-4 -left-4 w-7.5 h-7.5 rounded-full border-2 border-accented opacity-70 transition-opacity duration-200 group-hover:opacity-100"
              ></div>
            </div>
          </UTooltip>
        </div>

        <!-- 引用预览区 -->
        <Transition
          enter-active-class="transition-[max-height] duration-200 ease-out overflow-hidden"
          leave-active-class="transition-[max-height] duration-150 ease-in overflow-hidden"
          enter-from-class="max-h-0"
          enter-to-class="max-h-24"
          leave-from-class="max-h-24"
          leave-to-class="max-h-0"
        >
          <div 
            v-if="chatStore.pendingQuote"
            class="flex items-center gap-2 px-4 pt-3 pb-2 bg-elevated border-b border-default"
          >
            <div class="flex-1 min-w-0 flex items-center gap-2 cursor-pointer" @click="showQuoteDetail = true">
              <UIcon name="i-lucide-quote" class="w-4 h-4 text-muted shrink-0" />
              <MessagePreview 
                v-if="chatStore.pendingQuote"
                :content="chatStore.pendingQuote.parts"
                :lines="1"
                class="text-sm text-default"
              />
            </div>
            <UButton
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              square
              @click="chatStore.clearQuote()"
            />
          </div>
        </Transition>

        <!-- 附件预览区 -->
        <Transition
          enter-active-class="transition-[max-height] duration-200 ease-out overflow-hidden"
          leave-active-class="transition-[max-height] duration-150 ease-in overflow-hidden"
          enter-from-class="max-h-0"
          enter-to-class="max-h-48"
          leave-from-class="max-h-48"
          leave-to-class="max-h-0"
        >
          <div 
            v-if="selectedAttachments.length > 0"
            class="px-3 pt-3 flex flex-wrap gap-2"
          >
            <div
              v-for="(image, index) in selectedImages"
              :key="image.id"
            >
              <div class="relative group h-15 w-15 rounded-xl border border-default bg-elevated overflow-hidden flex items-center justify-center">
                <UImage
                  :src="image.preview"
                  :alt="`image ${index + 1}`"
                  :preview-name="image.file.name"
                  @error="handleImageError(image.id, $event)"
                />
                <UButton
                  icon="i-lucide-x"
                  size="xs"
                  color="neutral"
                  square
                  class="p-0.5 rounded-full absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  @click.stop="removeAttachment(image.id)"
                />
              </div>
            </div>
            <div
              v-for="attachment in selectedOtherAttachments"
              :key="attachment.id"
              class="flex items-center gap-1.5 border border-default rounded-lg bg-elevated px-2 py-1 max-w-[260px]"
            >
              <UIcon :name="getAttachmentIcon(attachment.mediaType)" class="size-3.5 shrink-0 text-muted" />
              <span class="text-xs truncate flex-1">{{ attachment.file.name }}</span>
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                square
                class="rounded-full shrink-0"
                @click.stop="removeAttachment(attachment.id)"
              />
            </div>
          </div>
        </Transition>

        <!-- 内部知识预览区（知识库 + 笔记） -->
        <Transition
          enter-active-class="transition-[max-height] duration-200 ease-out overflow-hidden"
          leave-active-class="transition-[max-height] duration-150 ease-in overflow-hidden"
          enter-from-class="max-h-0"
          enter-to-class="max-h-32"
          leave-from-class="max-h-32"
          leave-to-class="max-h-0"
        >
          <div v-if="hasLocalKnowledge" class="px-3 pt-3 max-h-32 overflow-y-auto flex flex-wrap gap-1.5">
            <!-- 知识库 -->
            <UBadge
              v-for="kb in selectedKbDisplayList"
              :key="kb.id"
              color="neutral"
              variant="subtle"
              class="rounded-full px-2.5 pr-1 py-0.5 gap-1"
            >
              <UTooltip :text="kb.pinned ? t('chat.input.kb.unpin') : t('chat.input.kb.pin')">
                <UIcon
                  name="i-lucide-pin"
                  :class="['size-3.5 shrink-0', kb.pinned ? 'text-primary' : 'text-muted']"
                  @click.stop="toggleKbPin(kb.id)"
                />
              </UTooltip>
              <UIcon name="i-lucide-book-search" class="size-3.5 shrink-0" />
              <span class="truncate max-w-[180px]">{{ kb.name }}</span>
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                square
                class="rounded-full"
                @click.stop="removeKb(kb.id)"
              />
            </UBadge>
            <!-- 笔记 -->
            <UBadge
              v-for="(note, index) in selectedNotes"
              :key="note.noteId"
              color="neutral"
              variant="subtle"
              class="rounded-full px-2.5 pr-1 py-0.5 gap-1 cursor-pointer"
              @click="handlePreviewSelectedNote(note)"
            >
              <UIcon name="i-lucide-notebook-pen" class="size-3.5" />
              <span class="truncate max-w-[180px]">{{ note.title }}</span>
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                square
                class="rounded-full"
                @click.stop="removeNote(index)"
              />
            </UBadge>
          </div>
        </Transition>

        <!-- 手动技能标签（仅当前消息生效） -->
        <Transition
          enter-active-class="transition-[max-height] duration-200 ease-out overflow-hidden"
          leave-active-class="transition-[max-height] duration-150 ease-in overflow-hidden"
          enter-from-class="max-h-0"
          enter-to-class="max-h-16"
          leave-from-class="max-h-16"
          leave-to-class="max-h-0"
        >
          <div v-if="manualSkillLabel" class="px-3 pt-3 pb-1.5">
            <UBadge color="neutral" variant="subtle" class="rounded-full px-2.5 pr-1 py-0.5 gap-1">
              <span class="truncate max-w-[260px]">{{ manualSkillLabel }}</span>
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                square
                class="rounded-full"
                @click.stop="manualSkillId = null"
              />
            </UBadge>
          </div>
        </Transition>

        <!-- 输入框区域 -->
        <div :class="isExpanded ? 'flex-1 min-h-0 flex' : ''">
          <textarea
            ref="textareaRef"
            v-model="inputText"
            :placeholder="isExpanded ? t('chat.input.placeholder.expanded') : t('chat.input.placeholder.default')"
            :rows="isExpanded ? 20 : 2"
            :class="[
              'w-full resize-none bg-transparent px-4 pt-3 pb-0 text-base leading-6 text-default outline-none placeholder:text-dimmed',
              isExpanded ? 'h-full min-h-0 overflow-y-auto' : 'overflow-y-auto'
            ]"
            @keydown="handleInputKeydown"
            @focus="isFocused = true"
            @blur="isFocused = false"
          />
        </div>

        <!-- 底部工具栏 -->
        <div 
          :class="[
            'flex shrink-0 items-end justify-between p-2.5',
            { 'mt-auto': isExpanded }
          ]"
        >
          <!-- 左侧工具按钮 -->
          <div class="flex items-center gap-1">
            <UDropdownMenu 
              :items="addMenuItems" 
              size="sm" 
              :content="{ side: 'top', align: 'start' }"
            >
              <template #item-label="{ item }">
                <UTooltip v-if="item.tooltip" :text="item.tooltip" :content="{ side: 'right' }">
                  <span>{{ item.label }}</span>
                </UTooltip>
                <span v-else>{{ item.label }}</span>
              </template>
              <UButton
                icon="i-lucide-plus"
                color="neutral"
                variant="ghost"
                size="sm"
                square
                class="rounded-full"
              />
            </UDropdownMenu>

            <PromptLibraryInsertPopover
              v-model:open="promptLibraryInsertOpen"
              @before-open="capturePromptInsertSelection"
              @insert="handleInsertPromptFromLibrary"
            >
              <UTooltip :text="t('chat.input.insertPrompt')">
                <UButton
                  icon="i-lucide-book-marked"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  square
                  class="rounded-full"
                />
              </UTooltip>
            </PromptLibraryInsertPopover>

            <!-- 思考深度 -->
            <UDropdownMenu
              v-if="currentModelSupportsThinking"
              :items="thinkingMenuItems"
              size="sm"
              :content="{ side: 'top', align: 'start' }"
            >
              <UTooltip :text="t('chat.input.thinking.title')">
                <UButton
                  icon="i-lucide-brain"
                  :color="effectiveThinkingMode === 'off' ? 'neutral' : 'primary'"
                  variant="ghost"
                  size="sm"
                  square
                  class="rounded-full"
                />
              </UTooltip>
            </UDropdownMenu>

            <!-- 内部知识（知识库 + 笔记） -->
            <LocalKnowledgeSelector
              v-model:open="localKnowledgeOpen"
              :selected-notes="selectedNotes"
              class="w-72"
              @toggle-note="handleToggleNote"
            >
              <UTooltip :text="t('chat.input.localKnowledge')">
                <UButton
                  icon="i-lucide-book-text"
                  :color="hasLocalKnowledge ? 'primary' : 'neutral'"
                  variant="ghost"
                  size="sm"
                  square
                  class="rounded-full"
                />
              </UTooltip>
            </LocalKnowledgeSelector>

            <!-- 网络搜索 -->
            <UDropdownMenu :items="webSearchMenuItems" size="sm" :content="{ side: 'top', align: 'start' }">
              <UTooltip :text="t('chat.input.webSearch')">
                <UButton
                  :icon="webSearchIcon"
                  :color="isWebSearchEnabled ? 'primary' : 'neutral'"
                  variant="ghost"
                  size="sm"
                  square
                  class="rounded-full"
                />
              </UTooltip>
            </UDropdownMenu>

            <!-- Skill 策略按钮（仅 Agent 模式显示） -->
            <SkillSelector
              v-if="sessionMode === 'agent'"
              v-model:open="skillPopoverOpen"
              :policy="sessionSkillPolicy"
              :manual-skill-id="manualSkillId"
              class="w-72"
              @update:policy="(value) => { sessionSkillPolicy = value; manualSkillId = null }"
              @select-skill="(skillId) => { manualSkillId = skillId }"
            >
              <UTooltip :text="t('chat.input.selectSkill')">
                <UButton
                  icon="i-lucide-package"
                  :color="sessionSkillPolicy === 'off' && !manualSkillId ? 'neutral' : 'primary'"
                  variant="ghost"
                  size="sm"
                  square
                  class="rounded-full"
                />
              </UTooltip>
            </SkillSelector>

            <!-- MCP 配置按钮（仅 Agent 模式显示） -->
            <McpSelector
              v-if="sessionMode === 'agent'"
              v-model:open="mcpPopoverOpen"
              v-model:policy="sessionMcpPolicy"
              v-model:selected="sessionMcpServerIds"
              class="w-80"
            >
              <UTooltip :text="t('chat.input.selectMcp')">
                <UButton
                  icon="i-gravity-ui:logo-mcp"
                  :color="sessionMcpPolicy === 'off' ? 'neutral' : 'primary'"
                  variant="ghost"
                  size="sm"
                  square
                  class="rounded-full"
                />
              </UTooltip>
            </McpSelector>
          </div>

          <!-- 右侧发送按钮 -->
          <div class="flex items-end gap-2">
            <!-- Model 选择器 -->
            <ModelSelector
              v-model="selectedModel"
              :scenario-id="chatStore.selectedScenarioId"
              placement="top"
              align="right"
              ghost
            />

            <UTooltip :text="chatStore.isStreaming ? t('chat.input.stop') : (chatStore.isAwaitingApproval ? t('chat.input.awaitingApproval') : t('chat.input.send'))" :content="{ side: 'top' }">
              <UButton 
                @click="chatStore.isStreaming ? handleAbort() : handleSend()" 
                :icon="chatStore.isStreaming ? 'i-iconamoon:player-stop-fill' : (chatStore.isAwaitingApproval ? 'i-lucide-shield-alert' : 'i-lucide-arrow-up')"
                :disabled="!chatStore.isStreaming && !canSend" 
                size="lg"
                square
                class="rounded-full transition-colors duration-200"
                :ui="{
                  leadingIcon: 'w-5'
                }"
              />
            </UTooltip>
          </div>
        </div>
        </div>
      </div>

      <!-- 底部面板（藏在输入框下层、只露出下半部的浅色延伸区：模式切换 + 快捷键 + 上下文进度） -->
      <div
        v-if="!isExpanded"
        class="relative z-0 rounded-3xl bg-elevated/60 px-2 -mt-11 pt-12 pb-1.5"
      >
        <div class="flex items-center justify-between">
          <!-- 左侧：模式选择器（Chat/Agent） -->
          <div class="flex items-center gap-1">
            <UTooltip :text="t('chat.input.toggleMode')" :kbds="['meta', '.']">
              <USelect
                v-model="sessionMode"
                :items="modeOptions"
                value-key="value"
                :icon="modeIcon"
                size="xs"
                variant="ghost"
                class="rounded-full"
                :ui="bottomPanelSelectUi"
                :content="{ side: 'top', align: 'start' }"
              >
                <template #item="{ item }">
                  <UTooltip :text="item.description" side="right" :delay-duration="300">
                    <div class="flex items-center gap-2 w-full cursor-pointer">
                      <UIcon :name="item.icon" class="size-4" />
                      <span class="flex-1">{{ item.label }}</span>
                      <UIcon v-if="item.value === sessionMode" name="i-lucide-check" class="size-4" />
                    </div>
                  </UTooltip>
                </template>
              </USelect>
            </UTooltip>

            <UTooltip v-if="sessionMode === 'agent'" :text="t('chat.input.toolApproval.title')">
              <USelect
                v-model="sessionToolApprovalMode"
                :items="toolApprovalOptions"
                value-key="value"
                :leading-icon="toolApprovalIcon"
                :color="sessionToolApprovalMode === 'auto' ? 'warning' : 'neutral'"
                size="xs"
                variant="ghost"
                class="rounded-full"
                :content="{ side: 'top', align: 'start' }"
                :ui="toolApprovalSelectUi"
              >
                <template #item="{ item }">
                  <UTooltip :text="item.description" side="right" :delay-duration="300">
                    <div class="flex items-center gap-2 w-full cursor-pointer">
                      <UIcon :name="item.icon" class="size-4" />
                      <span class="flex-1">{{ item.label }}</span>
                      <UIcon v-if="item.value === sessionToolApprovalMode" name="i-lucide-check" class="size-4" />
                    </div>
                  </UTooltip>
                </template>
              </USelect>
            </UTooltip>
          </div>

          <!-- 右侧：发送快捷键 + 上下文轮数统计 -->
          <div class="flex items-center gap-0.5">
            <USelect
              v-model="sendShortcutMode"
              :items="sendShortcutOptions"
              size="xs"
              variant="ghost"
              class="rounded-full"
              :ui="bottomPanelSelectUi"
              @update:model-value="handleShortcutChange"
            />
            <!-- 上下文轮数环形进度条 + Popover -->
            <UPopover mode="hover" :content="{ side: 'top', align: 'end', sideOffset: 8 }">
              <div class="flex items-center justify-center shrink-0 cursor-default px-1.5">
                <svg class="size-4 -rotate-90" viewBox="0 0 48 48" shape-rendering="geometricPrecision">
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="6"
                    class="text-neutral-200 dark:text-neutral-600"
                  />
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="6"
                    stroke-linecap="round"
                    :stroke-dasharray="circumference"
                    :stroke-dashoffset="contextProgressStrokeOffset"
                    class="text-neutral-600 dark:text-neutral-200"
                  />
                </svg>
              </div>
              <template #content>
                <div class="p-3 min-w-50 space-y-2 text-xs">
                  <div class="flex justify-between gap-4">
                    <span class="text-muted shrink-0">{{ t('chat.input.contextTurns') }}</span>
                    <span class="text-default tabular-nums">{{ turnCount }} / {{ contextCount }}</span>
                  </div>
                  <div v-if="contextOverflow > 0" class="text-xs my-2 text-muted">
                    {{ t('chat.input.contextOverflow') }}
                  </div>
                  <div class="border-t border-default pt-3 mt-3 space-y-2">
                    <div class="flex justify-between gap-4">
                      <span class="text-muted shrink-0">{{ t('chat.input.inputChars') }}</span>
                      <span class="text-default tabular-nums">{{ inputCharCount }}</span>
                    </div>
                    <div class="flex justify-between gap-4">
                      <span class="text-muted shrink-0">{{ t('chat.input.estimatedTokens') }}</span>
                      <span class="text-default tabular-nums">{{ estimatedTokens }}</span>
                    </div>
                  </div>
                </div>
              </template>
            </UPopover>
          </div>
        </div>
      </div>
    </div>

    <!-- 遮罩层（展开时显示） - 使用 Teleport 挂载到父容器 -->
    <Transition
      enter-active-class="transition-opacity duration-300 ease-out"
      leave-active-class="transition-opacity duration-300 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div 
        v-if="isExpanded"
        class="absolute left-0 right-0 bottom-0 z-40 bg-black/5 dark:bg-white/5"
        :style="collapseOverlayStyle"
        @click="handleCollapse"
      />
    </Transition>
    
    <!-- 引用详情弹窗 -->
    <QuoteDetailModal
      v-model:open="showQuoteDetail"
      :quote="chatStore.pendingQuote"
    />

    <!-- 笔记预览弹窗 -->
    <NoteContextPreviewModal
      v-model:open="showNotePreview"
      :note="previewingNote"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import {
  resolveNativeWebSearchConfig,
  resolveThinkingMode,
  normalizeInputModalities,
  supportsInputModality,
  getInputModalityFromMediaType,
  type ThinkingMode,
  type ToolApprovalMode,
  type ModelModality
} from '@shared'
import { useChatStore } from '@/stores/useChatStore'
import { useMcpStore } from '@/stores/useMcpStore'
import { useSkillStore } from '@/stores/useSkillStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import ModelSelector from '@/components/ModelSelector.vue'
import McpSelector from './McpSelector.vue'
import SkillSelector from './SkillSelector.vue'
import PromptLibraryInsertPopover from './PromptLibraryInsertPopover.vue'
import LocalKnowledgeSelector from './LocalKnowledgeSelector.vue'
import QuoteDetailModal from './QuoteDetailModal.vue'
import NoteContextPreviewModal from './NoteContextPreviewModal.vue'
import type { NotePreviewData } from './NoteContextPreviewModal.vue'
import { useNotes, type Note } from '@/composables/useNotes'
import { useKnowledge } from '@/composables/useKnowledge'
import { useMyToast } from '@/composables/useMyToast'
import MessagePreview from './MessagePreview.vue'
import UImage from '../UImage.vue'
import emitter from '@/utils/emitter'
import { fileToBase64 } from '@/utils/fileUtils'
import { isMac } from '@/utils/platformUtils'
import { getPersistentValue, removePersistentValueSoon, setPersistentValueSoon } from '@/utils/persistentState'
import { type MessageContentPart } from '@/utils/messageContentUtils'
import { estimateTokens } from '@/utils/estimateTokens'
import { INTENT_GROUPS, INTENT_META } from '@/config/quick-intent-config'
import type { Intent } from '@/config/quick-intent-config'

const chatStore = useChatStore()
const mcpStore = useMcpStore()
const skillStore = useSkillStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()
const toast = useMyToast()
const { loadNotes: loadAllNotes } = useNotes()
const { knowledgeBases, loadKnowledgeBases } = useKnowledge()
const inputText = ref('')
const rootRef = ref<HTMLElement>()
const inputPlaceholderRef = ref<HTMLElement>()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const inputContainerRef = ref<HTMLElement>()
const isFocused = ref(false)
const isDragOver = ref(false)
const dragEnterCounter = ref(0)
const showQuoteDetail = ref(false)
const skillPopoverOpen = ref(false)
const promptLibraryInsertOpen = ref(false)
const promptInsertSavedSelection = ref<{ start: number; end: number } | null>(null)
const manualSkillId = ref<string | null>(null)
let pasteListenerTarget: HTMLTextAreaElement | null = null

type AttachmentInputModality = 'image' | 'audio' | 'video' | 'file'

interface SelectedAttachment {
  id: string
  file: File
  preview: string
  mediaType: string
  modality: AttachmentInputModality
}

interface AddMenuItem extends Record<string, unknown> {
  label: string
  icon?: string
  onSelect?: () => void
  disabled?: boolean
  tooltip?: string
  children?: AddMenuItem[]
}

const MAX_ATTACHMENTS_COUNT = 8
const MAX_ATTACHMENT_BYTES: Record<AttachmentInputModality, number> = {
  image: 10 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  video: 25 * 1024 * 1024,
  file: 15 * 1024 * 1024
}

const selectedAttachments = ref<SelectedAttachment[]>([])
const selectedImages = computed(() => selectedAttachments.value.filter(item => item.modality === 'image'))
const selectedOtherAttachments = computed(() => selectedAttachments.value.filter(item => item.modality !== 'image'))

// 笔记上下文相关状态
interface NoteSnapshot {
  noteId: string
  title: string
  contentMd: string
}
const selectedNotes = ref<NoteSnapshot[]>([])
const showNotePreview = ref(false)
const previewingNote = ref<NotePreviewData | null>(null)

// 快捷意图菜单（使用嵌套结构）
const quickIntentMenuItems = computed(() => {
  return INTENT_GROUPS.map((group) => ({
    label: t(`chat.input.intentGroup.${group.key}`),
    icon: 'i-lucide-folder',
    children: group.intents.map(intent => ({
      label: t(`chat.input.intent.${intent}`),
      icon: INTENT_META[intent].icon,
      onSelect: () => handleIntentSelect(intent)
    }))
  }))
})

function handleToggleNote(note: Note) {
  const idx = selectedNotes.value.findIndex(n => n.noteId === note.id)
  if (idx !== -1) {
    selectedNotes.value.splice(idx, 1)
  } else {
    selectedNotes.value.push({
      noteId: note.id,
      title: note.title || t('chat.input.untitledNote'),
      contentMd: note.contentMd
    })
  }
}

// 已选知识库展示列表（id + name + pinned），pinned 在前
const selectedKbDisplayList = computed(() => {
  const pinned = chatStore.sessionKbIds || []
  const temp = chatStore.tempKbIds || []
  const list = knowledgeBases.value
  const toItem = (id: string, pinned: boolean) => {
    const kb = list.find(k => k.id === id)
    return { id, name: kb?.name ?? id, pinned }
  }
  return [...pinned.map(id => toItem(id, true)), ...temp.map(id => toItem(id, false))]
})

function removeKb(kbId: string) {
  chatStore.removeKbFromSelection(kbId)
}

function toggleKbPin(kbId: string) {
  void chatStore.toggleKbPin(kbId)
}

const currentModelInputModalities = computed<ModelModality[]>(() => {
  const selected = currentUsedModel.value
  if (!selected) return normalizeInputModalities(undefined)

  const [providerId, modelId] = selected.split('::')
  if (!providerId || !modelId) return normalizeInputModalities(undefined)

  const provider = settingsStore.providers.find(item => item.id === providerId)
  const model = provider?.models.find(item => item.id === modelId)
  return normalizeInputModalities(model?.inputModalities)
})

function isAttachmentModalitySupported(modality: AttachmentInputModality): boolean {
  return supportsInputModality(currentModelInputModalities.value, modality)
}

// 加号菜单（附件上传 + 快捷意图，笔记已移至本地知识）
function createUploadMenuItem(
  modality: AttachmentInputModality,
  label: string,
  icon: string,
  onSelect: () => void
): AddMenuItem {
  const supported = isAttachmentModalitySupported(modality)
  return {
    label,
    icon,
    onSelect,
    disabled: !supported,
    tooltip: supported ? undefined : t('chat.input.add.unsupportedUploadTooltip', { modality: modalityLabel(modality) })
  }
}

const addMenuUploadItems = computed<AddMenuItem[]>(() => {
  return [
    createUploadMenuItem('image', t('chat.input.add.uploadImage'), 'i-lucide-image', handleSelectImages),
    createUploadMenuItem('audio', t('chat.input.add.uploadAudio'), 'i-lucide-audio-lines', handleSelectAudios),
    createUploadMenuItem('video', t('chat.input.add.uploadVideo'), 'i-lucide-film', handleSelectVideos),
    createUploadMenuItem('file', t('chat.input.add.uploadFile'), 'i-lucide-file', handleSelectFiles)
  ]
})

const addMenuItems = computed<AddMenuItem[][]>(() => {
  return [
    addMenuUploadItems.value,
    [
      {
        label: t('chat.input.add.quickIntent'),
        icon: 'i-lucide-lightbulb',
        children: quickIntentMenuItems.value as AddMenuItem[]
      }
    ]
  ]
})

// 处理快捷意图选择
function handleIntentSelect(intent: Intent) {
  const prompt = t(`chat.input.intentPrompt.${intent}`)
  fillText(prompt)
}

// 快捷键模式管理
const sendShortcutMode = ref<'enter' | 'cmd-enter'>('enter')

// 快捷键选项
const sendShortcutOptions = computed(() => [
  {
    label: t('chat.input.shortcut.enter'),
    value: 'enter'
  },
  {
    label: t('chat.input.shortcut.cmdEnter', { key: isMac() ? '⌘' : 'Ctrl' }),
    value: 'cmd-enter'
  }
])

// 展开状态管理
const isExpanded = ref(false)
const collapsedInputContainerHeight = ref(0)
const collapsedInputBlockHeight = ref(0)
const expandedPosition = ref({ bottom: 0, left: 0, width: 0, height: 0 })
const EXPANDED_INPUT_TOP_MARGIN = 72
const INPUT_EXPAND_TRANSITION_MS = 300
let expandFrame: number | null = null
let collapseTimer: ReturnType<typeof setTimeout> | null = null
let expandedLayoutFrame: number | null = null
let expandedLayoutObserver: ResizeObserver | null = null

const inputPlaceholderStyle = computed(() => {
  if (!isExpanded.value || collapsedInputContainerHeight.value <= 0) return {}
  return { height: `${collapsedInputContainerHeight.value}px` }
})

const rootPlaceholderStyle = computed(() => {
  if (!isExpanded.value || collapsedInputBlockHeight.value <= 0) return {}
  return { height: `${collapsedInputBlockHeight.value}px` }
})

const expandedInputStyle = computed(() => {
  if (!isExpanded.value) return {}
  return {
    bottom: `${expandedPosition.value.bottom}px`,
    left: `${expandedPosition.value.left}px`,
    width: `${expandedPosition.value.width}px`,
    height: `${expandedPosition.value.height}px`,
    display: 'flex',
    flexDirection: 'column'
  }
})

const shouldShowChatTopBar = computed(() => {
  if (!chatStore.currentSessionId) return false
  return !(chatStore.isTemporarySession && chatStore.messages.length === 0)
})

const collapseOverlayStyle = computed(() => {
  return {
    top: `${shouldShowChatTopBar.value ? 56 : 0}px`
  }
})

// 输入框持久化 key 生成
const getExpandStateKey = (sessionId: string | null) => {
  return sessionId ? `chat-input-expand-${sessionId}` : 'chat-input-expand-new'
}

const getDraftKey = (sessionId: string | null) => {
  return sessionId ? `chat-input-draft-${sessionId}` : 'chat-input-draft-new'
}

const loadExpandState = (sessionId: string | null) => {
  const key = getExpandStateKey(sessionId)
  return getPersistentValue(key, false) === true
}

const saveExpandState = (sessionId: string | null, expanded: boolean) => {
  const key = getExpandStateKey(sessionId)
  if (expanded) {
    setPersistentValueSoon(key, true)
  } else {
    removePersistentValueSoon(key)
  }
}

const loadDraft = (sessionId: string | null) => {
  const key = getDraftKey(sessionId)
  return getPersistentValue(key, '')
}

const saveDraftDebounced = useDebounceFn((sessionId: string | null, text: string) => {
  const key = getDraftKey(sessionId)
  if (text.trim()) {
    setPersistentValueSoon(key, text)
  } else {
    removePersistentValueSoon(key)
  }
}, 500)

// 立即保存草稿（不走防抖）
const saveDraftImmediate = (sessionId: string | null, text: string) => {
  const key = getDraftKey(sessionId)
  if (text.trim()) {
    setPersistentValueSoon(key, text)
  } else {
    removePersistentValueSoon(key)
  }
}

// 删除草稿
const removeDraft = (sessionId: string | null) => {
  const key = getDraftKey(sessionId)
  removePersistentValueSoon(key)
}

const getQuoteDraftKey = (sessionId: string | null) => {
  return sessionId ? `chat-quote-draft-${sessionId}` : 'chat-quote-draft-new'
}

const loadQuoteDraft = (sessionId: string | null) => {
  const key = getQuoteDraftKey(sessionId)
  return getPersistentValue<unknown | null>(key, null)
}

const saveQuoteDraft = (sessionId: string | null, quote: unknown) => {
  const key = getQuoteDraftKey(sessionId)
  if (quote) {
    setPersistentValueSoon(key, quote)
  } else {
    removePersistentValueSoon(key)
  }
}

const emit = defineEmits<{
  send: [payload: { parts: MessageContentPart[]; manualSkillId?: string | null }]
}>()

// ModelSelector 的双向绑定
const selectedModel = computed({
  get: () => chatStore.selectedModel,
  set: (value: string) => chatStore.setModel(value)
})

// 获取实际使用的模型（用于发送消息和判断是否可发送）
const currentUsedModel = computed(() => chatStore.resolvedModel)

// 判断是否可以发送：有文本或附件且非忙碌（与笔记一致：未选模型也可点发送，由 handleSend 提示）
const canSend = computed(() => {
  return (!!inputText.value.trim() || selectedAttachments.value.length > 0) &&
    !chatStore.isBusy
})

// 上下文轮数环形进度条
const circumference = 2 * Math.PI * 20
const turnCount = computed(() => chatStore.currentTurns.length)
const contextCount = computed(() => chatStore.sessionContextCount ?? 10)
const contextProgress = computed(() => {
  const max = contextCount.value
  if (max <= 0) return 0
  return Math.min(turnCount.value / max, 1)
})
const contextProgressStrokeOffset = computed(() => circumference * (1 - contextProgress.value))
const contextOverflow = computed(() => Math.max(0, turnCount.value - contextCount.value))

// 待发送内容（字符数、预估 token）
const inputCharCount = computed(() => inputText.value.length)
const estimatedTokens = computed(() => estimateTokens(inputText.value))

// ===== MCP 配置 =====
const mcpPopoverOpen = ref(false)

// 会话级 MCP 配置（响应式）
const sessionMcpServerIds = computed({
  get: () => chatStore.sessionMcpServerIds || [],
  set: (value: string[]) => {
    chatStore.updateSessionMcpServers(value)
  }
})

// 会话级 MCP 策略（auto/manual/off）
const sessionMcpPolicy = computed({
  get: () => chatStore.sessionMcpPolicy || 'manual',
  set: (value: 'auto' | 'manual' | 'off') => {
    chatStore.updateSessionMcpPolicy(value)
  }
})

// 会话模式（Chat/Agent）
const sessionMode = computed({
  get: () => chatStore.sessionMode || 'chat',
  set: (value: 'chat' | 'agent') => {
    chatStore.updateSessionMode(value)
  }
})

const sessionToolApprovalMode = computed({
  get: () => chatStore.sessionToolApprovalMode || 'default',
  set: (value: ToolApprovalMode) => {
    chatStore.updateSessionToolApprovalMode(value)
  }
})

const sessionSkillPolicy = computed({
  get: () => chatStore.sessionSkillPolicy || 'auto',
  set: (value: 'auto' | 'off') => {
    chatStore.updateSessionSkillPolicy(value)
  }
})

const manualSkillLabel = computed(() => {
  if (!manualSkillId.value) return ''
  const skill = skillStore.skills.find(s => s.id === manualSkillId.value)
  return t('chat.input.manualSkill', { name: skill?.name || manualSkillId.value })
})

// 模式选项
const modeOptions = computed(() => ([
  { label: 'Chat', value: 'chat', icon: 'i-lucide-message-square', description: t('chat.input.mode.chat.description') },
  { label: 'Agent', value: 'agent', icon: 'i-lucide-infinity', description: t('chat.input.mode.agent.description') }
]))

const toolApprovalOptions = computed(() => ([
  {
    label: t('chat.input.toolApproval.default'),
    value: 'default',
    icon: 'i-lucide-shield-check',
    description: t('chat.input.toolApproval.default.description')
  },
  {
    label: t('chat.input.toolApproval.auto'),
    value: 'auto',
    icon: 'i-lucide-zap',
    description: t('chat.input.toolApproval.auto.description')
  }
]))

// ===== 本地知识（知识库 + 笔记） =====
const localKnowledgeOpen = ref(false)
const hasLocalKnowledge = computed(() => {
  const kbCount = (chatStore.effectiveKbIds || []).length
  const noteCount = selectedNotes.value.length
  return kbCount > 0 || noteCount > 0
})
// ===== 网络搜索模式 =====
interface SearchProvider {
  id: string
  type: 'builtin' | 'preset' | 'custom'
  name: string
  enabled: boolean
}

const searchProviders = ref<SearchProvider[]>([])

// 加载搜索服务列表
async function loadSearchProviders() {
  try {
    const providers = await window.ipc('webSearch:listProviders') as SearchProvider[]
    searchProviders.value = providers
  } catch (error) {
    console.error('Failed to load search providers', error)
  }
}

const sessionWebSearch = computed({
  get: () => chatStore.sessionWebSearch || 'builtin',
  set: (value: string) => {
    chatStore.updateSessionWebSearch(value)
  }
})

const sessionThinking = computed({
  get: () => chatStore.sessionThinking || 'auto',
  set: (value: ThinkingMode) => {
    chatStore.updateSessionThinking(value)
  }
})

// 判断搜索是否开启
const isWebSearchEnabled = computed(() => sessionWebSearch.value !== 'close')

// 获取当前搜索模式的图标
const webSearchIcon = computed(() => {
  const mode = sessionWebSearch.value
  if (mode === 'close') return 'i-lucide-globe-x'
  if (mode === 'native') return 'i-lucide-globe-lock'
  return 'i-lucide-globe'
})

const currentModelSupportsNativeWebSearch = computed(() => {
  const resolvedModel = currentUsedModel.value
  if (!resolvedModel) return false

  const [providerId, modelId] = resolvedModel.split('::')
  if (!providerId || !modelId) return false

  const provider = settingsStore.providers.find(p => p.id === providerId)
  if (!provider) return false

  const model = provider.models.find(m => m.id === modelId)
  if (!model) return false

  return !!resolveNativeWebSearchConfig(
    provider.nativeWebSearchDefaults,
    model.nativeWebSearch
  )
})

const currentModelThinkingConfig = computed(() => {
  const resolvedModel = currentUsedModel.value
  if (!resolvedModel) return undefined

  const [providerId, modelId] = resolvedModel.split('::')
  if (!providerId || !modelId) return undefined

  const provider = settingsStore.providers.find(p => p.id === providerId)
  if (!provider) return undefined

  const model = provider.models.find(m => m.id === modelId)
  if (!model) return undefined

  return model.thinking
})

const currentModelThinkingResolved = computed(() => {
  const config = currentModelThinkingConfig.value
  const selected = sessionThinking.value as ThinkingMode
  return resolveThinkingMode(config, selected)
})

const currentModelSupportsThinking = computed(() => currentModelThinkingResolved.value.supported)

const effectiveThinkingMode = computed(() => currentModelThinkingResolved.value.effectiveMode)

function formatThinkingModeLabel(mode: ThinkingMode) {
  if (mode === 'auto') return t('chat.input.thinking.auto')
  if (mode === 'off') return t('chat.input.thinking.off')
  if (mode === 'on') return t('chat.input.thinking.on')
  if (mode === 'standard') return t('chat.input.thinking.standard')
  if (mode === 'deep') return t('chat.input.thinking.deep')
  return t('chat.input.thinking.ultra')
}

const thinkingMenuItems = computed(() => {
  if (!currentModelSupportsThinking.value) return []
  const resolved = currentModelThinkingResolved.value
  const available = resolved.availableModes
  const firstGroup = available.map((mode) => ({
    label: formatThinkingModeLabel(mode),
    type: 'checkbox' as const,
    checked: effectiveThinkingMode.value === mode,
    onSelect: () => { sessionThinking.value = mode }
  }))
  return [firstGroup]
})

function getFallbackWebSearchMode(): string | null {
  const builtinProvider = searchProviders.value.find(p => p.type === 'builtin')
  if (builtinProvider) return builtinProvider.id
  return searchProviders.value.length > 0 ? 'close' : null
}

const webSearchMenuItems = computed(() => {
  // 内置搜索
  const builtinProvider = searchProviders.value.find(p => p.type === 'builtin')
  
  // 第一组：内置搜索 + 模型原生搜索
  const firstGroup = [
    ...(builtinProvider ? [{
      label: builtinProvider.name,
      icon: 'i-lucide-globe',
      type: 'checkbox' as const,
      checked: sessionWebSearch.value === builtinProvider.id,
      onSelect: () => { sessionWebSearch.value = builtinProvider.id }
    }] : []),
    ...(currentModelSupportsNativeWebSearch.value ? [{
      label: t('chat.input.webSearch.native'),
      icon: 'i-lucide-globe-lock',
      type: 'checkbox' as const,
      checked: sessionWebSearch.value === 'native',
      onSelect: () => { sessionWebSearch.value = 'native' }
    }] : [])
  ]
  
  // 第二组：已启用的预设和自定义搜索
  const thirdPartyItems = searchProviders.value
    .filter(provider => provider.type !== 'builtin' && provider.enabled)
    .map(provider => ({
      label: provider.name,
      icon: 'i-lucide-globe',
      type: 'checkbox' as const,
      checked: sessionWebSearch.value === provider.id,
      onSelect: () => { sessionWebSearch.value = provider.id }
    }))
  
  // 第三组：关闭搜索
  const closeGroup = [
    {
      label: t('chat.input.webSearch.off'),
      icon: 'i-lucide-globe-x',
      type: 'checkbox' as const,
      checked: sessionWebSearch.value === 'close',
      onSelect: () => { sessionWebSearch.value = 'close' }
    }
  ]
  
  // 组装菜单，第二组只有在有内容时才添加
  const result = [firstGroup]
  if (thirdPartyItems.length > 0) {
    result.push(thirdPartyItems)
  }
  result.push(closeGroup)
  
  return result
})

watch(
  () => [currentModelSupportsNativeWebSearch.value, searchProviders.value.length] as const,
  ([supported]) => {
    if (!supported && sessionWebSearch.value === 'native') {
      const fallback = getFallbackWebSearchMode()
      if (fallback) {
        sessionWebSearch.value = fallback
      }
    }
  },
  { immediate: true }
)

// 当前选中模式的图标
const modeIcon = computed(() => modeOptions.value.find(item => item.value === sessionMode.value)?.icon)
const toolApprovalIcon = computed(() => toolApprovalOptions.value.find(item => item.value === sessionToolApprovalMode.value)?.icon)
const bottomPanelSelectUi = {
  base: 'hover:bg-accented/70 focus:bg-accented/70 data-[state=open]:bg-accented/70'
}
const toolApprovalSelectUi = computed(() => {
  if (sessionToolApprovalMode.value !== 'auto') return bottomPanelSelectUi
  return {
    base: 'text-warning hover:bg-warning/10 focus:bg-warning/10 data-[state=open]:bg-warning/10',
    leadingIcon: 'text-warning',
    trailingIcon: 'text-warning',
    value: 'text-warning'
  }
})

// 切换模式快捷键
const toggleMode = () => {
  sessionMode.value = sessionMode.value === 'chat' ? 'agent' : 'chat'
}

defineShortcuts({
  'meta_.': {
    handler: toggleMode,
    usingInput: true
  },
  'meta_e': {
    usingInput: true,
    handler: () => {
      handleExpandArcClick()
    }
  }
})

function handleSend() {
  if (!canSend.value) {
    return
  }
  if (!currentUsedModel.value) {
    toast.error({ title: t('chat.input.error.selectModelFirst') })
    return
  }

  const text = inputText.value.trim()
  const attachments = selectedAttachments.value
  const unsupportedAttachments = attachments.filter(item => !isAttachmentModalitySupported(item.modality))
  if (unsupportedAttachments.length > 0) {
    const labels = [...new Set(unsupportedAttachments.map(item => modalityLabel(item.modality)))].join(', ')
    toast.warn(t('chat.input.error.unsupportedModality', { modality: labels }))
    return
  }
  
  // 构建消息内容数组
  const contentParts: MessageContentPart[] = []
  
  // 添加文本内容（如果有）
  if (text) {
    contentParts.push({ type: 'text', text })
  }
  
  // 添加附件内容
  for (const attachment of attachments) {
    contentParts.push({
      type: 'file',
      mediaType: attachment.mediaType,
      url: attachment.preview,
      filename: attachment.file.name
    })
  }

  // 添加笔记上下文快照
  if (selectedNotes.value.length > 0) {
    contentParts.push({
      type: 'data-note-context',
      data: {
        notes: selectedNotes.value.map(n => ({
          noteId: n.noteId,
          title: n.title,
          contentMd: n.contentMd
        }))
      }
    } as any)
  }
  
  // 如果没有文本也没有附件，不发送
  if (contentParts.length === 0) {
    return
  }
  
  // 清空输入框、附件和笔记
  inputText.value = ''
  selectedAttachments.value = []
  selectedNotes.value = []
  
  // 删除草稿缓存
  removeDraft(chatStore.currentSessionId)
  
  // 直接传递对象数组，不序列化
  emit('send', {
    parts: contentParts,
    manualSkillId: manualSkillId.value
  })
  manualSkillId.value = null

  // 发送后：展开态自动收起；非展开态保持聚焦输入框
  if (isExpanded.value) {
    handleCollapse()
  } else {
    nextTick(() => {
      focus()
    })
  }
}

function handleAbort() {
  chatStore.abortChat()
}

// 处理输入框的键盘事件
function handleInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    // 展开模式：Enter 和 Shift+Enter 都换行，Cmd/Ctrl+Enter 无作用
    if (isExpanded.value) {
      // 阻止 Cmd/Ctrl+Enter，但不执行任何操作
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
      // Enter 和 Shift+Enter 保持默认换行行为
      return
    }
    
    // 非展开模式：根据用户设置决定行为
    if (sendShortcutMode.value === 'enter') {
      // Enter发送模式：Enter发送，Shift+Enter换行
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        if (canSend.value) {
          handleSend()
        }
      }
      // Shift+Enter 换行 - 保持默认行为
    } else {
      // Cmd/Ctrl+Enter发送模式：Cmd/Ctrl+Enter发送，Enter换行
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        if (canSend.value) {
          handleSend()
        }
      }
      // Enter 换行 - 保持默认行为
    }
  }
}

// 处理快捷键模式切换
async function handleShortcutChange(mode: string) {
  await window.ipc('settings:setSendShortcut', { mode })
  // 切换后自动聚焦输入框
  nextTick(() => {
    focus()
  })
}

function handleExpandArcClick() {
  if (isExpanded.value) {
    handleCollapse()
  } else {
    handleExpand()
  }
}

function computeExpandedGeometry(rect: DOMRect) {
  const bottom = Math.max(0, window.innerHeight - rect.bottom)
  const availableHeight = Math.max(rect.height, window.innerHeight - EXPANDED_INPUT_TOP_MARGIN - bottom)
  const expandedHeight = Math.max(rect.height, Math.min(window.innerHeight * 0.8, availableHeight))
  return {
    bottom,
    left: rect.left,
    width: rect.width,
    expandedHeight
  }
}

function syncExpandedPosition() {
  if (!isExpanded.value) return
  const anchorRect = inputPlaceholderRef.value?.getBoundingClientRect()
  if (!anchorRect) return
  const geometry = computeExpandedGeometry(anchorRect)
  expandedPosition.value = {
    bottom: geometry.bottom,
    left: geometry.left,
    width: geometry.width,
    height: geometry.expandedHeight
  }
}

function scheduleSyncExpandedPosition() {
  if (!isExpanded.value) return
  if (expandedLayoutFrame !== null) return
  expandedLayoutFrame = requestAnimationFrame(() => {
    expandedLayoutFrame = null
    syncExpandedPosition()
  })
}

// 展开输入框
function handleExpand() {
  if (isExpanded.value) return
  if (collapseTimer) {
    clearTimeout(collapseTimer)
    collapseTimer = null
  }
  if (expandFrame !== null) {
    cancelAnimationFrame(expandFrame)
    expandFrame = null
  }

  const rect = inputContainerRef.value?.getBoundingClientRect()
  if (!rect) return

  collapsedInputContainerHeight.value = rect.height
  collapsedInputBlockHeight.value = rootRef.value?.getBoundingClientRect().height ?? rect.height

  const geometry = computeExpandedGeometry(rect)

  expandedPosition.value = {
    bottom: geometry.bottom,
    left: geometry.left,
    width: geometry.width,
    height: rect.height
  }

  isExpanded.value = true
  expandFrame = requestAnimationFrame(() => {
    expandFrame = null
    expandedPosition.value = {
      bottom: geometry.bottom,
      left: geometry.left,
      width: geometry.width,
      height: geometry.expandedHeight
    }
  })
  // 展开后自动聚焦
  nextTick(() => {
    focus()
  })
}

// 收起输入框
function handleCollapse() {
  if (!isExpanded.value) return
  if (expandFrame !== null) {
    cancelAnimationFrame(expandFrame)
    expandFrame = null
  }
  if (collapseTimer) {
    clearTimeout(collapseTimer)
    collapseTimer = null
  }

  expandedPosition.value = {
    ...expandedPosition.value,
    height: collapsedInputContainerHeight.value || inputContainerRef.value?.getBoundingClientRect().height || expandedPosition.value.height
  }
  collapseTimer = setTimeout(() => {
    collapseTimer = null
    isExpanded.value = false
  }, INPUT_EXPAND_TRANSITION_MS)
  // 收起后自动聚焦
  nextTick(() => {
    focus()
  })
}

// 全局键盘：Esc 仅收起（不切换）
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isExpanded.value) {
    handleCollapse()
  }
}

// 监听键盘事件
onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('resize', scheduleSyncExpandedPosition)
  // 监听全局聚焦输入框事件
  emitter.on('chat:focus-input', focus)
  // 监听快捷追问填充文本事件
  emitter.on('chat:fill-input', fillText)
  // 监听编辑消息后替换输入草稿事件
  emitter.on('chat:set-input-draft', setInputDraft)
  if (typeof ResizeObserver !== 'undefined') {
    expandedLayoutObserver = new ResizeObserver(() => {
      scheduleSyncExpandedPosition()
    })
    if (rootRef.value) {
      expandedLayoutObserver.observe(rootRef.value)
    }
    if (inputPlaceholderRef.value && inputPlaceholderRef.value !== rootRef.value) {
      expandedLayoutObserver.observe(inputPlaceholderRef.value)
    }
  }
  
  // 初始化：读取当前会话的展开状态（包括新建会话）
  if (loadExpandState(chatStore.currentSessionId)) {
    nextTick(() => {
      handleExpand()
    })
  }
  
  // 初始化：读取当前会话的草稿
  inputText.value = loadDraft(chatStore.currentSessionId)

  // 初始化：恢复当前会话的引用草稿
  const savedQuote = loadQuoteDraft(chatStore.currentSessionId)
  if (savedQuote) {
    chatStore.pendingQuote = savedQuote
  }

  // 初始化：读取快捷键模式设置
  const mode = await window.ipc('settings:getSendShortcut')
  sendShortcutMode.value = mode as 'enter' | 'cmd-enter'
  
  // 初始化 MCP Store
  if (!mcpStore.isInitialized) {
    await mcpStore.initialize()
  }

  // 初始化 Skill Store（用于手动技能选择）
  if (!skillStore.isInitialized) {
    await skillStore.initialize()
  }
  
  // 加载搜索服务列表
  await loadSearchProviders()

  // 预加载笔记、知识库列表（用于展示已选知识库名称，内部知识选择器打开时会再次加载）
  void loadAllNotes()
  void loadKnowledgeBases()
  
  // 绑定粘贴上传监听
  nextTick(() => {
    bindTextareaPasteListener()
  })

  // 页面加载完成后自动聚焦输入框
  focus()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', scheduleSyncExpandedPosition)
  emitter.off('chat:focus-input', focus)
  emitter.off('chat:fill-input', fillText)
  emitter.off('chat:set-input-draft', setInputDraft)
  if (expandFrame !== null) {
    cancelAnimationFrame(expandFrame)
    expandFrame = null
  }
  if (collapseTimer) {
    clearTimeout(collapseTimer)
    collapseTimer = null
  }
  if (expandedLayoutFrame !== null) {
    cancelAnimationFrame(expandedLayoutFrame)
    expandedLayoutFrame = null
  }
  if (expandedLayoutObserver) {
    expandedLayoutObserver.disconnect()
    expandedLayoutObserver = null
  }
  if (pasteListenerTarget) {
    pasteListenerTarget.removeEventListener('paste', handleTextareaPaste)
    pasteListenerTarget = null
  }
})

// 监听展开状态变化，保存持久状态（包括新建会话）
watch(isExpanded, (val) => {
  saveExpandState(chatStore.currentSessionId, val)
})

// 监听输入框内容变化，自动保存草稿（防抖）
watch(inputText, (val) => {
  saveDraftDebounced(chatStore.currentSessionId, val)
})

watch(textareaRef, () => {
  bindTextareaPasteListener()
})

// 监听引用变化，自动保存引用草稿
watch(() => chatStore.pendingQuote, (val) => {
  saveQuoteDraft(chatStore.currentSessionId, val)
})

// 监听会话切换，恢复对应的展开状态和草稿（包括新建会话）
watch(() => chatStore.currentSessionId, (newSessionId, oldSessionId) => {
  // 先保存旧会话的状态（包括从新建会话切换出去）
  if (oldSessionId !== newSessionId) {
    saveExpandState(oldSessionId, isExpanded.value)
    // 立即保存草稿（不走防抖）
    saveDraftImmediate(oldSessionId, inputText.value)
    saveQuoteDraft(oldSessionId, chatStore.pendingQuote)
  }
  // 恢复新会话的状态（包括切换到新建会话）
  if (loadExpandState(newSessionId)) {
    isExpanded.value = false
    nextTick(() => {
      handleExpand()
    })
  } else {
    isExpanded.value = false
  }
  // 恢复新会话的草稿
  inputText.value = loadDraft(newSessionId)
  chatStore.pendingQuote = loadQuoteDraft(newSessionId)
  manualSkillId.value = null
  skillPopoverOpen.value = false
  promptLibraryInsertOpen.value = false
  promptInsertSavedSelection.value = null
  selectedAttachments.value = []
  selectedNotes.value = []
})

watch(() => chatStore.pendingManualSkillId, (skillId) => {
  if (skillId) {
    manualSkillId.value = skillId
    chatStore.pendingManualSkillId = null
  }
}, { immediate: true })

watch(sessionMode, (mode) => {
  if (mode !== 'agent') {
    manualSkillId.value = null
    skillPopoverOpen.value = false
  }
})

watch(promptLibraryInsertOpen, (open) => {
  if (!open) {
    promptInsertSavedSelection.value = null
  }
})

// 聚焦输入框
function focus() {
  setTimeout(() => {
    textareaRef.value?.focus()
  }, 300)
}

function capturePromptInsertSelection() {
  const el = textareaRef.value
  if (!el || document.activeElement !== el) {
    promptInsertSavedSelection.value = null
    return
  }
  promptInsertSavedSelection.value = {
    start: el.selectionStart,
    end: el.selectionEnd
  }
}

function handleInsertPromptFromLibrary(text: string) {
  const el = textareaRef.value
  const cur = inputText.value
  let start: number
  let end: number

  if (el && document.activeElement === el) {
    start = el.selectionStart
    end = el.selectionEnd
  } else if (promptInsertSavedSelection.value) {
    start = promptInsertSavedSelection.value.start
    end = promptInsertSavedSelection.value.end
    promptInsertSavedSelection.value = null
  } else {
    start = end = cur.length
  }

  start = Math.max(0, Math.min(start, cur.length))
  end = Math.max(0, Math.min(end, cur.length))
  if (start > end) {
    const tmp = start
    start = end
    end = tmp
  }

  inputText.value = cur.slice(0, start) + text + cur.slice(end)
  const caret = start + text.length
  promptInsertSavedSelection.value = null
  promptLibraryInsertOpen.value = false
  nextTick(() => {
    const ta = textareaRef.value
    ta?.focus()
    ta?.setSelectionRange(caret, caret)
  })
}

// 填充文本（供快捷追问使用）
function fillText(text: string) {
  if (inputText.value.trim()) {
    // 如果已有内容，追加到最前面
    inputText.value = text + '\n' + inputText.value
  } else {
    // 如果为空，直接填充
    inputText.value = text
  }
  
  setTimeout(() => {
    const textarea = textareaRef.value
    if (textarea) {
      textarea.focus()
      // 光标移到末尾
      const len = inputText.value.length
      textarea.setSelectionRange(len, len)
    }
  }, 300)
}

function setInputDraft(text: string) {
  inputText.value = text
  saveDraftImmediate(chatStore.currentSessionId, text)

  setTimeout(() => {
    const textarea = textareaRef.value
    if (textarea) {
      textarea.focus()
      const len = inputText.value.length
      textarea.setSelectionRange(len, len)
    }
  }, 300)
}

function createAttachmentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function inferMediaTypeFromFileName(filename: string): string | undefined {
  const ext = filename.toLowerCase().split('.').pop()
  if (!ext) return undefined

  const mediaTypeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    m4v: 'video/x-m4v',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json'
  }

  return mediaTypeMap[ext]
}

function resolveAttachmentMediaType(file: File, pickerModality: AttachmentInputModality = 'file'): string {
  if (typeof file.type === 'string' && file.type.trim()) return file.type
  const inferred = inferMediaTypeFromFileName(file.name)
  if (inferred) return inferred
  if (pickerModality === 'image') return 'image/*'
  if (pickerModality === 'audio') return 'audio/*'
  if (pickerModality === 'video') return 'video/*'
  return 'application/octet-stream'
}

function resolveAttachmentModality(mediaType: string): AttachmentInputModality {
  const modality = getInputModalityFromMediaType(mediaType)
  return modality === 'image' || modality === 'audio' || modality === 'video' ? modality : 'file'
}

function modalityLabel(modality: AttachmentInputModality): string {
  return t(`chat.input.modality.${modality}`)
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getAttachmentIcon(mediaType: string): string {
  if (mediaType.startsWith('image/')) return 'i-lucide-image'
  if (mediaType.startsWith('audio/')) return 'i-lucide-audio-lines'
  if (mediaType.startsWith('video/')) return 'i-lucide-film'
  return 'i-lucide-file'
}

function hasFileDataTransfer(dataTransfer?: DataTransfer | null): boolean {
  if (!dataTransfer) return false
  const types = Array.from(dataTransfer.types || [])
  return types.includes('Files')
}

function normalizeClipboardFiles(dataTransfer?: DataTransfer | null): File[] {
  if (!dataTransfer) return []
  const files = Array.from(dataTransfer.files || [])
  if (files.length > 0) return files

  const fromItems: File[] = []
  for (const item of Array.from(dataTransfer.items || [])) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file) fromItems.push(file)
  }
  return fromItems
}

function bindTextareaPasteListener() {
  const textarea = textareaRef.value
  if (pasteListenerTarget && pasteListenerTarget !== textarea) {
    pasteListenerTarget.removeEventListener('paste', handleTextareaPaste)
    pasteListenerTarget = null
  }
  if (textarea && pasteListenerTarget !== textarea) {
    textarea.addEventListener('paste', handleTextareaPaste)
    pasteListenerTarget = textarea
  }
}

async function appendAttachmentFiles(
  files: File[],
  preferredModality?: AttachmentInputModality
) {
  if (!Array.isArray(files) || files.length === 0) return

  const unsupported = new Set<AttachmentInputModality>()
  let hasConvertError = false
  let oversizeCount = 0
  let overflowCount = 0

  for (const file of files) {
    if (selectedAttachments.value.length >= MAX_ATTACHMENTS_COUNT) {
      overflowCount += 1
      continue
    }

    if (file.size <= 0) {
      console.warn(t('chat.input.error.fileZero'), file.name)
      continue
    }

    const mediaType = resolveAttachmentMediaType(file, preferredModality ?? 'file')
    const actualModality = resolveAttachmentModality(mediaType)
    if (!isAttachmentModalitySupported(actualModality)) {
      unsupported.add(actualModality)
      continue
    }

    const maxBytes = MAX_ATTACHMENT_BYTES[actualModality]
    if (file.size > maxBytes) {
      oversizeCount += 1
      console.warn(t('chat.input.error.fileTooLargeDetail'), {
        filename: file.name || t('chat.message.file.unnamed'),
        size: formatBytes(file.size),
        max: formatBytes(maxBytes)
      })
      continue
    }

    try {
      const preview = await fileToBase64(file)
      selectedAttachments.value.push({
        id: createAttachmentId(),
        file,
        preview,
        mediaType,
        modality: actualModality
      })
    } catch (error) {
      hasConvertError = true
      console.error(t('chat.input.error.convertFile'), error)
    }
  }

  if (unsupported.size > 0) {
    const labels = [...unsupported].map(modalityLabel).join(', ')
    toast.warn(t('chat.input.error.unsupportedModality', { modality: labels }))
  }
  if (hasConvertError) {
    toast.error(t('chat.input.error.convertFileFailed'))
  }
  if (oversizeCount > 0) {
    toast.warn(t('chat.input.error.fileTooLarge', { count: oversizeCount }))
  }
  if (overflowCount > 0) {
    toast.warn(t('chat.input.error.tooManyAttachments', { count: MAX_ATTACHMENTS_COUNT }))
  }

  nextTick(() => {
    focus()
  })
}

async function handleSelectAttachments(pickerModality: AttachmentInputModality) {
  try {
    const options: Record<string, unknown> = { multiple: true }
    if (pickerModality === 'image') {
      options.types = [{
        description: t('chat.input.filePicker.images'),
        accept: {
          'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
        }
      }]
    } else if (pickerModality === 'audio') {
      options.types = [{
        description: t('chat.input.filePicker.audios'),
        accept: {
          'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']
        }
      }]
    } else if (pickerModality === 'video') {
      options.types = [{
        description: t('chat.input.filePicker.videos'),
        accept: {
          'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']
        }
      }]
    } else {
      options.types = [{
        description: t('chat.input.filePicker.files'),
        accept: {
          'application/*': ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'],
          'text/*': ['.txt', '.md', '.csv', '.json']
        }
      }]
      options.excludeAcceptAllOption = false
    }

    const fileHandles = await (window as any).showOpenFilePicker(options)
    const files = await Promise.all(fileHandles.map((fileHandle: any) => fileHandle.getFile()))
    await appendAttachmentFiles(files, pickerModality)
  } catch (error: any) {
    // 用户取消选择时不抛出错误
    if (error.name !== 'AbortError') {
      console.error(t('chat.input.error.selectFile'), error)
    }
  }
}

function handleDragEnter(event: DragEvent) {
  if (!hasFileDataTransfer(event.dataTransfer)) return
  dragEnterCounter.value += 1
  isDragOver.value = true
}

function handleDragOver(event: DragEvent) {
  if (!hasFileDataTransfer(event.dataTransfer)) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  isDragOver.value = true
}

function handleDragLeave(event: DragEvent) {
  if (!hasFileDataTransfer(event.dataTransfer)) return
  dragEnterCounter.value = Math.max(0, dragEnterCounter.value - 1)
  if (dragEnterCounter.value === 0) {
    isDragOver.value = false
  }
}

async function handleDropFiles(event: DragEvent) {
  if (!hasFileDataTransfer(event.dataTransfer)) return
  dragEnterCounter.value = 0
  isDragOver.value = false
  const files = Array.from(event.dataTransfer?.files || [])
  await appendAttachmentFiles(files)
}

async function handleTextareaPaste(event: ClipboardEvent) {
  const files = normalizeClipboardFiles(event.clipboardData)
  if (files.length === 0) return
  event.preventDefault()
  await appendAttachmentFiles(files)
}

function handleSelectImages() {
  return handleSelectAttachments('image')
}

function handleSelectAudios() {
  return handleSelectAttachments('audio')
}

function handleSelectVideos() {
  return handleSelectAttachments('video')
}

function handleSelectFiles() {
  return handleSelectAttachments('file')
}

function removeAttachment(id: string) {
  selectedAttachments.value = selectedAttachments.value.filter(item => item.id !== id)
}

// 移除笔记
function removeNote(index: number) {
  selectedNotes.value.splice(index, 1)
}

// 预览已选笔记
function handlePreviewSelectedNote(note: NoteSnapshot) {
  previewingNote.value = {
    noteId: note.noteId,
    title: note.title,
    contentMd: note.contentMd
  }
  showNotePreview.value = true
}

// 处理图片加载错误
function handleImageError(attachmentId: string, event: Event) {
  console.error(t('chat.input.error.imageLoad'), attachmentId, event)
  // 可以在这里添加错误处理逻辑，比如显示占位符
}

// 暴露方法给父组件
defineExpose({
  fillText
})
</script>
