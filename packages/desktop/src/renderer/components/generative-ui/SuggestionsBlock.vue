<template>
  <div v-if="items.length > 0" class="flex flex-col items-start gap-2 mt-8">
    <div class="mb-1">{{ t("chat.suggestions.continueAsking") }}</div>
    <UButton
      v-for="(item, idx) in items"
      :key="idx"
      size="md"
      icon="i-lucide-arrow-down-right"
      color="neutral"
      variant="soft"
      @click="handleClick(item)"
    >
      {{ item }}
    </UButton>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import emitter from '@/utils/emitter'

const props = defineProps<{
  items: string[]
}>()
const { t } = useI18n()

function handleClick(payload: string) {
  const text = payload.trim()
  if (text) {
    emitter.emit('chat:fill-input', text)
  }
}
</script>
