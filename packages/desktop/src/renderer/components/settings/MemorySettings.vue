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
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { loggerServiceRenderer } from "@shared";
import { useConfirm } from "@/composables/useConfirm";
import { useMyToast } from "@/composables/useMyToast";

const logger = loggerServiceRenderer.withContext("settings:memory");
const router = useRouter();
const { confirm } = useConfirm();
const toast = useMyToast();
const { t } = useI18n();

function goToSession(sessionId: string) {
  router.push({ name: "chat", params: { sessionId } });
}

const memorySettings = ref({
  sessionStateEnabled: true,
  crossSessionEnabled: true,
  longTermEnabled: true,
});

const longTermItems = ref<{ id: string; category: string; key: string; value: string; sessionId?: string | null; messageId?: string | null; sessionTitle?: string | null; createdAt: number; updatedAt: number }[]>([]);
const showMemoryModal = ref(false);
const formValue = ref("");
const editingItem = ref<{ key: string; value: string } | null>(null);

async function loadSettings() {
  const data = await window.ipc("settings:getMemorySettings");
  memorySettings.value = {
    sessionStateEnabled: data.sessionStateEnabled,
    crossSessionEnabled: data.crossSessionEnabled,
    longTermEnabled: data.longTermEnabled,
  };
}

async function loadLongTermItems() {
  const items = await window.ipc("longTermMemory:list");
  longTermItems.value = items;
}

async function handleChange(
  key: "sessionStateEnabled" | "crossSessionEnabled" | "longTermEnabled",
  value: boolean
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
</script>
