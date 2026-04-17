<template>
  <div
    v-if="chatStore.messages.length > 0"
    class="absolute right-1 top-1/2 -translate-y-1/2 z-20"
  >
    <div class="flex flex-col gap-2">
      <!-- 回到顶部 -->
      <UTooltip :text="t('chat.nav.top')" :content="{ side: 'left' }">
        <UButton
          icon="i-lucide-arrow-up-to-line"
          size="sm"
          color="neutral"
          variant="ghost"
          square
          :disabled="isAtTop"
          class="shadow rounded-full"
          @click="scrollToTop"
        />
      </UTooltip>

      <!-- 上一轮对话 -->
      <UTooltip :text="t('chat.nav.previousRound')" :content="{ side: 'left' }">
        <div class="shadow rounded-full">
          <UButton
            icon="i-lucide-arrow-down-to-dot"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            :disabled="!hasPreviousRound"
            class="rounded-full"
            style="transform: rotate(180deg);"
            @click="scrollToPreviousRound"
          />
        </div>
      </UTooltip>

      <!-- 对话导航 -->
      <UTooltip v-if="!tocOpen" :text="t('chat.nav.toc')" :kbds="['meta', 'L']" :content="{ side: 'left' }">
        <UButton
          icon="i-lucide-list"
          size="sm"
          color="neutral"
          variant="ghost"
          square
          class="shadow rounded-full"
          @click="toggleToc"
        />
      </UTooltip>

      <!-- 下一轮对话 -->
      <UTooltip :text="t('chat.nav.nextRound')" :content="{ side: 'left' }">
        <UButton
          icon="i-lucide-arrow-down-to-dot"
          size="sm"
          color="neutral"
          variant="ghost"
          square
          :disabled="!hasNextRound"
          class="shadow rounded-full"
          @click="scrollToNextRound"
        />
      </UTooltip>

      <!-- 回到底部 -->
      <UTooltip :text="t('chat.nav.bottom')" :content="{ side: 'left' }">
        <UButton
          icon="i-lucide-arrow-down-to-line"
          size="sm"
          color="neutral"
          variant="ghost"
          square
          :disabled="isAtBottom"
          class="shadow rounded-full"
          @click="scrollToBottom"
        />
      </UTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { useChatStore } from "@/stores/useChatStore";
import emitter from "@/utils/emitter";
import { groupMessages } from "@/utils/messageGrouper";

const tocOpen = defineModel<boolean>('tocOpen', { default: false })

const chatStore = useChatStore();
const { t } = useI18n();

function toggleToc() {
  tocOpen.value = !tocOpen.value
}

const isAtTop = ref(false);
const isAtBottom = ref(false);
const currentRoundIndex = ref(-1);

const turnMap = computed(() => new Map(chatStore.currentTurns.map((turn) => [turn.id, turn])))
const turnGroups = computed(() => groupMessages(chatStore.messages, { turns: turnMap.value }))

const hasSystemPrompt = computed(() => !!chatStore.selectedScenario?.systemPrompt?.trim())

// user group 在 virtualItems 中的 index（考虑 system prompt 的偏移）
const userGroupIndices = computed(() => {
  const offset = hasSystemPrompt.value ? 1 : 0
  const indices: number[] = []
  turnGroups.value.forEach((group, i) => {
    if (group.type === 'user') {
      indices.push(i + offset)
    }
  })
  return indices
})

const totalRounds = computed(() => userGroupIndices.value.length)
const hasPreviousRound = computed(() => currentRoundIndex.value > 0);
const hasNextRound = computed(() => currentRoundIndex.value < totalRounds.value - 1);

function getScrollContainer(): HTMLElement | null {
  return document.querySelector('[data-chat-message-scroll]') as HTMLElement;
}

function getVirtualItemElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll(':scope > [data-slot="viewport"] > [data-slot="item"][data-index]')
  ) as HTMLElement[];
}

function getVirtualItemIndex(element: HTMLElement): number | null {
  const rawIndex = element.getAttribute('data-index')
  if (!rawIndex) return null

  const index = Number(rawIndex)
  return Number.isFinite(index) ? index : null
}

function getCurrentVirtualIndex(container: HTMLElement, thresholdRatio = 0.3): number {
  const items = getVirtualItemElements(container)
  if (items.length === 0) return 0

  const containerRect = container.getBoundingClientRect()
  const threshold = containerRect.top + containerRect.height * thresholdRatio
  let currentIndex = getVirtualItemIndex(items[0]) ?? 0

  for (const item of items) {
    const itemIndex = getVirtualItemIndex(item)
    if (itemIndex == null) continue

    const rect = item.getBoundingClientRect()
    if (rect.top <= threshold) {
      currentIndex = itemIndex
    } else {
      break
    }
  }

  return currentIndex
}

function getRoundIndexForVirtualIndex(virtualIndex: number): number {
  let roundIndex = -1

  for (let i = 0; i < userGroupIndices.value.length; i++) {
    if (userGroupIndices.value[i] <= virtualIndex) {
      roundIndex = i
    } else {
      break
    }
  }

  return roundIndex < 0 && userGroupIndices.value.length > 0 ? 0 : roundIndex
}

function updateScrollState() {
  const container = getScrollContainer();
  if (!container) return;

  const { scrollTop, scrollHeight, clientHeight } = container;
  
  isAtTop.value = scrollTop < 10;
  isAtBottom.value = scrollHeight - scrollTop - clientHeight < 50;

  updateCurrentRoundIndex();
}

function updateCurrentRoundIndex() {
  const container = getScrollContainer();
  if (!container) return;

  if (userGroupIndices.value.length === 0) {
    currentRoundIndex.value = -1;
    return;
  }

  const currentVirtualIndex = getCurrentVirtualIndex(container);
  currentRoundIndex.value = getRoundIndexForVirtualIndex(currentVirtualIndex);
}

function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}

const debouncedUpdateScrollState = debounce(updateScrollState, 100);

function scrollToTop() {
  emitter.emit('chat:scroll-to-top');
}

function scrollToBottom() {
  emitter.emit('chat:scroll-to-bottom');
}

function scrollToPreviousRound() {
  if (currentRoundIndex.value <= 0) return;
  const targetVirtualIndex = userGroupIndices.value[currentRoundIndex.value - 1];
  if (targetVirtualIndex == null) return;
  emitter.emit('chat:navigate-to-group', { groupIndex: targetVirtualIndex, smooth: true });
}

function scrollToNextRound() {
  if (currentRoundIndex.value >= totalRounds.value - 1) return;
  const targetVirtualIndex = userGroupIndices.value[currentRoundIndex.value + 1];
  if (targetVirtualIndex == null) return;
  emitter.emit('chat:navigate-to-group', { groupIndex: targetVirtualIndex, smooth: true });
}

let scrollContainer: HTMLElement | null = null;

onMounted(() => {
  scrollContainer = getScrollContainer();
  if (scrollContainer) {
    scrollContainer.addEventListener('scroll', debouncedUpdateScrollState);
    updateScrollState();
  }
});

onUnmounted(() => {
  if (scrollContainer) {
    scrollContainer.removeEventListener('scroll', debouncedUpdateScrollState);
  }
});

watch(() => chatStore.messages.length, () => {
  nextTick(() => {
    updateScrollState();
  });
});
</script>
