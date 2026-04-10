<template>
  <section class="flex-1 min-w-0 ml-[6px] h-full bg-default rounded-xl overflow-hidden flex flex-col">
    <!-- 顶部：目标语言、翻译按钮、快捷键提示、模型选择器（最右） -->
    <div class="h-14 border-b border-default flex items-center gap-3 px-4 shrink-0">
      <span class="text-sm text-muted shrink-0">{{ t("translate.main.targetLanguage") }}</span>
      <USelect
        v-model="targetLang"
        :items="targetLangOptions"
        value-key="value"
        size="sm"
        class="w-36"
      />
      <UButton
        icon="i-lucide-file-input"
        size="sm"
        variant="soft"
        color="neutral"
        :disabled="loading"
        @click="handleSelectFile"
      >{{ t("translate.main.selectFile") }}</UButton>
      <UButton
        :icon="loading ? 'i-lucide-circle-stop' : 'i-lucide-languages'"
        size="sm"
        :disabled="!loading && !canTranslate"
        @click="handleTranslateAction"
      >{{ loading ? t("translate.main.abort") : t("translate.main.translate") }}</UButton>
      <ModelSelector
        v-model="selectedModel"
        model-type="translate"
        :show-default="true"
        :ghost="false"
        class="min-w-[140px] ml-auto"
      />
    </div>

    <!-- 下方：左右分割：输入 | 结果 -->
    <div class="flex-1 min-h-0 flex overflow-hidden">
      <div class="flex-1 min-w-0 flex flex-col p-3 min-h-0 overflow-hidden">
        <div class="flex flex-col flex-1 min-h-0">
          <UTextarea
            ref="textareaRef"
            v-model="inputText"
            :placeholder="textareaPlaceholder"
            size="xl"
            class="w-full h-full resize-none"
            :ui="{ base: 'h-full resize-none p-4' }"
            variant="outline"
            :disabled="loading"
            @keydown="handleKeydown"
          />
        </div>
      </div>
      <div class="flex-1 min-w-0 overflow-y-auto p-3">
        <div v-if="currentResult" class="flex flex-col gap-3">
          <TranslateResultCard :result="currentResult" :source-text="lastSourceText" />
        </div>
        <div v-else-if="streamingTranslationText" class="text-base leading-relaxed text-default whitespace-pre-wrap break-words py-3">
          {{ streamingTranslationText }}
        </div>
        <div v-else class="h-full flex items-center justify-center text-muted text-sm">
          {{ t("translate.main.resultPlaceholder") }}
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { useMyToast } from "@/composables/useMyToast";
import { TARGET_LANG_VALUES } from "@/config/translate-lang-config";
import { isMac } from "@/utils/platformUtils";
import { useSettingsStore } from "@/stores/useSettingsStore";
import ModelSelector from "@/components/ModelSelector.vue";
import TranslateResultCard from "./TranslateResultCard.vue";
import type { TranslateStreamEvent } from "@shared";

type TranslateResult = {
  detected: { type: "term" | "text"; sourceLang: string; confidence: number };
  translation: { targetLang: string; text: string };
  termCard?: Record<string, unknown>;
};

const props = defineProps<{
  initialRecord?: {
    id: string;
    input: string;
    result: string;
    targetLang: string;
  } | null;
}>();

const emit = defineEmits<{
  translated: [record: { id: string; input: string; result: string; targetLang: string }];
}>();

const { t, locale } = useI18n();
const toast = useMyToast();
const settingsStore = useSettingsStore();

const inputText = ref("");
const targetLang = ref("zh");
const selectedModel = ref("__default__");
const loading = ref(false);
const currentResult = ref<TranslateResult | null>(null);
const lastSourceText = ref("");
const streamingTranslationText = ref("");
const textareaRef = ref(null);
const activeRequestId = ref<string | null>(null);
const aborting = ref(false);
let removeTranslateStream: (() => void) | null = null;

function focusInput() {
  nextTick(() => textareaRef.value?.textareaRef?.focus());
}

defineExpose({ focusInput });

const canTranslate = computed(() => {
  return inputText.value.trim().length > 0 && !loading.value;
});

const textareaPlaceholder = computed(() => {
  const shortcut = isMac() ? "⌘+Enter" : "Ctrl+Enter";
  return t("translate.main.textareaPlaceholder", { shortcut });
});

const targetLangOptions = computed(() => {
  const displayNames = typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames([locale.value], { type: "language" })
    : null;

  return TARGET_LANG_VALUES.map((value) => ({
    value,
    label: displayNames?.of(value) || value,
  }));
});

const translateFileFilters = computed(() => [
  {
    name: t("translate.fileFilter.documents"),
    extensions: [
      "txt",
      "md",
      "markdown",
      "json",
      "csv",
      "pdf",
      "docx",
      "doc",
      "pptx",
      "ppt",
      "xlsx",
      "xls",
      "odt",
      "odp",
      "ods",
      "rtf",
    ],
  },
  { name: t("translate.fileFilter.allFiles"), extensions: ["*"] },
]);

function createTranslateRequestId() {
  return `translate_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function handleTranslateStreamEvent(event: TranslateStreamEvent) {
  if (!activeRequestId.value || event.requestId !== activeRequestId.value) return;
  if (event.type === "partial") {
    streamingTranslationText.value = String(event.translationText || "");
  }
}

async function abortActiveTranslation(options?: { clearLocalState?: boolean }) {
  const requestId = activeRequestId.value;
  if (!requestId) return;
  const clearLocalState = options?.clearLocalState !== false;
  if (clearLocalState) {
    activeRequestId.value = null;
    loading.value = false;
    aborting.value = false;
  }
  try {
    await window.ipc("translate:abort", { requestId });
  } catch {
    // ignore abort errors
  }
}

onMounted(() => {
  if (window.translate?.onStream) {
    removeTranslateStream = window.translate.onStream((event) => {
      handleTranslateStreamEvent(event);
    });
  }
});

onUnmounted(() => {
  void abortActiveTranslation({ clearLocalState: true });
  if (removeTranslateStream) {
    removeTranslateStream();
    removeTranslateStream = null;
  }
});

watch(
  () => props.initialRecord,
  (record) => {
    void abortActiveTranslation({ clearLocalState: true });
    if (record) {
      inputText.value = record.input;
      targetLang.value = record.targetLang;
      try {
        currentResult.value = JSON.parse(record.result) as TranslateResult;
        lastSourceText.value = record.input;
        streamingTranslationText.value = "";
      } catch {
        currentResult.value = null;
        lastSourceText.value = "";
        streamingTranslationText.value = "";
      }
    } else {
      inputText.value = "";
      currentResult.value = null;
      lastSourceText.value = "";
      streamingTranslationText.value = "";
    }
  },
  { immediate: true }
);

async function handleTranslate() {
  if (!canTranslate.value) return;
  const model = resolveTranslateRequestModel();
  if (model === null) {
    toast.error({ title: t("translate.main.selectModelFirst") });
    return;
  }
  await abortActiveTranslation({ clearLocalState: true });

  const input = inputText.value.trim();
  const lang = targetLang.value;
  const requestId = createTranslateRequestId();

  activeRequestId.value = requestId;
  loading.value = true;
  aborting.value = false;
  currentResult.value = null;
  streamingTranslationText.value = "";

  try {
    const ret = await window.ipc("translate:translate", { requestId, input, targetLang: lang, model });
    if (activeRequestId.value !== requestId) return;

    if (ret?.ok && ret.result) {
      currentResult.value = ret.result as TranslateResult;
      lastSourceText.value = input;
      streamingTranslationText.value = "";
      emit("translated", ret.record);
    } else if (!ret?.aborted) {
      toast.error({ title: t("translate.main.translateFailed"), description: ret?.error ?? t("translate.main.unknownError") });
    } else {
      streamingTranslationText.value = "";
    }
  } catch (e) {
    if (activeRequestId.value !== requestId) return;
    toast.error({
      title: t("translate.main.translateFailed"),
      description: e instanceof Error ? e.message : String(e),
    });
  } finally {
    if (activeRequestId.value === requestId) {
      loading.value = false;
      aborting.value = false;
      activeRequestId.value = null;
    }
  }
}

function resolveTranslateRequestModel(): string | undefined | null {
  const selected = String(selectedModel.value || "").trim();
  if (!selected) return null;

  const effectiveModel = selected === "__default__"
    ? (() => {
        const model = settingsStore.defaultModels?.translate;
        if (!model?.providerId || !model?.modelId) return null;
        return `${model.providerId}::${model.modelId}`;
      })()
    : selected;

  if (!effectiveModel) return null;
  const [providerId, modelId] = effectiveModel.split("::");
  if (!providerId || !modelId) return null;

  const provider = settingsStore.enabledProviders.find((item) => item.id === providerId);
  if (!provider) return null;
  if (!provider.models.some((item) => item.id === modelId)) return null;
  if (!settingsStore.isProviderModelSelectable(providerId, modelId)) return null;

  return selected === "__default__" ? undefined : effectiveModel;
}

async function handleAbortTranslation() {
  if (!loading.value || aborting.value) return;
  aborting.value = true;
  await abortActiveTranslation({ clearLocalState: false });
}

function handleTranslateAction() {
  if (loading.value) {
    void handleAbortTranslation();
    return;
  }
  void handleTranslate();
}

function handleKeydown(e: KeyboardEvent) {
  if (loading.value) return;
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    handleTranslate();
  }
}

async function handleSelectFile() {
  const result = await window.ipc("dialog:selectFile", {
    title: t("translate.main.selectFileTitle"),
    multiSelections: false,
    filters: translateFileFilters.value,
  });
  if (result.canceled || !result.filePaths?.length) return;
  const filePath = result.filePaths[0];
  const ret = await window.ipc("translate:readFile", { filePath });
  if (ret.ok && ret.content != null) {
    inputText.value = ret.content;
    currentResult.value = null;
    streamingTranslationText.value = "";
  } else {
    toast.error({ title: t("translate.main.readFileFailed"), description: ret?.error ?? t("translate.main.unknownError") });
  }
}
</script>
