<template>
  <section class="flex-1 min-w-0 bg-default rounded-xl overflow-y-auto">
    <div class="p-4 flex flex-col gap-3">
      <ListCell
        :title="t('general.language.title')"
        :description="currentLanguageDescription"
      >
        <template #trailing>
          <USelect
            :model-value="settingsStore.languagePreference"
            :items="localizedLanguageOptions"
            value-key="value"
            size="md"
            variant="outline"
            class="w-40 shrink-0"
            :disabled="isSavingLanguage"
            @update:model-value="handleLanguageChange"
          />
        </template>
      </ListCell>

      <ListCell
        :title="t('general.proxy.title')"
        :description="currentProxyDescription"
      >
        <template #trailing>
          <USelect
            :model-value="proxyModeDraft"
            :items="proxyModeOptions"
            value-key="value"
            size="md"
            variant="outline"
            class="w-44 shrink-0"
            :disabled="isSavingProxy"
            @update:model-value="handleProxyModeChange"
          />
        </template>
        <template v-if="proxyModeDraft === 'custom'" #footer>
          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-1.5">
              <div class="text-xs text-muted">{{ t('general.proxy.server.label') }}</div>
              <UInput
                :model-value="proxyServerDraft"
                type="url"
                size="md"
                variant="outline"
                :disabled="isSavingProxy"
                :placeholder="t('general.proxy.server.placeholder')"
                @update:model-value="handleProxyServerDraftChange"
                @blur="handleProxyServerBlur"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <div class="text-xs text-muted">{{ t('general.proxy.bypass.label') }}</div>
              <UTextarea
                :model-value="proxyBypassRulesDraft"
                :rows="4"
                autoresize
                size="md"
                variant="outline"
                :disabled="isSavingProxy"
                :placeholder="t('general.proxy.bypass.placeholder')"
                @update:model-value="handleProxyBypassRulesDraftChange"
                @blur="handleProxyBypassRulesBlur"
              />
              <div class="text-xs text-muted whitespace-pre-line">
                {{ customProxyFooterDescription }}
              </div>
            </div>
          </div>
        </template>
      </ListCell>

      <ListCell
        :title="t('general.launchAtLogin.title')"
        :description="currentLaunchAtLoginDescription"
      >
        <template #trailing>
          <USwitch
            :model-value="settingsStore.appBehaviorSettings.launchAtLogin"
            :disabled="isSavingLaunchAtLogin"
            @update:model-value="handleLaunchAtLoginChange"
          />
        </template>
      </ListCell>

      <ListCell
        :title="t('general.minimizeToTrayOnClose.title')"
        :description="currentMinimizeToTrayOnCloseDescription"
      >
        <template #trailing>
          <USwitch
            :model-value="settingsStore.appBehaviorSettings.minimizeToTrayOnClose"
            :disabled="isSavingMinimizeToTrayOnClose"
            @update:model-value="handleMinimizeToTrayOnCloseChange"
          />
        </template>
      </ListCell>

      <ListCell
        :title="t('general.devtools.title')"
        :description="t('general.devtools.description')"
      >
        <template #trailing>
          <USwitch
            :model-value="settingsStore.aiDevToolsEnabled"
            :disabled="isSaving"
            @update:model-value="handleToggleDevTools"
          />
        </template>
        <template v-if="settingsStore.aiDevToolsEnabled" #footer>
          <div class="flex items-center gap-2 min-w-0">
            <UButton
              :loading="isOpening"
              @click="openDevToolsViewer"
            >
              {{ t("general.devtools.open") }}
            </UButton>
            <span class="text-xs text-toned truncate">{{ devToolsUrl }}</span>
          </div>
        </template>
      </ListCell>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ListCell from '@/components/ListCell.vue'
import { useSettingsStore, type ProxyMode } from '@/stores/useSettingsStore'
import { useMyToast } from '@/composables/useMyToast'
import type { AppLanguagePreference, SupportedAppLocale } from '@shared'

const settingsStore = useSettingsStore()
const toast = useMyToast()
const { t } = useI18n()
const isSaving = ref(false)
const isSavingLanguage = ref(false)
const isSavingProxy = ref(false)
const isSavingLaunchAtLogin = ref(false)
const isSavingMinimizeToTrayOnClose = ref(false)
const isOpening = ref(false)
const devToolsUrl = 'http://127.0.0.1:4983'
const proxyModeDraft = ref<ProxyMode>('system')
const proxyServerDraft = ref('')
const proxyBypassRulesDraft = ref('')
const fixedLanguageLabels: Record<SupportedAppLocale, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
}
const languageOptions: Array<{ label: string; value: AppLanguagePreference }> = [
  { label: '', value: 'auto' },
  { label: '', value: 'en' },
  { label: '', value: 'zh-CN' },
  { label: '', value: 'zh-TW' },
]
const localizedLanguageOptions = computed(() => languageOptions.map((item) => ({
  ...item,
  label: item.value === 'auto'
    ? t('general.language.option.auto')
    : fixedLanguageLabels[item.value]
})))
const proxyModeOptions = computed<Array<{ label: string; value: ProxyMode }>>(() => ([
  { label: t('general.proxy.option.system'), value: 'system' },
  { label: t('general.proxy.option.custom'), value: 'custom' },
  { label: t('general.proxy.option.direct'), value: 'direct' }
]))

const currentLanguageDescription = computed(() => {
  const resolvedLabel = fixedLanguageLabels[settingsStore.resolvedLanguage]
  if (settingsStore.languagePreference === 'auto') {
    const locale = settingsStore.systemLocale || 'unknown'
    return t('general.language.description.auto', {
      systemLocale: locale,
      resolvedLabel
    })
  }
  return t('general.language.description.manual', { resolvedLabel })
})
const currentProxyDescription = computed(() => {
  if (settingsStore.proxySettings.mode === 'custom' && settingsStore.proxySettings.server) {
    return t('general.proxy.description.custom', {
      server: settingsStore.proxySettings.server,
      count: settingsStore.proxySettings.bypassRules.length
    })
  }
  if (settingsStore.proxySettings.mode === 'custom') {
    return t('general.proxy.description.customEmpty')
  }
  if (settingsStore.proxySettings.mode === 'direct') {
    return t('general.proxy.description.direct')
  }
  return t('general.proxy.description.system')
})
const customProxyFooterDescription = computed(() => (
  proxyModeDraft.value === 'custom' && !proxyServerDraft.value.trim()
    ? t('general.proxy.modeDescription.customEmpty')
    : t('general.proxy.bypass.hint')
))
const currentLaunchAtLoginDescription = computed(() => (
  settingsStore.appBehaviorSettings.launchAtLogin
    ? t('general.launchAtLogin.description.enabled')
    : t('general.launchAtLogin.description.disabled')
))
const currentMinimizeToTrayOnCloseDescription = computed(() => (
  settingsStore.appBehaviorSettings.minimizeToTrayOnClose
    ? t('general.minimizeToTrayOnClose.description.enabled')
    : t('general.minimizeToTrayOnClose.description.disabled')
))

watch(
  () => settingsStore.proxySettings,
  (value) => {
    proxyModeDraft.value = value.mode
    proxyServerDraft.value = value.server
    proxyBypassRulesDraft.value = value.bypassRules.join('\n')
  },
  { deep: true, immediate: true }
)

async function handleLanguageChange(value: string | number) {
  const nextValue = String(value) as AppLanguagePreference
  if (nextValue === settingsStore.languagePreference) return

  isSavingLanguage.value = true
  try {
    await settingsStore.setAppLanguage(nextValue)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    isSavingLanguage.value = false
  }
}

async function handleToggleDevTools(value: boolean) {
  isSaving.value = true
  try {
    await settingsStore.setAiDevToolsEnabled(value)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    isSaving.value = false
  }
}

async function handleLaunchAtLoginChange(value: boolean) {
  isSavingLaunchAtLogin.value = true
  try {
    await settingsStore.setAppBehaviorSettings({
      ...settingsStore.appBehaviorSettings,
      launchAtLogin: value
    })
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    isSavingLaunchAtLogin.value = false
  }
}

async function handleMinimizeToTrayOnCloseChange(value: boolean) {
  isSavingMinimizeToTrayOnClose.value = true
  try {
    await settingsStore.setAppBehaviorSettings({
      ...settingsStore.appBehaviorSettings,
      minimizeToTrayOnClose: value
    })
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    isSavingMinimizeToTrayOnClose.value = false
  }
}

async function handleProxyModeChange(value: string | number) {
  const nextValue = String(value)
  const nextMode = nextValue === 'custom' || nextValue === 'direct' ? nextValue : 'system'
  proxyModeDraft.value = nextMode
  await persistProxySettings({
    mode: nextMode,
    server: normalizeProxyServer(proxyServerDraft.value),
    bypassRules: normalizeProxyBypassRules(proxyBypassRulesDraft.value)
  })
}

function handleProxyServerDraftChange(value: string | number) {
  proxyServerDraft.value = String(value ?? '')
}

function handleProxyBypassRulesDraftChange(value: string | number) {
  proxyBypassRulesDraft.value = String(value ?? '')
}

function normalizeProxyServer(input: string) {
  return input.trim()
}

function normalizeProxyBypassRules(input: string) {
  const next = new Set<string>()
  for (const rule of input.split(/\r?\n/g)) {
    const normalized = rule.trim()
    if (normalized) next.add(normalized)
  }
  next.add('localhost')
  next.add('127.0.0.1')
  next.add('::1')
  return Array.from(next)
}

function hasProxySettingsChanged(next: {
  mode: ProxyMode
  server: string
  bypassRules: string[]
}) {
  return next.mode !== settingsStore.proxySettings.mode
    || next.server !== settingsStore.proxySettings.server
    || next.bypassRules.join('\n') !== settingsStore.proxySettings.bypassRules.join('\n')
}

async function persistProxySettings(next: {
  mode: ProxyMode
  server: string
  bypassRules: string[]
}) {
  if (!hasProxySettingsChanged(next)) return

  isSavingProxy.value = true
  try {
    await settingsStore.setProxySettings(next)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    isSavingProxy.value = false
  }
}

async function handleProxyServerBlur() {
  if (proxyModeDraft.value !== 'custom') return

  await persistProxySettings({
    mode: 'custom',
    server: normalizeProxyServer(proxyServerDraft.value),
    bypassRules: normalizeProxyBypassRules(proxyBypassRulesDraft.value)
  })
}

async function handleProxyBypassRulesBlur() {
  if (proxyModeDraft.value !== 'custom') return

  await persistProxySettings({
    mode: 'custom',
    server: normalizeProxyServer(proxyServerDraft.value),
    bypassRules: normalizeProxyBypassRules(proxyBypassRulesDraft.value)
  })
}

async function openDevToolsViewer() {
  isOpening.value = true
  try {
    const result = await settingsStore.openAiDevToolsViewer()
    if (!result?.ok) {
      toast.error(result?.error || t('general.devtools.openFailed'))
      return
    }
    window.devtoolsPreview.open(result.url || devToolsUrl)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  } finally {
    isOpening.value = false
  }
}
</script>
