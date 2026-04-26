<template>
  <div ref="pageRef" class="relative h-full min-h-0 flex flex-col bg-default rounded-xl overflow-hidden">
    <header class="shrink-0 px-12 py-5 border-b border-default">
      <div class="w-full flex items-center gap-4">
        <UInput
          v-model="query"
          class="w-full max-w-3xl"
          size="xl"
          icon="i-lucide-search"
          :placeholder="t('aiSearch.inputPlaceholder')"
          :loading="loading"
          enter-key-hint="search"
          @keydown.enter.prevent="runSearch()"
        />
        <div class="ml-auto flex shrink-0 items-center gap-2">
          <ModelSelector
            v-model="selectedModel"
            class="shrink-0"
            :placeholder="t('aiSearch.modelPlaceholder')"
            placement="bottom"
            align="right"
            model-type="chat"
            :show-default="false"
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

      <div v-if="history.length > 0" class="mt-3 w-full max-w-3xl flex items-center gap-2 min-w-0">
        <span class="text-xs text-muted shrink-0">{{ t('aiSearch.history') }}</span>
        <div class="flex-1 min-w-0 overflow-hidden">
          <div class="flex gap-1.5 overflow-x-auto scrollbar-hide">
            <button
              v-for="item in history"
              :key="item"
              type="button"
              class="shrink-0 max-w-52 truncate text-xs px-2 py-1 rounded-md border border-default text-muted hover:text-default hover:bg-elevated transition-colors"
              @click="searchHistory(item)"
            >
              {{ item }}
            </button>
          </div>
        </div>
        <UTooltip :text="t('aiSearch.clearHistory')">
          <UButton
            type="button"
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            @click="clearHistory"
          />
        </UTooltip>
      </div>
    </header>

    <div class="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_36%] gap-12 px-12 py-8 overflow-hidden">
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

          <div v-else-if="loading" class="space-y-3">
            <div
              v-for="index in 6"
              :key="index"
              class="h-28 rounded-md border border-default bg-elevated/40 animate-pulse"
            ></div>
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
                  <h3
                    class="min-w-0 flex-1 truncate text-left text-lg font-medium text-primary hover:underline cursor-pointer"
                    @click="openInPreview(item.url)"
                  >
                    {{ item.title || t('aiSearch.untitled') }}
                  </h3>
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

      <aside class="min-w-0 min-h-0 flex flex-col rounded-lg border border-default bg-default shadow-sm overflow-hidden">
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
              class="text-sm leading-6"
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
          class="text-sm leading-6"
          :content="activeReadContent"
        />
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import MarkdownBlock from "@/components/MarkdownBlock.vue";
import ModelSelector from "@/components/ModelSelector.vue";
import PanelResizeHandle from "@/components/PanelResizeHandle.vue";
import { useMyToast } from "@/composables/useMyToast";
import { useResizableWidth } from "@/composables/useResizableWidth";
import { useSettingsStore } from "@/stores/useSettingsStore";

type AiSearchItem = {
  title: string;
  url: string;
  snippet?: string;
};

type ReadCacheEntry = {
  title: string;
  content: string;
  error: string | null;
};

const { t } = useI18n();
const toast = useMyToast();
const settingsStore = useSettingsStore();

const query = ref("");
const selectedModel = ref("");
const perQueryLimit = ref(20);
const maxResults = ref(50);
const pageSize = ref(15);
const loading = ref(false);
const summaryLoading = ref(false);
const error = ref("");
const allResults = ref<AiSearchItem[]>([]);
const visibleCount = ref(15);
const summary = ref("");
const history = ref<string[]>([]);
const planQueries = ref<string[]>([]);
const aiEnabled = ref(false);
const hasSearched = ref(false);
const settingsOpen = ref(false);
const readerOpen = ref(false);
const activeReadUrl = ref("");
const readLoadingUrl = ref("");
const readCache = ref<Record<string, ReadCacheEntry>>({});
const pageRef = ref<HTMLElement | null>(null);
const resultsScroller = ref<HTMLElement | null>(null);
const pageWidth = ref(0);

const activeReadEntry = computed(() => activeReadUrl.value ? readCache.value[activeReadUrl.value] : undefined);
const activeReadContent = computed(() => activeReadEntry.value?.content || "");
const activeReadError = computed(() => activeReadEntry.value?.error || "");
const activeReadTitle = computed(() => activeReadEntry.value?.title || "");
const isAiSummaryDisabled = computed(() => !selectedModel.value || (hasSearched.value && !aiEnabled.value));
const results = computed(() => allResults.value.slice(0, visibleCount.value));
const canLoadMore = computed(() => visibleCount.value < allResults.value.length);
const readerPanelMaxWidth = computed(() => Math.max(520, pageWidth.value ? pageWidth.value - 32 : 1280));
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
  const config = await window.ipc("aiSearch:getConfig");
  selectedModel.value = config.model || "";
  perQueryLimit.value = config.perQueryLimit ?? 20;
  maxResults.value = config.maxResults ?? 50;
  pageSize.value = config.pageSize ?? 15;
  visibleCount.value = pageSize.value;
  history.value = await window.ipc("aiSearch:listHistory");
});

onUnmounted(() => {
  pageResizeObserver?.disconnect();
  pageResizeObserver = null;
});

function updatePageWidth() {
  pageWidth.value = pageRef.value?.clientWidth ?? 0;
}

async function runSearch(nextQuery?: string) {
  const q = (nextQuery ?? query.value).trim();
  if (!q || loading.value) return;

  query.value = q;
  hasSearched.value = true;
  loading.value = true;
  summaryLoading.value = !!selectedModel.value;
  error.value = "";
  allResults.value = [];
  visibleCount.value = pageSize.value;
  summary.value = "";
  planQueries.value = [];
  aiEnabled.value = false;
  activeReadUrl.value = "";
  readerOpen.value = false;

  try {
    await saveAiSearchConfig();
    const result = await window.ipc("aiSearch:search", {
      query: q,
      model: selectedModel.value || null,
      perQueryLimit: perQueryLimit.value,
      maxResults: maxResults.value,
    });

    if (!result.success) {
      error.value = result.error;
      return;
    }

    allResults.value = result.results;
    visibleCount.value = pageSize.value;
    summary.value = result.summary || "";
    aiEnabled.value = result.aiEnabled;
    planQueries.value = result.plan?.queries?.map((item) => item.query) ?? [];
    history.value = await window.ipc("aiSearch:listHistory");
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
    summaryLoading.value = false;
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

function searchHistory(item: string) {
  void runSearch(item);
}

async function clearHistory() {
  await window.ipc("aiSearch:clearHistory");
  history.value = [];
}

async function readResult(item: AiSearchItem) {
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

function openInPreview(url: string) {
  if (!url) {
    toast.error({ title: t("aiSearch.invalidUrl") });
    return;
  }
  window.webPreview.open(url);
}
</script>
