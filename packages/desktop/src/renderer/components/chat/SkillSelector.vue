<template>
  <UPopover :open="open" @update:open="handleOpenChange">
    <slot />

    <template #content>
      <div :class="[attrs.class, 'overflow-hidden']">
        <div class="h-80 flex flex-col">
          <div class="px-2 pt-2">
            <UTabs
              v-model="activeTab"
              :items="tabItems"
              :content="false"
              size="xs"
              class="w-full"
              @update:model-value="handleTabChange"
            />
          </div>

          <div v-if="activeTab === 'auto'" class="flex-1 min-h-0 px-4 text-sm text-muted text-center flex items-center justify-center">
            {{ t("chat.skillSelector.autoHint") }}
          </div>
          <div v-else-if="activeTab === 'off'" class="flex-1 min-h-0 px-4 text-sm text-muted text-center flex items-center justify-center">
            {{ t("chat.skillSelector.offHint") }}
          </div>
          <div v-else class="flex-1 min-h-0 p-2 flex flex-col">
            <div class="pb-2 shrink-0">
              <UInput
                v-model="searchTerm"
                :placeholder="t('chat.skillSelector.search')"
                icon="i-lucide-search"
                size="xs"
                variant="outline"
                class="w-full"
              />
            </div>

            <div class="flex-1 min-h-24 overflow-y-auto">
              <template v-if="filteredSkills.length > 0">
                <button
                  v-for="skill in filteredSkills"
                  :key="skill.id"
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md hover:bg-elevated/50 transition-colors text-default"
                  @click="handleSelectSkill(skill.id)"
                >
                  <UIcon name="i-lucide-package" class="size-4 shrink-0" />
                  <span class="flex-1 text-left truncate">{{ skill.name }}</span>
                  <UIcon
                    v-if="manualSkillId === skill.id"
                    name="i-lucide-check"
                    class="size-4 shrink-0"
                  />
                </button>
              </template>
              <div v-else class="px-3 py-4 text-sm text-muted text-center">
                {{ skills.length > 0 ? t("chat.skillSelector.emptySearch") : t("chat.skillSelector.empty") }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { computed, ref, useAttrs, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSkillStore } from '@/stores/useSkillStore'

defineOptions({
  inheritAttrs: false
})

const props = defineProps<{
  open: boolean
  policy: 'auto' | 'off'
  manualSkillId: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:policy': [value: 'auto' | 'off']
  'select-skill': [skillId: string]
}>()

type SkillTab = 'auto' | 'manual' | 'off'

const attrs = useAttrs()
const skillStore = useSkillStore()
const { t } = useI18n()
const searchTerm = ref('')
const activeTab = ref<SkillTab>(props.manualSkillId ? 'manual' : props.policy)

const tabItems = computed(() => [
  { value: 'auto', label: t('chat.skillSelector.tab.auto'), icon: 'i-lucide-wand-sparkles' },
  { value: 'manual', label: t('chat.skillSelector.tab.manual'), icon: 'i-lucide-package' },
  { value: 'off', label: t('chat.skillSelector.tab.off'), icon: 'i-lucide-ban' }
])

const skills = computed(() => skillStore.skills)
const filteredSkills = computed(() => {
  const keyword = searchTerm.value.trim().toLowerCase()
  if (!keyword) return skills.value
  return skills.value.filter(skill => {
    return skill.name.toLowerCase().includes(keyword) || skill.id.toLowerCase().includes(keyword)
  })
})

watch(
  () => [props.policy, props.manualSkillId],
  ([policy, manualSkillId]) => {
    activeTab.value = manualSkillId ? 'manual' : policy
  }
)

function handleTabChange(value: string | number) {
  const tab = value as SkillTab
  if (tab === 'manual') return
  emit('update:policy', tab)
}

function handleOpenChange(value: boolean) {
  if (!value && activeTab.value === 'manual' && !props.manualSkillId) {
    emit('update:policy', 'off')
  }
  emit('update:open', value)
}

function handleSelectSkill(skillId: string) {
  emit('select-skill', skillId)
}
</script>
