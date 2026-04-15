<template>
  <UModal
    :open="open"
    :title="modalTitle"
    :ui="{ content: 'max-w-3xl', footer: 'justify-end' }"
    @update:open="$emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4">
        <div class="rounded-lg border border-default bg-elevated p-3 text-sm">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge color="neutral" variant="soft">
              {{ modeLabel }}
            </UBadge>
            <span class="text-muted">{{ t("chat.historicalMemory.count", { count: recall?.hits.length ?? 0 }) }}</span>
          </div>
          <div v-if="recall?.query" class="mt-2 text-xs text-muted">
            {{ t("chat.historicalMemory.query") }}:
            <span class="text-default whitespace-pre-wrap">{{ recall.query }}</span>
          </div>
          <div v-if="showRangeLabel" class="mt-2 text-xs text-muted">
            {{ t("chat.historicalMemory.range") }}:
            <span class="text-default">{{ recall?.rangeLabel }}</span>
          </div>
        </div>

        <UEmpty
          v-if="!recall || recall.hits.length === 0"
          icon="i-lucide-brain-cog"
          :title="t('chat.historicalMemory.emptyTitle')"
          :description="t('chat.historicalMemory.emptyDescription')"
        />

        <div v-else class="space-y-2">
          <div
            v-for="hit in recall.hits"
            :key="`${hit.sessionId}:${hit.turnId}:${hit.chunkId}`"
            class="rounded-lg border border-default bg-default p-3 space-y-2"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="font-medium text-sm text-default truncate">
                  {{ hit.sessionTitle || hit.sessionId }}
                </div>
                <div class="text-xs text-muted">
                  {{ formatTime(hit.createdAt) }}
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-1 text-xs text-muted">
                <span>score {{ formatScore(hit.score) }}</span>
                <span v-if="hit.vectorScore != null">· vector {{ formatScore(hit.vectorScore) }}</span>
                <span v-if="hit.keywordScore != null">· keyword {{ formatScore(hit.keywordScore) }}</span>
              </div>
            </div>

            <div v-if="hit.reason.length > 0" class="flex flex-wrap gap-1">
              <UBadge
                v-for="reason in hit.reason"
                :key="reason"
                color="neutral"
                variant="outline"
                size="sm"
              >
                {{ reason }}
              </UBadge>
            </div>

            <pre class="text-xs text-toned whitespace-pre-wrap break-words">{{ hit.contentPreview }}</pre>

            <div class="flex justify-end">
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-arrow-up-right"
                @click="openSession(hit.sessionId)"
              >
                {{ t("chat.historicalMemory.openSession") }}
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        @click="$emit('update:open', false)"
      >
        {{ t("common.close") }}
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { HistoricalMemoryRecall } from '@shared'

const props = defineProps<{
  open: boolean
  recall?: HistoricalMemoryRecall | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const router = useRouter()
const { t, locale } = useI18n()

const modalTitle = computed(() => t('chat.historicalMemory.title'))
const modeLabel = computed(() => {
  if (props.recall?.mode === 'review') return t('chat.historicalMemory.mode.review')
  if (props.recall?.mode === 'tool') return t('chat.historicalMemory.mode.tool')
  return t('chat.historicalMemory.mode.auto')
})
const showRangeLabel = computed(() => {
  const label = props.recall?.rangeLabel?.trim()
  return !!label && label !== 'anytime'
})

function formatTime(value: number): string {
  if (!value) return t('settings.memory.historical.unknown')
  return new Date(value).toLocaleString(locale.value)
}

function formatScore(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '-'
}

function openSession(sessionId: string) {
  emit('update:open', false)
  router.push({ name: 'chat', params: { sessionId } })
}
</script>
