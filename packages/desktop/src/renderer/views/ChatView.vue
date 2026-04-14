<template>
  <div class="h-full flex gap-0">
    <!-- 项目分类面板 -->
    <div class="shrink-0 h-full">
      <ProjectPanel />
    </div>

    <!-- 会话列表 -->
    <div class="shrink-0 h-full">
      <SessionList />
    </div>

    <!-- 聊天区域 -->
    <div class="flex-1 min-w-0 ml-[6px] flex gap-0 overflow-x-auto">
      <section 
        class="flex-1 min-w-[550px] h-full bg-default rounded-l-xl overflow-hidden flex flex-col relative"
        :class="{
          'justify-center': shouldShowCenterView,
          'rounded-r-xl': !showTocSidebar && !showNoteSidebar
        }"
      >
        <!-- 顶部区域：只在有普通会话时显示（不包括新会话和临时会话的初始状态） -->
        <div v-if="shouldShowTopBar" class="h-14 border-b border-default bg-default flex items-center justify-between px-4">
          <div class="group px-2.5 py-1.5 rounded-md text-sm text-default flex items-center gap-1.5 min-w-0 hover:bg-elevated transition-colors">
            <div
              role="button"
              tabindex="0"
              class="max-w-[220px] min-w-0 cursor-pointer select-none"
              @click="openScenarioEdit"
              @keydown.enter.prevent="openScenarioEdit"
              @keydown.space.prevent="openScenarioEdit"
            >
              <span class="truncate">{{ currentScenarioName }}</span>
            </div>

            <div class="opacity-0 group-hover:opacity-100 transition-opacity">
              <UDropdownMenu :items="scenarioQuickMenuItems" size="md">
                <UButton
                  icon="i-lucide-more-horizontal"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  square
                  @click.stop
                />
              </UDropdownMenu>
            </div>
          </div>

          <!-- 会话主体信息（两行）：分类 + 标题 -->
          <div class="absolute left-1/2 -translate-x-1/2 min-w-0 max-w-[460px] flex flex-col items-center gap-0.5 px-2">
            <div class="flex items-center gap-1 text-xs text-muted max-w-full min-w-0 mt-0.5">
              <UIcon :name="currentCategoryIcon" class="w-3.5 h-3.5 shrink-0" :style="{ color: currentCategoryColor }" />
              <span class="truncate">{{ currentCategoryName }}</span>
            </div>

            <div class="max-w-full min-w-0 flex items-center justify-center">
              <template v-if="chatStore.isTemporarySession">
                <div class="flex items-center gap-1.5">
                  <UIcon name="i-lucide-message-circle-dashed" class="w-4 h-4" />
                  <span class="text-sm text-default font-medium select-none">{{ t("chat.sessionList.tempSession") }}</span>
                </div>
              </template>

	              <template v-else>
	                <UInput
	                  v-if="isEditingTitle"
	                  v-model="editingTitle"
	                  variant="none"
                  ref="editInputRef"
                  size="md"
                  class="w-[320px]"
                  :ui="{
                    base: 'px-2 py-0.5 text-center'
                  }"
                  @blur="handleSaveTitle"
	                  @keydown.enter="handleSaveTitle"
	                  @keydown.esc="handleCancelEdit"
	                />

	                <div v-else class="group/title flex items-center gap-1 rounded-md px-1">
	                  <UTooltip :disabled="!shouldShowTitleTooltip" :text="currentSessionTitle">
	                    <span
	                      ref="titleRef"
	                      class="text-sm text-default font-medium max-w-[300px] truncate"
	                    >
	                      {{ currentSessionTitle }}
	                    </span>
	                  </UTooltip>
	
	                  <div class="opacity-0 group-hover/title:opacity-100 has-[[data-state=open]]:opacity-100 transition-opacity">
	                    <UDropdownMenu :items="titleMenuItems" size="md">
	                      <UButton
	                        icon="i-lucide-more-horizontal"
	                        variant="ghost"
	                        color="neutral"
	                        size="xs"
	                        square
	                        @click.stop
	                      />
	                    </UDropdownMenu>
	                  </div>
	                </div>
	              </template>
	            </div>
	          </div>
          <!-- 会话操作 -->
          <div class="flex items-center gap-0.5">
            <!-- 分支标签：临时会话不显示 -->
            <UButton
              v-if="!chatStore.isTemporarySession && branchTagText"
              :color="isMainSession ? 'success' : 'info'"
              variant="soft"
              size="sm"
              :icon="isMainSession ? 'i-lucide-home' : 'i-lucide-git-branch'"
              class="rounded-full"
              @click="showBranchManager = true"
            >
              {{ branchTagText }}
            </UButton>
            
            <UTooltip :text="t('chat.view.sessionNote')" :kbds="['meta', 'J']">
              <UChip
                :show="!!sessionNoteData"
                color="success"
                size="sm"
                inset
                :ui="{
                  base: 'right-0.5 top-0.5'
                }"
              >
                <UButton
                  icon="i-lucide-notebook-pen"
                  variant="ghost"
                  color="neutral"
                  size="md"
                  square
                  @click="toggleNoteSidebar"
                />
              </UChip>
            </UTooltip>
            
            <UTooltip
              v-if="!chatStore.isTemporarySession && chatStore.currentSessionId && !isCurrentSessionArchived"
              :text="t('chat.sessionList.menu.complete')"
            >
              <UButton
                icon="i-lucide-check"
                variant="ghost"
                color="neutral"
                size="md"
                square
                @click="handleToggleArchive"
              />
            </UTooltip>

            <UTooltip
              v-if="!chatStore.isTemporarySession && chatStore.currentSessionId"
              :text="t('chat.view.searchCurrentSession')"
            >
              <UButton
                icon="i-lucide-search"
                variant="ghost"
                color="neutral"
                size="md"
                square
                @click="openCurrentSessionSearch"
              />
            </UTooltip>

            <UDropdownMenu
              :items="sessionOperationMenuItems"
              size="md"
            >
              <template #project-category-leading="{ item, active, ui }">
                <UIcon
                  v-if="item.icon"
                  :name="item.icon"
                  :class="ui.itemLeadingIcon({ class: item.ui?.itemLeadingIcon, color: item?.color, active })"
                  :style="item.projectColor ? { color: item.projectColor } : undefined"
                />
              </template>
              <UButton
                icon="i-lucide-more-horizontal"
                variant="ghost"
                color="neutral"
                size="md"
                square
              />
            </UDropdownMenu>
          </div>
        </div>

        <!-- 新建会话的中心视图：新会话或临时会话的初始状态 -->
        <NewSession v-if="shouldShowCenterView" />
        
        <!-- 有会话时的正常视图 -->
        <template v-else>
          <!-- 消息列表 -->
          <MessageList ref="messageListRef" />
          
          <!-- 导航按钮 -->
          <ChatNavigationButtons v-model:toc-open="showTocSidebar" />
        </template>

        <!-- 输入区域 -->
        <template v-if="isCurrentSessionArchived">
          <div class="shrink-0 min-h-[160px] py-2 flex flex-col items-center justify-center bg-default">
            <span class="text-sm text-muted mb-5">{{ t("chat.view.archivedHint") }}</span>
            <UButton
              size="md"
              icon="i-lucide-rotate-ccw"
              @click="handleResumeSession"
            >
              {{ t("chat.sessionList.menu.resume") }}
            </UButton>
          </div>
        </template>
        <ChatInput v-else @send="handleSend" />
        
        <!-- 临时问浮层 -->
        <TempAskOverlay />

        <PageFindBar
          v-if="isChatDetailRoute"
          ref="pageFindRef"
          v-model:open="pageFindOpen"
          :get-search-root="getPageFindRoot"
        />
      </section>
      
      <!-- 侧边栏区域（TOC / 会话笔记互斥） -->
      <div 
        v-if="!shouldShowCenterView"
        ref="sidebarRef"
        class="relative shrink-0 h-full overflow-visible"
      >
        <div class="h-full overflow-hidden">
          <ChatTocSidebar 
            v-show="showTocSidebar"
            @close="showTocSidebar = false"
          />
          <div v-if="showNoteSidebar" class="h-full w-full bg-default rounded-r-xl flex flex-col overflow-hidden border-l border-default">
            <div class="h-14 flex items-center justify-between px-4 py-3 border-b border-default shrink-0">
              <div
                v-if="sessionNoteData"
                class="flex items-center gap-1.5 font-medium group/note px-2.5 py-0.5 rounded-md max-w-[280px]"
                :class="{ 'hover:bg-elevated transition-colors': !isEditingNoteTitle }"
              >
                <UInput
                  v-if="isEditingNoteTitle"
                  ref="noteTitleInputRef"
                  v-model="sessionNoteTitle"
                  variant="none"
                  size="md"
                  class="w-[280px]"
                  :ui="{ base: 'px-0 py-0 rounded-none' }"
                  @blur="handleSaveNoteTitle"
                  @keydown.enter.prevent="handleSaveNoteTitle"
                  @keydown.esc.prevent="isEditingNoteTitle = false"
                />
                <template v-else>
                  <span class="text-sm text-default truncate">
                    {{ sessionNoteTitle || t("chat.view.sessionNote") }}
                  </span>
                  <div class="opacity-0 group-hover/note:opacity-100 transition-opacity">
                    <UTooltip :text="t('notes.detail.editTitle')">
                      <UButton
                        icon="i-lucide-pencil"
                        variant="ghost"
                        color="neutral"
                        size="sm"
                        square
                        @click.stop="startEditNoteTitle"
                      />
                    </UTooltip>
                  </div>
                </template>
              </div>
              <div v-else class="text-sm font-medium text-default">{{ t("chat.view.sessionNote") }}</div>
              <div class="flex items-center gap-1">
                <UTooltip v-if="sessionNoteData" :text="t('chat.notePreview.openInNotes')">
                  <UButton
                    icon="i-lucide-external-link"
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    square
                    @click="handleOpenInNotes"
                  />
                </UTooltip>
                <UButton
                  icon="i-lucide-x"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  square
                  @click="showNoteSidebar = false"
                />
              </div>
            </div>
            <div class="flex-1 min-h-0 flex flex-col">
              <div v-if="isNoteLoading" class="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-muted">
                <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin" />
                <p class="text-sm">{{ t("chat.view.noteLoading") }}</p>
              </div>
              <div v-else-if="!sessionNoteData" class="flex-1 flex flex-col items-center justify-center gap-3 px-8">
                <p class="text-sm text-muted text-center leading-6 mb-2 whitespace-pre-line">{{ t("chat.view.noteEmptyHint") }}</p>
                <UButton
                  icon="i-lucide-notebook-pen"
                  :loading="isCreatingNote"
                  variant="soft"
                  color="neutral"
                  @click="handleCreateSessionNote"
                >
                  {{ t("chat.view.createSessionNote") }}
                </UButton>
              </div>
              <DocumentEditor
                v-else
                v-model="sessionNoteContent"
                :placeholder="t('chat.view.notePlaceholder')"
                :show-drag-handle="false"
                :show-image-toolbar="false"
                :show-selection-ai-toolbar="false"
                :ui="{ root: 'flex-1 min-h-0 flex flex-col overflow-hidden', content: 'flex-1 min-h-0 overflow-y-auto', base: 'p-4 sm:p-4' }"
              />
            </div>
          </div>
        </div>

        <PanelResizeHandle
          v-if="showTocSidebar || showNoteSidebar"
          side="left"
          variant="edge"
          :active="activeSidebarIsDragging"
          :value="activeSidebarResizableWidth"
          :min="activeSidebarMinWidth"
          :max="activeSidebarMaxWidth"
          :cursor="activeSidebarCursor"
          @resize-start="handleActiveSidebarResizeStart"
          @resize-by="resizeActiveSidebarBy"
          @reset="resetActiveSidebarWidth"
        />
      </div>
    </div>
  </div>

    <!-- 场景详情 Modal -->
    <UModal 
      v-model:open="showScenarioDetailModal" 
      :title="scenarioDetailModalTitle"
      :ui="{
        body: '!p-0 h-full overflow-hidden',
        overlay: 'z-[100]',
        content: 'max-w-2xl z-[110] h-[80vh]'
      }"
    >
      <template #body>
        <ScenarioDetail 
          v-if="scenarioDetailModalTargetId" 
          :scenario-id="scenarioDetailModalTargetId" 
          :initial-tab="scenarioDetailInitialTab"
        />
      </template>
    </UModal>

    <!-- 场景选择器 Modal -->
    <ScenarioSelectorModal
      v-model="showScenarioSelectorModal"
      :selected-scenario-id="chatStore.selectedScenarioId"
      :title="t('chat.view.replaceScenario')"
      @select="handleScenarioSelect"
    />

    <!-- 顶部快捷新建场景 -->
    <UModal
      v-model:open="showScenarioCreateModal"
      :title="t('settings.scenario.createTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField :label="t('settings.scenario.name')" required>
            <UInput
              v-model="scenarioCreateForm.name"
              :placeholder="t('settings.scenario.namePlaceholder')"
              autofocus
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('settings.scenario.description')">
            <UTextarea
              v-model="scenarioCreateForm.description"
              :placeholder="t('settings.scenario.descriptionPlaceholder')"
              :rows="3"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <UButton variant="outline" @click="showScenarioCreateModal = false">{{ t("common.cancel") }}</UButton>
        <UButton
          :disabled="!scenarioCreateForm.name.trim()"
          @click="handleCreateScenarioFromTop"
        >
          {{ t("common.confirm") }}
        </UButton>
      </template>
    </UModal>

    <!-- 分支管理 Modal -->
    <BranchManagerModal
      v-if="branchManagerRootId"
      v-model="showBranchManager"
      :root-session-id="branchManagerRootId"
      @open-session-overview="handleOpenSessionOverview"
    />

    <!-- 会话地图 Modal -->
    <SessionOverviewModal
      v-if="branchManagerRootId"
      v-model="showSessionOverview"
      :root-session-id="branchManagerRootId"
    />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useChatStore } from "@/stores/useChatStore";
import { useProjectStore } from "@/stores/useProjectStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import SessionList from "../components/chat/SessionList.vue";
import ProjectPanel from "../components/chat/ProjectPanel.vue";
import NewSession from "../components/chat/NewSession.vue";
import MessageList from "../components/chat/MessageList.vue";
import ChatInput from "../components/chat/ChatInput.vue";
import ChatNavigationButtons from "../components/chat/ChatNavigationButtons.vue";
import ChatTocSidebar from "../components/chat/ChatTocSidebar.vue";
import BranchManagerModal from "../components/chat/BranchManagerModal.vue";
import SessionOverviewModal from "../components/chat/SessionOverviewModal.vue";
import TempAskOverlay from "../components/chat/TempAskOverlay.vue";
import PanelResizeHandle from "../components/PanelResizeHandle.vue";
import PageFindBar from "../components/PageFindBar.vue";
import ScenarioDetail from "../components/ScenarioDetail.vue";
import ScenarioSelectorModal from "../components/ScenarioSelectorModal.vue";
import DocumentEditor from "../components/editor/DocumentEditor.vue";
import { loggerServiceRenderer, type MessageContentPart } from "@shared";
import emitter from "@/utils/emitter";
import { useTooltipOnTruncate } from "@/composables/useTooltipOnTruncate";
import { useMyToast } from "@/composables/useMyToast";
import { useSessionDelete } from "@/composables/useSessionDelete";
import { useConfirm } from "@/composables/useConfirm";
import { useResizableWidth } from "@/composables/useResizableWidth";
import { useMotion } from "@vueuse/motion";
import { useDebounceFn } from "@vueuse/core";
import { DEFAULT_COLOR } from "@/config/project-icon-config";

const logger = loggerServiceRenderer.withContext("ChatView");
const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const projectStore = useProjectStore();
const settingsStore = useSettingsStore();
const toast = useMyToast();
const { deleteSession } = useSessionDelete();
const { confirm } = useConfirm();
const { t } = useI18n();

// ===== 场景相关 =====
const showScenarioDetailModal = ref(false);
/** 从新建会话卡片「编辑」打开时指定场景，不改变当前选中场景 */
const scenarioDetailModalScenarioIdOverride = ref<string | null>(null);
const scenarioDetailInitialTab = ref<string | undefined>(undefined);

const scenarioDetailModalTargetId = computed(() => {
  return scenarioDetailModalScenarioIdOverride.value ?? chatStore.selectedScenarioId ?? null;
});

const scenarioDetailModalTitle = computed(() => {
  const id = scenarioDetailModalTargetId.value;
  if (!id) return t("chat.view.scenario.unselected");
  const scenario = settingsStore.scenarios.find((s) => s.id === id);
  return scenario?.name || t("chat.view.scenario.unselected");
});

watch(showScenarioDetailModal, (isOpen) => {
  if (!isOpen) {
    scenarioDetailModalScenarioIdOverride.value = null;
  }
});
const showScenarioSelectorModal = ref(false);
const showScenarioCreateModal = ref(false);
const scenarioCreateForm = ref({
  name: "",
  description: ""
});
const showBranchManager = ref(false);
const showSessionOverview = ref(false);
const showTocSidebar = ref(false);
const showNoteSidebar = ref(false);
const pageFindOpen = ref(false);
const sidebarRef = ref<HTMLElement>();
const noteTitleInputRef = ref<any>();
const pageFindRef = ref<{ openFromShortcut: () => void } | null>(null);
const messageListRef = ref<{ getSearchRootElement: () => HTMLElement | null } | null>(null);

const isChatDetailRoute = computed(() => route.name === "chat");

function getPageFindRoot() {
  return messageListRef.value?.getSearchRootElement() || null;
}

function openPageFindInChat() {
  if (!isChatDetailRoute.value) return;
  pageFindOpen.value = true;
  nextTick(() => {
    pageFindRef.value?.openFromShortcut();
  });
}

// 侧边栏按会话记忆（仅对有 sessionId 的会话生效）
const getTocSidebarKey = (sessionId: string) => `chat-toc-sidebar-${sessionId}`;
const getNoteSidebarKey = (sessionId: string) => `chat-note-sidebar-${sessionId}`;

const loadTocSidebarState = (sessionId: string | null) => {
  if (!sessionId) return false;
  return localStorage.getItem(getTocSidebarKey(sessionId)) === 'true';
};

const saveTocSidebarState = (sessionId: string | null, open: boolean) => {
  if (!sessionId) return;
  const key = getTocSidebarKey(sessionId);
  if (open) {
    localStorage.setItem(key, 'true');
  } else {
    localStorage.removeItem(key);
  }
};

const loadNoteSidebarState = (sessionId: string | null) => {
  if (!sessionId) return false;
  return localStorage.getItem(getNoteSidebarKey(sessionId)) === 'true';
};

const saveNoteSidebarState = (sessionId: string | null, open: boolean) => {
  if (!sessionId) return;
  const key = getNoteSidebarKey(sessionId);
  if (open) {
    localStorage.setItem(key, 'true');
  } else {
    localStorage.removeItem(key);
  }
};

// 会话笔记
const sessionNoteData = ref<{ id: string; title: string; contentMd: string } | null>(null);
const sessionNoteTitle = ref("");
const sessionNoteContent = ref("");
const isEditingNoteTitle = ref(false);
const isCreatingNote = ref(false);
const isNoteLoading = ref(false);

// 侧边栏动画
const TOC_SIDEBAR_WIDTH = 300;
const NOTE_SIDEBAR_WIDTH = 400;
const tocSidebarResize = useResizableWidth({
  storageKey: "chat-toc-sidebar-width",
  defaultWidth: TOC_SIDEBAR_WIDTH,
  minWidth: 240,
  maxWidth: 420,
  side: "left",
  step: 16
});
const noteSidebarResize = useResizableWidth({
  storageKey: "chat-note-sidebar-width",
  defaultWidth: NOTE_SIDEBAR_WIDTH,
  minWidth: 320,
  maxWidth: 560,
  side: "left",
  step: 16
});
const sidebarMotionInstance = useMotion(sidebarRef, {
  initial: { width: 0 },
  enter: {
    width: 0,
    transition: { type: 'spring', stiffness: 300, damping: 30 }
  }
});
const activeSidebarResize = computed(() => {
  return showNoteSidebar.value ? noteSidebarResize : tocSidebarResize;
});
const isSidebarDragging = computed(() => {
  return tocSidebarResize.isDragging.value || noteSidebarResize.isDragging.value;
});
const activeSidebarIsDragging = computed(() => activeSidebarResize.value.isDragging.value);
const activeSidebarResizableWidth = computed(() => activeSidebarResize.value.width.value);
const activeSidebarMinWidth = computed(() => activeSidebarResize.value.minWidth.value);
const activeSidebarMaxWidth = computed(() => activeSidebarResize.value.maxWidth.value);
const activeSidebarCursor = computed(() => activeSidebarResize.value.cursor.value);

function handleActiveSidebarResizeStart(event: PointerEvent) {
  activeSidebarResize.value.startResize(event);
}

function resizeActiveSidebarBy(direction: number) {
  activeSidebarResize.value.resizeBy(direction);
}

function resetActiveSidebarWidth() {
  activeSidebarResize.value.resetWidth();
}

const activeSidebarWidth = computed(() => {
  if (showNoteSidebar.value) return noteSidebarResize.width.value;
  if (showTocSidebar.value) return tocSidebarResize.width.value;
  return 0;
});

watch(activeSidebarWidth, (w) => {
  if (sidebarMotionInstance) {
    sidebarMotionInstance.apply({
      width: w,
      transition: isSidebarDragging.value
        ? { duration: 0 }
        : { type: 'spring', stiffness: 300, damping: 30 }
    });
  }
});

watch(showTocSidebar, (show) => {
  if (show) showNoteSidebar.value = false;
  const sid = chatStore.currentSessionId;
  if (sid) saveTocSidebarState(sid, show);
});

defineShortcuts({
  meta_l: {
    usingInput: true,
    handler: () => {
      showTocSidebar.value = !showTocSidebar.value;
    }
  },
  meta_j: {
    usingInput: true,
    handler: () => {
      showNoteSidebar.value = !showNoteSidebar.value;
    }
  },
  meta_f: {
    usingInput: true,
    handler: () => {
      openPageFindInChat();
    }
  }
});

watch(showNoteSidebar, (show) => {
  if (show) showTocSidebar.value = false;
  const sid = chatStore.currentSessionId;
  if (sid) saveNoteSidebarState(sid, show);
});

watch(
  () => route.name,
  (name) => {
    if (name !== "chat") {
      pageFindOpen.value = false;
    }
  }
);

watch(
  () => route.params.sessionId,
  () => {
    pageFindOpen.value = false;
  }
);

// 是否显示中心视图（新会话或临时会话初始状态）
const shouldShowCenterView = computed(() => {
  // 没有会话ID：新会话
  if (!chatStore.currentSessionId) return true;
  
  // 临时会话且没有消息：显示中心视图
  if (chatStore.isTemporarySession && chatStore.messages.length === 0) return true;
  
  return false;
});

// 是否显示顶部栏（有普通会话或有消息的临时会话）
const shouldShowTopBar = computed(() => {
  // 没有会话ID：不显示
  if (!chatStore.currentSessionId) return false;
  
  // 临时会话且没有消息：不显示
  if (chatStore.isTemporarySession && chatStore.messages.length === 0) return false;
  
  return true;
});

// 分支标签文本
const branchTagText = computed(() => {
  const session = chatStore.currentSession;
  if (!session) return null;
  
  // 判断是否是主会话（有分支）
  const isMain = !session.rootSessionId;
  if (isMain) {
    const branchCount = chatStore.currentBranches.length;
    if (branchCount === 0) return null; // 没有分支不显示
    return t('chat.view.branch.main', { count: branchCount });
  }
  
  // 是分支会话 - 按创建时间排序
  const rootId = session.rootSessionId;
  const allBranches = chatStore.sessions
    .filter(s => s.rootSessionId === rootId)
    .sort((a, b) => a.createdAt - b.createdAt);  // 按创建时间升序排序
  const currentIndex = allBranches.findIndex(s => s.id === session.id);
  return t('chat.view.branch.child', { index: currentIndex + 1, total: allBranches.length });
});

const isMainSession = computed(() => {
  return !chatStore.currentSession?.rootSessionId;
});

const isCurrentSessionArchived = computed(() => {
  return !!chatStore.currentSession?.isArchived;
});

const branchManagerRootId = computed(() => {
  const session = chatStore.currentSession;
  if (!session) return null;
  return session.rootSessionId || session.id;
});

const currentScenarioName = computed(() => {
  const scenario = chatStore.selectedScenario;
  return scenario?.name || t("chat.view.scenario.unselected");
});

const scenarioQuickMenuItems = computed(() => [[
  {
    label: t("chat.view.menu.replaceScenario"),
    icon: "i-lucide-repeat",
    onSelect: () => {
      showScenarioSelectorModal.value = true;
    }
  },
  {
    label: t("settings.scenario.create"),
    icon: "i-lucide-plus",
    onSelect: () => {
      openScenarioCreateModal();
    }
  }
]]);

function handleOpenSessionOverview() {
  showSessionOverview.value = true;
}

function openScenarioEdit() {
  scenarioDetailModalScenarioIdOverride.value = null;
  showScenarioDetailModal.value = true;
}

function openScenarioCreateModal() {
  scenarioCreateForm.value = { name: "", description: "" };
  showScenarioCreateModal.value = true;
}

async function handleCreateScenarioFromTop() {
  const name = scenarioCreateForm.value.name.trim();
  if (!name) return;

  try {
    const newScenario = await settingsStore.createScenario({
      name,
      description: scenarioCreateForm.value.description.trim() || undefined
    });

    chatStore.setScenario(newScenario.id);
    scenarioDetailModalScenarioIdOverride.value = null;
    showScenarioCreateModal.value = false;
    showScenarioDetailModal.value = true;
    emitter.emit('chat:focus-input');
    toast.success(t("settings.scenario.created"));
  } catch (error) {
    toast.error({
      title: t("settings.scenario.createFailed"),
      description: String(error)
    });
  }
}

// ===== 会话标题相关 =====
const isEditingTitle = ref(false);
const editingTitle = ref("");
const editInputRef = ref<any>(null);
const { elementRef: titleRef, shouldShowTooltip: shouldShowTitleTooltip, checkTruncation } = useTooltipOnTruncate();

const currentSessionTitle = computed(() => {
  const currentSession = chatStore.sessions.find(s => s.id === chatStore.currentSessionId);
  return currentSession?.title || t("chat.view.session.untitled");
});

const currentSessionMeta = computed(() => {
  if (!chatStore.currentSessionId) return null;
  return chatStore.sessions.find(s => s.id === chatStore.currentSessionId) || null;
});

const currentCategoryName = computed(() => {
  return getProjectDisplayName(currentSessionMeta.value?.projectId ?? null);
});

const currentCategoryIcon = computed(() => {
  return getProjectDisplayIcon(currentSessionMeta.value?.projectId ?? null);
});

const currentCategoryColor = computed(() => {
  return getProjectDisplayColor(currentSessionMeta.value?.projectId ?? null);
});

function getProjectDisplayName(projectId: string | null) {
  if (!projectId) return t('chat.sessionList.category.uncategorized');
  return projectStore.projects.find(project => project.id === projectId)?.name || t('chat.sessionList.category.uncategorized');
}

function getProjectDisplayIcon(projectId: string | null) {
  if (!projectId) return 'i-lucide-folder-dot';
  return projectStore.projects.find(project => project.id === projectId)?.icon || 'i-lucide-folder';
}

function getProjectDisplayColor(projectId: string | null) {
  if (!projectId) return DEFAULT_COLOR;
  return projectStore.projects.find(project => project.id === projectId)?.color || DEFAULT_COLOR;
}

const moveCategoryMenuItems = computed(() => {
  if (!chatStore.currentSessionId || chatStore.isTemporarySession) return [];

  const currentProjectId = currentSessionMeta.value?.projectId ?? null;
  const targets = [
    { id: null as string | null, label: t('chat.sessionList.category.uncategorized'), icon: 'i-lucide-folder-dot', color: DEFAULT_COLOR },
    ...projectStore.projects.map(project => ({
      id: project.id,
      label: project.name,
      icon: project.icon || 'i-lucide-folder',
      color: project.color || DEFAULT_COLOR
    }))
  ];

  return targets.map(target => ({
    label: target.label,
    icon: target.icon,
    slot: 'project-category',
    projectColor: target.color,
    type: "checkbox" as const,
    checked: target.id === currentProjectId,
    onUpdateChecked: (checked: boolean) => {
      if (!checked) return;
      handleMoveCurrentSession(target.id);
    }
  }));
});

async function handleMoveCurrentSession(targetProjectId: string | null) {
  if (!chatStore.currentSessionId || chatStore.isTemporarySession) return;

  const currentProjectId = currentSessionMeta.value?.projectId ?? null;
  if (currentProjectId === targetProjectId) return;

  try {
    const movedCount = await chatStore.moveSessionToProject(chatStore.currentSessionId, targetProjectId);
    const targetLabel = getProjectDisplayName(targetProjectId);
    if (movedCount > 1) {
      toast.success(t('chat.sessionList.toast.movedMany', { count: movedCount, target: targetLabel }));
    } else {
      toast.success(t('chat.sessionList.toast.movedOne', { target: targetLabel }));
    }
  } catch (error) {
    toast.error({
      title: t('chat.sessionList.toast.moveFailed'),
      description: String(error)
    });
  }
}

const titleMenuItems = computed(() => [[
  {
    label: t("chat.sessionList.menu.editTitle"),
    icon: "i-lucide-pencil",
    onSelect: () => {
      handleEditTitle();
    }
  },
  {
    label: t("chat.sessionList.menu.generateTitle"),
    icon: "i-lucide-sparkles",
    onSelect: () => {
      handleRegenerateTitle();
    }
  }
]]);

function handleEditTitle() {
  if (!chatStore.currentSessionId) return;
  
  const currentSession = chatStore.sessions.find(s => s.id === chatStore.currentSessionId);
  if (!currentSession) return;
  
  isEditingTitle.value = true;
  editingTitle.value = currentSession.title;
  
  nextTick(() => {
    if (editInputRef.value) {
      const inputElement = editInputRef.value.inputRef as HTMLInputElement;
      if (inputElement) {
        inputElement.select();
      }
    }
  });
}

async function handleSaveTitle() {
  if (!chatStore.currentSessionId) {
    isEditingTitle.value = false;
    return;
  }
  
  const trimmed = editingTitle.value.trim();
  
  // 如果标题为空，直接退出编辑（恢复原标题）
  if (!trimmed) {
    isEditingTitle.value = false;
    return;
  }
  
  const currentSession = chatStore.sessions.find(s => s.id === chatStore.currentSessionId);
  if (!currentSession) {
    isEditingTitle.value = false;
    return;
  }
  
  // 标题没变化，直接退出编辑
  if (trimmed === currentSession.title) {
    isEditingTitle.value = false;
    return;
  }
  
  try {
    await chatStore.updateSessionTitle(chatStore.currentSessionId, trimmed);
    toast.success(t('chat.sessionList.toast.titleUpdated'));
  } catch (error) {
    toast.error({
      title: t('chat.sessionList.toast.updateFailed'),
      description: String(error)
    });
  } finally {
    isEditingTitle.value = false;
    nextTick(() => {
      checkTruncation();
    });
  }
}

function handleCancelEdit() {
  isEditingTitle.value = false;
  editingTitle.value = "";
}

async function handleRegenerateTitle() {
  if (!chatStore.currentSessionId) return;
  
  try {
    const messages = await window.ipc('messages:getDisplayMessages', { 
      sessionId: chatStore.currentSessionId 
    });
    
    // 判断是否是分支会话
    const currentSession = chatStore.sessions.find(s => s.id === chatStore.currentSessionId);
    const isBranch = currentSession?.rootSessionId !== undefined;
    
    let userMessages;
    if (isBranch) {
      // 分支会话：优先取分叉后的独有消息
      const uniqueUserMessages = messages
        .filter(m => m.role === 'user' && !m.isShared)
        .slice(0, 3);
      
      if (uniqueUserMessages.length > 0) {
        // 有独有消息，使用独有消息
        userMessages = uniqueUserMessages;
      } else {
        // 兜底：没有独有消息（刚创建分支还没发消息），使用所有消息
        userMessages = messages
          .filter(m => m.role === 'user')
          .slice(0, 3);
      }
    } else {
      // 主会话：取前 3 条 user 消息
      userMessages = messages
        .filter(m => m.role === 'user')
        .slice(0, 3);
    }
    
    if (userMessages.length === 0) {
      toast.error({
        title: t('chat.sessionList.toast.cannotGenerateTitle'),
        description: t('chat.sessionList.toast.noUserMessages')
      });
      return;
    }
    
    const parts = userMessages.flatMap((m, index) => {
      const parts = Array.isArray(m.parts) ? m.parts : [];
      return index > 0 ? [{ type: 'text', text: '\n' }, ...parts] : parts;
    });
    if (parts.length === 0) {
      toast.error({
        title: t('chat.sessionList.toast.cannotGenerateTitle'),
        description: t('chat.sessionList.toast.noUsableMessages')
      });
      return;
    }

    const result = await window.ipc('sessions:generateTitle', { parts });
    
    if (result?.ok && result?.title) {
      await chatStore.updateSessionTitle(chatStore.currentSessionId, result.title.trim());
      toast.success(t('chat.sessionList.toast.titleUpdated'));
      nextTick(() => {
        checkTruncation();
      });
    } else {
      toast.error({
        title: t('chat.sessionList.toast.generateFailed'),
        description: result?.error || t('chat.sessionList.toast.invalidGeneratedTitle')
      });
    }
  } catch (error) {
    toast.error({
      title: t('chat.sessionList.toast.generateFailed'),
      description: String(error)
    });
  }
}

// 监听标题变化，重新检测截断状态
watch(() => currentSessionTitle.value, () => {
  if (!isEditingTitle.value) {
    nextTick(() => {
      checkTruncation();
    });
  }
});

// ===== 会话操作相关 =====
const sessionOperationMenuItems = computed(() => {
  const hasSession = !chatStore.isTemporarySession && chatStore.currentSessionId
  const currentSession = chatStore.currentSession
  const isFavorite = !!currentSession?.isFavorite

  const mainGroup = hasSession
    ? [
        {
          label: t("chat.sessionList.menu.moveToCategory"),
          icon: "i-lucide-folder-input",
          children: moveCategoryMenuItems.value
        },
        {
          label: t("chat.view.menu.sessionMap"),
          icon: "i-lucide-milestone",
          onSelect: () => {
            handleOpenSessionOverview();
          }
        },
        {
          label: isFavorite ? t("chat.sessionList.menu.unfavorite") : t("chat.sessionList.menu.favorite"),
          icon: isFavorite ? "i-lucide-star-off" : "i-lucide-star",
          onSelect: () => {
            handleToggleFavorite();
          }
        }
      ]
    : []

  const deleteGroup = [
    {
      label: t("chat.sessionList.menu.delete"),
      icon: "i-lucide-trash-2",
      color: "error",
      onSelect: () => {
        handleDeleteSession();
      }
    }
  ]

  return mainGroup.length > 0 ? [mainGroup, deleteGroup] : [deleteGroup]
});

async function handleToggleFavorite() {
  if (!chatStore.currentSessionId) return;
  const session = chatStore.currentSession;
  if (!session) return;
  const next = !session.isFavorite;
  await chatStore.updateSessionFavorite(chatStore.currentSessionId, next);
  toast.success(next ? t('chat.sessionList.toast.favorited') : t('chat.sessionList.toast.unfavorited'));
}

async function handleToggleArchive() {
  if (!chatStore.currentSessionId) return;
  const session = chatStore.currentSession;
  if (!session) return;
  const next = !session.isArchived;
  await chatStore.updateSessionArchive(chatStore.currentSessionId, next);
  toast.success(next ? t('chat.sessionList.toast.completed') : t('chat.sessionList.toast.resumed'));
}

function openCurrentSessionSearch() {
  if (!chatStore.currentSessionId || chatStore.isTemporarySession) return;

  emitter.emit('global-search:open', {
    scope: 'messages',
    onlyCurrentSession: true,
    messageTimeRange: 'all'
  });
}

async function handleResumeSession() {
  if (!chatStore.currentSessionId) return;
  await chatStore.updateSessionArchive(chatStore.currentSessionId, false);
  toast.success(t('chat.sessionList.toast.resumed'));
  await nextTick();
  emitter.emit('chat:focus-input');
}

async function handleDeleteSession() {
  if (!chatStore.currentSessionId) return;
  
  // 临时会话：使用特殊的确认提示
  if (chatStore.isTemporarySession) {
    const confirmed = await confirm({
      title: t('chat.view.confirmDeleteTempTitle'),
      content: t('chat.view.confirmDeleteTempContent'),
      confirmText: t('chat.sessionList.menu.delete'),
      cancelText: t('notes.modal.cancel'),
      confirmColor: 'error',
      confirmIcon: 'i-lucide-trash-2'
    });
    
    if (confirmed) {
      const sid = chatStore.currentSessionId
      if (sid) {
        await chatStore.deleteSession(sid)
      }
      chatStore.createNewSession();
    }
    return;
  }
  
  // 普通会话：使用标准删除流程（带确认）
  await deleteSession(chatStore.currentSessionId);
}

const handleScenarioSelect = async (scenarioId: string) => {
  chatStore.setScenario(scenarioId);
  emitter.emit('chat:focus-input');
};

// ===== 会话笔记 =====
function toggleNoteSidebar() {
  showNoteSidebar.value = !showNoteSidebar.value;
}

async function handleCreateSessionNote() {
  const sessionId = chatStore.currentSessionId;
  if (!sessionId || isCreatingNote.value) return;
  isCreatingNote.value = true;
  try {
    const note = await window.ipc("sessions:createLinkedNote", { sessionId });
    if (note) {
      sessionNoteData.value = note;
      sessionNoteTitle.value = note.title;
      sessionNoteContent.value = note.contentMd;
      const session = chatStore.currentSession;
      if (session) session.linkedNoteId = note.id;
    }
  } catch (error) {
    toast.error({ title: t("chat.view.toast.createNoteFailed"), description: String(error) });
  } finally {
    isCreatingNote.value = false;
  }
}

async function loadSessionNote() {
  const sessionId = chatStore.currentSessionId;
  if (!sessionId) {
    sessionNoteData.value = null;
    isNoteLoading.value = false;
    return;
  }
  isNoteLoading.value = true;
  const loadingForSessionId = sessionId;
  try {
    const note = await window.ipc("sessions:getLinkedNote", { sessionId });
    if (chatStore.currentSessionId !== loadingForSessionId) return;
    if (note) {
      sessionNoteData.value = note;
      sessionNoteTitle.value = note.title;
      sessionNoteContent.value = note.contentMd;
    } else {
      sessionNoteData.value = null;
      sessionNoteTitle.value = "";
      sessionNoteContent.value = "";
    }
  } catch {
    if (chatStore.currentSessionId !== loadingForSessionId) return;
    sessionNoteData.value = null;
  } finally {
    if (chatStore.currentSessionId === loadingForSessionId) {
      isNoteLoading.value = false;
    }
  }
}

const saveNoteContentDebounced = useDebounceFn(async () => {
  const note = sessionNoteData.value;
  if (!note) return;
  try {
    await window.ipc("notes:update", {
      id: note.id,
      updates: { contentMd: sessionNoteContent.value }
    });
  } catch {
    // silent
  }
}, 500);

watch(sessionNoteContent, (val) => {
  if (sessionNoteData.value && val !== sessionNoteData.value.contentMd) {
    saveNoteContentDebounced();
  }
});

function startEditNoteTitle() {
  isEditingNoteTitle.value = true;
  nextTick(() => {
    const inputEl = noteTitleInputRef.value?.inputRef as HTMLInputElement | undefined;
    if (inputEl) {
      inputEl.focus();
      inputEl.select();
    }
  });
}

async function handleSaveNoteTitle() {
  isEditingNoteTitle.value = false;
  const note = sessionNoteData.value;
  if (!note) return;
  const newTitle = sessionNoteTitle.value.trim();
  if (!newTitle || newTitle === note.title) {
    sessionNoteTitle.value = note.title;
    return;
  }
  try {
    await window.ipc("notes:update", {
      id: note.id,
      updates: { title: newTitle }
    });
    note.title = newTitle;
  } catch {
    sessionNoteTitle.value = note.title;
  }
}

function handleOpenInNotes() {
  const note = sessionNoteData.value;
  if (!note) return;
  router.push({ name: "notes-detail", params: { noteId: note.id } });
}

async function handleAppendToNote(content: string) {
  const sessionId = chatStore.currentSessionId;
  if (!sessionId) return;

  if (!sessionNoteData.value) {
    isCreatingNote.value = true;
    try {
      const note = await window.ipc("sessions:createLinkedNote", { sessionId });
      if (note) {
        sessionNoteData.value = note;
        sessionNoteTitle.value = note.title;
        sessionNoteContent.value = note.contentMd;
        const session = chatStore.currentSession;
        if (session) session.linkedNoteId = note.id;
      }
    } catch (error) {
      toast.error({ title: t("chat.view.toast.createNoteFailed"), description: String(error) });
      return;
    } finally {
      isCreatingNote.value = false;
    }
  }

  const separator = sessionNoteContent.value.trim() ? "\n\n---\n\n" : "";
  sessionNoteContent.value = sessionNoteContent.value + separator + content;
  showNoteSidebar.value = true;
  toast.success({ title: t("chat.view.toast.appendedToNote") });
}

watch(() => chatStore.currentSessionId, (newId) => {
  loadSessionNote();
  if (newId) {
    showNoteSidebar.value = loadNoteSidebarState(newId);
    showTocSidebar.value = loadTocSidebarState(newId);
  } else {
    showNoteSidebar.value = false;
    showTocSidebar.value = false;
  }
}, { immediate: false });

// 编辑系统提示词
function handleEditPrompt() {
  scenarioDetailModalScenarioIdOverride.value = null;
  scenarioDetailInitialTab.value = 'prompt';
  showScenarioDetailModal.value = true;
  // 当Modal关闭时重置初始tab
  watch(showScenarioDetailModal, (isOpen) => {
    if (!isOpen) {
      scenarioDetailInitialTab.value = undefined;
    }
  }, { once: true });
}

function handleScenarioOpenDetail(scenarioId: string) {
  scenarioDetailModalScenarioIdOverride.value = scenarioId;
  scenarioDetailInitialTab.value = undefined;
  showScenarioDetailModal.value = true;
}

// ===== 消息管理 =====
async function handleSend(payload: { parts: MessageContentPart[]; manualSkillId?: string | null }) {
  if (payload.parts.length === 0 || chatStore.isBusy) {
    return;
  }

  await chatStore.sendMessage(payload.parts, payload.manualSkillId);
  emitter.emit('chat:scroll-to-bottom');
}

// ===== 流式事件监听 =====
let unsubscribeStream: null | (() => void) = null;
let unsubscribeTemporarySessionDeleted: null | (() => void) = null;

// ===== 路由同步 =====
// 监听路由变化，同步到 store
// 同时监听 name 和 sessionId，确保会话之间也能正常切换
watch(() => [route.name, route.params.sessionId] as const, async ([routeName, sessionId]) => {
  if (routeName === 'chat-new') {
    // 新会话
    if (chatStore.currentSessionId !== null || chatStore.isTemporarySession) {
      logger.info("route changed: switching to new session");
      chatStore.createNewSession();
    }
  } else if (routeName === 'chat-temp') {
    logger.info("route changed: creating temporary session");
    await chatStore.createTemporarySession();
  } else if (routeName === 'chat' && sessionId) {
    // 普通会话
    if (chatStore.currentSessionId !== sessionId) {
      logger.info("route changed: switching to session", { sessionId });
      await chatStore.switchSession(sessionId as string);
    }
  }
}, { immediate: false });

// 监听 store 的变化，同步到路由
watch(() => [chatStore.currentSessionId, chatStore.isTemporarySession] as const, ([sessionId]) => {
  const routeName = route.name as string;

  if (!sessionId) {
    // 新会话
    if (routeName !== 'chat-new') {
      logger.info("store changed: navigating to /chat");
      router.replace({ name: "chat-new" });
    }
  } else {
    // 普通会话
    if (routeName !== 'chat' || route.params.sessionId !== sessionId) {
      logger.info("store changed: navigating to /chat/:sessionId", { sessionId });
      router.replace({ name: "chat", params: { sessionId } });
    }
  }
});

onMounted(async () => {
  try {
    await chatStore.init();
    
    // 初始化时，根据路由设置当前状态
    const routeName = route.name as string;
    const sessionId = route.params.sessionId as string | undefined;
    
    if (routeName === 'chat-new') {
      logger.info("onMounted: initializing with new session state");
      if (chatStore.currentSessionId) {
        chatStore.createNewSession();
      }
    } else if (routeName === 'chat-temp') {
      logger.info("onMounted: creating temporary session from route");
      await chatStore.createTemporarySession();
    } else if (routeName === 'chat' && sessionId) {
      logger.info("onMounted: initializing with session from route", { sessionId });
      await chatStore.switchSession(sessionId);
    }
  } catch (error) {
    logger.error("onMounted init failed", { error });
  }

  unsubscribeStream = window.chat.onStream((evt) => {
    chatStore.handleStreamChunk(evt);
    emitter.emit('chat:scroll-to-bottom-if-needed');
  });
  unsubscribeTemporarySessionDeleted = window.chat.onTemporarySessionsDeleted((evt) => {
    if (!evt?.sessionIds?.length) return;
    const currentId = chatStore.currentSessionId;
    if (!currentId) return;
    if (!evt.sessionIds.includes(currentId)) return;
    toast.warn(t('chat.view.toast.tempSessionExpired'));
    chatStore.createNewSession();
  });

  // 监听编辑系统提示词事件
  emitter.on('scenario:edit-prompt', handleEditPrompt);
  emitter.on('scenario:open-detail', handleScenarioOpenDetail);
  emitter.on('scenario:open-create-modal', openScenarioCreateModal);
  emitter.on('session:append-to-note', handleAppendToNote);

  loadSessionNote();
});

onUnmounted(() => {
  unsubscribeStream?.();
  unsubscribeStream = null;
  unsubscribeTemporarySessionDeleted?.();
  unsubscribeTemporarySessionDeleted = null;
  emitter.off('scenario:edit-prompt', handleEditPrompt);
  emitter.off('scenario:open-detail', handleScenarioOpenDetail);
  emitter.off('scenario:open-create-modal', openScenarioCreateModal);
  emitter.off('session:append-to-note', handleAppendToNote);
});

// ===== 自动聚焦输入框 =====
// 当切换会话时自动聚焦
watch(() => chatStore.currentSessionId, () => {
  emitter.emit('chat:focus-input')
})

// 当切换模型时自动聚焦
watch(() => chatStore.selectedModel, () => {
  emitter.emit('chat:focus-input')
})
</script>

<style>
</style>
