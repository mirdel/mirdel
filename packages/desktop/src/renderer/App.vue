<template>
  <UApp
    :locale="appLocale"
    :tooltip="{ disableHoverableContent: true, ignoreNonKeyboardFocus: true, delayDuration: 0 }"
    :toaster="{ position: 'top-center', ui: { viewport: 'z-[9999]' } }"
  >
    <div v-if="!isAppReady" class="h-screen flex items-center justify-center bg-slate-300">
      <div class="flex flex-col items-center gap-3">
        <UIcon name="i-lucide-loader" class="size-8 animate-spin text-toned" />
      </div>
    </div>
    <RouterView v-else />

    <UModal
      v-model:open="welcomeModalOpen"
      :close="false"
      :dismissible="false"
      :ui="{
        content: 'max-w-xl',
        body: 'p-0',
        footer: 'justify-end gap-3'
      }"
    >
      <template #body>
        <div class="px-8 pt-9 pb-6">
          <div class="mx-auto mb-4 flex items-center justify-center">
            <div
              class="size-30 text-primary"
              v-html="mirdelLogoSvg"
            ></div>
          </div>

          <div class="space-y-4 text-center">
            <h1 class="text-2xl font-semibold text-default">
              {{ t("onboarding.welcome.title") }}
            </h1>
            <p class="text-md leading-8 text-default">
              {{ t("onboarding.welcome.description") }}
            </p>
          </div>
        </div>
      </template>

      <template #footer>
        <UButton variant="outline" color="neutral" size="lg" @click="handleSkipWelcome">
          {{ t("onboarding.welcome.skip") }}
        </UButton>
        <UButton size="lg" @click="handleOpenModelService">
          {{ t("onboarding.welcome.configure") }}
        </UButton>
      </template>
    </UModal>

    <UpdateReadyModal />
    <ReleaseNotesModal />
  </UApp>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useUpdateStore } from "@/stores/useUpdateStore";
import { loggerServiceRenderer } from "@shared";
import UpdateReadyModal from "@/components/updates/UpdateReadyModal.vue";
import ReleaseNotesModal from "@/components/updates/ReleaseNotesModal.vue";
import mirdelLogoSvgRaw from "@/assets/mirdel.svg?raw";
import { en, zh_cn, zh_tw } from '@nuxt/ui/locale'

const logger = loggerServiceRenderer.withContext("App");
const settingsStore = useSettingsStore();
const updateStore = useUpdateStore();
const router = useRouter();
const { locale, t } = useI18n();
const isAppReady = ref(false);
const welcomeModalOpen = ref(false);
const mirdelLogoSvg = mirdelLogoSvgRaw;
const appLocale = computed(() => {
  switch (locale.value) {
    case "en":
      return en;
    case "zh-TW":
      return zh_tw;
    case "zh-CN":
    default:
      return zh_cn;
  }
});

watch(
  () => settingsStore.resolvedLanguage,
  (nextLocale) => {
    locale.value = nextLocale;
    document.documentElement.lang = nextLocale;
    if (isAppReady.value) {
      void updateStore.loadChangelog(nextLocale);
    }
  },
  { immediate: true }
);

onMounted(async () => {
  try {
    await settingsStore.initialize();
    const result = await window.ipc("settings:getWelcomeOnboardingDismissedAt") as { dismissedAt: number | null };
    welcomeModalOpen.value = !result?.dismissedAt;
    await updateStore.initialize(settingsStore.resolvedLanguage);
    isAppReady.value = true;
    logger.info("app initialized successfully");
  } catch (error) {
    logger.error("failed to initialize app", { error });
    isAppReady.value = true;
  }
});

function resolveExternalUrl(url: string, baseUrl?: string): string | null {
  try {
    const parsed = new URL(url, baseUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 全局监听链接点击，拦截外部链接并在预览窗口中打开
 */
function handleGlobalClick(event: MouseEvent) {
  // 查找点击目标是否为 <a> 标签或其子元素
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest("a");
  
  if (!anchor) return;

  // 编辑器区域内（contenteditable）不做全局拦截，交给编辑器自身处理
  const editableContainer = anchor.closest('[contenteditable="true"]');
  if (editableContainer) return;
  
  const href = anchor.getAttribute("href");
  if (!href) return;

  const markdownContainer = anchor.closest("[data-markdown-link-base-url]");
  const markdownBaseUrl = markdownContainer instanceof HTMLElement
    ? markdownContainer.dataset.markdownLinkBaseUrl
    : undefined;
  const resolvedUrl = resolveExternalUrl(href, markdownBaseUrl);
  
  // 只拦截外部链接
  if (!resolvedUrl) return;
  
  // 阻止默认行为
  event.preventDefault();
  event.stopPropagation();
  
  // 在预览窗口中打开
  window.webPreview?.open(resolvedUrl);
}

onMounted(() => {
  // 使用 capture 阶段监听，确保能捕获所有链接点击
  document.addEventListener("click", handleGlobalClick, true);
});

onUnmounted(() => {
  document.removeEventListener("click", handleGlobalClick, true);
  updateStore.dispose();
});

async function dismissWelcomeModal() {
  await window.ipc("settings:dismissWelcomeOnboarding");
  welcomeModalOpen.value = false;
}

async function handleSkipWelcome() {
  await dismissWelcomeModal();
}

async function handleOpenModelService() {
  await dismissWelcomeModal();
  await router.push("/settings/model-service");
}

if (import.meta.env.DEV) {
  Object.assign(window, {
    __mirdelMockReleaseNotes: () => updateStore.openMockReleaseNotes(),
    __mirdelMockUpdateDownloaded: () => updateStore.mockDownloadedUpdateReady(),
  });
}
</script>
