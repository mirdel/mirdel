<template>
  <div
    v-if="open"
    class="absolute top-16 right-4 z-100 flex items-center rounded-lg border border-default bg-default/95 pl-1.5 pr-2 py-1 shadow-lg backdrop-blur"
  >
    <div class="relative">
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        class="h-8 w-72 rounded-md border border-default bg-default px-2 pr-24 text-sm text-default outline-none focus:border-primary"
        :placeholder="t('pageFind.placeholder')"
        @keydown="handleInputKeydown"
      />
      <div class="absolute inset-y-0 right-1 flex items-center gap-0.5">
        <UTooltip :text="t('pageFind.caseSensitive')">
          <UButton
            icon="i-lucide-case-sensitive"
            size="xs"
            square
            :variant="caseSensitive ? 'subtle' : 'ghost'"
            color="neutral"
            @click="toggleCaseSensitive"
          />
        </UTooltip>
        <UTooltip :text="t('pageFind.wholeWord')">
          <UButton
            icon="i-lucide-whole-word"
            size="xs"
            square
            :variant="wholeWord ? 'subtle' : 'ghost'"
            color="neutral"
            @click="toggleWholeWord"
          />
        </UTooltip>
        <UTooltip :text="t('pageFind.regex')">
          <UButton
            icon="i-lucide-regex"
            size="xs"
            square
            :variant="useRegex ? 'subtle' : 'ghost'"
            color="neutral"
            @click="toggleRegex"
          />
        </UTooltip>
      </div>
    </div>
    <span class="min-w-12 text-center text-xs" :class="resultTextClass">
      {{ resultLabel }}
    </span>
    <UTooltip :text="t('pageFind.prev')">
      <UButton icon="i-lucide-chevron-up" variant="ghost" color="neutral" size="sm" square @click="goPrev" />
    </UTooltip>
    <UTooltip :text="t('pageFind.next')">
      <UButton icon="i-lucide-chevron-down" variant="ghost" color="neutral" size="sm" square @click="goNext" />
    </UTooltip>
    <UTooltip :text="t('pageFind.close')">
      <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="sm" square @click="closeBar" />
    </UTooltip>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  open: boolean;
  getSearchRoot: () => HTMLElement | null;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
}>();

const { t } = useI18n();
const inputRef = ref<HTMLInputElement | null>(null);
const query = ref("");
const matches = ref(0);
const activeMatchOrdinal = ref(0);
const activeMatchIndex = ref(0);
const caseSensitive = ref(false);
const wholeWord = ref(false);
const useRegex = ref(false);
const regexError = ref("");

const FIND_ALL_HIGHLIGHT_KEY = "ax-chat-find-hit";
const FIND_ACTIVE_HIGHLIGHT_KEY = "ax-chat-find-active";

let observedRoot: HTMLElement | null = null;
let observer: MutationObserver | null = null;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let matchRanges: Range[] = [];

const hasQuery = computed(() => query.value.trim().length > 0);
const hasRegexError = computed(() => regexError.value.length > 0);
const resultLabel = computed(() => {
  if (!hasQuery.value) return "";
  if (hasRegexError.value) return t("pageFind.invalidRegex");
  if (matches.value <= 0) return t("pageFind.noResults");
  return `${activeMatchOrdinal.value}/${matches.value}`;
});
const resultTextClass = computed(() => (hasRegexError.value ? "text-error" : "text-muted"));

function focusInput(selectAll = false) {
  nextTick(() => {
    const input = inputRef.value;
    if (!input) return;
    input.focus();
    if (selectAll) input.select();
  });
}

function getSelectionTextForFind() {
  const root = props.getSearchRoot();
  if (!root) return "";

  const raw = window.getSelection?.()?.toString() || "";
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";

  const selection = window.getSelection?.();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  if (!range) return "";
  if (!root.contains(range.commonAncestorContainer)) return "";

  return text.slice(0, 120);
}

function openFromShortcut() {
  const seedText = getSelectionTextForFind();
  if (seedText) {
    query.value = seedText;
  }
  if (query.value.trim()) {
    scheduleRecompute();
  }
  focusInput(true);
}

function closeBar() {
  emit("update:open", false);
}

function resetResultState() {
  matchRanges = [];
  matches.value = 0;
  activeMatchIndex.value = 0;
  activeMatchOrdinal.value = 0;
}

function escapeRegexText(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createSearchRegex(searchText: string): RegExp | null {
  const baseSource = useRegex.value ? searchText : escapeRegexText(searchText);
  const wrappedSource = wholeWord.value
    ? `(?<![\\p{L}\\p{N}_])(?:${baseSource})(?![\\p{L}\\p{N}_])`
    : baseSource;
  const flags = `gu${caseSensitive.value ? "" : "i"}`;

  try {
    regexError.value = "";
    return new RegExp(wrappedSource, flags);
  } catch (error) {
    regexError.value = error instanceof Error ? error.message : String(error);
    return null;
  }
}

function createHighlight(ranges: Range[]): any {
  const HighlightCtor = (window as any).Highlight;
  const highlight = new HighlightCtor();
  for (const range of ranges) {
    highlight.add(range);
  }
  return highlight;
}

function clearHighlights() {
  const registry = (CSS as any).highlights;
  registry.delete(FIND_ALL_HIGHLIGHT_KEY);
  registry.delete(FIND_ACTIVE_HIGHLIGHT_KEY);
}

function applyHighlights() {
  clearHighlights();

  const registry = (CSS as any).highlights;
  if (matchRanges.length === 0) return;

  registry.set(FIND_ALL_HIGHLIGHT_KEY, createHighlight(matchRanges));
  const activeRange = matchRanges[activeMatchIndex.value];
  if (activeRange) {
    registry.set(FIND_ACTIVE_HIGHLIGHT_KEY, createHighlight([activeRange]));
  }
}

function disconnectObserver() {
  observer?.disconnect();
  observer = null;
  observedRoot = null;
}

function stopFindAndReset(clearInput = false) {
  if (clearInput) {
    query.value = "";
  }
  regexError.value = "";
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  disconnectObserver();
  clearHighlights();
  resetResultState();
}

function shouldSkipTextNode(textNode: Text) {
  const parent = textNode.parentElement;
  if (!parent) return true;
  if (parent.closest("[data-chat-page-find-ignore='true']")) return true;
  if (parent.closest("button, input, textarea, select, option, [role='button'], [aria-hidden='true']")) return true;
  const tag = parent.tagName.toLowerCase();
  return tag === "script" || tag === "style" || tag === "noscript";
}

function buildRanges(root: HTMLElement, regex: RegExp): Range[] {
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    if (!shouldSkipTextNode(textNode)) {
      const haystack = textNode.data;
      const nodeRegex = new RegExp(regex.source, regex.flags);
      let match: RegExpExecArray | null = nodeRegex.exec(haystack);
      while (match) {
        const matchedText = match[0] || "";
        if (!matchedText) {
          nodeRegex.lastIndex += 1;
          match = nodeRegex.exec(haystack);
          continue;
        }
        const range = document.createRange();
        range.setStart(textNode, match.index);
        range.setEnd(textNode, match.index + matchedText.length);
        ranges.push(range);
        match = nodeRegex.exec(haystack);
      }
    }
    node = walker.nextNode();
  }

  return ranges;
}

function scrollToActiveMatch() {
  const activeRange = matchRanges[activeMatchIndex.value];
  if (!activeRange) return;
  const container =
    activeRange.startContainer.nodeType === Node.TEXT_NODE
      ? activeRange.startContainer.parentElement
      : (activeRange.startContainer as Element);
  container?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function updateResultInfo() {
  matches.value = matchRanges.length;
  if (matchRanges.length === 0) {
    activeMatchIndex.value = 0;
    activeMatchOrdinal.value = 0;
    return;
  }
  if (activeMatchIndex.value >= matchRanges.length) {
    activeMatchIndex.value = 0;
  }
  activeMatchOrdinal.value = activeMatchIndex.value + 1;
}

function recomputeMatches() {
  const normalized = query.value.trim();
  if (!normalized) {
    stopFindAndReset(false);
    return;
  }

  const root = props.getSearchRoot();
  if (!root) {
    stopFindAndReset(false);
    return;
  }

  const regex = createSearchRegex(normalized);
  if (!regex) {
    clearHighlights();
    resetResultState();
    return;
  }

  if (root !== observedRoot) {
    disconnectObserver();
    observer = new MutationObserver(() => {
      scheduleRecompute();
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    observedRoot = root;
  }

  matchRanges = buildRanges(root, regex);
  updateResultInfo();
  applyHighlights();
}

function scheduleRecompute() {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    recomputeMatches();
  }, 80);
}

function moveMatch(step: 1 | -1) {
  if (matchRanges.length === 0) return;
  const total = matchRanges.length;
  activeMatchIndex.value = (activeMatchIndex.value + step + total) % total;
  updateResultInfo();
  applyHighlights();
  scrollToActiveMatch();
}

function goNext() {
  moveMatch(1);
}

function goPrev() {
  moveMatch(-1);
}

function toggleCaseSensitive() {
  caseSensitive.value = !caseSensitive.value;
  focusInput(false);
}

function toggleWholeWord() {
  wholeWord.value = !wholeWord.value;
  focusInput(false);
}

function toggleRegex() {
  useRegex.value = !useRegex.value;
  focusInput(false);
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeBar();
    return;
  }

  if (event.key !== "Enter") return;
  event.preventDefault();

  if (event.shiftKey) {
    goPrev();
  } else {
    goNext();
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      focusInput(true);
      if (query.value.trim()) {
        recomputeMatches();
      }
      return;
    }
    stopFindAndReset(false);
  }
);

watch(query, (nextQuery) => {
  if (!props.open) return;

  const normalized = nextQuery.trim();
  if (!normalized) {
    stopFindAndReset(false);
    return;
  }

  scheduleRecompute();
});

watch([caseSensitive, wholeWord, useRegex], () => {
  if (!props.open) return;
  if (!query.value.trim()) return;
  scheduleRecompute();
});

onUnmounted(() => {
  stopFindAndReset(true);
});

defineExpose({
  openFromShortcut,
});
</script>

<style>
::highlight(ax-chat-find-hit) {
  background: color-mix(in srgb, var(--ui-primary) 22%, transparent);
}

::highlight(ax-chat-find-active) {
  background: color-mix(in srgb, var(--ui-primary) 78%, white);
  color: var(--ui-color-neutral-950);
}
</style>
