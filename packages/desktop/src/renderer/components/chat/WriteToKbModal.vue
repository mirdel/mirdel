<template>
  <UModal
    v-model:open="modelOpen"
    :title="t('knowledge.writeModal.title')"
    :ui="{ footer: 'justify-end', body: 'p-4' }"
  >
    <template #body>
      <div class="space-y-3">
        <div v-if="isLoadingKbs" class="flex items-center justify-center py-6 text-sm text-muted">
          {{ t("knowledge.writeModal.loading") }}
        </div>

        <template v-else-if="kbList.length > 0">
          <p class="text-sm text-muted">{{ t("knowledge.writeModal.selectHint") }}</p>
          <div class="max-h-64 overflow-y-auto space-y-1">
            <div
              v-for="kb in kbList"
              :key="kb.id"
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
              :class="selectedKbId === kb.id ? 'bg-elevated border border-default' : 'hover:bg-elevated border border-transparent'"
              @click="selectedKbId = kb.id"
            >
              <UIcon name="i-lucide-book-search" class="w-4 h-4 shrink-0 text-muted" />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ kb.name }}</div>
                <div v-if="kb.description" class="text-xs text-muted truncate">{{ kb.description }}</div>
              </div>
              <UIcon
                v-if="selectedKbId === kb.id"
                name="i-lucide-check"
                class="w-4 h-4 shrink-0"
              />
            </div>
          </div>
        </template>

        <UEmpty
          v-else
          icon="i-lucide-database"
          :title="t('knowledge.writeModal.emptyTitle')"
          :description="t('knowledge.writeModal.emptyDescription')"
          variant="naked"
        />
      </div>
    </template>

    <template #footer="{ close }">
      <UButton variant="outline" color="neutral" @click="close()">{{ t("notes.modal.cancel") }}</UButton>
      <UButton
        :disabled="!selectedKbId || isWriting"
        :loading="isWriting"
        @click="handleConfirm"
      >
        {{ t("knowledge.writeModal.write") }}
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useKnowledge, type KnowledgeBase } from '@/composables/useKnowledge'
import { useMyToast } from '@/composables/useMyToast'

const props = defineProps<{
  contentMd: string
}>()

const modelOpen = defineModel<boolean>('open', { default: false })

const toast = useMyToast()
const { t } = useI18n()
const { loadKnowledgeBases, addTextItem, processItem } = useKnowledge()

const kbList = ref<KnowledgeBase[]>([])
const selectedKbId = ref<string | null>(null)
const isLoadingKbs = ref(false)
const isWriting = ref(false)

watch(modelOpen, async (open) => {
  if (!open) return
  selectedKbId.value = null
  isLoadingKbs.value = true
  try {
    await loadKnowledgeBases()
    const list = await window.ipc('kb:list')
    kbList.value = list
    if (list.length === 1) {
      selectedKbId.value = list[0].id
    }
  } catch (error) {
    toast.error({ title: t('knowledge.writeModal.loadFailed'), description: String(error) })
  } finally {
    isLoadingKbs.value = false
  }
})

async function handleConfirm() {
  if (!selectedKbId.value || !props.contentMd.trim()) return
  isWriting.value = true
  try {
    const name = props.contentMd.slice(0, 80).replace(/\n/g, ' ').trim() || t('knowledge.writeModal.defaultName')
    const item = await addTextItem(selectedKbId.value, {
      name,
      content: props.contentMd,
    })
    await processItem(item.id, selectedKbId.value)
    toast.success(t('knowledge.writeModal.success'))
    modelOpen.value = false
  } catch (error) {
    toast.error({ title: t('knowledge.writeModal.failed'), description: String(error) })
  } finally {
    isWriting.value = false
  }
}
</script>
