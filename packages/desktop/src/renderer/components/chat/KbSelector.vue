<template>
  <UPopover :open="open" @update:open="$emit('update:open', $event)">
    <slot />

    <template #content>
      <div :class="[attrs.class, 'bg-default shadow-lg rounded-md ring ring-default overflow-hidden']">
        <div class="p-2 border-b border-default">
          <UInput
            v-model="searchTerm"
            :placeholder="t('chat.kbSelector.search')"
            icon="i-lucide-search"
            size="sm"
            variant="outline"
            class="w-full"
          />
        </div>

        <div class="max-h-80 overflow-y-auto p-1">
          <div
            v-for="kb in filteredKbs"
            :key="kb.id"
            class="flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors hover:bg-elevated/50 cursor-pointer"
            @click="toggleKb(kb.id)"
          >
            <span class="flex-1 truncate text-default text-sm">{{ kb.name }}</span>
            <UIcon
              v-if="selected.includes(kb.id)"
              name="i-lucide-check"
              class="size-4 shrink-0"
            />
          </div>

          <div v-if="!filteredKbs.length" class="text-center py-8 text-sm text-muted">
            <UIcon name="i-lucide-book-open" class="w-8 h-8 mx-auto mb-2" />
            <div>{{ searchTerm ? t("chat.kbSelector.emptySearch") : t("chat.kbSelector.empty") }}</div>
            <UButton
              v-if="!searchTerm"
              :label="t('chat.kbSelector.goToKnowledge')"
              variant="link"
              size="xs"
              @click="goToKnowledge"
            />
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { computed, ref, useAttrs, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useKnowledge } from '@/composables/useKnowledge'

defineOptions({
  inheritAttrs: false
})

const props = defineProps<{
  open: boolean
  selected: string[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:selected': [value: string[]]
}>()

const attrs = useAttrs()
const router = useRouter()
const { t } = useI18n()
const { knowledgeBases, loadKnowledgeBases } = useKnowledge()
const searchTerm = ref('')

const filteredKbs = computed(() => {
  let list = knowledgeBases.value
  if (searchTerm.value) {
    list = list.filter(kb =>
      kb.name.toLowerCase().includes(searchTerm.value.toLowerCase())
    )
  }
  return list
})

watch(
  () => props.open,
  (open) => {
    if (open) loadKnowledgeBases()
  }
)

function toggleKb(kbId: string) {
  const ids = [...props.selected]
  const index = ids.indexOf(kbId)
  if (index > -1) ids.splice(index, 1)
  else ids.push(kbId)
  emit('update:selected', ids)
}

function goToKnowledge() {
  emit('update:open', false)
  router.push({ path: '/knowledge' })
}
</script>
