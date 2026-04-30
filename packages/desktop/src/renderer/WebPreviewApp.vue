<template>
  <UApp
    :tooltip="{ disableHoverableContent: true, ignoreNonKeyboardFocus: true, delayDuration: 300 }"
    :toaster="{ position: 'top-right' }"
  >
    <div class="w-full h-full flex flex-col bg-muted relative">
      <!-- 工具栏 -->
      <div
        class="relative flex items-center gap-2 px-3 py-2 bg-muted/95 border-b border-default shrink-0"
        style="-webkit-app-region: drag;"
      >
        <!-- 为了避开 macOS 三色灯，预留一段左侧空白 -->
        <div class="w-16 shrink-0"></div>

        <!-- 导航按钮 -->
        <div class="flex items-center gap-1" style="-webkit-app-region: no-drag;">
          <UButton
            icon="i-lucide-arrow-left"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            :disabled="!canGoBack"
            @click="handleGoBack"
          />
          <UButton
            icon="i-lucide-arrow-right"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            :disabled="!canGoForward"
            @click="handleGoForward"
          />
          <UButton
            :icon="isLoading ? 'i-lucide-x' : 'i-lucide-refresh-cw'"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            @click="handleRefreshOrStop"
          />
        </div>

        <!-- 地址栏 -->
        <div
          class="flex-1 flex items-center gap-2 px-3 py-1.5 bg-default rounded-lg border border-default min-w-0"
          style="-webkit-app-region: no-drag;"
        >
          <UIcon
            :name="isSecure ? 'i-lucide-lock' : 'i-lucide-globe'"
            :class="isSecure ? 'text-green-500' : 'text-muted'"
            class="shrink-0"
          />
          <span class="flex-1 text-sm text-default truncate select-all">
            {{ displayUrl || "about:blank" }}
          </span>
        </div>

        <!-- 在浏览器中打开 -->
        <div class="flex items-center gap-1 shrink-0" style="-webkit-app-region: no-drag;">
          <UButton
            icon="i-lucide-external-link"
            size="md"
            color="neutral"
            variant="outline"
            @click="handleOpenInBrowser"
          >
            {{ t('webPreview.openInBrowser') }}
          </UButton>
        </div>
      </div>

      <!-- 加载进度条（细线，叠加在工具栏底部） -->
      <div
        v-if="isLoading"
        class="absolute bottom-0 left-0 right-0 h-0.5 bg-elevated"
      >
        <div
          class="h-full bg-accented transition-all duration-300"
          :style="{ width: `${loadingProgress}%` }"
        />
      </div>

      <div
        v-if="loadError"
        class="flex-1 min-h-0 flex items-start justify-center px-8 pt-[18vh] bg-default"
        style="-webkit-app-region: no-drag;"
      >
        <div class="w-full max-w-2xl">
          <UIcon name="i-lucide-circle-alert" class="mb-5 size-12 text-muted" />
          <h1 class="text-2xl font-semibold text-default">{{ t("web.openFailed") }}</h1>
          <p class="mt-3 text-sm text-muted">{{ t("web.openFailedDescription") }}</p>
          <div class="mt-5 space-y-2 rounded-lg border border-default bg-muted/40 p-4 text-sm">
            <div class="truncate text-muted">{{ loadError.url }}</div>
            <div class="text-toned">{{ t("web.errorDetail", { error: loadError.description }) }}</div>
          </div>
          <div class="mt-6 flex items-center gap-2">
            <UButton icon="i-lucide-refresh-cw" color="neutral" @click="handleRefreshOrStop">
              {{ t("webApp.reload") }}
            </UButton>
            <UButton icon="i-lucide-external-link" color="neutral" variant="outline" @click="handleOpenInBrowser">
              {{ t("webPreview.openInBrowser") }}
            </UButton>
          </div>
        </div>
      </div>

    </div>
  </UApp>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { initColorModeForWindow } from "@/utils/initColorMode";

type WebLoadError = {
  code: number;
  description: string;
  url: string;
};

const { t } = useI18n();
const currentUrl = ref("");
const isLoading = ref(false);
const loadingProgress = ref(0);
const canGoBack = ref(false);
const canGoForward = ref(false);
const isSecure = ref(false);
const loadError = ref<WebLoadError | null>(null);
const displayUrl = computed(() => currentUrl.value || loadError.value?.url || "");

let progressInterval: ReturnType<typeof setInterval> | null = null;
let removeStateListener: (() => void) | null = null;

function handleGoBack() {
  window.webPreview?.goBack();
}

function handleGoForward() {
  window.webPreview?.goForward();
}

function handleRefreshOrStop() {
  if (isLoading.value) {
    window.webPreview?.stop();
  } else {
    window.webPreview?.reload();
  }
}

async function handleOpenInBrowser() {
  if (!displayUrl.value) return;
  try {
    await window.webPreview?.openInBrowser(displayUrl.value);
  } catch (error) {
    console.error("Failed to open in browser:", error);
  }
}

function handleStateUpdate(state: {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  loadError: WebLoadError | null;
}) {
  currentUrl.value = state.url;
  canGoBack.value = state.canGoBack;
  canGoForward.value = state.canGoForward;
  isSecure.value = state.url.startsWith("https://");
  loadError.value = state.loadError;

  if (state.isLoading) {
    isLoading.value = true;
    loadingProgress.value = 20;
    if (progressInterval) clearInterval(progressInterval);
    progressInterval = setInterval(() => {
      if (loadingProgress.value < 90) {
        loadingProgress.value += Math.random() * 10;
      }
    }, 200);
  } else {
    isLoading.value = false;
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    loadingProgress.value = 100;
    setTimeout(() => {
      if (!isLoading.value) loadingProgress.value = 0;
    }, 300);
  }
}

onMounted(() => {
  if (window.webPreview?.onState) {
    removeStateListener = window.webPreview.onState(handleStateUpdate);
  }
  initColorModeForWindow();
});

onUnmounted(() => {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  if (removeStateListener) {
    removeStateListener();
    removeStateListener = null;
  }
});
</script>
