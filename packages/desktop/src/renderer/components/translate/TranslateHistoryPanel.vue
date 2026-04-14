<template>
  <section
    :style="widthStyle"
    class="relative shrink-0 h-full"
  >
    <div class="h-full flex flex-col bg-default rounded-xl overflow-hidden">
      <div class="px-2 py-2 border-b border-default">
        <UButton
          icon="i-lucide-plus"
          variant="soft"
          color="neutral"
          size="md"
          block
          @click="emit('new')"
        >{{ t("translate.history.new") }}</UButton>
      </div>
      <div v-if="props.history.length === 0" class="flex-1 flex items-center justify-center px-4">
        <UEmpty
          icon="i-lucide-history"
          :title="t('translate.history.emptyTitle')"
          size="sm"
          variant="naked"
        />
      </div>
      <UList
        v-else
        :model-value="props.selectedId"
        :items="props.history"
        value-key="id"
        label-key="input"
        size="md"
        gap="md"
        padding="md"
        class="flex-1"
        @update:model-value="handleSelectionChange"
      >
        <template #item="{ item }">
          <div class="flex flex-col items-start gap-0.5 min-w-0 w-full">
            <UText :text="item.input" class="text-sm truncate w-full" />
            <UText :text="getPreviewText(item)" class="text-xs opacity-70 truncate w-full" />
          </div>
        </template>
        <template #item-trailing="{ item }">
          <UButton
            icon="i-lucide-trash-2"
            variant="ghost"
            color="neutral"
            size="xs"
            square
            class="opacity-0 group-hover:opacity-100 shrink-0"
            @click.stop="handleDelete(item.id)"
          />
        </template>
      </UList>
    </div>

    <PanelResizeHandle
      variant="gap"
      :active="isDragging"
      :value="width"
      :min="minWidth"
      :max="maxWidth"
      :cursor="resizeCursor"
      @resize-start="startResize"
      @resize-by="resizeBy"
      @reset="resetWidth"
    />
  </section>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
import { useResizableWidth } from "@/composables/useResizableWidth";
import PanelResizeHandle from "@/components/PanelResizeHandle.vue";
import UList from "@/components/UList.vue";
import UText from "@/components/UText.vue";
import { useI18n } from "vue-i18n";
import { getTranslatePreviewText } from "@/views/translateViewModel";

type TranslateRecord = {
  id: string;
  input: string;
  result: string;
  targetLang: string;
  createdAt: number;
};

const props = defineProps<{
  history: TranslateRecord[];
  selectedId: string | null;
}>();

const emit = defineEmits<{
  new: [];
  select: [record: TranslateRecord];
  delete: [id: string];
}>();

const { t } = useI18n();
const { confirm } = useConfirm();
const {
  width,
  minWidth,
  maxWidth,
  widthStyle,
  cursor: resizeCursor,
  isDragging,
  startResize,
  resizeBy,
  resetWidth,
} = useResizableWidth({
  storageKey: "translate-history-panel-width",
  defaultWidth: 240,
  minWidth: 200,
  maxWidth: 360,
  side: "right",
  step: 16,
});

function getPreviewText(item: TranslateRecord): string {
  return getTranslatePreviewText(item);
}

function handleSelect(item: TranslateRecord) {
  emit("select", item);
}

function handleSelectionChange(id: string | null) {
  if (!id) return;
  const item = props.history.find((h) => h.id === id);
  if (item) emit("select", item);
}

async function handleDelete(id: string) {
  const ok = await confirm({
    title: t("translate.history.deleteTitle"),
    content: t("translate.history.deleteContent"),
    confirmText: t("translate.history.deleteConfirm"),
    confirmColor: "error",
  });
  if (ok) emit("delete", id);
}
</script>
