<template>
  <div
    :data-message-id="message.id"
    class="mb-2 group leading-7"
  >
    <!-- user 消息：居右，灰色背景 -->
    <div v-if="message.role === 'user'" class="flex justify-end">
      <div class="max-w-[80%] flex flex-col justify-end items-end">
        <!-- user 消息头部：时间在左、头像在右，贴近气泡 -->
        <div v-if="displayTime" class="mb-2 flex justify-end">
          <div class="flex items-center gap-2.5">
            <div class="flex items-center gap-2 text-xs select-none">
              <UTooltip :text="fullTime">
                <span class="text-muted">{{ formattedTime }}</span>
              </UTooltip>
            </div>
            <UAvatar icon="i-lucide-user" size="md" />
          </div>
        </div>
        <!-- 内部知识摘要（图标 + 数字，hover 用 popover 展示完整列表） -->
        <UPopover
          v-if="hasLocalKnowledgeInMessage"
          mode="hover"
          :content="{ side: 'top', align: 'end', sideOffset: 6 }"
          class="mb-1.5 inline-flex"
        >
          <div
            class="inline-flex items-center justify-end gap-1 px-2 py-0.5 rounded-lg bg-elevated text-xs text-muted cursor-default"
          >
            <template v-if="messageKbDisplayList.length > 0">
              <UIcon name="i-lucide-book-search" class="size-3 shrink-0" />
              <span>{{ messageKbDisplayList.length }}</span>
            </template>
            <template v-if="messageKbDisplayList.length > 0 && (messageNoteContext?.notes?.length ?? 0) > 0">
              <span class="text-muted/60">·</span>
            </template>
            <template v-if="(messageNoteContext?.notes?.length ?? 0) > 0">
              <UIcon name="i-lucide-notebook-pen" class="size-3 shrink-0" />
              <span>{{ (messageNoteContext?.notes ?? []).length }}</span>
            </template>
          </div>
          <template #content>
            <div class="py-1.5 px-2 min-w-[120px] text-sm">
              <div
                v-for="kb in messageKbDisplayList"
                :key="kb.id"
                class="flex items-center gap-2 py-0.5 text-default"
              >
                <UIcon name="i-lucide-book-search" class="size-3.5 shrink-0 text-muted" />
                <span class="truncate">{{ kb.name }}</span>
              </div>
              <div
                v-for="note in (messageNoteContext?.notes ?? [])"
                :key="note.noteId"
                class="flex items-center gap-2 py-0.5 text-default cursor-pointer hover:bg-elevated/80 rounded px-1 -mx-1"
                @click="handlePreviewNoteContext(note)"
              >
                <UIcon name="i-lucide-notebook-pen" class="size-3.5 shrink-0 text-muted" />
                <span class="truncate">{{ note.title }}</span>
              </div>
            </div>
          </template>
        </UPopover>
        <div 
          ref="userMessageContent"
          class="px-3 py-2 rounded-xl bg-elevated"
          @mousedown="handleMouseDown"
          @mouseup="handleTextSelection"
        >
          <div v-if="message.isDeleted" class="text-muted text-sm select-none">{{ t("chat.sessionOverview.messageDeleted") }}</div>
          <div v-else>
            <!-- 引用展示 -->
            <div 
              v-if="messageQuote"
              class="mb-2 pl-2 border-l-3 border-default cursor-pointer"
              @click="handleShowQuoteDetail"
            >
              <div class="text-sm truncate">{{ quoteDisplayText }}</div>
            </div>
            <!-- 消息内容 -->
            <div class="space-y-2">
              <!-- 文本内容 -->
              <div v-if="messageText" class="whitespace-pre-wrap wrap-break-word">{{ messageText }}</div>
              <!-- 图片内容 -->
              <div v-if="messageImages.length > 0" class="flex flex-wrap gap-2">
                <div
                  v-for="(image, index) in messageImages"
                  :key="index"
                  class="relative group"
                >
                  <div class="relative max-h-32 max-w-32 w-auto rounded-xl overflow-hidden flex items-center justify-center">
                    <UImage
                      :src="image"
                      :alt="t('chat.quote.imageAlt', { index: index + 1 })"
                    />
                  </div>
                </div>
              </div>
              <!-- 非图片附件 -->
              <div v-if="messageOtherFiles.length > 0" class="flex flex-col gap-1.5">
                <div
                  v-for="(file, index) in messageOtherFiles"
                  :key="`${file.filename || file.url}-${index}`"
                  class="flex items-center gap-2 border border-default rounded-lg bg-default px-2 py-1"
                >
                  <UIcon :name="getFilePartIcon(file.mediaType)" class="size-4 shrink-0 text-muted" />
                  <div class="min-w-0 flex-1">
                    <div class="text-xs truncate">{{ file.filename || t('chat.message.file.unnamed') }}</div>
                    <div class="text-[11px] text-muted truncate">{{ file.mediaType || 'application/octet-stream' }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- user 消息工具栏：hover 显示；更多菜单打开时也保持可见 -->
        <div
          class="mt-2 flex justify-end items-center gap-1 transition-opacity"
          :class="isUserMoreMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
        >
          <!-- 复制按钮：已删除消息隐藏 -->
          <UTooltip v-if="!message.isDeleted" :text="isCopied ? t('chat.thinking.copied') : t('chat.thinking.copy')">
            <UButton
              :icon="isCopied ? 'i-lucide-check' : 'i-lucide-copy'"
              size="sm"
              color="neutral"
              variant="ghost"
              square
              @click="handleCopy"
            />
          </UTooltip>
          <!-- 引用按钮：已删除消息或会话已完成时隐藏 -->
          <UTooltip v-if="!message.isDeleted && !isSessionArchived" :text="t('chat.message.askAboutThis')">
            <UButton
              icon="i-lucide-quote"
              size="sm"
              color="neutral"
              variant="ghost"
              square
              @click="handleQuoteMessage"
            />
          </UTooltip>
          <!-- 更多操作 -->
          <UDropdownMenu
            v-if="!message.isDeleted"
            :items="userMoreMenuItems"
            :content="{ align: 'end', side: 'top' }"
            @update:open="isUserMoreMenuOpen = $event"
          >
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
        </div>
      </div>
    </div>

    <!-- assistant 消息：无背景 -->
    <div v-else>
      <!-- assistant 消息头部：机器人头像 + 供应商/模型/时间（grouped 模式下隐藏） -->
      <div v-if="!isGroupedMode" class="mb-2 flex items-center gap-2.5">
        <!-- 机器人头像 -->
        <ModelLogo :model-id="modelInfo?.modelName ?? ''" size="md" />
        <!-- 供应商、模型、时间信息（已删除消息不显示模型信息） -->
        <div class="flex items-center gap-2 text-xs select-none">
          <template v-if="!message.isDeleted && modelInfo">
            <span class="truncate">{{ modelInfo.modelName }}</span>
            <USeparator orientation="vertical" class="h-3" />
            <span class="text-muted truncate">{{ modelInfo.providerName }}</span>
          </template>
          <template v-if="displayTime">
            <USeparator v-if="!message.isDeleted && modelInfo" orientation="vertical" class="h-3" />
            <UTooltip :text="fullTime">
              <span class="text-muted">{{ formattedTime }}</span>
            </UTooltip>
            <!-- 已编辑标记 -->
            <template v-if="message.userEdited">
              <span class="text-muted">·</span>
              <UTooltip :text="t('chat.message.editedTooltip')">
                <span class="text-muted">{{ t("chat.message.edited") }}</span>
              </UTooltip>
            </template>
          </template>
        </div>
      </div>
      
      <!-- 消息主体内容 -->
      <div class="flex-1 min-w-0">
            
            <!-- 已删除消息显示 -->
            <div v-if="message.isDeleted" class="py-2">
              <div class="text-muted text-sm select-none">{{ t("chat.sessionOverview.messageDeleted") }}</div>
            </div>
            
            <!-- 空内容时显示 loading 动画（含 pending；grouped 模式下不显示，由 TurnGroup 统一管理） -->
            <div v-else-if="!isGroupedMode && !hasVisibleContent && (message.status === 'streaming' || message.status === 'pending')" class="py-2">
              <div class="flex gap-1.5">
                <span class="w-2 h-2 bg-muted rounded-full animate-pulse" style="animation-delay: 0ms"></span>
                <span class="w-2 h-2 bg-muted rounded-full animate-pulse" style="animation-delay: 500ms"></span>
                <span class="w-2 h-2 bg-muted rounded-full animate-pulse" style="animation-delay: 1000ms"></span>
              </div>
            </div>
            
            <!-- 有内容时：按 content 顺序渲染各 Block -->
            <div v-else>
              <template v-for="(part, index) in messageContent" :key="index">
                <!-- Thinking -->
                <MessageThinkingBlock
                  v-if="part.type === 'reasoning' && part.text"
                  :part="part"
                />
                <!-- Text -->
                <MessageTextBlock
                  v-else-if="part.type === 'text' && part.text"
                  :part="part"
                  :is-streaming="message.status === 'streaming'"
                  @text-selected="handleBlockTextSelection"
                  @citation-click="handleCitationClick"
                />
                <!-- Tool Call（整合显示调用和结果） -->
                <MessageToolBlock
                  v-else-if="part.type === 'dynamic-tool' || (typeof part.type === 'string' && part.type.startsWith('tool-'))"
                  :tool-call="part"
                  :tool-result="part.type === 'dynamic-tool' && part.state === 'output-available' ? part as any : toolResultMap?.get((part as any).toolCallId)"
                />
                <div
                  v-else-if="part.type === 'file'"
                  class="my-2"
                >
                  <div
                    v-if="isImageFilePart(part)"
                    class="relative max-h-48 max-w-48 w-auto rounded-xl overflow-hidden flex items-center justify-center"
                  >
                    <UImage
                      :src="part.url"
                      :alt="part.filename || t('chat.message.file.unnamed')"
                    />
                  </div>
                  <div
                    v-else
                    class="flex items-center gap-2 border border-default rounded-lg bg-elevated px-2 py-1 max-w-[320px]"
                  >
                    <UIcon :name="getFilePartIcon(part.mediaType)" class="size-4 shrink-0 text-muted" />
                    <div class="min-w-0 flex-1">
                      <div class="text-xs truncate">{{ part.filename || t('chat.message.file.unnamed') }}</div>
                      <div class="text-[11px] text-muted truncate">{{ part.mediaType || 'application/octet-stream' }}</div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
            
      </div>
    </div>
  </div>

  <!-- 引用详情弹窗 -->
  <QuoteDetailModal
    v-model:open="showQuoteDetailModal"
    :quote="messageQuote"
  />

  <!-- 笔记上下文预览弹窗 -->
  <NoteContextPreviewModal
    v-model:open="showNoteContextPreview"
    :note="previewingNoteContext"
  />

  <!-- 调试详情弹窗（user 消息可查看其触发的请求调试信息） -->
  <MessageDebugModal
    v-model:open="showDebugModal"
    :turn-id="message.role === 'user' ? message.turnId : undefined"
  />

  <UModal
    v-model:open="isEditing"
    :title="t('chat.message.editTitle')"
    :ui="{ footer: 'justify-end', content: 'h-[90vh] min-w-[900px] flex flex-col', body: 'flex-1 min-h-0 flex flex-col' }"
  >
    <template #body>
      <div class="flex-1 min-h-0 flex flex-col border border-default rounded-lg overflow-hidden">
        <DocumentEditor
          v-model="editingContent"
          :placeholder="t('chat.message.editPlaceholder')"
          autofocus="end"
          :show-drag-handle="false"
          :show-image-toolbar="false"
          :ui="{ root: 'flex-1 min-h-0 flex flex-col overflow-hidden', content: 'flex-1 min-h-0 overflow-y-auto', base: 'p-4 sm:p-4 min-h-[150px]' }"
        />
      </div>
    </template>
    <template #footer>
      <UButton
        size="md"
        color="neutral"
        variant="outline"
        @click="handleCancelEdit"
      >
        {{ t("chat.message.cancel") }}
      </UButton>
      <UButton
        size="md"
        :loading="isSaving"
        @click="handleSaveEdit"
      >
        {{ t("chat.message.save") }}
      </UButton>
    </template>
  </UModal>
  
  <!-- 文本选择浮层 -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showSelectionToolbar"
        class="fixed z-9999 bg-inverted text-inverted rounded-lg shadow-xl px-2 py-1.5 flex items-center gap-1"
        :style="{
          top: selectionToolbarPosition.top - 4 + 'px',
          left: selectionToolbarPosition.left + 'px',
          transform: 'translateX(-50%)'
        }"
        @mousedown.prevent
      >
        <UButton
          icon="i-lucide-quote"
          size="xs"
          color="white"
          variant="ghost"
          @click="handleQuoteSelection"
        >
          {{ t("chat.message.askAboutThis") }}
        </UButton>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import UList from "../UList.vue";
import UText from "../UText.vue";
import DocumentEditor from "../editor/DocumentEditor.vue";
import QuoteDetailModal from "./QuoteDetailModal.vue";
import NoteContextPreviewModal from "./NoteContextPreviewModal.vue";
import type { NotePreviewData } from "./NoteContextPreviewModal.vue";
import MessageDebugModal from "./MessageDebugModal.vue";
import MessageThinkingBlock from "./MessageThinkingBlock.vue";
import MessageTextBlock from "./MessageTextBlock.vue";
import MessageToolBlock from "./MessageToolBlock.vue";
import ModelLogo from "../ModelLogo.vue";
import UImage from "../UImage.vue";
import { copyToClipboard } from "../../utils/clipboard";
import { parseModelInfo } from "../../utils/modelInfo";
import { formatMessageTime, formatFullTime } from "../../utils/timeFormat";
import { extractAnswerTextFromContent, extractImagesFromContent, extractFilePartsFromContent, extractQuoteFromContent, extractNoteContextFromContent, extractKbFromContent, extractQuotableParts, serializeMessageContent, type MessageContentPart, type NoteContextSnapshot } from "../../utils/messageContentUtils";
import { useChatStore } from "@/stores/useChatStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useConfirm } from "@/composables/useConfirm";
import { useMyToast } from "@/composables/useMyToast";
import emitter from "@/utils/emitter";

type MessagePublic = import('@/stores/useChatStore').MessagePublic;

/**
 * 消息显示模式
 * - standalone: 独立模式，显示完整的 header、loading、toolbar
 * - grouped: 组内模式，不显示 header、loading、toolbar（由 TurnGroup 统一管理）
 */
type DisplayMode = 'standalone' | 'grouped'

const props = withDefaults(defineProps<{
  message: MessagePublic;
  mode?: DisplayMode;  // 显示模式，默认 standalone
  toolResultMap?: Map<string, MessageContentPart>;  // toolCallId -> dynamic-tool(output) 映射
}>(), {
  mode: 'standalone'
});

const emit = defineEmits<{
  'citation-click': [index: number];
}>()

// 便捷计算属性
const isGroupedMode = computed(() => props.mode === 'grouped')

const chatStore = useChatStore();
const settingsStore = useSettingsStore();
const isSessionArchived = computed(() => !!chatStore.currentSession?.isArchived);
const { confirm } = useConfirm();
const toast = useMyToast();
const { t } = useI18n();

const isCopied = ref(false);
const isUserMoreMenuOpen = ref(false);
const showQuoteDetailModal = ref(false);
const showDebugModal = ref(false);
let resetTimer: ReturnType<typeof setTimeout> | null = null;

// ===== 文本选择引用相关 =====
const showSelectionToolbar = ref(false);
const selectedText = ref('');
const selectionToolbarPosition = ref({ top: 0, left: 0 });
const userMessageContent = ref<HTMLElement>();
const selectionToolbarRef = ref<HTMLElement>();
let mousedownMessageId: string | null = null;

// ===== 编辑相关 =====
const isEditing = ref(false);
const editingContent = ref('');
const isSaving = ref(false);

// 更多操作菜单（user 消息用）
const moreMenuItems = computed(() => {
  const items = [];
  
  // 调试信息：user 消息可查看其触发的请求调试信息
  if (settingsStore.sessionPreferences.showDebugEntry && props.message.role === 'user' && props.message.turnId) {
    items.push({
      label: t('chat.message.debugInfo'),
      icon: 'i-lucide-bug',
      onSelect: () => {
        showDebugModal.value = true;
      }
    });
  }
  
  return items;
});

// ===== 时间格式化 =====
// user 消息使用 createdAt（发送时间），assistant 消息使用 updatedAt（完成时间）
const displayTime = computed(() => {
  return props.message.role === 'assistant' 
    ? props.message.updatedAt 
    : props.message.createdAt;
});
const formattedTime = computed(() => formatMessageTime(displayTime.value));

// 解析消息内容
const messageContent = computed(() => {
  return props.message.parts;
});

// 提取文本内容（用于显示和复制）
const messageText = computed(() => {
  return extractAnswerTextFromContent(messageContent.value);
});

// 判断是否有可见内容（reasoning/text/tool 任意有内容）
const hasVisibleContent = computed(() => {
  return messageContent.value.some(part => {
    if (part.type === 'reasoning' || part.type === 'text') {
      return !!(part as any).text;
    }
    if (part.type === 'file') {
      return true;
    }
    if (part.type === 'dynamic-tool' || (typeof part.type === 'string' && part.type.startsWith('tool-'))) {
      return true;
    }
    return false;
  });
});

// 提取图片内容
const messageImages = computed(() => {
  return extractImagesFromContent(messageContent.value);
});

const messageOtherFiles = computed(() => {
  return extractFilePartsFromContent(messageContent.value).filter((part) => !String(part.mediaType || '').startsWith('image/'))
})

function isImageFilePart(part: Extract<MessageContentPart, { type: 'file' }>): boolean {
  return String(part.mediaType || '').startsWith('image/')
}

function getFilePartIcon(mediaType?: string): string {
  const normalized = String(mediaType || '')
  if (normalized.startsWith('image/')) return 'i-lucide-image'
  if (normalized.startsWith('audio/')) return 'i-lucide-audio-lines'
  if (normalized.startsWith('video/')) return 'i-lucide-film'
  return 'i-lucide-file'
}

// 引用显示文本：提取文本部分，如果包含图片则前面加上 [图片]
const quoteDisplayText = computed(() => {
  const quote = extractQuoteFromContent(props.message.parts)
  if (!quote?.parts) return ''
  const text = extractAnswerTextFromContent(quote.parts)
  const hasImages = extractImagesFromContent(quote.parts).length > 0
  
  if (hasImages && text) {
    return `${t('chat.message.imagePrefix')} ${text}`
  } else if (hasImages) {
    return t('chat.message.imagePrefix')
  } else {
    return text
  }
});

const messageQuote = computed(() => {
  const quote = extractQuoteFromContent(props.message.parts)
  return quote ? { parts: quote.parts, sourceMessageId: quote.sourceMessageId } : undefined
})

// 笔记上下文
const messageNoteContext = computed(() => extractNoteContextFromContent(props.message.parts))

// 知识库列表（从 data-kb 提取，已含 id+name）
const messageKbData = computed(() => extractKbFromContent(props.message.parts))
const messageKbDisplayList = computed(() => messageKbData.value?.kbs ?? [])

// 是否有内部知识（知识库或笔记）
const hasLocalKnowledgeInMessage = computed(() => {
  const hasKb = (messageKbData.value?.kbs?.length ?? 0) > 0
  const hasNote = (messageNoteContext.value?.notes?.length ?? 0) > 0
  return hasKb || hasNote
})
const showNoteContextPreview = ref(false)
const previewingNoteContext = ref<NotePreviewData | null>(null)

function handlePreviewNoteContext(note: NoteContextSnapshot) {
  previewingNoteContext.value = {
    noteId: note.noteId,
    title: note.title,
    contentMd: note.contentMd
  }
  showNoteContextPreview.value = true
}
const fullTime = computed(() => formatFullTime(displayTime.value));

function handleCitationClick(index: number) {
  emit('citation-click', index)
}

// ===== 模型信息解析（从 turn 获取）=====
const modelInfo = computed(() => {
  if (props.message.role !== 'assistant') return null
  const turn = chatStore.getTurnByMessage(props.message)
  if (turn?.selectedModel) {
    return parseModelInfo(turn.selectedModel);
  }
  return null;
});

// ===== 复制功能 =====
async function handleCopy() {
  const success = await copyToClipboard(messageText.value);
  
  if (success) {
    isCopied.value = true;
    
    // 清除之前的定时器（如果存在）
    if (resetTimer) {
      clearTimeout(resetTimer);
    }
    
    // 1.5秒后恢复
    resetTimer = setTimeout(() => {
      isCopied.value = false;
      resetTimer = null;
    }, 1500);
  }
}

// ===== user 消息更多菜单 =====
const userMoreMenuItems = computed(() => [[
  {
    label: t('chat.message.appendToNote'),
    icon: 'i-lucide-notebook-pen',
    onSelect: () => handleAppendToNote()
  },
  {
    label: t('chat.sessionList.menu.delete'),
    icon: 'i-lucide-trash-2',
    color: 'error' as const,
    onSelect: () => handleDelete()
  },
]]);

// ===== 追加到笔记 =====
function handleAppendToNote() {
  const text = messageText.value;
  if (text) {
    emitter.emit('session:append-to-note', text);
  }
}

// ===== 删除功能 =====
async function handleDelete() {
  const roleText = props.message.role === 'user' ? t('chat.message.userMessage') : t('chat.message.aiReply');
  
  const confirmed = await confirm({
    title: t('chat.message.confirmDeleteTitle'),
    content: t('chat.message.confirmDeleteContent', { role: roleText }),
    confirmText: t('chat.sessionList.menu.delete'),
    cancelText: t('chat.message.cancel'),
    confirmColor: 'error',
    confirmIcon: 'i-lucide-trash-2'
  });

  if (confirmed) {
    try {
      await chatStore.deleteMessage(props.message.id);
    } catch (error) {
      console.error(t('chat.message.deleteFailed'), error);
    }
  }
}

// ===== 编辑功能 =====
function handleStartEditInternal() {
  if (props.message.isDeleted) return;
  
  // 编辑时只编辑文本部分
  editingContent.value = messageText.value;
  isEditing.value = true;
}

// 对外暴露的编辑入口（兼容按钮点击）
function handleStartEdit() {
  handleStartEditInternal();
}

function handleCancelEdit() {
  isEditing.value = false;
  editingContent.value = '';
}

async function handleSaveEdit() {
  if (isSaving.value) return;
  
  // 检查内容是否真的有变化
  if (editingContent.value === messageText.value) {
    // 内容没有变化，直接关闭编辑模式
    isEditing.value = false;
    return;
  }
  
  try {
    isSaving.value = true;
    
    // 重新构建 content：保留图片，更新文本
    const newContentParts = messageContent.value.map(part => {
      if (part.type === 'text') {
        return { type: 'text', text: editingContent.value } as const;
      }
      return part;
    });
    
    // 如果没有文本部分，添加一个
    if (!newContentParts.some(p => p.type === 'text')) {
      newContentParts.unshift({ type: 'text', text: editingContent.value });
    }
    
    // 序列化为 JSON
    const serializedContent = serializeMessageContent(newContentParts);
    
    await chatStore.updateMessage(props.message.id, {
      parts: serializedContent
    });
    isEditing.value = false;
  } catch (error) {
    console.error(t('chat.message.saveEditFailed'), error);
  } finally {
    isSaving.value = false;
  }
}

// ===== 引用相关 =====
function handleQuoteMessage() {
  if (props.message.isDeleted) return;

  const quotableParts = extractQuotableParts(props.message.parts);
  if (quotableParts.length === 0) return;

  chatStore.setQuote(quotableParts, props.message.id);
}

function handleShowQuoteDetail() {
  if (messageQuote.value) {
    showQuoteDetailModal.value = true;
  }
}

// 记录鼠标按下时的消息ID
function handleMouseDown(event: MouseEvent) {
  const target = event.target as HTMLElement;
  const messageEl = target.closest('[data-message-id]');
  mousedownMessageId = messageEl?.getAttribute('data-message-id') || null;
}

// 处理文本选择
function handleTextSelection(event: MouseEvent) {
  // 延迟执行，确保选择完成
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    
    if (text && text.length > 0) {
      // 获取鼠标松开时的消息ID
      const target = event.target as HTMLElement;
      const messageEl = target.closest('[data-message-id]');
      const mouseupMessageId = messageEl?.getAttribute('data-message-id') || null;
      
      // 只有在同一消息内才显示引用按钮
      if (mousedownMessageId === mouseupMessageId && mousedownMessageId) {
        selectedText.value = text;
        
        // 获取选区的位置
        const range = selection?.getRangeAt(0);
        
        // 使用 getClientRects() 获取实际文本行的位置（避免包含 padding 等空白区域）
        const rects = range?.getClientRects();
        
        if (rects && rects.length > 0) {
          // 取第一行的位置（浮层显示在第一行上方）
          const firstRect = rects[0];
          selectionToolbarPosition.value = {
            top: firstRect.top + window.scrollY - 145,
            left: firstRect.left + firstRect.width / 2
          };
          showSelectionToolbar.value = true;
        }
      } else {
        // 跨消息选择，不显示引用按钮
        showSelectionToolbar.value = false;
      }
    }
    
    // 重置
    mousedownMessageId = null;
  }, 10);
}

// 点击引用选中的文本
function handleQuoteSelection() {
  if (selectedText.value) {
    // 构造文本类型的引用内容
    const quoteContent = [{ type: 'text', text: selectedText.value }] as MessageContentPart[];
    chatStore.setQuote(quoteContent, props.message.id);
    showSelectionToolbar.value = false;
    selectedText.value = '';
    // 清除选区
    window.getSelection()?.removeAllRanges();
  }
}

// 处理 Block 组件的文本选择事件
function handleBlockTextSelection(text: string, position: { top: number; left: number }) {
  selectedText.value = text;
  selectionToolbarPosition.value = {
    top: position.top + window.scrollY,
    left: position.left
  };
  showSelectionToolbar.value = true;
}

// 点击外部隐藏浮层
onMounted(() => {
  const hideToolbar = (e: MouseEvent) => {
    // 如果点击的不是浮层本身，隐藏浮层
    const target = e.target as HTMLElement;
    if (!target.closest('.fixed.z-9999')) {
      showSelectionToolbar.value = false;
      selectedText.value = '';
    }
  };

  // selectionchange 兜底：选区被清空时（如点击选中文本本身）隐藏浮层
  const handleSelectionChange = () => {
    if (!showSelectionToolbar.value) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      showSelectionToolbar.value = false;
      selectedText.value = '';
    }
  };

  // 消息列表滚动时隐藏浮层（不清除选区）
  const handleMessageListScroll = () => {
    showSelectionToolbar.value = false;
  };
  
  // 监听编辑事件（由 TurnGroup 触发）
  const handleStartEdit = (messageId: string) => {
    if (messageId === props.message.id) {
      handleStartEditInternal();
    }
  };
  
  document.addEventListener('mousedown', hideToolbar);
  document.addEventListener('selectionchange', handleSelectionChange);
  // 事件类型未在类型中声明，这里使用 any 规避 TS 检查
  (emitter as any).on('chat:message-list-scroll', handleMessageListScroll);
  (emitter as any).on('message:start-edit', handleStartEdit);
  
  onUnmounted(() => {
    document.removeEventListener('mousedown', hideToolbar);
    document.removeEventListener('selectionchange', handleSelectionChange);
    (emitter as any).off('chat:message-list-scroll', handleMessageListScroll);
    (emitter as any).off('message:start-edit', handleStartEdit);
  });
});
</script>
