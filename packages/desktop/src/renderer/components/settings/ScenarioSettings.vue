<template>
  <div class="flex-1 min-w-0 flex flex-col">
    <div class="flex min-w-0 flex-1 min-h-0 bg-default rounded-xl overflow-hidden">
    <!-- 左侧：场景列表 -->
    <section class="w-[240px] flex flex-col border-r border-default min-h-0">
      <div class="px-4 py-3 border-b border-default shrink-0">
        <div class="text-sm font-medium">{{ t("settings.scenario.title") }}</div>
      </div>
      <div class="p-3 pb-2 shrink-0">
        <UInput
          v-model="scenarioListSearchQuery"
          :placeholder="t('settings.scenario.listSearchPlaceholder')"
          icon="i-lucide-search"
          size="md"
          :ui="{ root: 'w-full' }"
        />
      </div>
      <UList
        v-if="filteredScenarios.length > 0"
        v-model="selectedScenarioId"
        :items="filteredScenarios"
        value-key="id"
        label-key="name"
        size="md"
        gap="md"
        padding="md"
        class="flex-1 min-h-0"
      >
        <template #item="{ item }">
          <div class="flex items-center justify-between gap-2 min-w-0 w-full group">
            <div class="flex flex-col items-start gap-0.5 min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <UText :text="item.name" class="text-sm font-medium" />
                <UBadge v-if="item.id === 'default-scenario'" color="neutral" variant="outline" size="sm">
                  {{ t("scenario.list.default") }}
                </UBadge>
              </div>
              <UText 
                v-if="item.description" 
                :text="item.description" 
                class="text-xs opacity-70 w-full" 
              />
            </div>
            <div class="opacity-0 group-hover:opacity-100 has-[[data-state=open]]:opacity-100 transition-opacity">
              <UDropdownMenu :items="getScenarioMenuItems(item.id)" size="md">
                <UButton
                  icon="i-lucide-more-horizontal"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  @click.stop
                />
              </UDropdownMenu>
            </div>
          </div>
        </template>
      </UList>
      <div
        v-else-if="scenarioListSearchQuery.trim()"
        class="flex-1 min-h-0 flex items-center justify-center p-2"
      >
        <UEmpty
          :title="t('common.listSearchNoResults')"
          icon="i-lucide-search"
          size="sm"
          variant="naked"
        />
      </div>
      <div v-else class="flex-1 min-h-0" />
      <div class="p-3 border-t border-default shrink-0">
        <UButton
          icon="i-lucide-plus"
          variant="soft"
          color="neutral"
          block
          @click="openCreateModal"
        >
          {{ t("settings.scenario.create") }}
        </UButton>
      </div>
    </section>

    <!-- 右侧：场景详情 -->
    <ScenarioDetail v-if="selectedScenarioId" :scenario-id="selectedScenarioId" />

    <!-- 未选中场景的占位 -->
    <section v-else class="flex-1 min-w-0 flex items-center justify-center">
      <div class="text-sm opacity-50">{{ t("settings.scenario.selectPrompt") }}</div>
    </section>
  </div>

  <!-- 新建/编辑场景弹窗 -->
  <UModal
    v-model:open="modalOpen"
    :title="isEditMode ? t('settings.scenario.editTitle') : t('settings.scenario.createTitle')"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField :label="t('settings.scenario.name')" required>
          <UInput
            v-model="modalForm.name"
            :placeholder="t('settings.scenario.namePlaceholder')"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('settings.scenario.description')">
          <UTextarea
            v-model="modalForm.description"
            :placeholder="t('settings.scenario.descriptionPlaceholder')"
            :rows="3"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <UButton variant="outline" @click="modalOpen = false">{{ t("common.cancel") }}</UButton>
      <UButton
        :disabled="!modalForm.name.trim()"
        @click="handleModalConfirm"
      >
        {{ t("common.confirm") }}
      </UButton>
    </template>
  </UModal>

  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { loggerServiceRenderer } from "@shared";
import { useI18n } from "vue-i18n";
import { useConfirm } from "@/composables/useConfirm";
import { useMyToast } from "@/composables/useMyToast";
import { useSettingsStore } from "@/stores/useSettingsStore";
import UList from "@/components/UList.vue";
import UText from "@/components/UText.vue";
import ScenarioDetail from "@/components/ScenarioDetail.vue";
import { filterScenariosBySearchQuery } from "@/utils/scenarioSearch";

const logger = loggerServiceRenderer.withContext("settings:scenario");
const toast = useMyToast();
const { confirm } = useConfirm();
const { t } = useI18n();
const settingsStore = useSettingsStore();

// ===== 场景列表 =====
const scenarios = computed(() => settingsStore.scenarios);
const scenarioListSearchQuery = ref("");
const filteredScenarios = computed(() =>
  filterScenariosBySearchQuery(
    scenarios.value,
    scenarioListSearchQuery.value,
    settingsStore
  )
);
const selectedScenarioId = ref<string>("");

// 初始化选中第一个场景
watch(scenarios, (newScenarios) => {
  if (!selectedScenarioId.value && newScenarios.length > 0) {
    selectedScenarioId.value = newScenarios[0].id;
  }
}, { immediate: true });

// ===== 场景菜单 =====
const getScenarioMenuItems = (scenarioId: string) => {
  const isDefaultScenario = scenarioId === 'default-scenario';
  
  const items = [
    {
      label: t("settings.scenario.edit"),
      icon: "i-lucide-square-pen",
      onSelect: () => openEditModal(scenarioId)
    }
  ];
  
  // 默认场景不允许删除
  if (!isDefaultScenario) {
    items.push({
      label: t("common.delete"),
      icon: "i-lucide-trash-2",
      color: "error",
      onSelect: () => confirmDeleteScenario(scenarioId)
    });
  }
  
  return [items];
};

// 删除场景
async function confirmDeleteScenario(scenarioId: string) {
  const scenario = scenarios.value.find((s) => s.id === scenarioId);
  if (!scenario) return;

  const confirmed = await confirm({
    title: t("settings.scenario.deleteConfirmTitle"),
    content: t("settings.scenario.deleteConfirmContent", { name: scenario.name }),
    confirmText: t("common.delete"),
    cancelText: t("common.cancel"),
    confirmColor: 'error',
    confirmIcon: 'i-lucide-trash-2'
  });

  if (!confirmed) return;

  try {
    await settingsStore.deleteScenario(scenarioId);
    toast.success(t("settings.scenario.deleted"));

    // 如果删除的是当前选中的场景，清空选择
    if (selectedScenarioId.value === scenarioId) {
      selectedScenarioId.value = "";
    }
  } catch (error) {
    logger.error("Failed to delete scenario", { error });
    toast.error({
      title: t("settings.scenario.deleteFailed"),
      description: String(error)
    });
  }
}

// ===== 新建/编辑弹窗 =====
const modalOpen = ref(false);
const isEditMode = ref(false);
const editingScenarioId = ref("");
const modalForm = ref({
  name: "",
  description: ""
});

function openCreateModal() {
  isEditMode.value = false;
  modalForm.value = { name: "", description: "" };
  modalOpen.value = true;
}

function openEditModal(scenarioId: string) {
  const scenario = scenarios.value.find((s) => s.id === scenarioId);
  if (!scenario) return;

  isEditMode.value = true;
  editingScenarioId.value = scenarioId;
  modalForm.value = {
    name: scenario.name,
    description: scenario.description || ""
  };
  modalOpen.value = true;
}

async function handleModalConfirm() {
  try {
    if (isEditMode.value) {
      // 编辑
      await settingsStore.updateScenario(editingScenarioId.value, {
        name: modalForm.value.name,
        description: modalForm.value.description || undefined
      });
      toast.success(t("settings.scenario.updated"));
    } else {
      // 新建
      const newScenario = await settingsStore.createScenario({
        name: modalForm.value.name,
        description: modalForm.value.description || undefined
      });
      selectedScenarioId.value = newScenario.id;
      toast.success(t("settings.scenario.created"));
    }

    modalOpen.value = false;
  } catch (error) {
    logger.error("Failed to save scenario", { error });
    toast.error({
      title: isEditMode.value ? t("settings.scenario.updateFailed") : t("settings.scenario.createFailed"),
      description: String(error)
    });
  }
}
</script>
