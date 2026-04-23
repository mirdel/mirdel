<template>
  <div class="mb-3 leading-7 group">
    <div>
      <div class="mb-2 flex items-center gap-2.5">
        <UAvatar icon="i-lucide-settings" size="md" />
        <div class="flex items-center gap-2 text-xs select-none">
          <span class="truncate">{{ t("scenario.tabs.prompt") }}</span>
        </div>
      </div>

      <div class="flex-1 min-w-0">
        <div class="px-4 py-3 rounded-xl border border-default text-sm">
          <CollapsibleText :source="content" :collapsed-height="80" fade-from-class="from-default">
            <div class="whitespace-pre-wrap">{{ content }}</div>
          </CollapsibleText>
        </div>

        <div class="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <UTooltip :text="t('chat.systemPrompt.edit')">
            <UButton
              icon="i-lucide-square-pen"
              size="sm"
              color="neutral"
              variant="ghost"
              square
              @click="handleEdit"
            />
          </UTooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import CollapsibleText from './CollapsibleText.vue'

const { t } = useI18n()

defineProps<{
  content: string
}>()

const emit = defineEmits<{
  edit: []
}>()

function handleEdit() {
  emit('edit')
}
</script>
