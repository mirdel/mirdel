<template>
  <UModal :open="open" @update:open="$emit('update:open', $event)" :title="note?.title || t('chat.notePreview.defaultTitle')">
    <template #body>
      <div v-if="note">
        <MarkdownBlock :content="note.contentMd || t('chat.notePreview.emptyContent')" :is-streaming="false" />
      </div>
    </template>

    <template #footer>
      <div class="w-full flex justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          @click="$emit('update:open', false)"
        >
          {{ t("chat.notePreview.close") }}
        </UButton>
        <UButton
          icon="i-lucide-arrow-up-right"
          @click="handleJumpToNote"
        >
          {{ t("chat.notePreview.openInNotes") }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MarkdownBlock from '../MarkdownBlock.vue'
import { useMyToast } from '@/composables/useMyToast'

export interface NotePreviewData {
  noteId: string
  title: string
  contentMd: string
}

const props = defineProps<{
  open: boolean
  note: NotePreviewData | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { t } = useI18n()
const router = useRouter()
const toast = useMyToast()

async function handleJumpToNote() {
  if (!props.note) return
  try {
    const result = await window.ipc('notes:get', { id: props.note.noteId })
    if (!result) {
      toast.error({ title: t('chat.notePreview.deleted') })
      return
    }
    router.push({ name: 'notes-detail', params: { noteId: props.note.noteId } })
    emit('update:open', false)
  } catch {
    toast.error({ title: t('chat.notePreview.deleted') })
  }
}
</script>
