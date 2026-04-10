<template>
  <div
    v-if="chatStore.messages.length > 0"
    class="absolute right-3 top-1/2 -translate-y-1/2 z-20"
  >
    <div class="flex flex-col gap-2">
      <!-- 回到顶部 -->
      <UTooltip :text="t('chat.nav.top')" :content="{ side: 'left' }">
        <UButton
          icon="i-lucide-arrow-up-to-line"
          size="sm"
          color="neutral"
          variant="soft"
          square
          :disabled="isAtTop"
          @click="scrollToTop"
        />
      </UTooltip>

      <!-- 上一轮对话 -->
      <UTooltip :text="t('chat.nav.previousRound')" :content="{ side: 'left' }">
        <UButton
          icon="i-lucide-arrow-down-to-dot"
          size="sm"
          color="neutral"
          variant="soft"
          square
          :disabled="!hasPreviousRound"
          style="transform: rotate(180deg);"
          @click="scrollToPreviousRound"
        />
      </UTooltip>

      <!-- 对话导航 -->
      <UTooltip v-if="!tocOpen" :text="t('chat.nav.toc')" :kbds="['meta', 'L']" :content="{ side: 'left' }">
        <UButton
          icon="i-lucide-list"
          size="sm"
          color="neutral"
          variant="soft"
          square
          @click="toggleToc"
        />
      </UTooltip>

      <!-- 下一轮对话 -->
      <UTooltip :text="t('chat.nav.nextRound')" :content="{ side: 'left' }">
        <UButton
          icon="i-lucide-arrow-down-to-dot"
          size="sm"
          color="neutral"
          variant="soft"
          square
          :disabled="!hasNextRound"
          @click="scrollToNextRound"
        />
      </UTooltip>

      <!-- 回到底部 -->
      <UTooltip :text="t('chat.nav.bottom')" :content="{ side: 'left' }">
        <UButton
          icon="i-lucide-arrow-down-to-line"
          size="sm"
          color="neutral"
          variant="soft"
          square
          :disabled="isAtBottom"
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

const tocOpen = defineModel<boolean>('tocOpen', { default: false })

const chatStore = useChatStore();
const { t } = useI18n();

// 切换 TOC 侧边栏
function toggleToc() {
  tocOpen.value = !tocOpen.value
}

// 状态
const isAtTop = ref(false);
const isAtBottom = ref(false);
const currentRoundIndex = ref(-1);
const totalRounds = ref(0);

// 获取滚动容器
function getScrollContainer(): HTMLElement | null {
  return document.querySelector('[data-chat-message-scroll]') as HTMLElement;
}

// 获取所有对话轮次（user 消息的 DOM 元素）
function getRoundElements(): HTMLElement[] {
  const container = getScrollContainer();
  if (!container) return [];
  
  const userMessages = container.querySelectorAll('[data-message-role="user"]');
  return Array.from(userMessages) as HTMLElement[];
}

const hasPreviousRound = computed(() => currentRoundIndex.value > 0);
const hasNextRound = computed(() => currentRoundIndex.value < totalRounds.value - 1);

// 更新滚动状态
function updateScrollState() {
  const container = getScrollContainer();
  if (!container) return;

  const { scrollTop, scrollHeight, clientHeight } = container;
  
  isAtTop.value = scrollTop < 10;
  isAtBottom.value = scrollHeight - scrollTop - clientHeight < 50;

  updateCurrentRoundIndex();
}

// 更新当前所在的对话轮次：找最后一个已滚过视口上方 30% 线的 user 消息
function updateCurrentRoundIndex() {
  const container = getScrollContainer();
  if (!container) return;

  const rounds = getRoundElements();
  totalRounds.value = rounds.length;

  if (rounds.length === 0) {
    currentRoundIndex.value = -1;
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const threshold = containerRect.top + containerRect.height * 0.3;

  let foundIndex = 0;
  for (let i = rounds.length - 1; i >= 0; i--) {
    const rect = rounds[i].getBoundingClientRect();
    if (rect.top <= threshold) {
      foundIndex = i;
      break;
    }
  }

  currentRoundIndex.value = foundIndex;
}

// 防抖函数
function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}

const debouncedUpdateScrollState = debounce(updateScrollState, 100);

function scrollToTop() {
  const container = getScrollContainer();
  if (!container) return;

  container.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function scrollToBottom() {
  const container = getScrollContainer();
  if (!container) return;

  container.scrollTo({
    top: container.scrollHeight,
    behavior: 'smooth'
  });
}

function scrollToPreviousRound() {
  const rounds = getRoundElements();
  if (currentRoundIndex.value <= 0) return;

  const targetElement = rounds[currentRoundIndex.value - 1];
  if (!targetElement) return;

  targetElement.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

function scrollToNextRound() {
  const rounds = getRoundElements();
  if (currentRoundIndex.value >= rounds.length - 1) return;

  const targetElement = rounds[currentRoundIndex.value + 1];
  if (!targetElement) return;

  targetElement.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

// 监听滚动事件
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

// 消息变化时重新计算（处理新增消息后按钮状态更新）
watch(() => chatStore.messages.length, () => {
  nextTick(() => {
    updateScrollState();
  });
});
</script>
