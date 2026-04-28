import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { getPersistentValue, setPersistentValueSoon } from "@/utils/persistentState";

export type AiSearchItem = {
  title: string;
  url: string;
  snippet?: string;
};

export type AiSearchReadCacheEntry = {
  title: string;
  content: string;
  error: string | null;
};

const AI_SEARCH_VISITED_RESULTS_KEY = "ai-search-visited-result-urls";
const MAX_VISITED_RESULT_URLS = 1000;
export const DEFAULT_AI_SEARCH_MODEL = "__default__";

export const useAiSearchStore = defineStore("aiSearch", () => {
  const initialized = ref(false);
  const query = ref("");
  const selectedModel = ref(DEFAULT_AI_SEARCH_MODEL);
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
  const historyOpen = ref(false);
  const readerOpen = ref(false);
  const activeReadUrl = ref("");
  const readLoadingUrl = ref("");
  const readCache = ref<Record<string, AiSearchReadCacheEntry>>({});
  const visitedResultUrls = ref<Record<string, true>>({});

  const activeReadEntry = computed(() => activeReadUrl.value ? readCache.value[activeReadUrl.value] : undefined);
  const activeReadContent = computed(() => activeReadEntry.value?.content || "");
  const activeReadError = computed(() => activeReadEntry.value?.error || "");
  const activeReadTitle = computed(() => activeReadEntry.value?.title || "");
  const isAiSummaryDisabled = computed(() => !selectedModel.value || (hasSearched.value && !aiEnabled.value));
  const results = computed(() => allResults.value.slice(0, visibleCount.value));
  const canLoadMore = computed(() => visibleCount.value < allResults.value.length);

  function loadVisitedResultUrls() {
    try {
      const urls = getPersistentValue<unknown>(AI_SEARCH_VISITED_RESULTS_KEY, []);
      if (!Array.isArray(urls)) return;
      visitedResultUrls.value = Object.fromEntries(
        urls
          .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
          .slice(-MAX_VISITED_RESULT_URLS)
          .map((url) => [url, true])
      );
    } catch {
      visitedResultUrls.value = {};
    }
  }

  function persistVisitedResultUrls() {
    try {
      setPersistentValueSoon(AI_SEARCH_VISITED_RESULTS_KEY, Object.keys(visitedResultUrls.value).slice(-MAX_VISITED_RESULT_URLS));
    } catch {
      // Ignore storage failures.
    }
  }

  function isResultVisited(url: string) {
    return !!visitedResultUrls.value[url];
  }

  function markResultVisited(url: string) {
    const normalizedUrl = url.trim();
    if (!normalizedUrl || visitedResultUrls.value[normalizedUrl]) return;
    const urls = [...Object.keys(visitedResultUrls.value), normalizedUrl].slice(-MAX_VISITED_RESULT_URLS);
    visitedResultUrls.value = Object.fromEntries(urls.map((item) => [item, true]));
    persistVisitedResultUrls();
  }

  function resetForSearch(q: string) {
    query.value = q;
    historyOpen.value = false;
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
  }

  return {
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
    hasSearched,
    settingsOpen,
    historyOpen,
    readerOpen,
    activeReadUrl,
    readLoadingUrl,
    readCache,
    visitedResultUrls,
    activeReadEntry,
    activeReadContent,
    activeReadError,
    activeReadTitle,
    isAiSummaryDisabled,
    results,
    canLoadMore,
    loadVisitedResultUrls,
    isResultVisited,
    markResultVisited,
    resetForSearch,
  };
});
