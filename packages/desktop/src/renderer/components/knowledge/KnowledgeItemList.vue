<template>
  <div ref="rootRef" class="flex flex-col gap-2">
    <!-- 空状态 -->
    <UEmpty
      v-if="props.items.length === 0"
      icon="i-lucide-inbox"
      :title="t('knowledge.itemList.emptyTitle')"
      size="sm"
      variant="naked"
      class="py-8"
    />

    <!-- 内容列表 -->
    <div
      v-for="item in props.items"
      :key="item.id"
      :data-kb-item-id="item.id"
      class="flex items-center gap-3 rounded-lg px-4 py-3 transition-colors group"
      :class="props.flashItemId === item.id
        ? 'bg-amber-50 ring-1 ring-inset ring-amber-200'
        : 'bg-elevated hover:bg-elevated/80'"
    >
      <!-- 图标 -->
      <div class="flex-shrink-0">
        <UIcon :name="getItemIcon(item)" class="text-lg text-muted" />
      </div>

      <!-- 信息 -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium truncate">{{ item.name }}</span>
          
          <!-- 状态标签 -->
          <UBadge 
            v-if="item.status === 'processing'" 
            color="info" 
            variant="subtle" 
            size="sm"
          >
            <UIcon name="i-lucide-loader-2" class="animate-spin mr-1" />
            {{ t("knowledge.itemList.status.processing") }}
          </UBadge>
          <UBadge 
            v-else-if="item.status === 'error'" 
            color="error" 
            variant="subtle" 
            size="sm"
          >
            {{ t("knowledge.itemList.status.error") }}
          </UBadge>
          <UBadge 
            v-else-if="item.status === 'ready'" 
            color="success" 
            variant="subtle" 
            size="sm"
          >
            {{ t("knowledge.itemList.status.ready") }}
          </UBadge>
          <UBadge 
            v-else-if="item.status === 'pending'" 
            color="neutral" 
            variant="subtle" 
            size="sm"
          >
            {{ t("knowledge.itemList.status.pending") }}
          </UBadge>

          <!-- 文件变更提示 -->
          <UBadge 
            v-if="item.hasChanged" 
            color="warning" 
            variant="subtle" 
            size="sm"
          >
            <UIcon name="i-lucide-alert-triangle" class="mr-0.5" />{{ t("knowledge.itemList.changed") }}
          </UBadge>
        </div>

        <!-- 附加信息 -->
        <div class="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <span
            v-if="item.source"
            class="truncate max-w-[300px] cursor-pointer hover:text-default hover:underline"
            @click="handleSourceClick(item)"
          >
            {{ item.source }}
          </span>
          <span v-if="item.chunkCount > 0">{{ t("knowledge.itemList.chunkCount", { count: item.chunkCount }) }}</span>
          <UTooltip v-if="item.lastSyncAt" :text="formatFullTime(item.lastSyncAt)">
            <span class="cursor-default">{{ t("knowledge.itemList.syncedAt", { time: formatMessageTime(item.lastSyncAt) }) }}</span>
          </UTooltip>
        </div>

        <!-- 错误信息 -->
        <div v-if="item.error" class="mt-1 truncate text-xs text-error">
          {{ item.error }}
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <UTooltip v-if="item.type === 'text'" :text="t('knowledge.itemList.tooltip.edit')">
          <UButton
            icon="i-lucide-pencil"
            variant="ghost"
            color="neutral"
            size="xs"
            :disabled="item.status === 'processing'"
            @click="emit('edit', item)"
          />
        </UTooltip>
        <UTooltip :text="t('knowledge.itemList.tooltip.refresh')">
          <UButton
            icon="i-lucide-refresh-cw"
            variant="ghost"
            color="neutral"
            size="xs"
            :disabled="item.status === 'processing'"
            @click="emit('refresh', item)"
          />
        </UTooltip>
        <UTooltip :text="t('knowledge.itemList.tooltip.delete')">
          <UButton
            icon="i-lucide-trash-2"
            variant="ghost"
            size="xs"
            color="error"
            :disabled="item.status === 'processing'"
            @click="emit('delete', item)"
          />
        </UTooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { KbItem } from '@/composables/useKnowledge';
import { formatMessageTime, formatFullTime } from '@/utils/timeFormat';

const props = defineProps<{
  items: KbItem[];
  flashItemId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'edit', item: KbItem): void;
  (e: 'refresh', item: KbItem): void;
  (e: 'delete', item: KbItem): void;
}>();

const { t } = useI18n();
const rootRef = ref<HTMLElement | null>(null);

function scrollToActiveItem(itemId: string) {
  const root = rootRef.value;
  if (!root) return;

  const itemElement = root.querySelector<HTMLElement>(`[data-kb-item-id="${itemId}"]`);
  if (!itemElement) return;

  itemElement.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest'
  });
}

watch(
  () => [props.flashItemId, props.items.map(item => item.id).join('|')] as const,
  async ([itemId]) => {
    if (!itemId) return;
    await nextTick();
    scrollToActiveItem(itemId);
  },
  { flush: 'post' }
);

function getItemIcon(item: KbItem): string {
  switch (item.type) {
    case 'text':
      return 'i-lucide-file-text';
    case 'file':
      return getFileIcon(item.fileType);
    case 'directory':
      return 'i-lucide-folder';
    case 'url':
      return 'i-lucide-globe';
    default:
      return 'i-lucide-file';
  }
}

function handleSourceClick(item: KbItem) {
  const src = item.source;
  if (!src) return;
  if (item.type === 'url') {
    window.webPreview?.open(src);
  } else if (item.type === 'file') {
    window.ipc('shell:showItemInFolder', src);
  } else if (item.type === 'directory') {
    window.ipc('shell:openPath', src);
  }
}

function getFileIcon(fileType?: string): string {
  if (!fileType) return 'i-lucide-file';
  
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return 'i-lucide-file-text';
    case 'docx':
    case 'doc':
      return 'i-lucide-file-text';
    case 'xlsx':
    case 'xls':
      return 'i-lucide-file-spreadsheet';
    case 'pptx':
    case 'ppt':
      return 'i-lucide-file-presentation';
    case 'md':
    case 'markdown':
      return 'i-lucide-file-code';
    case 'json':
      return 'i-lucide-file-json';
    default:
      return 'i-lucide-file';
  }
}

</script>
