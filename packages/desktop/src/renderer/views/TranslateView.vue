<template>
  <div class="h-full flex gap-0">
    <div class="shrink-0 h-full">
      <TranslateHistoryPanel
        :history="history"
        :selected-id="selectedHistoryId"
        @new="handleStartNew"
        @select="handleHistorySelect"
        @delete="handleHistoryDelete"
      />
    </div>
    <div class="flex-1 min-w-0 h-full">
      <TranslateMainArea
        ref="mainAreaRef"
        :initial-record="selectedRecord"
        @translated="handleTranslated"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import TranslateHistoryPanel from "@/components/translate/TranslateHistoryPanel.vue";
import TranslateMainArea from "@/components/translate/TranslateMainArea.vue";
import {
  buildTranslateRouteQuery,
  resolveTranslateSelection,
  type TranslateHistoryRecord,
} from "./translateViewModel";

type TranslateRecord = TranslateHistoryRecord;

const history = ref<TranslateRecord[]>([]);
const selectedHistoryId = ref<string | null>(null);
const selectedRecord = ref<TranslateRecord | null>(null);
const mainAreaRef = ref<InstanceType<typeof TranslateMainArea> | null>(null);
const route = useRoute();
const router = useRouter();

function setRouteRecordId(recordId: string | null) {
  void router.replace({
    name: "translate",
    query: buildTranslateRouteQuery(route.query as Record<string, unknown>, recordId),
  });
}

function syncSelectedRecordFromRoute() {
  const recordId = typeof route.query.recordId === "string" ? route.query.recordId : null;
  const selection = resolveTranslateSelection(history.value, recordId);
  selectedHistoryId.value = selection.selectedHistoryId;
  selectedRecord.value = selection.selectedRecord;
}

async function loadHistory() {
  history.value = await window.ipc("translate:listHistory");
  syncSelectedRecordFromRoute();
}

function handleStartNew() {
  setRouteRecordId(null);
  selectedHistoryId.value = null;
  selectedRecord.value = null;
  nextTick(() => mainAreaRef.value?.focusInput?.());
}

defineShortcuts({
  meta_n: {
    usingInput: true,
    handler: () => {
      handleStartNew();
    },
  },
});

function handleHistorySelect(record: TranslateRecord) {
  setRouteRecordId(record.id);
  selectedHistoryId.value = record.id;
  selectedRecord.value = record;
}

function handleTranslated() {
  void loadHistory();
  setRouteRecordId(null);
  selectedHistoryId.value = null;
  selectedRecord.value = null;
}

async function handleHistoryDelete(id: string) {
  await window.ipc("translate:deleteRecord", { id });
  if (selectedHistoryId.value === id) {
    setRouteRecordId(null);
    selectedHistoryId.value = null;
    selectedRecord.value = null;
  }
  void loadHistory();
}

watch(() => route.query.recordId, () => {
  syncSelectedRecordFromRoute();
});

onMounted(() => {
  void loadHistory();
  nextTick(() => mainAreaRef.value?.focusInput?.());
});
</script>
