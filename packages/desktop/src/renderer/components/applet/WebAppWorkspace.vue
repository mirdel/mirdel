<template>
  <div class="h-full min-h-0 flex flex-col bg-default">
    <div class="h-11 shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 bg-default">
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-arrow-left"
          size="sm"
          variant="ghost"
          color="neutral"
          :disabled="!state.canGoBack"
          @click="goBack"
        />
        <UButton
          icon="i-lucide-arrow-right"
          size="sm"
          variant="ghost"
          color="neutral"
          :disabled="!state.canGoForward"
          @click="goForward"
        />
        <UButton
          icon="i-lucide-rotate-cw"
          size="sm"
          variant="ghost"
          color="neutral"
          @click="reload"
        />
      </div>
      <div class="min-w-0 max-w-96 truncate text-sm font-medium text-default">
        {{ app.name }}
      </div>
      <div class="flex items-center justify-end gap-1">
        <UButton
          :icon="linkCopyFeedback ? 'i-lucide-check' : 'i-lucide-link'"
          size="sm"
          variant="ghost"
          color="neutral"
          @click="copyLink"
        />
        <UButton
          icon="i-lucide-compass"
          size="sm"
          variant="ghost"
          color="neutral"
          @click="openInBrowser"
        />
        <UButton
          icon="i-lucide-x"
          size="sm"
          variant="ghost"
          color="neutral"
          @click="closeCurrentApplet"
        />
      </div>
    </div>
    <div ref="contentRef" class="relative flex-1 min-h-0 bg-default">
      <div v-if="currentLoadError" class="absolute inset-0 flex items-start justify-center overflow-auto px-8 pt-[18vh]">
        <div class="w-full max-w-2xl">
          <UIcon name="i-lucide-circle-alert" class="mb-5 size-12 text-muted" />
          <h1 class="text-2xl font-semibold text-default">{{ t("web.openFailed") }}</h1>
          <p class="mt-3 text-sm text-muted">{{ t("web.openFailedDescription") }}</p>
          <div class="mt-5 space-y-2 rounded-lg border border-default bg-muted/40 p-4 text-sm">
            <div v-if="currentLoadError.url" class="truncate text-muted">{{ currentLoadError.url }}</div>
            <div class="text-toned">{{ t("web.errorDetail", { error: currentLoadError.description }) }}</div>
          </div>
          <div class="mt-6 flex items-center gap-2">
            <UButton icon="i-lucide-refresh-cw" color="neutral" :disabled="!app.webUrl" @click="reload">
              {{ t("webApp.reload") }}
            </UButton>
            <UButton icon="i-lucide-compass" color="neutral" variant="outline" :disabled="!displayUrl" @click="openInBrowser">
              {{ t("webApp.openInBrowser") }}
            </UButton>
          </div>
        </div>
      </div>
      <div v-else-if="state.isLoading && !state.url" class="absolute inset-0 flex items-center justify-center text-muted">
        <UIcon name="i-lucide-loader" class="size-5 animate-spin" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useOpenedAppStore, type OpenedApplet } from "@/stores/useOpenedAppStore";
import { copyToClipboard } from "@/utils/clipboard";

const props = defineProps<{
  app: OpenedApplet;
}>();

type WebLoadError = {
  code: number;
  description: string;
  url: string;
};

const { t } = useI18n();
const router = useRouter();
const openedAppStore = useOpenedAppStore();
const linkCopyFeedback = ref(false);
const contentRef = ref<HTMLElement | null>(null);
const state = reactive({
  url: "",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  loadError: null as WebLoadError | null,
});
const displayUrl = computed(() => state.url || state.loadError?.url || props.app.webUrl || "");
const currentLoadError = computed<WebLoadError | null>(() => {
  if (state.loadError) return state.loadError;
  if (props.app.webUrl) return null;
  return {
    code: 0,
    description: t("webApp.invalidUrl"),
    url: "",
  };
});

let resizeObserver: ResizeObserver | null = null;
let unsubscribeState: (() => void) | null = null;
let animationFrame = 0;
let linkCopyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

const LINK_COPY_FEEDBACK_MS = 2000;

function clearLinkCopyFeedbackTimer() {
  if (linkCopyFeedbackTimer) {
    clearTimeout(linkCopyFeedbackTimer);
    linkCopyFeedbackTimer = null;
  }
}

function getBounds() {
  const rect = contentRef.value?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  };
}

function updateBounds() {
  if (!props.app.webUrl) return;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(() => {
    animationFrame = 0;
    window.appWebView.setBounds({
      appletId: props.app.id,
      bounds: getBounds(),
    });
  });
}

async function showWebView() {
  if (!props.app.webUrl) return;
  await nextTick();
  const result = await window.appWebView.show({
    appletId: props.app.id,
    url: props.app.webUrl,
    bounds: getBounds(),
  });
  if (!result.ok) {
    state.loadError = {
      code: 0,
      description: result.error || t("webApp.invalidUrl"),
      url: props.app.webUrl,
    };
    return;
  }
  if (result.ok) updateBounds();
}

function openInBrowser() {
  if (!displayUrl.value) return;
  void window.appWebView.openInBrowser({
    appletId: props.app.id,
    url: displayUrl.value,
  });
}

function goBack() {
  window.appWebView.goBack(props.app.id);
}

function goForward() {
  window.appWebView.goForward(props.app.id);
}

function reload() {
  state.loadError = null;
  if (!state.url && props.app.webUrl) {
    void showWebView();
  }
  window.appWebView.reload(props.app.id);
}

async function copyLink() {
  const url = displayUrl.value;
  if (!url) return;
  const ok = await copyToClipboard(url);
  if (!ok) return;
  linkCopyFeedback.value = true;
  clearLinkCopyFeedbackTimer();
  linkCopyFeedbackTimer = setTimeout(() => {
    linkCopyFeedback.value = false;
    linkCopyFeedbackTimer = null;
  }, LINK_COPY_FEEDBACK_MS);
}

async function closeCurrentApplet() {
  await openedAppStore.closeApplet(props.app.id);
  await router.push({ name: "applet" });
}

function subscribeState() {
  if (unsubscribeState) return;
  unsubscribeState = window.appWebView.onState((nextState) => {
    if (nextState.appletId !== props.app.id) return;
    state.url = nextState.url;
    state.canGoBack = nextState.canGoBack;
    state.canGoForward = nextState.canGoForward;
    state.isLoading = nextState.isLoading;
    state.loadError = nextState.loadError;
  });
}

function disconnect() {
  clearLinkCopyFeedbackTimer();
  linkCopyFeedback.value = false;
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }
  resizeObserver?.disconnect();
  resizeObserver = null;
  unsubscribeState?.();
  unsubscribeState = null;
}

watch(
  () => openedAppStore.isAppletOpened(props.app.id),
  (isOpened) => {
    if (!isOpened) {
      window.appWebView.close(props.app.id);
    }
  }
);

onMounted(() => {
  subscribeState();
  if (contentRef.value) {
    resizeObserver = new ResizeObserver(updateBounds);
    resizeObserver.observe(contentRef.value);
  }
  void showWebView();
});

onActivated(() => {
  subscribeState();
  void showWebView();
});

onDeactivated(() => {
  window.appWebView.hide(props.app.id);
});

onUnmounted(() => {
  disconnect();
  window.appWebView.hide(props.app.id);
});
</script>
