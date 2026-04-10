<template>
  <section class="flex-1 min-w-0 bg-default rounded-xl overflow-y-auto">
    <div class="p-4 flex flex-col gap-3">
      <ListCell
        :title="t('settings.session.titleGeneration.title')"
        :description="t('settings.session.titleGeneration.description')"
      >
        <template #trailing>
          <USelect
            :model-value="settingsStore.sessionPreferences.titleGenerationMode"
            :items="titleGenerationModeOptions"
            value-key="value"
            size="md"
            variant="outline"
            class="w-40 shrink-0"
            @update:model-value="handleTitleGenerationModeChange"
          />
        </template>
      </ListCell>

      <ListCell
        :title="t('settings.session.generateSuggestions.title')"
        :description="t('settings.session.generateSuggestions.description')"
      >
        <template #trailing>
          <USwitch
            :model-value="settingsStore.sessionPreferences.generateSuggestions"
            @update:model-value="(value) => handleToggle('generateSuggestions', value)"
          />
        </template>
      </ListCell>

      <ListCell
        :title="t('settings.session.showMindmap.title')"
        :description="t('settings.session.showMindmap.description')"
      >
        <template #trailing>
          <USwitch
            :model-value="settingsStore.sessionPreferences.showMindmap"
            @update:model-value="(value) => handleToggle('showMindmap', value)"
          />
        </template>
      </ListCell>

      <ListCell
        :title="t('settings.session.showTokenUsage.title')"
        :description="t('settings.session.showTokenUsage.description')"
      >
        <template #trailing>
          <USwitch
            :model-value="settingsStore.sessionPreferences.showTokenUsage"
            @update:model-value="(value) => handleToggle('showTokenUsage', value)"
          />
        </template>
      </ListCell>

      <ListCell
        :title="t('settings.session.showDebugEntry.title')"
        :description="t('settings.session.showDebugEntry.description')"
      >
        <template #trailing>
          <USwitch
            :model-value="settingsStore.sessionPreferences.showDebugEntry"
            @update:model-value="(value) => handleToggle('showDebugEntry', value)"
          />
        </template>
      </ListCell>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ListCell from '@/components/ListCell.vue'
import { useMyToast } from '@/composables/useMyToast'
import {
  useSettingsStore,
  type SessionPreferences,
  type SessionTitleGenerationMode
} from '@/stores/useSettingsStore'

const settingsStore = useSettingsStore()
const toast = useMyToast()
const { t } = useI18n()

const titleGenerationModeOptions = computed<Array<{ label: string; value: SessionTitleGenerationMode }>>(() => ([
  { label: t('settings.session.titleGeneration.option.ai'), value: 'ai' },
  { label: t('settings.session.titleGeneration.option.extract'), value: 'extract' }
]))

async function handleTitleGenerationModeChange(value: string | number) {
  try {
    await settingsStore.setSessionPreferences({
      titleGenerationMode: value === 'extract' ? 'extract' : 'ai'
    })
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

async function handleToggle(
  key: keyof Omit<SessionPreferences, 'titleGenerationMode'>,
  value: boolean
) {
  try {
    await settingsStore.setSessionPreferences({ [key]: value })
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}
</script>
