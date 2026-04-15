<template>
  <div class="h-full flex gap-0">
    <!-- 无知识库时：居中空状态 -->
    <section v-if="knowledgeBases.length === 0" class="flex-1 h-full flex items-center justify-center bg-default rounded-xl">
      <UEmpty
        icon="i-lucide-book-search"
        :title="t('knowledge.view.emptyTitle')"
        :description="t('knowledge.view.emptyDescription')"
        :actions="emptyKnowledgeActions"
        size="lg"
        variant="naked"
      />
    </section>

    <!-- 有知识库时：分栏布局 -->
    <template v-else>
    <!-- 左侧：知识库列表 -->
    <section class="w-[240px] shrink-0 h-full flex flex-col bg-default rounded-xl overflow-hidden">
      <div class="px-4 py-3 border-b border-default">
        <div class="text-sm font-medium">{{ t("knowledge.view.listTitle") }}</div>
      </div>
      
      <UList
        v-model="selectedKbId"
        :items="knowledgeBases"
        value-key="id"
        label-key="name"
        size="md"
        gap="md"
        padding="md"
        class="flex-1"
      >
        <template #item="{ item }">
          <div class="flex items-center justify-between gap-2 min-w-0 w-full group">
            <div class="flex flex-col items-start gap-0.5 min-w-0 flex-1">
              <UText :text="item.name" class="text-sm font-medium" />
              <UText 
                v-if="item.description" 
                :text="item.description" 
                class="text-xs opacity-70 w-full" 
              />
            </div>
            <div class="opacity-0 group-hover:opacity-100 has-data-[state=open]:opacity-100 transition-opacity">
              <UDropdownMenu :items="getKbMenuItems(item)" size="sm">
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
      
      <div class="p-3 border-t border-default">
        <UButton
          icon="i-lucide-plus"
          variant="soft"
          color="neutral"
          block
          @click="openCreateModal"
        >
          {{ t("knowledge.view.createAction") }}
        </UButton>
      </div>
    </section>

    <!-- 右侧：知识库详情 -->
    <section v-if="currentKb" class="flex-1 min-w-0 ml-[6px] h-full flex flex-col bg-default rounded-xl overflow-hidden">
      <!-- 头部 -->
      <div class="px-6 py-4 border-b border-default flex items-center justify-between">
        <div class="flex flex-col gap-1">
          <div class="text-base font-medium">{{ currentKb.name }}</div>
          <div v-if="currentKb.description" class="text-sm text-muted">{{ currentKb.description }}</div>
        </div>
      </div>

      <!-- Tabs + 添加按钮 -->
      <div class="flex items-center justify-between gap-2 px-6 pt-4 border-b border-default">
        <UTabs
          v-model="activeTab"
          :items="tabItemsWithBadge"
          variant="link"
          color="neutral"
          class="flex-1 min-w-0"
          :content="false"
        />
        <UButton
          v-if="currentTabContentConfig"
          size="md"
          variant="soft"
          color="neutral"
          icon="i-lucide-plus"
          class="shrink-0 mb-2"
          @click="handleAddByTab"
        >
          {{ currentTabContentConfig.addLabel }}
        </UButton>
      </div>

      <!-- 内容区域 -->
      <div class="flex-1 min-h-0 overflow-auto p-6">
        <div v-if="currentTabContentConfig" class="flex flex-col gap-4">
          <KnowledgeItemList
            :items="currentTabItems"
            :flash-item-id="flashItemId"
            @edit="handleEditTextItem"
            @refresh="handleRefreshItem"
            @delete="handleDeleteItem"
          />
        </div>
      </div>
    </section>

    <!-- 未选中知识库的占位 -->
    <section v-else class="flex-1 min-w-0 ml-[6px] h-full flex flex-col items-center justify-center bg-default rounded-l-xl">
      <div class="text-sm opacity-50">{{ t("knowledge.view.unselected") }}</div>
    </section>
    </template>

    <!-- 新建/编辑知识库弹窗 -->
    <UModal
      v-model:open="kbModalOpen"
      :title="isEditMode ? t('knowledge.modal.editTitle') : t('knowledge.modal.createTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField :label="t('knowledge.modal.field.name')" required>
            <UInput
              v-model="kbModalForm.name"
              :placeholder="t('knowledge.modal.namePlaceholder')"
              autofocus
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('knowledge.modal.field.description')">
            <UTextarea
              v-model="kbModalForm.description"
              :placeholder="t('knowledge.modal.descriptionPlaceholder')"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <div>
            <label class="block text-sm font-medium mb-2">{{ t("knowledge.modal.field.embeddingModel") }}</label>
            <ModelSelector
              v-model="kbModalForm.embeddingModel"
              :show-default="true"
              model-type="embedding"
            />
          </div>

          <UFormField :label="t('knowledge.modal.field.embeddingDimension')" :error="dimensionValidationError">
            <div class="flex items-center gap-2">
              <UInput
                :model-value="embeddingDimensionInput"
                type="number"
                :placeholder="t('knowledge.modal.dimensionPlaceholder')"
                :min="1"
                :loading="isDimensionLoading"
                class="flex-1 min-w-0"
                @update:model-value="handleEmbeddingDimensionInput"
                @blur="handleDimensionBlur"
              />
              <UButton
                icon="i-lucide-refresh-cw"
                variant="ghost"
                color="neutral"
                size="md"
                :loading="isDetectingDimension"
                :disabled="!kbModalForm.embeddingModel"
                :title="t('knowledge.modal.detectDimensionTitle')"
                @click="detectAndFillDimension"
              />
            </div>
          </UFormField>

          <div v-if="isEditMode && needsMigration" class="rounded-lg bg-warning-50 p-3 text-sm text-warning-800">
            {{ t("knowledge.modal.migrationNotice") }}
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <UButton variant="outline" @click="close()">{{ t("knowledge.modal.cancel") }}</UButton>
        <template v-if="isEditMode && needsMigration">
          <UButton
            :disabled="!canMigrate"
            :loading="isMigrating"
            @click="handleKbMigrate"
          >
            {{ t("knowledge.modal.migrate") }}
          </UButton>
        </template>
        <template v-else>
          <UButton
            :disabled="!canConfirmKbModal"
            loading-auto
            @click="handleKbModalConfirm"
          >
            {{ t("knowledge.modal.confirm") }}
          </UButton>
        </template>
      </template>
    </UModal>

    <!-- 添加/编辑文本弹窗（共用） -->
    <UModal
      v-model:open="textModalOpen"
      :title="textModalTitle"
      :ui="{ footer: 'justify-end', content: 'h-[90vh] min-w-[900px] flex flex-col', body: 'flex-1 min-h-0 flex flex-col' }"
    >
      <template #body>
        <div class="flex-1 min-h-0 flex flex-col border border-default rounded-lg overflow-hidden">
            <DocumentEditor
              v-model="textModalContent"
            :placeholder="t('knowledge.textModal.placeholder')"
            autofocus="end"
            :show-drag-handle="false"
            :show-image-toolbar="false"
            :ui="{ root: 'flex-1 min-h-0 flex flex-col overflow-hidden', content: 'flex-1 min-h-0 overflow-y-auto', base: 'p-4 sm:p-4' }"
          />
        </div>
      </template>

      <template #footer="{ close }">
        <UButton variant="outline" @click="close()">{{ t("knowledge.modal.cancel") }}</UButton>
        <UButton
          :disabled="!textModalContent.trim()"
          :loading="isSubmitting"
          @click="handleSubmitTextModal"
        >
          {{ textModalSubmitLabel }}
        </UButton>
      </template>
    </UModal>

    <!-- 添加目录弹窗 -->
    <UModal v-model:open="directoryModalOpen" :title="t('knowledge.directoryModal.title')" :ui="{ footer: 'justify-end' }">
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField :label="t('knowledge.directoryModal.path')" required>
            <div class="flex gap-2">
              <UInput
                v-model="directoryModalForm.path"
                :placeholder="t('knowledge.directoryModal.pathPlaceholder')"
                readonly
                class="flex-1"
              />
              <UButton variant="outline" @click="handleSelectDirectory">
                {{ t("knowledge.directoryModal.select") }}
              </UButton>
            </div>
          </UFormField>

          <UFormField :label="t('knowledge.directoryModal.depth')">
            <UInput
              v-model="directoryModalForm.maxDepth"
              type="number"
              :placeholder="t('knowledge.directoryModal.depthPlaceholder')"
              class="w-full"
            />
            <template #hint>
              {{ t("knowledge.directoryModal.depthHint") }}
            </template>
          </UFormField>
        </div>
      </template>

      <template #footer="{ close }">
        <UButton variant="outline" @click="close()">{{ t("knowledge.modal.cancel") }}</UButton>
        <UButton
          :disabled="!directoryModalForm.path"
          :loading="isSubmitting"
          @click="handleAddDirectory"
        >
          {{ t("knowledge.textModal.addAndProcess") }}
        </UButton>
      </template>
    </UModal>

    <!-- 添加网页弹窗 -->
    <UModal v-model:open="urlModalOpen" :title="t('knowledge.urlModal.title')" :ui="{ footer: 'justify-end' }">
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField :label="t('knowledge.urlModal.url')" required>
            <UInput
              v-model="urlModalForm.url"
              :placeholder="t('knowledge.urlModal.urlPlaceholder')"
              autofocus
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('knowledge.urlModal.name')">
            <UInput
              v-model="urlModalForm.name"
              :placeholder="t('knowledge.urlModal.namePlaceholder')"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>

      <template #footer="{ close }">
        <UButton variant="outline" @click="close()">{{ t("knowledge.modal.cancel") }}</UButton>
        <UButton
          :disabled="!urlModalForm.url.trim()"
          :loading="isSubmitting"
          @click="handleAddUrl"
        >
          {{ t("knowledge.textModal.addAndProcess") }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useKnowledge, type KnowledgeBase, type KbItem } from '@/composables/useKnowledge';
import { useConfirm } from '@/composables/useConfirm';
import { useMyToast } from '@/composables/useMyToast';
import { DEFAULT_MODEL_PLACEHOLDER } from '@/stores/useChatStore';
import UList from '@/components/UList.vue';
import UText from '@/components/UText.vue';
import ModelSelector from '@/components/ModelSelector.vue';
import KnowledgeItemList from '@/components/knowledge/KnowledgeItemList.vue';
import DocumentEditor from '@/components/editor/DocumentEditor.vue';
import {
  buildKnowledgeDetailRoute,
  getKnowledgeTextItemName,
  isKnowledgeUrlValid,
  resolveKnowledgeRouteItemFocus
} from './knowledgeViewModel';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const toast = useMyToast();
const { confirm } = useConfirm();

const {
  knowledgeBases,
  currentKb,
  currentKbItems,
  itemsByType,
  isLoading,
  loadKnowledgeBases,
  createKb,
  updateKb,
  migrateKb,
  deleteKb,
  selectKb,
  getItem,
  addTextItem,
  updateTextItemAndProcess,
  addFileItem,
  addDirectoryItem,
  addUrlItem,
  deleteItem,
  processItem,
  selectFile,
  selectDirectory
} = useKnowledge();

const emptyKnowledgeActions = computed(() => ([
  { label: t('knowledge.view.createAction'), icon: 'i-lucide-plus', onClick: openCreateModal }
]));

// ===== Tab 状态 =====
const activeTab = ref('text');
const tabItemsBase = computed(() => ([
  { label: t('knowledge.tab.text'), value: 'text', icon: 'i-lucide-file-text' },
  { label: t('knowledge.tab.file'), value: 'file', icon: 'i-lucide-file' },
  { label: t('knowledge.tab.directory'), value: 'directory', icon: 'i-lucide-folder' },
  { label: t('knowledge.tab.url'), value: 'url', icon: 'i-lucide-globe' }
]));
const tabItemsWithBadge = computed(() =>
  tabItemsBase.value.map((item) => ({
    ...item,
    badge: itemsByType.value[item.value]?.length ?? 0
  }))
);

const tabContentConfig = computed<Record<string, { addLabel: string }>>(() => ({
  text: { addLabel: t('knowledge.tab.addText') },
  file: { addLabel: t('knowledge.tab.addFile') },
  directory: { addLabel: t('knowledge.tab.addDirectory') },
  url: { addLabel: t('knowledge.tab.addUrl') }
}));

const currentTabContentConfig = computed(() => tabContentConfig.value[activeTab.value]);
const currentTabItems = computed(() => itemsByType.value[activeTab.value] ?? []);

function handleAddByTab() {
  switch (activeTab.value) {
    case 'text':
      openAddTextModal();
      break;
    case 'file':
      handleAddFile();
      break;
    case 'directory':
      openAddDirectoryModal();
      break;
    case 'url':
      openAddUrlModal();
      break;
  }
}

// ===== 知识库选择 =====
const selectedKbId = ref<string>('');
const flashItemId = ref<string | null>(null);
const preserveRouteQueryOnKbSync = ref(false);
let flashItemTimer: ReturnType<typeof setTimeout> | null = null;

function triggerFlashItem(itemId: string, duration = 2200) {
  flashItemId.value = itemId;
  if (flashItemTimer) {
    clearTimeout(flashItemTimer);
  }
  flashItemTimer = setTimeout(() => {
    if (flashItemId.value === itemId) {
      flashItemId.value = null;
    }
    flashItemTimer = null;
  }, duration);
}

function clearFlashItem() {
  flashItemId.value = null;
  if (flashItemTimer) {
    clearTimeout(flashItemTimer);
    flashItemTimer = null;
  }
}

watch(selectedKbId, async (newId) => {
  if (!newId) {
    clearFlashItem();
    return;
  }

  const isSyncingFromRoute = preserveRouteQueryOnKbSync.value;
  preserveRouteQueryOnKbSync.value = false;

  await selectKb(newId);

  if (isSyncingFromRoute) {
    return;
  }

  await router.replace(buildKnowledgeDetailRoute(newId));
});

// 从路由参数初始化
watch(() => route.params.kbId, (kbId) => {
  if (kbId && typeof kbId === 'string' && kbId !== selectedKbId.value) {
    preserveRouteQueryOnKbSync.value = true;
    selectedKbId.value = kbId;
    return;
  }

  if (!kbId) {
    clearFlashItem();
  }
}, { immediate: true });

watch(
  () => {
    const itemId = typeof route.query.itemId === 'string' ? route.query.itemId : null;
    const targetItem = itemId
      ? currentKbItems.value.find(item => item.id === itemId) ?? null
      : null;

    return [
      itemId,
      selectedKbId.value,
      targetItem?.id ?? null,
      targetItem?.type ?? null
    ] as const;
  },
  async ([itemId, currentKbId, matchedItemId, matchedItemType]) => {
    const focus = resolveKnowledgeRouteItemFocus(itemId, currentKbItems.value);
    if (!currentKbId || !focus || focus.itemId !== matchedItemId || focus.itemType !== matchedItemType) {
      return;
    }

    if (activeTab.value !== focus.itemType) {
      activeTab.value = focus.itemType;
    }

    triggerFlashItem(focus.itemId);
    await router.replace(buildKnowledgeDetailRoute(currentKbId, route.query));
  },
  { immediate: true }
);

// 与网络搜索一致：默认模型统一存 '__default__'，指定模型存 'providerId/modelId'
function toKbEmbeddingModel(value: string): string {
  if (!value || value === DEFAULT_MODEL_PLACEHOLDER) return DEFAULT_MODEL_PLACEHOLDER;
  return value.replace(/::/g, '/');
}

// 将知识库存储格式转为 ModelSelector 格式
function fromKbEmbeddingModel(value: string | undefined): string {
  if (!value || value === DEFAULT_MODEL_PLACEHOLDER) return DEFAULT_MODEL_PLACEHOLDER;
  return value.replace(/\//g, '::');
}

// ===== 知识库菜单 =====
const getKbMenuItems = (kb: KnowledgeBase) => {
  return [[
    {
      label: t('knowledge.menu.edit'),
      icon: 'i-lucide-square-pen',
      onSelect: () => openEditModal(kb)
    },
    {
      label: t('knowledge.menu.delete'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () => confirmDeleteKb(kb)
    }
  ]];
};

async function confirmDeleteKb(kb: KnowledgeBase) {
  const confirmed = await confirm({
    title: t('knowledge.confirm.deleteTitle'),
    content: t('knowledge.confirm.deleteKbContent', { name: kb.name }),
    confirmText: t('knowledge.confirm.delete'),
    cancelText: t('knowledge.confirm.cancel'),
    confirmColor: 'error',
    confirmIcon: 'i-lucide-trash-2'
  });

  if (!confirmed) return;

  try {
    await deleteKb(kb.id);
    toast.success(t('knowledge.toast.deleteSuccess'));
  } catch (error) {
    toast.error({
      title: t('knowledge.toast.deleteFailed'),
      description: String(error)
    });
  }
}

// ===== 知识库弹窗 =====
const kbModalOpen = ref(false);
const isEditMode = ref(false);
const editingKbId = ref('');
const kbModalForm = ref({
  name: '',
  description: '',
  embeddingModel: DEFAULT_MODEL_PLACEHOLDER,
  embeddingDimension: undefined as number | undefined
});

// 维度输入框的显示值（与 kbModalForm.embeddingDimension 同步，空字符串表示未设置）
const embeddingDimensionInput = ref<string | number>('');

const isDetectingDimension = ref(false);
const isValidatingDimension = ref(false);
const dimensionValidationError = ref<string | undefined>(undefined);

const isDimensionLoading = computed(() => isDetectingDimension.value || isValidatingDimension.value);

// 编辑模式下的原始值，用于判断是否需要迁移
const originalEmbeddingModel = ref('');
const originalEmbeddingDimension = ref<number | undefined>(undefined);

function parseEmbeddingDimension(v: string | number | undefined): number | undefined {
  if (v === '' || v === undefined || v === null) return undefined;
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return isNaN(n) || n < 1 ? undefined : n;
}

function handleEmbeddingDimensionInput(v: string | number) {
  dimensionValidationError.value = undefined;
  const parsed = parseEmbeddingDimension(v);
  kbModalForm.value.embeddingDimension = parsed;
  embeddingDimensionInput.value = v === '' || v === undefined ? '' : v;
}

async function handleDimensionBlur() {
  const dim = parseEmbeddingDimension(embeddingDimensionInput.value);
  if (dim == null) return;
  const modelValue = kbModalForm.value.embeddingModel;
  if (!modelValue) return;
  isValidatingDimension.value = true;
  dimensionValidationError.value = undefined;
  try {
    const validation = await validateEmbeddingDimension(modelValue, dim);
    if (!validation.ok) {
      dimensionValidationError.value = validation.error;
    }
  } catch (err) {
    dimensionValidationError.value = err instanceof Error ? err.message : String(err);
  } finally {
    isValidatingDimension.value = false;
  }
}

/** 通过 probe 探测模型默认维度 */
async function detectEmbeddingDimension(modelValue: string): Promise<number> {
  const embeddingModel = toKbEmbeddingModel(modelValue);
  const { dimension } = await window.ipc('embedding:detectDimension', { embeddingModel });
  return dimension;
}

/** 校验维度是否被模型支持 */
async function validateEmbeddingDimension(modelValue: string, dimension: number): Promise<{ ok: boolean; error?: string }> {
  const embeddingModel = toKbEmbeddingModel(modelValue);
  return window.ipc('embedding:validateDimension', { embeddingModel, dimension });
}

function openCreateModal() {
  isEditMode.value = false;
  kbModalForm.value = {
    name: '',
    description: '',
    embeddingModel: DEFAULT_MODEL_PLACEHOLDER,
    embeddingDimension: undefined
  };
  embeddingDimensionInput.value = '';
  dimensionValidationError.value = undefined;
  kbModalOpen.value = true;
  nextTick(() => detectAndFillDimension());
}

async function detectAndFillDimension() {
  const modelValue = kbModalForm.value.embeddingModel;
  if (!modelValue) return;
  isDetectingDimension.value = true;
  dimensionValidationError.value = undefined;
  try {
    const dim = await detectEmbeddingDimension(modelValue);
    embeddingDimensionInput.value = dim;
    kbModalForm.value.embeddingDimension = dim;
  } catch (err) {
    dimensionValidationError.value = err instanceof Error ? err.message : String(err);
    console.error('Failed to detect embedding dimension:', err);
  } finally {
    isDetectingDimension.value = false;
  }
}

watch(() => kbModalForm.value.embeddingModel, (modelValue) => {
  if (!modelValue) return;
  detectAndFillDimension();
}, { immediate: false });

function openEditModal(kb: KnowledgeBase) {
  isEditMode.value = true;
  editingKbId.value = kb.id;
  kbModalForm.value = {
    name: kb.name,
    description: kb.description || '',
    embeddingModel: fromKbEmbeddingModel(kb.embeddingModel),
    embeddingDimension: kb.embeddingDimension
  };
  embeddingDimensionInput.value = kb.embeddingDimension ?? '';
  dimensionValidationError.value = undefined;
  originalEmbeddingModel.value = kbModalForm.value.embeddingModel;
  originalEmbeddingDimension.value = kb.embeddingDimension;
  kbModalOpen.value = true;
}

const canConfirmKbModal = computed(() => {
  if (!kbModalForm.value.name.trim()) return false;
  if (isEditMode.value && needsMigration.value) return false;
  if (dimensionValidationError.value) return false;
  return true;
});

const needsMigration = computed(() => {
  if (!isEditMode.value) return false;
  const modelChanged = kbModalForm.value.embeddingModel !== originalEmbeddingModel.value;
  const currentDim = parseEmbeddingDimension(embeddingDimensionInput.value);
  const dimChanged = currentDim !== originalEmbeddingDimension.value;
  return modelChanged || dimChanged;
});

const canMigrate = computed(() => {
  if (!kbModalForm.value.name.trim()) return false;
  const dim = parseEmbeddingDimension(embeddingDimensionInput.value);
  if (dim == null || dim < 1) return false;
  if (dimensionValidationError.value) return false;
  return true;
});

const isMigrating = ref(false);

async function handleKbModalConfirm() {
  try {
    if (isEditMode.value) {
      await updateKb(editingKbId.value, {
        name: kbModalForm.value.name,
        description: kbModalForm.value.description || undefined
      });
      toast.success(t('knowledge.toast.updateSuccess'));
    } else {
      const dim = parseEmbeddingDimension(embeddingDimensionInput.value);
      if (dim != null) {
        const validation = await validateEmbeddingDimension(kbModalForm.value.embeddingModel, dim);
        if (!validation.ok) {
          toast.error({ title: t('knowledge.toast.createFailed'), description: validation.error });
          return;
        }
      }
      const kb = await createKb({
        name: kbModalForm.value.name,
        description: kbModalForm.value.description || undefined,
        embeddingModel: toKbEmbeddingModel(kbModalForm.value.embeddingModel),
        embeddingDimension: dim
      });
      selectedKbId.value = kb.id;
      toast.success(t('knowledge.toast.createSuccess'));
    }
    kbModalOpen.value = false;
  } catch (error) {
    toast.error({
      title: isEditMode.value ? t('knowledge.toast.updateFailed') : t('knowledge.toast.createFailed'),
      description: String(error)
    });
  }
}

async function handleKbMigrate() {
  if (!kbModalForm.value.name.trim()) {
    toast.error({ title: t('knowledge.toast.migrateFailed'), description: t('knowledge.toast.enterName') });
    return;
  }
  const dim = parseEmbeddingDimension(embeddingDimensionInput.value);
  if (dim == null || dim < 1) {
    toast.error({ title: t('knowledge.toast.migrateFailed'), description: t('knowledge.toast.invalidDimension') });
    return;
  }
  const validation = await validateEmbeddingDimension(kbModalForm.value.embeddingModel, dim);
  if (!validation.ok) {
    toast.error({ title: t('knowledge.toast.migrateFailed'), description: validation.error });
    return;
  }
  isMigrating.value = true;
  try {
    await updateKb(editingKbId.value, {
      name: kbModalForm.value.name,
      description: kbModalForm.value.description || undefined
    });
    await migrateKb(editingKbId.value, {
      embeddingModel: toKbEmbeddingModel(kbModalForm.value.embeddingModel),
      embeddingDimension: dim
    });
    originalEmbeddingModel.value = kbModalForm.value.embeddingModel;
    originalEmbeddingDimension.value = dim;
    embeddingDimensionInput.value = dim;
    kbModalOpen.value = false;
    toast.success(t('knowledge.toast.migrateSuccess'));
    await selectKb(editingKbId.value);
    const items = currentKbItems.value;
    for (const item of items) {
      processItem(item.id, editingKbId.value).catch(err => {
        console.error('Failed to process item after migrate:', err);
      });
    }
  } catch (error) {
    toast.error({
      title: t('knowledge.toast.migrateFailed'),
      description: String(error)
    });
  } finally {
    isMigrating.value = false;
  }
}

// 添加文本弹窗 - 工具栏配置
// ===== 添加/编辑文本弹窗（共用） =====
const textModalOpen = ref(false);
const textModalContent = ref('');
const editingTextItem = ref<KbItem | null>(null); // null = 添加，非 null = 编辑
const isSubmitting = ref(false);

const textModalTitle = computed(() => (editingTextItem.value ? t('knowledge.textModal.editTitle') : t('knowledge.textModal.addTitle')));
const textModalSubmitLabel = computed(() => (editingTextItem.value ? t('knowledge.textModal.save') : t('knowledge.textModal.addAndProcess')));

watch(textModalOpen, (open) => {
  if (!open) {
    textModalContent.value = '';
    editingTextItem.value = null;
  }
});

function openAddTextModal() {
  textModalContent.value = '';
  editingTextItem.value = null;
  textModalOpen.value = true;
}

async function handleEditTextItem(item: KbItem) {
  const full = await getItem(item.id);
  if (full == null) {
    toast.error({ title: t('knowledge.toast.loadFailed'), description: t('knowledge.toast.contentUnavailable') });
    return;
  }
  textModalContent.value = full.content ?? '';
  editingTextItem.value = item;
  textModalOpen.value = true;
}

function handleSubmitTextModal() {
  if (editingTextItem.value) {
    handleSaveEditText();
  } else {
    handleAddText();
  }
}

async function handleAddText() {
  if (!currentKb.value) return;
  isSubmitting.value = true;
  try {
    const content = textModalContent.value.trim();
    const item = await addTextItem(currentKb.value.id, {
      name: getKnowledgeTextItemName(content, t('content.untitled')),
      content
    });
    textModalOpen.value = false;
    await processItem(item.id, currentKb.value.id);
    toast.success(t('knowledge.toast.addSuccess'));
  } catch (error) {
    toast.error({
      title: t('knowledge.toast.addFailed'),
      description: String(error)
    });
  } finally {
    isSubmitting.value = false;
  }
}

function handleSaveEditText() {
  if (!editingTextItem.value) return;
  const itemId = editingTextItem.value.id;
  const name = getKnowledgeTextItemName(textModalContent.value.trim(), t('content.untitled'));
  const content = textModalContent.value.trim();
  isSubmitting.value = true;
  try {
    currentKbItems.value = currentKbItems.value.map(item =>
      item.id === itemId ? { ...item, status: 'processing' as const, error: undefined } : item
    );
    textModalOpen.value = false;
  } finally {
    isSubmitting.value = false;
  }
  updateTextItemAndProcess(itemId, { name, content })
    .then(() => toast.success(t('knowledge.toast.saveProcessed')))
    .catch((error) => {
      currentKbItems.value = currentKbItems.value.map(item =>
        item.id === itemId ? { ...item, status: 'error' as const, error: String(error) } : item
      );
      toast.error({
        title: t('knowledge.toast.saveFailed'),
        description: String(error)
      });
    });
}

// ===== 添加文件 =====
const KB_FILE_FILTERS = computed(() => ([
  { name: t('translate.fileFilter.documents'), extensions: ['txt', 'md', 'markdown', 'json', 'csv', 'pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'odt', 'odp', 'ods', 'rtf'] },
  { name: t('knowledge.fileFilter.code'), extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'vue', 'css', 'scss', 'html', 'xml', 'yaml', 'yml'] },
  { name: t('translate.fileFilter.allFiles'), extensions: ['*'] }
]));

async function handleAddFile() {
  if (!currentKb.value) return;
  
  const filePaths = await selectFile({ 
    title: t('knowledge.common.selectFile'), 
    multiSelections: true,
    filters: KB_FILE_FILTERS.value
  });
  
  if (!filePaths || filePaths.length === 0) return;
  
  for (const filePath of filePaths) {
    try {
      const item = await addFileItem(currentKb.value.id, filePath);
      // 异步处理，不阻塞
      processItem(item.id, currentKb.value.id).catch(err => {
        console.error('Failed to process file:', err);
      });
    } catch (error) {
      toast.error({
        title: t('knowledge.toast.addFileFailed'),
        description: String(error)
      });
    }
  }
  
  toast.success(t('knowledge.toast.filesAdded', { count: filePaths.length }));
}

// ===== 添加目录弹窗 =====
const directoryModalOpen = ref(false);
const directoryModalForm = ref({ path: '', maxDepth: '5' });

function openAddDirectoryModal() {
  directoryModalForm.value = { path: '', maxDepth: '5' };
  directoryModalOpen.value = true;
}

async function handleSelectDirectory() {
  const dirPath = await selectDirectory(t('knowledge.common.selectDirectory'));
  if (dirPath) {
    directoryModalForm.value.path = dirPath;
  }
}

async function handleAddDirectory() {
  if (!currentKb.value || !directoryModalForm.value.path) return;
  
  isSubmitting.value = true;
  try {
    const raw = directoryModalForm.value.maxDepth.trim();
    const parsed = raw === '' ? NaN : parseInt(directoryModalForm.value.maxDepth, 10);
    const maxDepth = raw === '' || (!isNaN(parsed) && parsed === 0)
      ? undefined
      : !isNaN(parsed) && parsed > 0
        ? parsed
        : 5;
    
    const item = await addDirectoryItem(
      currentKb.value.id, 
      directoryModalForm.value.path,
      maxDepth
    );
    directoryModalOpen.value = false;
    
    // 开始处理
    await processItem(item.id, currentKb.value.id);
    toast.success(t('knowledge.toast.addSuccess'));
  } catch (error) {
    toast.error({
      title: t('knowledge.toast.addDirectoryFailed'),
      description: String(error)
    });
  } finally {
    isSubmitting.value = false;
  }
}

// ===== 添加网页弹窗 =====
const urlModalOpen = ref(false);
const urlModalForm = ref({ url: '', name: '' });

function openAddUrlModal() {
  urlModalForm.value = { url: '', name: '' };
  urlModalOpen.value = true;
}

async function handleAddUrl() {
  if (!currentKb.value || !urlModalForm.value.url) return;
  
  if (!isKnowledgeUrlValid(urlModalForm.value.url.trim())) {
    toast.error({ title: t('knowledge.toast.invalidUrlTitle'), description: t('knowledge.toast.invalidUrlDescription') });
    return;
  }
  
  isSubmitting.value = true;
  try {
    const item = await addUrlItem(
      currentKb.value.id,
      urlModalForm.value.url,
      urlModalForm.value.name || undefined
    );
    urlModalOpen.value = false;
    
    // 开始处理
    await processItem(item.id, currentKb.value.id);
    toast.success(t('knowledge.toast.addSuccess'));
  } catch (error) {
    toast.error({
      title: t('knowledge.toast.addUrlFailed'),
      description: String(error)
    });
  } finally {
    isSubmitting.value = false;
  }
}

// ===== 刷新/删除 Item =====
async function handleRefreshItem(item: KbItem) {
  if (!currentKb.value) return;
  
  try {
    await processItem(item.id, currentKb.value.id);
    toast.success(t('knowledge.toast.refreshSuccess'));
  } catch (error) {
    toast.error({
      title: t('knowledge.toast.refreshFailed'),
      description: String(error)
    });
  }
}

async function handleDeleteItem(item: KbItem) {
  const confirmed = await confirm({
    title: t('knowledge.confirm.deleteTitle'),
    content: t('knowledge.confirm.deleteItemContent', { name: item.name }),
    confirmText: t('knowledge.confirm.delete'),
    cancelText: t('knowledge.confirm.cancel'),
    confirmColor: 'error'
  });

  if (!confirmed) return;

  try {
    await deleteItem(item.id);
    toast.success(t('knowledge.toast.deleteSuccess'));
  } catch (error) {
    toast.error({
      title: t('knowledge.toast.deleteFailed'),
      description: String(error)
    });
  }
}

// ===== 初始化 =====
onMounted(async () => {
  await loadKnowledgeBases();
  
  // 如果 URL 中没有 kbId，选中第一个
  if (!route.params.kbId && knowledgeBases.value.length > 0) {
    selectedKbId.value = knowledgeBases.value[0].id;
  }
});
</script>
