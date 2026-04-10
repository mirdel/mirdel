<template>
  <UModal 
    :open="open" 
    @update:open="$emit('update:open', $event)" 
    :title="t('chat.sources.title', { count: sources.length })"
    :ui="{ width: 'max-w-md' }"
  >
    <template #body>
      <div class="divide-y divide-gray-100 dark:divide-gray-800">
        <div
          v-for="source in sources"
          :key="`${source.id}-${source.index}`"
          class="py-3"
        >
          <SourceCard :source="source" :show-index="true" @click="$emit('source-click', source)" />
        </div>
      </div>
      
      <!-- 空状态 -->
      <div v-if="sources.length === 0" class="text-center text-muted py-8">
        {{ t("chat.sources.empty") }}
      </div>
    </template>

    <template #footer>
      <div class="w-full flex justify-end">
        <UButton 
          color="neutral" 
          variant="outline"
          @click="$emit('update:open', false)"
        >
          {{ t("chat.sources.close") }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { CitationSource } from '@shared';
import SourceCard from './SourceCard.vue';

defineProps<{
  open: boolean;
  sources: CitationSource[];
}>();

defineEmits<{
  'update:open': [value: boolean];
  'source-click': [source: CitationSource];
}>();

const { t } = useI18n();
</script>
