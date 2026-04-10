<template>
  <div class="flex min-w-0 flex-1 overflow-hidden">
    <!-- 左侧筛选面板 -->
    <aside class="w-[220px] border-r border-default flex flex-col shrink-0">
      <div class="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
        <!-- 模型类型 -->
        <div>
          <div class="text-xs font-medium text-toned mb-2">{{ t('settings.globalModelSearch.filter.modelType') }}</div>
          <URadioGroup
            v-model="filterModelType"
            :items="modelTypeOptions"
            size="md"
          />
        </div>

        <div class="border-t border-default" />

        <!-- 输入模态 -->
        <div>
          <div class="text-xs font-medium text-toned mb-2">{{ t('settings.globalModelSearch.filter.inputModality') }}</div>
          <div class="flex flex-col gap-1.5">
            <UCheckbox
              v-for="item in modalityOptions"
              :key="`in-${item.value}`"
              :label="item.label"
              :model-value="filterInputModalities.includes(item.value)"
              size="md"
              @update:model-value="(checked: boolean | 'indeterminate') => toggleModality('input', item.value, checked)"
            />
          </div>
        </div>

        <div class="border-t border-default" />

        <!-- 输出模态 -->
        <div>
          <div class="text-xs font-medium text-toned mb-2">{{ t('settings.globalModelSearch.filter.outputModality') }}</div>
          <div class="flex flex-col gap-1.5">
            <UCheckbox
              v-for="item in modalityOptions"
              :key="`out-${item.value}`"
              :label="item.label"
              :model-value="filterOutputModalities.includes(item.value)"
              size="md"
              @update:model-value="(checked: boolean | 'indeterminate') => toggleModality('output', item.value, checked)"
            />
          </div>
        </div>

        <div class="border-t border-default" />

        <!-- 供应商状态 -->
        <div>
          <div class="text-xs font-medium text-toned mb-2">{{ t('settings.globalModelSearch.filter.providerStatus') }}</div>
          <URadioGroup
            v-model="filterEnabled"
            :items="enabledOptions"
            size="md"
          />
        </div>

        <div class="border-t border-default" />

        <!-- API Key 状态 -->
        <div>
          <div class="text-xs font-medium text-toned mb-2">{{ t('settings.globalModelSearch.filter.apiKey') }}</div>
          <URadioGroup
            v-model="filterApiKey"
            :items="apiKeyOptions"
            size="md"
          />
        </div>
      </div>
      <div class="px-3 pt-2 pb-3 border-t border-default">
        <UButton
          variant="soft"
          color="neutral"
          size="md"
          icon="i-lucide-rotate-ccw"
          block
          @click="resetFilters"
        >
          {{ t('settings.globalModelSearch.reset') }}
        </UButton>
      </div>
    </aside>

    <!-- 右侧结果列表 -->
    <section class="flex-1 min-w-0 flex flex-col overflow-hidden">
      <!-- 搜索框 + 统计 -->
      <div class="px-4 pt-3 pb-2">
        <UInput
          v-model="searchQuery"
          :placeholder="t('settings.globalModelSearch.searchPlaceholder')"
          icon="i-lucide-search"
          size="md"
          class="w-full"
          :ui="{ trailing: 'pe-1' }"
        >
          <template v-if="searchQuery?.length" #trailing>
            <UButton
              color="neutral"
              variant="link"
              size="sm"
              icon="i-lucide-circle-x"
              :aria-label="t('settings.globalModelSearch.clearSearch')"
              @click="searchQuery = ''"
            />
          </template>
        </UInput>
        <div class="text-sm text-muted mt-3">
          {{ t('settings.globalModelSearch.summary', { providers: matchedProviderCount, models: matchedModelCount }) }}
        </div>
      </div>

      <!-- 结果 -->
      <div class="flex-1 overflow-y-auto px-4">
        <div v-if="filteredResults.length === 0" class="py-16">
          <UEmpty
            :title="t('settings.globalModelSearch.emptyTitle')"
            :description="t('settings.globalModelSearch.emptyDescription')"
            icon="i-lucide-search-x"
            size="sm"
            variant="naked"
          />
        </div>
        <UAccordion
          v-else
          v-model="expandedProviders"
          type="multiple"
          :items="accordionItems"
        >
          <template #default="{ item }">
            <div class="flex items-center justify-between w-full">
              <div class="flex items-center gap-2 min-w-0">
                <div class="w-8 h-8 p-1 rounded-full overflow-hidden shrink-0 flex items-center justify-center border border-default">
                  <img
                    v-if="getProviderLogo(item.value) && !logoLoadFailed.has(item.value)"
                    :src="getProviderLogo(item.value)!"
                    :alt="item.label"
                    loading="lazy"
                    decoding="async"
                    class="w-full h-full object-contain"
                    @error="onLogoLoadError(item.value)"
                  />
                  <UIcon v-else :name="getProviderFallbackIcon(item.value)" class="w-4 h-4 text-toned" />
                </div>
                <span class="text-sm font-medium">{{ item.label }}</span>
                <UBadge variant="subtle" color="neutral" size="sm">
                  {{ getGroup(item.value)?.models.length }}
                </UBadge>
                <UBadge
                  :variant="getGroup(item.value)?.provider.enabled ? 'subtle' : 'subtle'"
                  :color="getGroup(item.value)?.provider.enabled ? 'primary' : 'neutral'"
                  size="sm"
                >
                  {{ getGroup(item.value)?.provider.enabled ? t('settings.globalModelSearch.provider.enabled') : t('settings.globalModelSearch.provider.disabled') }}
                </UBadge>
                <UBadge
                  :variant="getGroup(item.value)?.provider.hasApiKey ? 'subtle' : 'subtle'"
                  :color="getGroup(item.value)?.provider.hasApiKey ? 'primary' : 'neutral'"
                  size="sm"
                >
                  {{ getGroup(item.value)?.provider.hasApiKey ? t('settings.globalModelSearch.provider.configuredKey') : t('settings.globalModelSearch.provider.unconfiguredKey') }}
                </UBadge>
              </div>
              <UButton
                size="xs"
                variant="soft"
                color="neutral"
                icon="i-lucide-arrow-up-right"
                class="ml-2"
                @click.stop="$emit('go-to-provider', item.value)"
              >
                {{ t('settings.globalModelSearch.goToConfig') }}
              </UButton>
            </div>
          </template>
          <template #body="{ item }">
            <div class="py-2 flex flex-col gap-1.5">
              <ModelListItem
                v-for="m in getGroup(item.value)?.models"
                :key="m.id"
                :model="m"
                :is-favorite="settingsStore.isModelFavorite(item.value, m.id)"
                :local-runtime="getLocalRuntime(item.value, m.id)"
                :show-local-runtime-actions="item.value === 'local'"
                show-modalities
                :show-remove="false"
                @toggle-favorite="handleToggleFavorite(item.value, m.id)"
                @open-config="$emit('open-config', item.value, m.id)"
                @local-download="handleLocalDownload(m.id)"
                @local-cancel-download="handleLocalCancelDownload(m.id)"
                @local-load="handleLocalLoad(m.id)"
                @local-unload="handleLocalUnload(m.id)"
              />
            </div>
          </template>
        </UAccordion>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { getProviderFallbackIcon, useProviderLogo } from '@/composables/useProviderLogo'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { LocalModelRuntimeStatus } from '@/stores/useSettingsStore'
import ModelListItem from './ModelListItem.vue'

defineEmits<{
  'go-to-provider': [providerId: string]
  'open-config': [providerId: string, modelId: string]
}>()

const settingsStore = useSettingsStore()
const { t } = useI18n()
const { providerLogoUrl } = useProviderLogo()

const logoLoadFailed = ref(new Set<string>())
function onLogoLoadError(id: string) {
  logoLoadFailed.value = new Set(logoLoadFailed.value).add(id)
}

const modalityOptions = computed(() => [
  { label: t('settings.modelList.modality.text'), value: 'text' },
  { label: t('settings.modelList.modality.image'), value: 'image' },
  { label: t('settings.modelList.modality.audio'), value: 'audio' },
  { label: t('settings.modelList.modality.video'), value: 'video' },
  { label: t('settings.modelList.modality.file'), value: 'file' },
  { label: 'Mask', value: 'mask' },
])

const searchQuery = ref('')
const filterModelType = ref('all')
const filterInputModalities = ref<string[]>([])
const filterOutputModalities = ref<string[]>([])
const filterEnabled = ref('all')
const filterApiKey = ref('all')

const modelTypeOptions = computed(() => [
  { label: t('settings.globalModelSearch.option.all'), value: 'all' },
  { label: t('settings.globalModelSearch.option.generative'), value: 'generative' },
  { label: t('settings.globalModelSearch.option.embedding'), value: 'embedding' },
  { label: t('settings.globalModelSearch.option.rerank'), value: 'rerank' },
])

const enabledOptions = computed(() => [
  { label: t('settings.globalModelSearch.option.all'), value: 'all' },
  { label: t('settings.globalModelSearch.option.enabled'), value: 'enabled' },
  { label: t('settings.globalModelSearch.option.disabled'), value: 'disabled' },
])

const apiKeyOptions = computed(() => [
  { label: t('settings.globalModelSearch.option.all'), value: 'all' },
  { label: t('settings.globalModelSearch.option.configured'), value: 'configured' },
  { label: t('settings.globalModelSearch.option.unconfigured'), value: 'unconfigured' },
])

function toggleModality(type: 'input' | 'output', value: string, checked: boolean | 'indeterminate') {
  const list = type === 'input' ? filterInputModalities : filterOutputModalities
  if (checked === true) {
    if (!list.value.includes(value)) {
      list.value = [...list.value, value]
    }
  } else {
    list.value = list.value.filter(v => v !== value)
  }
}

function resetFilters() {
  searchQuery.value = ''
  filterModelType.value = 'all'
  filterInputModalities.value = []
  filterOutputModalities.value = []
  filterEnabled.value = 'all'
  filterApiKey.value = 'all'
}

const filteredResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return settingsStore.providers
    .filter(provider => {
      if (filterEnabled.value === 'enabled' && !provider.enabled) return false
      if (filterEnabled.value === 'disabled' && provider.enabled) return false
      if (filterApiKey.value === 'configured' && !provider.hasApiKey) return false
      if (filterApiKey.value === 'unconfigured' && provider.hasApiKey) return false
      return true
    })
    .map(provider => {
      const providerMatchesSearch = query
        ? provider.name.toLowerCase().includes(query) || provider.id.toLowerCase().includes(query)
        : true

      const models = provider.models.filter(model => {
        if (query && !providerMatchesSearch) {
          if (!model.id.toLowerCase().includes(query)) return false
        }

        if (filterModelType.value !== 'all') {
          const mt = model.modelType || 'generative'
          if (mt !== filterModelType.value) return false
        }

        const mt = model.modelType || 'generative'
        if (filterInputModalities.value.length > 0) {
          if (mt !== 'generative') return false
          const modelInput = model.inputModalities || []
          if (!filterInputModalities.value.every((m: string) => modelInput.includes(m))) return false
        }

        if (filterOutputModalities.value.length > 0) {
          if (mt !== 'generative') return false
          const modelOutput = model.outputModalities || []
          if (!filterOutputModalities.value.every((m: string) => modelOutput.includes(m))) return false
        }

        return true
      }).sort((a: any, b: any) => a.id.localeCompare(b.id))

      return { provider, models }
    })
    .filter(group => group.models.length > 0)
})

const groupMap = computed(() =>
  new Map(filteredResults.value.map(g => [g.provider.id, g]))
)

function getGroup(providerId: string) {
  return groupMap.value.get(providerId)
}

function getProviderLogo(providerId: string) {
  const group = getGroup(providerId)
  return group ? providerLogoUrl(group.provider.logo) : undefined
}

const accordionItems = computed(() =>
  filteredResults.value.map(group => ({
    label: group.provider.name,
    value: group.provider.id,
  }))
)

const expandedProviders = ref<string[]>([])
watch(() => filteredResults.value.map(g => g.provider.id), (ids) => {
  expandedProviders.value = [...ids]
}, { immediate: true })

const matchedProviderCount = computed(() => filteredResults.value.length)
const matchedModelCount = computed(() =>
  filteredResults.value.reduce((sum, g) => sum + g.models.length, 0)
)

function getLocalRuntime(providerId: string, modelId: string): LocalModelRuntimeStatus | null {
  if (providerId !== 'local') return null
  return settingsStore.getLocalModelRuntime(modelId)
}

async function handleToggleFavorite(providerId: string, modelId: string) {
  try {
    await settingsStore.toggleModelFavorite(providerId, modelId)
  } catch {
    // no-op
  }
}

async function handleLocalDownload(modelId: string) {
  try {
    await settingsStore.downloadLocalModel(modelId)
  } finally {
    await settingsStore.refreshLocalModelRuntimes()
  }
}

async function handleLocalCancelDownload(modelId: string) {
  try {
    await settingsStore.cancelLocalModelDownload(modelId)
  } finally {
    await settingsStore.refreshLocalModelRuntimes()
  }
}

async function handleLocalLoad(modelId: string) {
  try {
    await settingsStore.loadLocalModel(modelId)
  } finally {
    await settingsStore.refreshLocalModelRuntimes()
  }
}

async function handleLocalUnload(modelId: string) {
  try {
    await settingsStore.unloadLocalModel(modelId)
  } finally {
    await settingsStore.refreshLocalModelRuntimes()
  }
}

onMounted(() => {
  settingsStore.startLocalModelRuntimePolling()
})

onBeforeUnmount(() => {
  settingsStore.stopLocalModelRuntimePolling()
})
</script>
