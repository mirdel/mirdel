<template>
  <UPopover :open="open" @update:open="emit('update:open', $event)">
    <slot />

    <template #content>
      <div :class="[attrs.class, 'overflow-hidden']">
        <div class="w-72 h-80 flex flex-col">
          <!-- 知识库分组：固定高度 + 滚动 -->
          <div class="shrink-0 px-2 pt-3 pb-1">
            <div class="flex items-center gap-1.5 text-xs font-medium text-muted mb-1.5">
              <UIcon name="i-lucide-book-search" class="size-3.5 shrink-0" />
              {{ t("chat.localKnowledge.kbGroup") }}
            </div>
            <div class="h-20 overflow-y-auto">
              <template v-if="kbList.length > 0">
                <button
                  v-for="kb in kbList"
                  :key="kb.id"
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md hover:bg-elevated/50 transition-colors text-default text-left"
                  @click="toggleKb(kb.id)"
                >
                  <span
                    :class="[
                      'size-4 shrink-0 rounded-sm border flex items-center justify-center transition-colors',
                      effectiveKbIds.includes(kb.id)
                        ? 'border-inverted bg-inverted text-inverted'
                        : 'border-default bg-default text-transparent'
                    ]"
                  >
                    <UIcon name="i-lucide-check" class="size-3" />
                  </span>
                  <span class="flex-1 truncate">{{ kb.name }}</span>
                </button>
              </template>
              <div v-else class="px-3 py-4 text-sm text-muted text-center">
                {{ t("chat.localKnowledge.emptyKb") }}
              </div>
            </div>
          </div>

          <!-- 笔记分组：撑满剩余空间 + 滚动 -->
          <div class="flex-1 min-h-0 px-2 pt-2 pb-3 flex flex-col">
            <div class="flex items-center gap-1.5 text-xs font-medium text-muted mb-1.5 shrink-0">
              <UIcon name="i-lucide-notebook-pen" class="size-3.5 shrink-0" />
              {{ t("chat.localKnowledge.noteGroup") }}
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto">
              <template v-if="noteList.length > 0">
                <button
                  v-for="note in noteList"
                  :key="note.id"
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md hover:bg-elevated/50 transition-colors text-default text-left"
                  @click="emit('toggle-note', note)"
                >
                  <span
                    :class="[
                      'size-4 shrink-0 rounded-sm border flex items-center justify-center transition-colors',
                      selectedNoteIds.includes(note.id)
                        ? 'border-inverted bg-inverted text-inverted'
                        : 'border-default bg-default text-transparent'
                    ]"
                  >
                    <UIcon name="i-lucide-check" class="size-3" />
                  </span>
                  <span class="flex-1 truncate">{{ note.title || t("chat.localKnowledge.untitledNote") }}</span>
                </button>
              </template>
              <div v-else class="px-3 py-4 text-sm text-muted text-center">
                {{ t("chat.localKnowledge.emptyNote") }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { computed, useAttrs, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/useChatStore'
import { useKnowledge } from '@/composables/useKnowledge'
import { useNotes, type Note } from '@/composables/useNotes'

defineOptions({
  inheritAttrs: false
})

const props = defineProps<{
  open: boolean
  selectedNotes: Array<{ noteId: string; title: string; contentMd: string }>
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'toggle-note': [note: Note]
}>()

const { t } = useI18n()
const attrs = useAttrs()
const chatStore = useChatStore()
const { knowledgeBases, loadKnowledgeBases } = useKnowledge()
const { notes: allNotes, loadNotes: loadAllNotes } = useNotes()

const effectiveKbIds = computed(() => chatStore.effectiveKbIds || [])
const kbList = computed(() => knowledgeBases.value)
const noteList = computed(() => allNotes.value)
const selectedNoteIds = computed(() => props.selectedNotes.map(n => n.noteId))

function toggleKb(kbId: string) {
  if (effectiveKbIds.value.includes(kbId)) {
    chatStore.removeKbFromSelection(kbId)
  } else {
    chatStore.addKbToTemp(kbId)
  }
}

watch(() => props.open, (open) => {
  if (open) {
    void loadKnowledgeBases()
    void loadAllNotes()
  }
})
</script>
