<template>
  <UModal v-model:open="isOpen" :title="t('settings.fetchModels.title', { provider: providerName })" :ui="{ body: 'max-h-[60vh] flex flex-col overflow-hidden' }">
    <template #body>
      <div class="flex flex-col gap-4 min-h-0 flex-1">
        <div v-if="loading" class="py-8 text-center text-sm text-toned">
          {{ t('settings.fetchModels.loading') }}
        </div>
        <div v-else-if="error" class="py-4">
          <UAlert :title="error" variant="soft" color="error" />
        </div>
        <div v-else-if="fetchedModels.length === 0" class="py-8">
          <UEmpty :title="t('settings.fetchModels.emptyTitle')" :description="t('settings.fetchModels.emptyDescription')" icon="i-lucide-cpu" size="sm" variant="naked" />
        </div>
        <template v-else>
          <div class="shrink-0 pr-1">
            <UInput
              v-model="searchQuery"
              :placeholder="t('model.selector.search')"
              icon="i-lucide-search"
              size="md"
              :ui="{ root: 'w-full' }"
            />
          </div>
          <div v-if="filteredModels.length === 0" class="py-8 flex-1 flex items-center justify-center">
            <UEmpty :title="t('settings.fetchModels.emptyTitle')" :description="t('settings.modelService.noSearchResults')" icon="i-lucide-cpu" size="sm" variant="naked" />
          </div>
          <UScrollArea v-else class="flex-1 min-h-0">
            <div class="flex flex-col gap-2 pr-2">
              <div
                v-for="m in filteredModels"
                :key="m.id"
                class="flex items-center justify-between px-3 py-2 rounded-lg border border-default hover:border-default"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <ModelLogo :model-id="m.id" />
                  <span class="text-sm truncate">{{ m.id }}</span>
                  <UBadge v-if="m.modelType === 'embedding'" variant="subtle" color="info" size="sm">{{ t('settings.modelList.tag.embedding') }}</UBadge>
                  <UBadge v-else-if="m.modelType === 'rerank'" variant="subtle" color="warning" size="sm">{{ t('settings.modelList.tag.rerank') }}</UBadge>
                </div>
                <UTooltip :text="isInCommon(m.id) ? t('settings.fetchModels.removeFromList') : t('settings.fetchModels.addToList')">
                  <UButton
                    :icon="isInCommon(m.id) ? 'i-lucide-minus' : 'i-lucide-plus'"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    :loading="actioningId === m.id"
                    @click="isInCommon(m.id) ? handleRemove(m.id) : handleAdd(m)"
                  />
                </UTooltip>
              </div>
            </div>
          </UScrollArea>
        </template>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import ModelLogo from "@/components/ModelLogo.vue";
import { useSettingsStore } from "@/stores/useSettingsStore";

const props = defineProps<{
  open: boolean;
  providerId?: string;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "open-config": [providerId: string, modelId: string];
}>();

const settingsStore = useSettingsStore();
const { t } = useI18n();

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit("update:open", value),
});

const providerName = computed(() => {
  if (!props.providerId) return "";
  const p = settingsStore.providers.find((x) => x.id === props.providerId);
  return p?.name ?? props.providerId;
});

const commonModelIds = computed(() => {
  if (!props.providerId) return new Set<string>();
  const p = settingsStore.providers.find((x) => x.id === props.providerId);
  return new Set(p?.models?.map((m) => m.id) ?? []);
});

const loading = ref(false);
const error = ref("");
const fetchedModels = ref<Array<{ id: string; modelType: 'generative' | 'embedding' | 'rerank' }>>([]);
const actioningId = ref<string>("");
const searchQuery = ref("");

const filteredModels = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return fetchedModels.value;
  return fetchedModels.value.filter((m) => m.id.toLowerCase().includes(q));
});

function isInCommon(modelId: string) {
  return commonModelIds.value.has(modelId);
}

async function fetchModels() {
  if (!props.providerId) return;
  loading.value = true;
  error.value = "";
  fetchedModels.value = [];
  try {
    const result = await window.ipc("providers:fetchModels", {
      providerId: props.providerId,
    });
    if (result.ok) {
      fetchedModels.value = (result.models || []).map((m: { id: string; modelType: 'generative' | 'embedding' | 'rerank' }) => ({
        id: m.id,
        modelType: m.modelType || "generative",
      }));
    } else {
      error.value = result.error;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

async function handleAdd(m: { id: string }) {
  if (!props.providerId) return;
  emit("open-config", props.providerId, m.id);
}

async function handleRemove(modelId: string) {
  if (!props.providerId) return;
  actioningId.value = modelId;
  try {
    await settingsStore.removeModelFromCommon(props.providerId, modelId);
  } finally {
    actioningId.value = "";
  }
}

watch(
  () => props.open,
  (val) => {
    if (val && props.providerId) {
      searchQuery.value = "";
      fetchModels();
    }
  }
);
</script>
