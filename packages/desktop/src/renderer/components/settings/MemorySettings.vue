<template>
  <section class="flex-1 min-w-0 bg-default rounded-xl overflow-y-auto">
    <div class="p-4 flex flex-col gap-4">
      <!-- 当前记忆 -->
      <div class="rounded-xl border border-default bg-elevated/30 p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-default">{{ t("settings.memory.current.title") }}</div>
            <div class="mt-1 text-sm text-muted">
              {{ t("settings.memory.current.description") }}
            </div>
          </div>
          <USwitch :model-value="true" disabled class="shrink-0" />
        </div>
      </div>

      <!-- 会话状态记忆 -->
      <div class="rounded-xl border border-default bg-elevated/30 p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-default">{{ t("settings.memory.sessionState.title") }}</div>
            <div class="mt-1 text-sm text-muted">
              {{ t("settings.memory.sessionState.description") }}
            </div>
          </div>
          <USwitch
            :model-value="memorySettings.sessionStateEnabled"
            @update:model-value="(v) => handleChange('sessionStateEnabled', v)"
            class="shrink-0"
          />
        </div>
      </div>

      <!-- 跨会话记忆 -->
      <div class="rounded-xl border border-default bg-elevated/30 p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-default">{{ t("settings.memory.crossSession.title") }}</div>
            <div class="mt-1 text-sm text-muted">
              {{ t("settings.memory.crossSession.description") }}
            </div>
          </div>
          <USwitch
            :model-value="memorySettings.crossSessionEnabled"
            @update:model-value="(v) => handleChange('crossSessionEnabled', v)"
            class="shrink-0"
          />
        </div>
      </div>

      <!-- 历史对话记忆 -->
      <div class="rounded-xl border border-default bg-elevated/30 p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-default">{{ t("settings.memory.historical.title") }}</div>
            <div class="mt-1 text-sm text-muted">
              {{ t("settings.memory.historical.description") }}
            </div>
          </div>
          <USwitch
            :model-value="memorySettings.historicalEnabled"
            @update:model-value="(v) => handleChange('historicalEnabled', v)"
            class="shrink-0"
          />
        </div>

        <div v-if="memorySettings.historicalEnabled" class="mt-4 flex flex-col gap-4">
          <div>
            <label class="block text-sm font-medium mb-2">{{ t("settings.memory.historical.embeddingModel") }}</label>
            <ModelSelector
              v-model="memorySettings.historicalEmbeddingModel"
              :show-default="true"
              model-type="embedding"
              @update:model-value="(value) => handleChange('historicalEmbeddingModel', value)"
            />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <UFormField>
              <template #label>
                <div class="inline-flex items-center gap-1">
                  <span>{{ t("settings.memory.historical.embeddingDimension") }}</span>
                  <UTooltip :text="t('settings.memory.historical.embeddingDimensionHelp')">
                    <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
                  </UTooltip>
                </div>
              </template>
              <UInput
                :model-value="historicalEmbeddingDimensionInput"
                type="number"
                :min="1"
                :placeholder="t('settings.memory.historical.dimensionPlaceholder')"
                class="w-full"
                @update:model-value="handleHistoricalDimensionInput"
                @blur="saveHistoricalAdvancedSettings"
              />
            </UFormField>

            <UFormField>
              <template #label>
                <div class="inline-flex items-center gap-1">
                  <span>{{ t("settings.memory.historical.maxRecall") }}</span>
                  <UTooltip :text="t('settings.memory.historical.maxRecallHelp')">
                    <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
                  </UTooltip>
                </div>
              </template>
              <UInput
                :model-value="historicalMaxRecallInput"
                type="number"
                :min="1"
                :max="10"
                class="w-full"
                @update:model-value="handleHistoricalMaxRecallInput"
                @blur="saveHistoricalAdvancedSettings"
              />
            </UFormField>

            <UFormField>
              <template #label>
                <div class="inline-flex items-center gap-1">
                  <span>{{ t("settings.memory.historical.minScore") }}</span>
                  <UTooltip :text="t('settings.memory.historical.minScoreHelp')">
                    <UIcon name="i-lucide-circle-question-mark" class="size-3.5 text-muted" />
                  </UTooltip>
                </div>
              </template>
              <UInput
                :model-value="historicalMinScoreInput"
                type="number"
                :min="0"
                :max="1"
                step="0.01"
                class="w-full"
                @update:model-value="handleHistoricalMinScoreInput"
                @blur="saveHistoricalAdvancedSettings"
              />
            </UFormField>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default bg-default p-3">
            <div class="text-sm text-toned">
              {{ t("settings.memory.historical.indexStats", {
                count: historicalStats.chunkCount,
                dimension: historicalStats.vectorDimension ?? t("settings.memory.historical.unknown"),
                last: formatStatsTime(historicalStats.lastIndexedAt)
              }) }}
            </div>
            <div class="flex items-center gap-2">
              <UButton
                icon="i-lucide-search"
                variant="soft"
                color="neutral"
                @click="openHistoricalRecallTest"
              >
                {{ t("settings.memory.historical.testRecall") }}
              </UButton>
              <UButton
                icon="i-lucide-refresh-cw"
                variant="outline"
                color="neutral"
                :loading="isRebuildingHistoricalIndex"
                @click="handleRebuildHistoricalIndex"
              >
                {{ t("settings.memory.historical.rebuild") }}
              </UButton>
              <UButton
                icon="i-lucide-trash-2"
                variant="outline"
                color="error"
                @click="handleClearHistoricalIndex"
              >
                {{ t("settings.memory.historical.clear") }}
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- 长期记忆 -->
      <div class="rounded-xl border border-default bg-elevated/30 p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-default">{{ t("settings.memory.longTerm.title") }}</div>
            <div class="mt-1 text-sm text-muted">
              {{ t("settings.memory.longTerm.description") }}
            </div>
          </div>
          <USwitch
            :model-value="memorySettings.longTermEnabled"
            @update:model-value="(v) => handleChange('longTermEnabled', v)"
            class="shrink-0"
          />
        </div>

        <div v-if="memorySettings.longTermEnabled" class="mt-4 flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <span class="text-sm text-toned">{{ t("settings.memory.longTerm.summary") }}</span>
            <UButton
              icon="i-lucide-plus"
              variant="soft"
              color="neutral"
              size="md"
              :disabled="longTermItems.length >= 20"
              @click="openMemoryModal()"
            >
              {{ t("settings.memory.longTerm.add") }}
            </UButton>
          </div>

          <UEmpty
            v-if="longTermItems.length === 0"
            icon="i-lucide-brain-cog"
            :title="t('settings.memory.longTerm.emptyTitle')"
            :description="t('settings.memory.longTerm.emptyDescription')"
            :actions="[{ icon: 'i-lucide-plus', label: t('settings.memory.longTerm.add'), onClick: () => openMemoryModal() }]"
          />

          <ul v-else class="flex flex-col gap-2">
            <li
              v-for="item in longTermItems"
              :key="item.key"
              class="flex flex-col gap-1 rounded-lg border border-default bg-default p-3"
            >
              <div class="flex items-center gap-2">
                <span class="flex-1 min-w-0 text-sm truncate">{{ item.value }}</span>
                <div class="flex items-center gap-1 shrink-0">
                  <UTooltip :text="t('settings.memory.item.edit')">
                    <UButton
                      icon="i-lucide-pencil"
                      variant="ghost"
                      color="neutral"
                      size="xs"
                      @click="openMemoryModal(item)"
                    />
                  </UTooltip>
                  <UTooltip :text="t('settings.memory.item.delete')">
                    <UButton
                      icon="i-lucide-trash-2"
                      variant="ghost"
                      color="neutral"
                      size="xs"
                      @click="handleRemove(item)"
                    />
                  </UTooltip>
                </div>
              </div>
              <div class="text-xs text-muted">
                <template v-if="item.sessionId">
                  {{ t("settings.memory.item.source") }}<a
                    href="#"
                    class="hover:underline cursor-pointer"
                    @click.prevent="goToSession(item.sessionId)"
                  >{{ item.sessionTitle || t("settings.memory.item.sourceFallback") }}</a>
                </template>
                <span v-else>{{ t("settings.memory.item.manual") }}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 新增/编辑弹窗（复用） -->
    <UModal
      v-model:open="showMemoryModal"
      :title="editingItem ? t('settings.memory.modal.editTitle') : t('settings.memory.modal.createTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <UFormField :label="t('settings.memory.modal.contentLabel')" :description="t('settings.memory.modal.contentDescription')">
          <UInput
            v-model="formValue"
            size="md"
            :placeholder="t('settings.memory.modal.placeholder')"
            :maxlength="100"
            class="w-full"
            autofocus
            @keydown.enter="handleMemoryModalSave"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="outline" color="neutral" @click="showMemoryModal = false">{{ t("common.cancel") }}</UButton>
          <UButton :disabled="!formValue.trim()" @click="handleMemoryModalSave">{{ t("common.confirm") }}</UButton>
        </div>
      </template>
    </UModal>

    <!-- 测试历史记忆召回 -->
    <UModal
      v-model:open="showHistoricalRecallTestModal"
      :title="t('settings.memory.historical.test.title')"
      :ui="{ content: 'max-w-3xl', footer: 'justify-end' }"
    >
      <template #body>
        <div class="space-y-4">
          <div
            v-if="!memorySettings.historicalEnabled"
            class="rounded-lg border border-default bg-elevated p-3 text-sm text-toned"
          >
            {{ t("settings.memory.historical.test.disabledHint") }}
          </div>

          <UFormField :label="t('settings.memory.historical.test.queryLabel')">
            <UTextarea
              v-model="historicalRecallTestQuery"
              :placeholder="t('settings.memory.historical.test.queryPlaceholder')"
              :rows="4"
              autoresize
              class="w-full"
              :disabled="isTestingHistoricalRecall"
            />
          </UFormField>

          <div v-if="historicalRecallTestResult" class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div class="rounded-lg border border-default bg-default p-3">
                <div class="text-xs text-muted">{{ t("settings.memory.historical.test.indexedChunks") }}</div>
                <div class="font-medium">{{ historicalRecallTestResult.stats.chunkCount }}</div>
              </div>
              <div class="rounded-lg border border-default bg-default p-3">
                <div class="text-xs text-muted">{{ t("settings.memory.historical.test.hitCount") }}</div>
                <div class="font-medium">{{ historicalRecallTestResult.hits.length }}</div>
              </div>
              <div class="rounded-lg border border-default bg-default p-3">
                <div class="text-xs text-muted">{{ t("settings.memory.historical.test.duration") }}</div>
                <div class="font-medium">{{ formatDuration(historicalRecallTestResult.duration) }}</div>
              </div>
              <div class="rounded-lg border border-default bg-default p-3">
                <div class="text-xs text-muted">{{ t("settings.memory.historical.test.currentEmbeddingModel") }}</div>
                <div class="font-medium truncate">
                  {{ historicalRecallTestResult.stats.currentEmbeddingModel || t("settings.memory.historical.unknown") }}
                </div>
              </div>
              <div class="rounded-lg border border-default bg-default p-3">
                <div class="text-xs text-muted">{{ t("settings.memory.historical.test.indexModel") }}</div>
                <div class="font-medium truncate">
                  {{ historicalRecallTestResult.stats.embeddingModel || t("settings.memory.historical.unknown") }}
                </div>
              </div>
              <div class="rounded-lg border border-default bg-default p-3">
                <div class="text-xs text-muted">{{ t("settings.memory.historical.test.threshold") }}</div>
                <div class="font-medium">
                  {{ t("settings.memory.historical.test.thresholdValue", {
                    maxRecall: historicalRecallTestResult.settings.maxRecall,
                    minScore: formatScore(historicalRecallTestResult.settings.minScore)
                  }) }}
                </div>
              </div>
            </div>

            <UEmpty
              v-if="historicalRecallTestResult.stats.chunkCount === 0"
              icon="i-lucide-database"
              :title="t('settings.memory.historical.test.emptyIndexTitle')"
              :description="t('settings.memory.historical.test.emptyIndexDescription')"
            />
            <UEmpty
              v-else-if="historicalRecallTestResult.hits.length === 0"
              icon="i-lucide-search-x"
              :title="t('settings.memory.historical.test.noResultsTitle')"
              :description="t('settings.memory.historical.test.noResultsDescription')"
            />
            <div v-else class="space-y-2">
              <div
                v-for="hit in historicalRecallTestResult.hits"
                :key="hit.chunkId"
                class="rounded-lg border border-default bg-default p-3 space-y-2"
              >
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <span class="font-medium text-default">{{ hit.sessionTitle || hit.sessionId }}</span>
                  <span class="text-muted">{{ formatStatsTime(hit.createdAt) }}</span>
                  <span class="text-muted">score {{ formatScore(hit.score) }}</span>
                  <span
                    v-for="reason in hit.reason"
                    :key="reason"
                    class="px-1.5 py-0.5 rounded border border-default text-muted"
                  >
                    {{ reason }}
                  </span>
                </div>
                <div class="text-xs text-muted">
                  vector {{ formatOptionalScore(hit.vectorScore) }} · keyword {{ formatOptionalScore(hit.keywordScore) }}
                </div>
                <pre class="text-xs text-toned whitespace-pre-wrap break-all">{{ hit.contentPreview }}</pre>
              </div>
            </div>
          </div>

          <div
            v-if="historicalRecallTestError"
            class="rounded-lg border border-default bg-elevated p-3 text-sm text-error"
          >
            {{ historicalRecallTestError }}
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            variant="outline"
            color="neutral"
            @click="showHistoricalRecallTestModal = false"
          >
            {{ t("common.cancel") }}
          </UButton>
          <UButton
            icon="i-lucide-search"
            :loading="isTestingHistoricalRecall"
            :disabled="!historicalRecallTestQuery.trim()"
            @click="runHistoricalRecallTest"
          >
            {{ t("settings.memory.historical.test.run") }}
          </UButton>
        </div>
      </template>
    </UModal>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { loggerServiceRenderer } from "@shared";
import { useConfirm } from "@/composables/useConfirm";
import { useMyToast } from "@/composables/useMyToast";
import ModelSelector from "@/components/ModelSelector.vue";

const logger = loggerServiceRenderer.withContext("settings:memory");
const router = useRouter();
const { confirm } = useConfirm();
const toast = useMyToast();
const { t } = useI18n();

const DEFAULT_HISTORICAL_MAX_RECALL = 3;
const DEFAULT_HISTORICAL_MIN_SCORE = 0.58;

type HistoricalRecallTestHit = {
  chunkId: number;
  sessionId: string;
  sessionTitle: string;
  turnId: string;
  score: number;
  vectorScore?: number;
  keywordScore?: number;
  reason: string[];
  createdAt: number;
  updatedAt: number;
  contentPreview: string;
};

type HistoricalRecallTestResult = {
  query: string;
  duration: number;
  stats: {
    chunkCount: number;
    vectorReady: boolean;
    embeddingModel: string | null;
    vectorDimension: number | null;
    lastIndexedAt: number | null;
    currentEmbeddingModel: string | null;
  };
  settings: {
    enabled: boolean;
    maxRecall: number;
    minScore: number;
  };
  hits: HistoricalRecallTestHit[];
};

function goToSession(sessionId: string) {
  router.push({ name: "chat", params: { sessionId } });
}

const memorySettings = ref({
  sessionStateEnabled: true,
  crossSessionEnabled: true,
  longTermEnabled: true,
  historicalEnabled: false,
  historicalEmbeddingModel: "__default__",
  historicalEmbeddingDimension: null as number | null,
  historicalMaxRecall: DEFAULT_HISTORICAL_MAX_RECALL,
  historicalMinScore: DEFAULT_HISTORICAL_MIN_SCORE,
});

const longTermItems = ref<{ id: string; category: string; key: string; value: string; sessionId?: string | null; messageId?: string | null; sessionTitle?: string | null; createdAt: number; updatedAt: number }[]>([]);
const historicalStats = ref<{ chunkCount: number; vectorReady: boolean; embeddingModel: string | null; vectorDimension: number | null; lastIndexedAt: number | null }>({
  chunkCount: 0,
  vectorReady: false,
  embeddingModel: null,
  vectorDimension: null,
  lastIndexedAt: null,
});
const historicalEmbeddingDimensionInput = ref<string | number>("");
const historicalMaxRecallInput = ref<string | number>(DEFAULT_HISTORICAL_MAX_RECALL);
const historicalMinScoreInput = ref<string | number>(DEFAULT_HISTORICAL_MIN_SCORE);
const isRebuildingHistoricalIndex = ref(false);
const showMemoryModal = ref(false);
const showHistoricalRecallTestModal = ref(false);
const historicalRecallTestQuery = ref("");
const isTestingHistoricalRecall = ref(false);
const historicalRecallTestResult = ref<HistoricalRecallTestResult | null>(null);
const historicalRecallTestError = ref<string | null>(null);
const formValue = ref("");
const editingItem = ref<{ key: string; value: string } | null>(null);

async function loadSettings() {
  const data = await window.ipc("settings:getMemorySettings");
  memorySettings.value = {
    sessionStateEnabled: data.sessionStateEnabled,
    crossSessionEnabled: data.crossSessionEnabled,
    longTermEnabled: data.longTermEnabled,
    historicalEnabled: data.historicalEnabled,
    historicalEmbeddingModel: data.historicalEmbeddingModel,
    historicalEmbeddingDimension: data.historicalEmbeddingDimension,
    historicalMaxRecall: data.historicalMaxRecall,
    historicalMinScore: data.historicalMinScore,
  };
  historicalEmbeddingDimensionInput.value = data.historicalEmbeddingDimension ?? "";
  historicalMaxRecallInput.value = data.historicalMaxRecall;
  historicalMinScoreInput.value = data.historicalMinScore;
}

async function loadLongTermItems() {
  const items = await window.ipc("longTermMemory:list");
  longTermItems.value = items;
}

async function loadHistoricalStats() {
  historicalStats.value = await window.ipc("historicalMemory:getStats");
}

async function handleChange(
  key: keyof typeof memorySettings.value,
  value: boolean | string | number | null
) {
  const next = { ...memorySettings.value, [key]: value };
  try {
    await window.ipc("settings:setMemorySettings", next);
    memorySettings.value = next;
    logger.info("memory setting updated", { [key]: value });
  } catch (error) {
    logger.error("Failed to update memory setting", { error });
    toast.error({ title: t("settings.memory.saveFailed"), description: String(error) });
  }
}

function handleHistoricalDimensionInput(value: string | number) {
  historicalEmbeddingDimensionInput.value = value;
  const raw = String(value ?? "").trim();
  const parsed = Number(raw);
  memorySettings.value.historicalEmbeddingDimension = raw && Number.isFinite(parsed)
    ? Math.max(1, Math.floor(parsed))
    : null;
}

function handleHistoricalMaxRecallInput(value: string | number) {
  historicalMaxRecallInput.value = value;
  const raw = String(value ?? "").trim();
  const parsed = Number(raw);
  if (raw && Number.isFinite(parsed)) {
    memorySettings.value.historicalMaxRecall = Math.max(1, Math.min(10, Math.floor(parsed)));
  }
}

function handleHistoricalMinScoreInput(value: string | number) {
  historicalMinScoreInput.value = value;
  const raw = String(value ?? "").trim();
  const parsed = Number(raw);
  if (raw && Number.isFinite(parsed)) {
    memorySettings.value.historicalMinScore = Math.max(0, Math.min(1, parsed));
  }
}

function normalizeHistoricalAdvancedInputs() {
  const dimensionRaw = String(historicalEmbeddingDimensionInput.value ?? "").trim();
  const parsedDimension = Number(dimensionRaw);
  const normalizedDimension = dimensionRaw && Number.isFinite(parsedDimension)
    ? Math.max(1, Math.floor(parsedDimension))
    : null;

  const maxRecallRaw = String(historicalMaxRecallInput.value ?? "").trim();
  const parsedMaxRecall = Number(maxRecallRaw);
  const normalizedMaxRecall = maxRecallRaw && Number.isFinite(parsedMaxRecall)
    ? Math.max(1, Math.min(10, Math.floor(parsedMaxRecall)))
    : DEFAULT_HISTORICAL_MAX_RECALL;

  const minScoreRaw = String(historicalMinScoreInput.value ?? "").trim();
  const parsedMinScore = Number(minScoreRaw);
  const normalizedMinScore = minScoreRaw && Number.isFinite(parsedMinScore)
    ? Math.max(0, Math.min(1, parsedMinScore))
    : DEFAULT_HISTORICAL_MIN_SCORE;

  memorySettings.value.historicalEmbeddingDimension = normalizedDimension;
  memorySettings.value.historicalMaxRecall = normalizedMaxRecall;
  memorySettings.value.historicalMinScore = normalizedMinScore;
  historicalEmbeddingDimensionInput.value = normalizedDimension ?? "";
  historicalMaxRecallInput.value = normalizedMaxRecall;
  historicalMinScoreInput.value = normalizedMinScore;
}

async function saveHistoricalAdvancedSettings() {
  normalizeHistoricalAdvancedInputs();
  await handleChange("historicalEmbeddingDimension", memorySettings.value.historicalEmbeddingDimension);
  await handleChange("historicalMaxRecall", memorySettings.value.historicalMaxRecall);
  await handleChange("historicalMinScore", memorySettings.value.historicalMinScore);
}

function formatStatsTime(value: number | null) {
  if (!value) return t("settings.memory.historical.never");
  return new Date(value).toLocaleString();
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatScore(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : "-";
}

function formatOptionalScore(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "-";
}

async function handleRebuildHistoricalIndex() {
  isRebuildingHistoricalIndex.value = true;
  try {
    const res = await window.ipc("historicalMemory:rebuild");
    const hasFailures = res.result.failedTurns > 0;
    toast[hasFailures ? "warn" : "success"]({
      title: hasFailures
        ? t("settings.memory.historical.rebuildPartial")
        : t("settings.memory.historical.rebuildDone"),
      description: t("settings.memory.historical.rebuildDoneDescription", {
        turns: res.result.indexedTurns,
        chunks: res.result.indexedChunks,
        failed: res.result.failedTurns,
      }),
    });
    await loadHistoricalStats();
  } catch (error) {
    toast.error({ title: t("settings.memory.historical.rebuildFailed"), description: String(error) });
  } finally {
    isRebuildingHistoricalIndex.value = false;
  }
}

async function handleClearHistoricalIndex() {
  const confirmed = await confirm({
    title: t("settings.memory.historical.clearConfirmTitle"),
    content: t("settings.memory.historical.clearConfirmContent"),
    confirmText: t("settings.memory.historical.clear"),
    cancelText: t("common.cancel"),
    confirmColor: "error",
    confirmIcon: "i-lucide-trash-2"
  });
  if (!confirmed) return;

  const res = await window.ipc("historicalMemory:clear");
  if (res.ok) {
    toast.success({ title: t("settings.memory.historical.cleared") });
    await loadHistoricalStats();
  }
}

function openHistoricalRecallTest() {
  historicalRecallTestError.value = null;
  historicalRecallTestResult.value = null;
  showHistoricalRecallTestModal.value = true;
}

async function runHistoricalRecallTest() {
  const query = historicalRecallTestQuery.value.trim();
  if (!query || isTestingHistoricalRecall.value) return;

  isTestingHistoricalRecall.value = true;
  historicalRecallTestError.value = null;
  historicalRecallTestResult.value = null;
  try {
    const res = await window.ipc("historicalMemory:testRecall", { query });
    if (res.ok) {
      historicalRecallTestResult.value = res.result;
    } else {
      historicalRecallTestError.value = res.error || t("settings.memory.historical.test.failed");
    }
  } catch (error) {
    historicalRecallTestError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isTestingHistoricalRecall.value = false;
  }
}

function openMemoryModal(item?: { key: string; value: string }) {
  editingItem.value = item ?? null;
  formValue.value = item?.value ?? "";
  showMemoryModal.value = true;
}

async function handleMemoryModalSave() {
  const value = formValue.value.trim();
  if (!value) return;
  if (editingItem.value) {
    const res = await window.ipc("longTermMemory:updateByKey", { key: editingItem.value.key, value });
    if (res.ok) {
      showMemoryModal.value = false;
      editingItem.value = null;
      formValue.value = "";
      toast.success({ title: t("settings.memory.updated") });
      loadLongTermItems();
    } else {
      toast.error({ title: t("settings.memory.updateFailed") });
    }
  } else {
    const res = await window.ipc("longTermMemory:add", { value });
    if (res.ok) {
      showMemoryModal.value = false;
      formValue.value = "";
      toast.success({ title: t("settings.memory.added") });
      loadLongTermItems();
    } else {
      toast.error({ title: res.error || t("settings.memory.addFailed") });
    }
  }
}

async function handleRemove(item: { key: string; value: string }) {
  const confirmed = await confirm({
    title: t("settings.memory.deleteConfirmTitle"),
    content: t("settings.memory.deleteConfirmContent", { value: item.value }),
    confirmText: t("common.delete"),
    cancelText: t("common.cancel"),
    confirmColor: "error",
    confirmIcon: "i-lucide-trash-2",
  });
  if (!confirmed) return;

  const res = await window.ipc("longTermMemory:removeByKey", { key: item.key });
  if (res.ok) {
    toast.success({ title: t("settings.memory.deleted") });
    loadLongTermItems();
  } else {
    toast.error({ title: t("settings.memory.deleteFailed") });
  }
}

onMounted(() => {
  loadSettings();
  loadLongTermItems();
  loadHistoricalStats();
});

watch(
  () => memorySettings.value.longTermEnabled,
  (enabled) => {
    if (enabled) loadLongTermItems();
  }
);

watch(showMemoryModal, (open) => {
  if (!open) {
    editingItem.value = null;
    formValue.value = "";
  }
});

watch(showHistoricalRecallTestModal, (open) => {
  if (!open) {
    historicalRecallTestError.value = null;
    historicalRecallTestResult.value = null;
    isTestingHistoricalRecall.value = false;
  }
});
</script>
