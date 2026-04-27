<template>
  <div ref="pageRef" class="relative h-full min-h-0 flex flex-col bg-default rounded-xl overflow-hidden">
    <header class="shrink-0 px-12 py-5 border-b border-default">
      <div class="w-full flex items-center gap-4">
        <div ref="searchBoxRef" class="relative w-full max-w-3xl">
          <UInput
            v-model="query"
            class="w-full"
            size="xl"
            icon="i-lucide-search"
            :placeholder="t('aiSearch.inputPlaceholder')"
            :loading="loading"
            enter-key-hint="search"
            @focus="closeHistoryPanel"
            @click="closeHistoryPanel"
            @keydown.enter.prevent="runSearch()"
          >
            <template #trailing>
              <UTooltip :text="t('aiSearch.history')">
                <UButton
                  type="button"
                  icon="i-lucide-history"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  square
                  @click.stop="toggleHistoryPanel"
                />
              </UTooltip>
            </template>
          </UInput>

          <div
            v-if="historyOpen"
            class="absolute left-0 right-0 top-full z-30 mt-2 max-h-96 overflow-y-auto rounded-lg border border-default bg-default p-1.5 shadow-lg"
          >
            <div class="mb-1 flex items-center justify-between gap-3 px-1.5 py-1">
              <div class="text-xs text-muted">
                {{ t('aiSearch.historyCount', { count: history.length }) }}
              </div>
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-trash-2"
                :disabled="history.length === 0"
                @click="clearHistory"
              >
                {{ t('aiSearch.clearHistory') }}
              </UButton>
            </div>
            <div v-if="history.length > 0" class="space-y-0.5">
              <button
                v-for="item in history"
                :key="item"
                type="button"
                class="group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-elevated/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                @click="searchHistory(item)"
              >
                <UIcon name="i-lucide-history" class="size-4 shrink-0 text-muted" />
                <span class="min-w-0 flex-1 truncate text-sm">{{ item }}</span>
                <span class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <UTooltip :text="t('aiSearch.useHistoryKeyword')">
                    <UButton
                      type="button"
                      icon="i-lucide-corner-down-left"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      square
                      @click.stop="fillHistoryKeyword(item)"
                    />
                  </UTooltip>
                  <UTooltip :text="t('aiSearch.deleteHistoryKeyword')">
                    <UButton
                      type="button"
                      icon="i-lucide-trash-2"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      square
                      @click.stop="deleteHistoryKeyword(item)"
                    />
                  </UTooltip>
                </span>
              </button>
            </div>
            <div v-else class="px-3 py-8">
              <UEmpty
                icon="i-lucide-history"
                :title="t('aiSearch.historyEmptyTitle')"
                :description="t('aiSearch.historyEmptyDescription')"
                variant="naked"
              />
            </div>
          </div>
        </div>
        <div class="ml-auto flex shrink-0 items-center gap-2">
          <ModelSelector
            v-model="selectedModel"
            class="shrink-0"
            placement="bottom"
            align="right"
            model-type="chat"
            :show-default="true"
            @update:model-value="handleModelChange"
          />
          <UModal
            v-model:open="settingsOpen"
            :title="t('aiSearch.settingsTitle')"
            :description="t('aiSearch.settingsDescription')"
            :ui="{ content: 'max-w-md', body: 'space-y-5' }"
          >
            <UTooltip :text="t('aiSearch.settings')">
              <UButton
                type="button"
                icon="i-lucide-settings-2"
                color="neutral"
                variant="ghost"
                size="xl"
                square
              />
            </UTooltip>

            <template #body>
              <div class="space-y-4">
                <UFormField
                  :label="t('aiSearch.perQueryLimit')"
                  :description="t('aiSearch.perQueryLimitDescription')"
                >
                  <UInputNumber
                    v-model="perQueryLimit"
                    class="w-full"
                    :min="5"
                    :max="50"
                    :step="5"
                    @change="saveAiSearchConfig"
                  />
                </UFormField>
                <UFormField
                  :label="t('aiSearch.maxResults')"
                  :description="t('aiSearch.maxResultsDescription')"
                >
                  <UInputNumber
                    v-model="maxResults"
                    class="w-full"
                    :min="20"
                    :max="100"
                    :step="10"
                    @change="saveAiSearchConfig"
                  />
                </UFormField>
                <UFormField
                  :label="t('aiSearch.pageSize')"
                  :description="t('aiSearch.pageSizeDescription')"
                >
                  <UInputNumber
                    v-model="pageSize"
                    class="w-full"
                    :min="5"
                    :max="30"
                    :step="5"
                    @change="saveAiSearchConfig"
                  />
                </UFormField>
              </div>
            </template>
          </UModal>
        </div>
      </div>

    </header>

    <div
      class="flex-1 min-h-0 grid gap-12 px-12 py-8 overflow-hidden"
      :class="hasResolvedSummaryModel ? 'grid-cols-[minmax(0,1fr)_36%]' : 'grid-cols-1'"
    >
      <section class="min-w-0 min-h-0 flex flex-col">
        <div ref="resultsScroller" class="flex-1 min-h-0 overflow-y-auto" @scroll="onResultsScroll">
          <div v-if="error" class="py-8">
            <UEmpty
              icon="i-lucide-circle-alert"
              :title="t('aiSearch.errorTitle')"
              :description="error"
              variant="naked"
            />
          </div>

          <div v-else-if="loading" class="divide-y divide-default">
            <div
              v-for="index in 6"
              :key="index"
              class="py-4"
            >
              <div class="flex items-center gap-1">
                <div class="size-8 shrink-0 rounded-md bg-elevated animate-pulse"></div>
                <div class="h-5 flex-1 rounded bg-elevated animate-pulse"></div>
              </div>
              <div class="mt-2 h-3 w-1/2 rounded bg-elevated animate-pulse"></div>
              <div class="mt-3 space-y-2">
                <div class="h-4 w-full rounded bg-elevated animate-pulse"></div>
                <div class="h-4 w-3/4 rounded bg-elevated animate-pulse"></div>
              </div>
            </div>
          </div>

          <div v-else-if="results.length === 0" class="h-full flex items-center justify-center py-8">
            <UEmpty
              icon="i-lucide-search"
              :title="t('aiSearch.emptyTitle')"
              :description="t('aiSearch.emptyDescription')"
              variant="naked"
            />
          </div>

          <div v-else class="divide-y divide-default">
            <article
              v-for="item in results"
              :key="item.url"
              class="py-4 transition-colors"
            >
              <div class="min-w-0">
                <div class="flex items-center gap-1 min-w-0">
                  <UTooltip :text="t('aiSearch.readMode')">
                    <UButton
                      type="button"
                      class="shrink-0"
                      :icon="activeReadUrl === item.url && readerOpen ? 'i-lucide-book-open-check' : 'i-lucide-book-open'"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      square
                      :loading="readLoadingUrl === item.url"
                      @click="readResult(item)"
                    />
                  </UTooltip>
                  <a
                    class="min-w-0 flex-1 truncate text-left text-lg font-medium hover:underline cursor-pointer"
                    :class="isResultVisited(item.url) ? 'text-muted' : 'text-primary'"
                    :href="item.url"
                    target="_blank"
                    rel="noreferrer"
                    @pointerdown="markResultVisited(item.url)"
                    @keydown.enter="markResultVisited(item.url)"
                  >
                    {{ item.title || t('aiSearch.untitled') }}
                  </a>
                </div>
                <div class="mt-1 text-xs text-muted truncate">{{ item.url }}</div>
                <p v-if="item.snippet" class="mt-2 text-sm text-muted leading-6 line-clamp-2">
                  {{ item.snippet }}
                </p>
              </div>
            </article>
            <div v-if="canLoadMore" class="flex justify-center pt-1">
              <UButton
                type="button"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-chevron-down"
                @click="loadMoreResults"
              >
                {{ t('aiSearch.loadMore') }}
              </UButton>
            </div>
          </div>
        </div>
      </section>

      <aside
        v-if="hasResolvedSummaryModel"
        class="min-w-0 min-h-0 flex flex-col rounded-lg border border-default bg-default shadow-sm overflow-hidden"
      >
        <div class="shrink-0 px-4 py-3 border-b border-default flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 text-sm font-medium">
            <UIcon name="i-lucide-sparkles" class="size-4 text-muted" />
            <span>{{ t('aiSearch.summaryTab') }}</span>
          </div>
          <div v-if="planQueries.length > 1" class="text-xs text-muted truncate">
            {{ t('aiSearch.queryCount', { count: planQueries.length }) }}
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto p-4">
          <div class="h-full">
            <div v-if="isAiSummaryDisabled" class="h-full flex items-center justify-center">
              <UEmpty
                icon="i-lucide-sparkles"
                :title="t('aiSearch.summaryDisabledTitle')"
                :description="t('aiSearch.summaryDisabledDescription')"
                variant="naked"
              />
            </div>
            <div v-else-if="summaryLoading" class="space-y-3">
              <div class="h-4 w-2/3 rounded bg-elevated animate-pulse"></div>
              <div class="h-4 w-full rounded bg-elevated animate-pulse"></div>
              <div class="h-4 w-5/6 rounded bg-elevated animate-pulse"></div>
            </div>
            <MarkdownBlock
              v-else-if="summary"
              class="leading-6"
              :content="summary"
            />
            <UEmpty
              v-else
              icon="i-lucide-file-text"
              :title="t('aiSearch.summaryEmptyTitle')"
              :description="t('aiSearch.summaryEmptyDescription')"
              variant="naked"
            />
          </div>
        </div>
      </aside>
    </div>

    <aside
      v-if="readerOpen"
      class="absolute inset-y-0 right-0 z-20 flex flex-col border-l border-default bg-default shadow-xl"
      :style="readerPanelWidthStyle"
    >
      <PanelResizeHandle
        side="left"
        variant="edge"
        :active="readerPanelResize.isDragging.value"
        :value="readerPanelResize.width.value"
        :min="readerPanelResize.minWidth.value"
        :max="readerPanelResize.maxWidth.value"
        :cursor="readerPanelResize.cursor.value"
        @resize-start="readerPanelResize.startResize"
        @resize-by="readerPanelResize.resizeBy"
        @reset="readerPanelResize.resetWidth"
      />
      <div class="shrink-0 border-b border-default px-5 py-4">
        <div class="flex items-center gap-3">
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">
              {{ activeReadTitle || t('aiSearch.readerTab') }}
            </div>
          </div>
          <UButton
            type="button"
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            @click="readerOpen = false"
          />
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        <div v-if="!activeReadUrl" class="h-full flex items-center justify-center">
          <UEmpty
            icon="i-lucide-book-open"
            :title="t('aiSearch.readerEmptyTitle')"
            :description="t('aiSearch.readerEmptyDescription')"
            variant="naked"
          />
        </div>
        <div v-else-if="readLoadingUrl === activeReadUrl" class="space-y-3">
          <div class="h-5 w-3/4 rounded bg-elevated animate-pulse"></div>
          <div class="h-4 w-full rounded bg-elevated animate-pulse"></div>
          <div class="h-4 w-11/12 rounded bg-elevated animate-pulse"></div>
          <div class="h-4 w-5/6 rounded bg-elevated animate-pulse"></div>
        </div>
        <UEmpty
          v-else-if="activeReadError"
          icon="i-lucide-circle-alert"
          :title="t('aiSearch.readerErrorTitle')"
          :description="activeReadError"
          variant="naked"
        />
        <MarkdownBlock
          v-else-if="activeReadContent"
          class="leading-6"
          :content="activeReadContent"
          :base-url="activeReadUrl"
        />
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import MarkdownBlock from "@/components/MarkdownBlock.vue";
import ModelSelector from "@/components/ModelSelector.vue";
import PanelResizeHandle from "@/components/PanelResizeHandle.vue";
import { useResizableWidth } from "@/composables/useResizableWidth";
import { DEFAULT_AI_SEARCH_MODEL, useAiSearchStore, type AiSearchItem } from "@/stores/useAiSearchStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

const { t } = useI18n();
const aiSearchStore = useAiSearchStore();
const settingsStore = useSettingsStore();
const {
  initialized,
  query,
  selectedModel,
  perQueryLimit,
  maxResults,
  pageSize,
  loading,
  summaryLoading,
  error,
  allResults,
  visibleCount,
  summary,
  history,
  planQueries,
  aiEnabled,
  settingsOpen,
  historyOpen,
  readerOpen,
  activeReadUrl,
  readLoadingUrl,
  readCache,
  activeReadContent,
  activeReadError,
  activeReadTitle,
  isAiSummaryDisabled,
  results,
  canLoadMore,
} = storeToRefs(aiSearchStore);
const { loadVisitedResultUrls, isResultVisited, markResultVisited, resetForSearch } = aiSearchStore;
const pageRef = ref<HTMLElement | null>(null);
const searchBoxRef = ref<HTMLElement | null>(null);
const resultsScroller = ref<HTMLElement | null>(null);
const pageWidth = ref(0);
const activeAiSearchRequestId = ref("");
const readerPanelMaxWidth = computed(() => Math.max(520, pageWidth.value ? pageWidth.value - 32 : 1280));
const resolvedSummaryModelRef = computed(() => resolveAiSearchConcreteModelRef());
const hasResolvedSummaryModel = computed(() => !!resolvedSummaryModelRef.value);
const readerPanelResize = useResizableWidth({
  storageKey: "ai-search-reader-panel-width",
  defaultWidth: 920,
  minWidth: 520,
  maxWidth: readerPanelMaxWidth,
  side: "left",
  step: 24,
});
const readerPanelWidthStyle = readerPanelResize.widthStyle;
let pageResizeObserver: ResizeObserver | null = null;

onMounted(async () => {
  await settingsStore.initialize();
  updatePageWidth();
  if (pageRef.value) {
    pageResizeObserver = new ResizeObserver(updatePageWidth);
    pageResizeObserver.observe(pageRef.value);
  }
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  if (!initialized.value) {
    loadVisitedResultUrls();
    const config = await window.ipc("aiSearch:getConfig");
    selectedModel.value = typeof config.model === "string" ? config.model : DEFAULT_AI_SEARCH_MODEL;
    perQueryLimit.value = config.perQueryLimit ?? 20;
    maxResults.value = config.maxResults ?? 50;
    pageSize.value = config.pageSize ?? 15;
    visibleCount.value = pageSize.value;
    initialized.value = true;
  }
  history.value = await window.ipc("aiSearch:listHistory");
});

onUnmounted(() => {
  void abortActiveAiSearch();
  pageResizeObserver?.disconnect();
  pageResizeObserver = null;
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
});

function updatePageWidth() {
  pageWidth.value = pageRef.value?.clientWidth ?? 0;
}

async function runSearch(nextQuery?: string) {
  const q = (nextQuery ?? query.value).trim();
  if (!q) return;

  void abortActiveAiSearch({ clearLocalState: false });
  const requestId = createAiSearchRequestId();
  activeAiSearchRequestId.value = requestId;
  const requestModel = hasResolvedSummaryModel.value ? selectedModel.value : null;
  resetForSearch(q);
  summaryLoading.value = !!requestModel;

  try {
    await saveAiSearchConfig();
    if (activeAiSearchRequestId.value !== requestId) return;
    const result = await window.ipc("aiSearch:search", {
      requestId,
      query: q,
      model: requestModel,
      perQueryLimit: perQueryLimit.value,
      maxResults: maxResults.value,
    });
    if (activeAiSearchRequestId.value !== requestId) return;

    if (!result.success) {
      if (result.aborted) return;
      error.value = result.error;
      summaryLoading.value = false;
      activeAiSearchRequestId.value = "";
      return;
    }

    allResults.value = result.results;
    visibleCount.value = pageSize.value;
    summary.value = "";
    aiEnabled.value = result.aiEnabled;
    planQueries.value = result.plan?.queries?.map((item) => item.query) ?? [];
    loading.value = false;
    void window.ipc("aiSearch:listHistory").then((items) => {
      history.value = items;
    });

    if (result.aiEnabled && requestModel && result.results.length > 0) {
      void runSearchSummary(requestId, q, requestModel, result.results);
    } else {
      summaryLoading.value = false;
      activeAiSearchRequestId.value = "";
    }
  } catch (err) {
    if (activeAiSearchRequestId.value !== requestId) return;
    error.value = err instanceof Error ? err.message : String(err);
    summaryLoading.value = false;
    activeAiSearchRequestId.value = "";
  } finally {
    if (activeAiSearchRequestId.value === requestId) {
      loading.value = false;
      if (!summaryLoading.value) {
        activeAiSearchRequestId.value = "";
      }
    }
  }
}

function createAiSearchRequestId() {
  return `ai_search_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function abortActiveAiSearch(options?: { clearLocalState?: boolean }) {
  const requestId = activeAiSearchRequestId.value;
  if (!requestId) return;
  if (options?.clearLocalState !== false) {
    activeAiSearchRequestId.value = "";
    loading.value = false;
    summaryLoading.value = false;
  }
  try {
    await window.ipc("aiSearch:abort", { requestId });
  } catch {
    // Ignore abort errors.
  }
}

async function runSearchSummary(requestId: string, q: string, model: string, searchResults: AiSearchItem[]) {
  try {
    const result = await window.ipc("aiSearch:summarize", {
      requestId,
      query: q,
      model,
      results: searchResults,
    });
    if (activeAiSearchRequestId.value !== requestId) return;
    if (result.success) {
      summary.value = result.summary || "";
    } else if (!result.aborted) {
      summary.value = "";
    }
  } catch {
    if (activeAiSearchRequestId.value !== requestId) return;
    summary.value = "";
  } finally {
    if (activeAiSearchRequestId.value === requestId) {
      summaryLoading.value = false;
      activeAiSearchRequestId.value = "";
    }
  }
}

async function saveAiSearchConfig() {
  const next = sanitizeAiSearchConfig();
  perQueryLimit.value = next.perQueryLimit;
  maxResults.value = next.maxResults;
  pageSize.value = next.pageSize;
  await window.ipc("aiSearch:setConfig", {
    model: selectedModel.value,
    perQueryLimit: next.perQueryLimit,
    maxResults: next.maxResults,
    pageSize: next.pageSize,
  });
}

function sanitizeAiSearchConfig() {
  return {
    perQueryLimit: clampNumber(perQueryLimit.value, 5, 50, 20),
    maxResults: clampNumber(maxResults.value, 20, 100, 50),
    pageSize: clampNumber(pageSize.value, 5, 30, 15),
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numberValue)));
}

function loadMoreResults() {
  visibleCount.value = Math.min(allResults.value.length, visibleCount.value + pageSize.value);
}

function onResultsScroll(event: Event) {
  if (!canLoadMore.value) return;
  const element = event.currentTarget instanceof HTMLElement ? event.currentTarget : resultsScroller.value;
  if (!element) return;
  const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
  if (remaining < 160) {
    loadMoreResults();
  }
}

function handleModelChange(value: string) {
  selectedModel.value = value;
  void saveAiSearchConfig();
}

function resolveAiSearchConcreteModelRef(): string | null {
  const model = String(selectedModel.value || "").trim();
  if (!model) return null;

  const concreteModel = model === DEFAULT_AI_SEARCH_MODEL
    ? (() => {
        const defaultModel = settingsStore.defaultModel;
        if (!defaultModel?.providerId || !defaultModel?.modelId) return null;
        return `${defaultModel.providerId}::${defaultModel.modelId}`;
      })()
    : model;

  if (!concreteModel) return null;
  const [providerId, modelId] = concreteModel.split("::");
  if (!providerId || !modelId) return null;

  const provider = settingsStore.enabledProviders.find((item) => item.id === providerId);
  if (!provider) return null;
  if (!provider.models.some((item) => item.id === modelId)) return null;
  if (!settingsStore.isProviderModelSelectable(providerId, modelId)) return null;
  return concreteModel;
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target;
  if (target instanceof Node && searchBoxRef.value?.contains(target)) return;
  historyOpen.value = false;
}

function toggleHistoryPanel() {
  historyOpen.value = !historyOpen.value;
}

function closeHistoryPanel() {
  historyOpen.value = false;
}

function searchHistory(item: string) {
  historyOpen.value = false;
  void runSearch(item);
}

function fillHistoryKeyword(item: string) {
  query.value = item;
  historyOpen.value = false;
}

async function deleteHistoryKeyword(item: string) {
  history.value = await window.ipc("aiSearch:deleteHistory", { keyword: item });
  historyOpen.value = true;
}

async function clearHistory() {
  await window.ipc("aiSearch:clearHistory");
  history.value = [];
  historyOpen.value = true;
}

async function readResult(item: AiSearchItem) {
  markResultVisited(item.url);
  activeReadUrl.value = item.url;
  readerOpen.value = true;
  if (readCache.value[item.url]?.content || readCache.value[item.url]?.error) return;

  readLoadingUrl.value = item.url;
  readCache.value = {
    ...readCache.value,
    [item.url]: {
      title: item.title,
      content: "",
      error: null,
    },
  };

  try {
    const result = await window.ipc("aiSearch:fetchPage", { url: item.url });
    if (!result.success) {
      readCache.value = {
        ...readCache.value,
        [item.url]: {
          title: item.title,
          content: "",
          error: result.error,
        },
      };
      return;
    }

    readCache.value = {
      ...readCache.value,
      [item.url]: {
        title: result.title || item.title,
        content: result.content,
        error: null,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    readCache.value = {
      ...readCache.value,
      [item.url]: {
        title: item.title,
        content: "",
        error: message,
      },
    };
  } finally {
    readLoadingUrl.value = "";
  }
}

</script>
