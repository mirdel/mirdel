<template>
  <UModal
    v-model:open="isOpen"
    :close="false"
    :ui="{
      content: 'w-[1080px] max-w-[calc(100vw-2rem)] h-[760px] max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden',
      header: 'border-b-0 pl-5 !pr-3 pt-5 pb-3',
      body: 'flex-1 min-h-0 !p-0 bg-muted',
      footer: 'px-4 py-3 bg-muted justify-end'
    }"
  >
    <template #header>
      <div class="flex flex-col w-full gap-4">
        <div class="flex w-full items-center gap-3">
          <div class="min-w-0 flex-1">
            <UInput
              ref="inputRef"
              v-model="query"
              type="text"
              :placeholder="t('globalSearch.inputPlaceholder')"
              icon="i-lucide-search"
              size="xl"
              class="w-full"
              :ui="{ trailing: 'pr-2' }"
              spellcheck="false"
            >
              <template v-if="query" #trailing>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  @click="clearQuery"
                >
                  {{ t('globalSearch.clear') }}
                </UButton>
              </template>
            </UInput>
          </div>

          <UTooltip :text="t('globalSearch.close')">
            <UButton
              color="neutral"
              variant="ghost"
              size="lg"
              icon="i-lucide-x"
              @click="closeModal"
            />
          </UTooltip>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <UButton
              v-for="item in tabs"
              :key="item.value"
              color="neutral"
              size="md"
              class="rounded-full"
              :variant="activeTab === item.value ? 'solid' : 'soft'"
              @click="activeTab = item.value"
            >
              {{ item.label }}
            </UButton>
          </div>

          <div v-if="showMessageFilters" class="ml-auto flex shrink-0 items-center gap-3">
            <span class="text-xs text-toned">{{ t('globalSearch.filter') }}</span>
            <UTooltip :text="currentSessionId ? t('globalSearch.currentSessionAvailable') : t('globalSearch.currentSessionUnavailable')">
              <UButton
                color="neutral"
                size="md"
                class="rounded-full"
                :disabled="!currentSessionId"
                :variant="onlyCurrentSession ? 'solid' : 'outline'"
                @click="onlyCurrentSession = !onlyCurrentSession"
              >
                {{ t('globalSearch.currentSession') }}
              </UButton>
            </UTooltip>
            <USelect
              v-model="messageTimeRange"
              :items="messageTimeRangeOptions"
              value-key="value"
              size="md"
              variant="outline"
              class="w-30"
            />
          </div>
        </div>
      </div>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col px-5">
        <div v-if="isLoading" class="flex h-full items-center justify-center gap-3 px-5 pb-4 text-muted">
          <UIcon name="i-lucide-loader-circle" class="animate-spin text-lg" />
          <span class="text-sm">{{ t('globalSearch.searching') }}</span>
        </div>

        <div v-else-if="searchError" class="flex h-full items-center justify-center px-5 pb-4">
          <div class="flex h-full w-full items-center justify-center">
            <UEmpty
              :title="t('globalSearch.errorTitle')"
              :description="searchError"
              icon="i-lucide-search-x"
              size="md"
              variant="naked"
            />
          </div>
        </div>

        <div v-else-if="!trimmedQuery" class="flex h-full items-center justify-center px-5 pb-4">
          <div class="flex h-full w-full items-center justify-center ">
            <UEmpty
              :title="t('globalSearch.emptyTitle')"
              :description="t('globalSearch.emptyDescription')"
              icon="i-lucide-search"
              size="md"
              variant="naked"
            />
          </div>
        </div>

        <div v-else-if="!hasAnyResults" class="flex h-full items-center justify-center px-5 pb-4">
          <div class="flex h-full w-full items-center justify-center">
            <UEmpty
              :title="t('globalSearch.noResultsTitle')"
              :description="t('globalSearch.noResultsDescription')"
              icon="i-lucide-search"
              size="md"
              variant="naked"
            />
          </div>
        </div>

        <div v-else class="h-full min-h-0 overflow-y-auto">
          <div class="py-4">
            <section v-if="showMessagesSection" class="mb-4">
              <div class="mb-2 flex items-center justify-between px-2">
                <h3 class="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{{ t('globalSearch.tab.messages') }}</h3>
                <span class="text-[11px] text-muted">{{ t('globalSearch.itemCount', { count: result.buckets.messages.total }) }}</span>
              </div>
              <button
                v-for="item in result.buckets.messages.items"
                :key="item.messageId"
                type="button"
                class="mb-2 w-full rounded-xl px-4 py-3 text-left transition-colors"
                :class="isSelectedItem(`message:${item.messageId}`)
                  ? 'bg-accented'
                  : 'bg-default'"
                :ref="(el) => setResultItemRef(`message:${item.messageId}`, el)"
                @mouseenter="setSelectedItem(`message:${item.messageId}`)"
                @click="openMessageResult(item)"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="truncate text-sm font-medium text-default">{{ item.sessionTitle }}</div>
                  <span class="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium"
                    :class="item.role === 'user' ? 'bg-accented text-default' : 'bg-success/10 text-success'"
                  >
                    {{ item.role === 'user' ? t('globalSearch.role.user') : t('globalSearch.role.assistant') }}
                  </span>
                </div>
                <div class="mt-2 line-clamp-2 text-sm leading-6 text-toned" v-html="renderSnippet(item.snippet)" />
              </button>
            </section>

            <section v-if="showSessionsSection">
              <div class="mb-2 flex items-center justify-between px-2">
                <h3 class="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{{ t('globalSearch.tab.sessions') }}</h3>
                <span class="text-[11px] text-muted">{{ t('globalSearch.itemCount', { count: result.buckets.sessions.total }) }}</span>
              </div>
              <button
                v-for="item in result.buckets.sessions.items"
                :key="item.sessionId"
                type="button"
                class="mb-2 w-full rounded-xl px-4 py-3 text-left transition-colors"
                :class="isSelectedItem(`session:${item.sessionId}`)
                  ? 'bg-accented'
                  : 'bg-default'"
                :ref="(el) => setResultItemRef(`session:${item.sessionId}`, el)"
                @mouseenter="setSelectedItem(`session:${item.sessionId}`)"
                @click="openSessionResult(item)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium text-default" v-html="renderSnippet(item.titleHighlight)" />
                    <div v-if="item.summarySnippet" class="mt-1 line-clamp-2 text-xs leading-5 text-muted" v-html="renderSnippet(item.summarySnippet)" />
                  </div>
                  <span class="shrink-0 rounded-md bg-accented px-2 py-0.5 text-[11px] font-medium text-toned">
                    {{ t('globalSearch.matchedMessages', { count: item.matchedMessageCount }) }}
                  </span>
                </div>
                <div v-if="item.topMessageHits.length" class="mt-3 space-y-2">
                  <div
                    v-for="preview in item.topMessageHits.slice(0, 2)"
                    :key="preview.messageId"
                    class="rounded-md bg-accented px-3 py-2 text-xs leading-5 text-toned"
                    v-html="renderSnippet(preview.snippet)"
                  />
                </div>
              </button>
            </section>

            <section v-if="showTranslationsSection" class="mb-4">
              <div class="mb-2 flex items-center justify-between px-2">
                <h3 class="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{{ t('globalSearch.tab.translations') }}</h3>
                <span class="text-[11px] text-muted">{{ t('globalSearch.itemCount', { count: result.buckets.translations.total }) }}</span>
              </div>
              <button
                v-for="item in result.buckets.translations.items"
                :key="item.recordId"
                type="button"
                class="mb-2 w-full rounded-xl px-4 py-3 text-left transition-colors"
                :class="isSelectedItem(`translation:${item.recordId}`)
                  ? 'bg-accented'
                  : 'bg-default'"
                :ref="(el) => setResultItemRef(`translation:${item.recordId}`, el)"
                @mouseenter="setSelectedItem(`translation:${item.recordId}`)"
                @click="openTranslateResult(item)"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="line-clamp-1 text-sm font-medium text-default" v-html="renderSnippet(item.inputSnippet)" />
                  <span class="shrink-0 rounded-md bg-accented px-2 py-0.5 text-[11px] font-medium text-toned">
                    {{ item.targetLang }}
                  </span>
                </div>
                <div class="mt-2 line-clamp-2 text-sm leading-6 text-toned" v-html="renderSnippet(item.translationSnippet)" />
              </button>
            </section>

            <section v-if="showNotesSection">
              <div class="mb-2 flex items-center justify-between px-2">
                <h3 class="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{{ t('globalSearch.tab.notes') }}</h3>
                <span class="text-[11px] text-muted">{{ t('globalSearch.itemCount', { count: result.buckets.notes.total }) }}</span>
              </div>
              <button
                v-for="item in result.buckets.notes.items"
                :key="item.noteId"
                type="button"
                class="mb-2 w-full rounded-xl px-4 py-3 text-left transition-colors"
                :class="isSelectedItem(`note:${item.noteId}`)
                  ? 'bg-accented'
                  : 'bg-default'"
                :ref="(el) => setResultItemRef(`note:${item.noteId}`, el)"
                @mouseenter="setSelectedItem(`note:${item.noteId}`)"
                @click="openNoteResult(item)"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="truncate text-sm font-medium text-default" v-html="renderSnippet(item.titleHighlight)" />
                  <span class="shrink-0 rounded-md bg-accented px-2 py-0.5 text-[11px] font-medium text-toned">
                    {{ item.listName }}
                  </span>
                </div>
                <div class="mt-2 line-clamp-2 text-sm leading-6 text-toned" v-html="renderSnippet(item.snippet)" />
              </button>
            </section>

            <section v-if="showKnowledgeSection" class="mb-4">
              <div class="mb-2 flex items-center justify-between px-2">
                <h3 class="text-sm font-semibold uppercase tracking-[0.16em] text-muted">{{ t('globalSearch.tab.knowledge') }}</h3>
                <span class="text-[11px] text-muted">{{ t('globalSearch.itemCount', { count: result.buckets.knowledge.total }) }}</span>
              </div>
              <button
                v-for="item in result.buckets.knowledge.items"
                :key="item.itemId"
                type="button"
                class="mb-2 w-full rounded-xl px-4 py-3 text-left transition-colors"
                :class="isSelectedItem(`knowledge:${item.itemId}`)
                  ? 'bg-accented'
                  : 'bg-default'"
                :ref="(el) => setResultItemRef(`knowledge:${item.itemId}`, el)"
                @mouseenter="setSelectedItem(`knowledge:${item.itemId}`)"
                @click="openKnowledgeResult(item)"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-medium text-default" v-html="renderSnippet(item.itemNameHighlight)" />
                    <div v-if="item.itemSource" class="mt-1 line-clamp-1 text-xs text-muted">
                      {{ item.itemSource }}
                    </div>
                  </div>
                  <div class="flex shrink-0 items-center gap-2">
                    <span class="rounded-md bg-accented px-2 py-0.5 text-[11px] font-medium text-toned">
                      {{ item.kbName }}
                    </span>
                    <span class="rounded-md bg-accented px-2 py-0.5 text-[11px] font-medium text-toned">
                      {{ t('globalSearch.matchedChunks', { count: item.matchedChunkCount }) }}
                    </span>
                  </div>
                </div>
                <div v-if="item.topChunkHits.length" class="mt-3 space-y-2">
                  <div
                    v-for="preview in item.topChunkHits.slice(0, 2)"
                    :key="preview.chunkId"
                    class="rounded-md bg-accented px-3 py-2 text-xs leading-5 text-toned"
                    v-html="renderSnippet(preview.snippet)"
                  />
                </div>
              </button>
            </section>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-5">
        <div class="flex items-center gap-2 text-xs text-toned">
          <div class="flex items-center gap-1">
            <UKbd size="sm">↑</UKbd>
            <UKbd size="sm">↓</UKbd>
          </div>
          <span>{{ t('globalSearch.shortcuts.navigate') }}</span>
        </div>
        <div class="flex items-center gap-2 text-xs text-toned">
          <UKbd size="sm">Enter</UKbd>
          <span>{{ t('globalSearch.shortcuts.open') }}</span>
        </div>
        <div class="flex items-center gap-2 text-xs text-toned">
          <UKbd size="sm">Esc</UKbd>
          <span>{{ t('globalSearch.shortcuts.close') }}</span>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useChatStore } from "@/stores/useChatStore";
import emitter from "@/utils/emitter";
import {
  applySearchPreset,
  buildSearchNavigationTarget,
  buildVisibleSearchItems,
  createEmptySearchResult,
  getNextSelectionKey,
  hasSearchResults,
  normalizeSelectedItemKey,
  renderSearchSnippet as renderSnippet,
  type KnowledgeSearchHit,
  type MessageSearchHit,
  type MessageTimeRange,
  type NoteSearchHit,
  type SearchResult,
  type SearchScope,
  type SearchSelectionItem,
  type SessionSearchHit,
  type TranslateSearchHit,
} from "./globalSearchViewModel";

const props = defineProps<{
  open: boolean;
  preset?: {
    scope?: SearchScope;
    onlyCurrentSession?: boolean;
    messageTimeRange?: MessageTimeRange;
  } | null;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const router = useRouter();
const route = useRoute();
const chatStore = useChatStore();
const { t } = useI18n();

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit("update:open", value),
});

const inputRef = ref<{ inputRef?: HTMLInputElement | null } | null>(null);
const resultItemRefs = new Map<string, HTMLElement>();
const query = ref("");
const activeTab = ref<SearchScope>("all");
const onlyCurrentSession = ref(false);
const messageTimeRange = ref<MessageTimeRange>("all");
const isLoading = ref(false);
const searchError = ref("");
const selectedItemKey = ref("");
const result = ref<SearchResult>(createEmptySearchResult());

let searchTimer: number | null = null;
let searchRequestId = 0;
let stopSearchNavigationShortcuts: (() => void) | null = null;

const tabs = computed<Array<{ label: string; value: SearchScope }>>(() => [
  { label: t("globalSearch.tab.all"), value: "all" },
  { label: t("globalSearch.tab.messages"), value: "messages" },
  { label: t("globalSearch.tab.sessions"), value: "sessions" },
  { label: t("globalSearch.tab.translations"), value: "translations" },
  { label: t("globalSearch.tab.notes"), value: "notes" },
  { label: t("globalSearch.tab.knowledge"), value: "knowledge" },
]);

const currentSessionId = computed(() => {
  return route.name === "chat" && typeof route.params.sessionId === "string"
    ? route.params.sessionId
    : undefined;
});
const showMessageFilters = computed(() => activeTab.value === "messages");
const trimmedQuery = computed(() => query.value.trim());
const showMessagesSection = computed(() => result.value.buckets.messages.items.length > 0);
const showSessionsSection = computed(() => result.value.buckets.sessions.items.length > 0);
const showTranslationsSection = computed(() => result.value.buckets.translations.items.length > 0);
const showNotesSection = computed(() => result.value.buckets.notes.items.length > 0);
const showKnowledgeSection = computed(() => result.value.buckets.knowledge.items.length > 0);
const hasAnyResults = computed(() => hasSearchResults(result.value));
const messageTimeRangeOptions = computed<Array<{ label: string; value: MessageTimeRange }>>(() => [
  { label: t("globalSearch.time.all"), value: "all" },
  { label: t("globalSearch.time.today"), value: "today" },
  { label: t("globalSearch.time.3d"), value: "3d" },
  { label: t("globalSearch.time.7d"), value: "7d" },
  { label: t("globalSearch.time.30d"), value: "30d" },
]);
const visibleItems = computed<SearchSelectionItem[]>(() => buildVisibleSearchItems(result.value));

function resetResults() {
  result.value = createEmptySearchResult(activeTab.value);
  searchError.value = "";
  isLoading.value = false;
  selectedItemKey.value = "";
}

function closeModal() {
  isOpen.value = false;
}

function applyPreset() {
  const nextState = applySearchPreset(
    {
      activeTab: activeTab.value,
      onlyCurrentSession: onlyCurrentSession.value,
      messageTimeRange: messageTimeRange.value,
    },
    props.preset,
    currentSessionId.value
  );
  activeTab.value = nextState.activeTab;
  onlyCurrentSession.value = nextState.onlyCurrentSession;
  messageTimeRange.value = nextState.messageTimeRange;
}

function clearQuery() {
  query.value = "";
  selectedItemKey.value = "";
  void nextTick(() => inputRef.value?.inputRef?.focus());
}

function isSelectedItem(key: string) {
  return selectedItemKey.value === key;
}

function setSelectedItem(key: string) {
  selectedItemKey.value = key;
}

function setResultItemRef(key: string, element: Element | { $el?: Element } | null) {
  if (!element) {
    resultItemRefs.delete(key);
    return;
  }

  const candidate = element instanceof HTMLElement
    ? element
    : element instanceof Element
      ? element
      : element.$el;

  if (candidate instanceof HTMLElement) {
    resultItemRefs.set(key, candidate);
  }
}

function scrollSelectedItemIntoView() {
  const selectedElement = resultItemRefs.get(selectedItemKey.value);
  if (!selectedElement) return;

  selectedElement.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });
}

function moveSelection(direction: 1 | -1) {
  selectedItemKey.value = getNextSelectionKey(
    visibleItems.value,
    selectedItemKey.value,
    direction
  );
  void nextTick(() => scrollSelectedItemIntoView());
}

async function activateSelection() {
  const selected = visibleItems.value.find((item) => item.key === selectedItemKey.value) || visibleItems.value[0];
  if (!selected) return;

  if (selected.type === "message") {
    await openMessageResult(selected.item);
    return;
  }

  if (selected.type === "session") {
    await openSessionResult(selected.item);
    return;
  }

  if (selected.type === "translation") {
    await openTranslateResult(selected.item);
    return;
  }

  if (selected.type === "knowledge") {
    await openKnowledgeResult(selected.item);
    return;
  }

  await openNoteResult(selected.item);
}

function registerSearchNavigationShortcuts() {
  if (stopSearchNavigationShortcuts) return;

  stopSearchNavigationShortcuts = defineShortcuts({
    arrowdown: {
      usingInput: true,
      handler: () => {
        moveSelection(1);
      },
    },
    arrowup: {
      usingInput: true,
      handler: () => {
        moveSelection(-1);
      },
    },
    enter: {
      usingInput: true,
      handler: () => {
        void activateSelection();
      },
    },
  });
}

function unregisterSearchNavigationShortcuts() {
  stopSearchNavigationShortcuts?.();
  stopSearchNavigationShortcuts = null;
}

async function runSearch() {
  const keyword = trimmedQuery.value;
  if (!keyword) {
    resetResults();
    return;
  }

  const requestId = ++searchRequestId;
  isLoading.value = true;
  searchError.value = "";

  try {
    const nextResult = await window.ipc("search:search", {
      query: keyword,
      scope: activeTab.value,
      sessionId: activeTab.value === "messages" && onlyCurrentSession.value ? currentSessionId.value : undefined,
      messageTimeRange: activeTab.value === "messages" ? messageTimeRange.value : undefined,
      limit: 12,
      offset: 0,
    }) as SearchResult;

    if (requestId !== searchRequestId) return;
    result.value = nextResult;
    selectedItemKey.value = visibleItems.value[0]?.key || "";
    await nextTick();
    scrollSelectedItemIntoView();
  } catch (error) {
    if (requestId !== searchRequestId) return;
    searchError.value = error instanceof Error ? error.message : String(error);
  } finally {
    if (requestId === searchRequestId) {
      isLoading.value = false;
    }
  }
}

function scheduleSearch() {
  if (searchTimer !== null) {
    window.clearTimeout(searchTimer);
  }

  searchTimer = window.setTimeout(() => {
    searchTimer = null;
    void runSearch();
  }, 160);
}

async function navigateToMessage(sessionId: string, messageId: string) {
  chatStore.setPendingScrollTarget({ sessionId, messageId });
  const isSameSession = route.name === "chat" && route.params.sessionId === sessionId;
  if (!isSameSession) {
    await router.push({ name: "chat", params: { sessionId } });
    return;
  }

  emitter.emit("chat:scroll-to-message", messageId);
}

async function openMessageResult(item: MessageSearchHit) {
  isOpen.value = false;
  const target = buildSearchNavigationTarget(item);
  await navigateToMessage(
    target.pendingScrollTarget?.sessionId || item.sessionId,
    target.pendingScrollTarget?.messageId || item.messageId
  );
}

async function openSessionResult(item: SessionSearchHit) {
  isOpen.value = false;
  const target = buildSearchNavigationTarget(item);
  if (target.pendingScrollTarget) {
    chatStore.setPendingScrollTarget(target.pendingScrollTarget);
  } else {
    chatStore.clearPendingScrollTarget();
  }

  await router.push(target.route);
  if (target.pendingScrollTarget && route.name === "chat" && route.params.sessionId === item.sessionId) {
    emitter.emit("chat:scroll-to-message", target.pendingScrollTarget.messageId);
  }
}

async function openTranslateResult(item: TranslateSearchHit) {
  isOpen.value = false;
  await router.push(buildSearchNavigationTarget(item).route);
}

async function openNoteResult(item: NoteSearchHit) {
  isOpen.value = false;
  await router.push(buildSearchNavigationTarget(item).route);
}

async function openKnowledgeResult(item: KnowledgeSearchHit) {
  isOpen.value = false;
  await router.push(buildSearchNavigationTarget(item).route);
}

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      if (searchTimer !== null) {
        window.clearTimeout(searchTimer);
        searchTimer = null;
      }
      return;
    }

    applyPreset();
    await nextTick();
    inputRef.value?.inputRef?.focus();
    inputRef.value?.inputRef?.select();
    scheduleSearch();
  }
);

watch(
  () => props.open,
  (open) => {
    if (open) {
      registerSearchNavigationShortcuts();
    } else {
      unregisterSearchNavigationShortcuts();
    }
  },
  { immediate: true }
);

watch([query, activeTab, onlyCurrentSession, messageTimeRange], () => {
  if (!isOpen.value) return;
  scheduleSearch();
});

watch(currentSessionId, (sessionId) => {
  if (!sessionId) {
    onlyCurrentSession.value = false;
  }
});

onUnmounted(() => {
  unregisterSearchNavigationShortcuts();
});

watch(visibleItems, (items) => {
  selectedItemKey.value = normalizeSelectedItemKey(items, selectedItemKey.value);

  void nextTick(() => scrollSelectedItemIntoView());
});
</script>

<style scoped>
:deep(mark) {
  background: rgba(250, 204, 21, 0.22);
  color: inherit;
  padding: 0 0.1em;
  border-radius: 0.25rem;
}
</style>
