<template>
  <div class="flex flex-col min-w-0 flex-1 bg-default rounded-xl overflow-hidden">
    <!-- Tab 切换 -->
    <div class="px-2 py-2.5 shrink-0 border-b border-default">
      <UTabs v-model="activeView" :items="viewTabs" :content="false" variant="pill" color="neutral" size="sm" :ui="{ root: 'w-70' }" />
    </div>

    <!-- 按供应商浏览 视图 -->
    <div v-show="activeView === 'provider'" class="flex min-w-0 flex-1 min-h-0 overflow-hidden">
    <!-- 第二栏：供应商列表 -->
    <section class="w-[240px] flex flex-col border-r border-default">
      <div class="p-3 pb-2 shrink-0">
        <UInput
          v-model="providerListSearchQuery"
          :placeholder="t('settings.modelService.providerSearchPlaceholder')"
          icon="i-lucide-search"
          size="md"
          :ui="{ root: 'w-full' }"
        />
      </div>
      <UList
        v-model="selectedProviderId"
        :items="filteredSortedProviders"
        value-key="id"
        label-key="name"
        size="md"
        gap="md"
        padding="md"
        class="flex-1 min-h-0"
      >
        <template #item="{ item }">
          <div class="flex items-center gap-2 w-full min-w-0">
            <!-- Logo 或默认图标 -->
            <div class="w-8 h-8 p-1 rounded-full overflow-hidden shrink-0 flex items-center justify-center border border-default  relative">
              <img
                v-if="providerLogoUrl(item.logo) && !logoLoadFailed.has(item.id)"
                :src="providerLogoUrl(item.logo)!"
                :alt="item.name"
                loading="lazy"
                decoding="async"
                class="w-full h-full object-contain"
                @error="onLogoLoadError(item.id)"
              />
              <UIcon v-else :name="getProviderFallbackIcon(item.id)" class="w-4 h-4 text-muted" />
            </div>
            <div class="flex-1 min-w-0 flex flex-col">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 min-w-0">
                  <UText :text="item.name" class="text-sm font-medium truncate" />
                  <UBadge v-if="item.management?.free" variant="subtle" color="success" size="sm">{{ t('settings.modelService.free') }}</UBadge>
                </div>
                <div
                  :class="[
                    'w-2 h-2 rounded-full shrink-0',
                    item.enabled ? 'bg-green-500' : 'bg-inverted/30'
                  ]"
                />
              </div>
              <div class="text-xs opacity-70">
                {{ item.hasApiKey ? t('settings.modelService.keyConfigured') : t('settings.modelService.keyNotConfigured') }}
              </div>
            </div>
          </div>
        </template>
      </UList>
      <div class="p-3 border-t border-default">
        <UButton
          icon="i-lucide-plus"
          variant="soft"
          color="neutral"
          block
          @click="openAddCustomModal"
        >
          {{ t('settings.modelService.addProvider') }}
        </UButton>
      </div>
    </section>

    <!-- 第三栏：详细配置 -->
    <section class="flex-1 min-w-0 overflow-y-auto">
      <div class="p-4 flex flex-col gap-4">
        <!-- 供应商配置卡片（本地 / 第三方统一） -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-9 h-9 p-1 rounded-full overflow-hidden shrink-0 flex items-center justify-center border border-default relative">
                  <img
                    v-if="activeProvider && providerLogoUrl(activeProvider.logo) && !logoLoadFailed.has(activeProvider.id)"
                    :src="providerLogoUrl(activeProvider.logo)!"
                    :alt="activeProvider.name"
                    loading="lazy"
                    decoding="async"
                    class="w-full h-full object-contain"
                    @error="onLogoLoadError(activeProvider.id)"
                  />
                  <UIcon v-else :name="getProviderFallbackIcon(activeProvider?.id ?? '')" class="w-4 h-4 text-muted" />
                </div>
                <div class="flex flex-col">
                  <div class="flex items-center gap-1.5">
                    <span class="text-sm font-medium">{{ activeProvider?.name ?? t('settings.modelService.selectProvider') }}</span>
                    <UBadge v-if="activeProvider?.management?.free" variant="subtle" color="success" size="sm">{{ t('settings.modelService.free') }}</UBadge>
                  </div>
                  <a
                    v-if="activeProvider?.helpUrl"
                    href="#"
                    class="text-xs text-info hover:underline self-start mt-px"
                    @click.prevent="openHelpUrl(activeProvider!.helpUrl!)"
                  >
                    {{ activeProvider.helpLabel || t('settings.modelService.getApiKey') }}
                  </a>
                  <span
                    v-else-if="activeProvider?.helpLabel"
                    class="text-xs text-muted self-start mt-px"
                  >
                    {{ activeProvider.helpLabel }}
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  v-if="activeProvider?.isBuiltin === false"
                  icon="i-lucide-pencil"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  @click="openEditCustomModal"
                />
                <UButton
                  v-if="activeProvider?.isBuiltin === false"
                  icon="i-lucide-trash-2"
                  variant="ghost"
                  color="error"
                  size="xs"
                  @click="confirmDeleteCustom"
                />
                <span class="text-xs opacity-70">{{ t('settings.modelService.enabled') }}</span>
                <USwitch
                  v-model="providerForm.enabled"
                  :disabled="!canToggleEnabled"
                  @change="handleSave"
                />
              </div>
            </div>
          </template>

          <div class="flex flex-col gap-3">
            <UFormField :label="t('settings.modelService.apiKey')">
              <div class="flex gap-2">
                <UInput
                  v-model="providerForm.apiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  :placeholder="t('settings.modelService.apiKeyPlaceholder')"
                  :readonly="!canEditApiKey"
                  class="flex-1"
                  :ui="!canEditApiKey ? { base: 'bg-elevated' } : undefined"
                  @blur="handleApiKeyBlur"
                />
                <UTooltip :text="showApiKey ? t('settings.modelService.hideApiKey') : t('settings.modelService.showApiKey')">
                  <UButton
                    :icon="showApiKey ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
                    variant="ghost"
                    color="neutral"
                    :disabled="!providerForm.apiKey"
                    @click="showApiKey = !showApiKey"
                  />
                </UTooltip>
                <UTooltip :text="t('settings.modelService.copyApiKey')">
                  <UButton
                    icon="i-lucide-copy"
                    variant="ghost"
                    color="neutral"
                    :disabled="!providerForm.apiKey"
                    @click="copyApiKey"
                  />
                </UTooltip>
                <UTooltip v-if="canRegenerateApiKey" :text="t('settings.modelService.regenerateApiKey')">
                  <UButton
                    icon="i-lucide-refresh-cw"
                    variant="ghost"
                    color="neutral"
                    :loading="isRegeneratingLocalApiKey"
                    @click="regenerateLocalApiKey"
                  />
                </UTooltip>
              </div>
            </UFormField>

            <UFormField :label="t('settings.modelService.baseUrl')">
              <div class="flex gap-2">
                <UInput
                  v-model="providerForm.baseUrl"
                  class="flex-1"
                  placeholder="https://api.openai.com"
                  :readonly="!canEditBaseUrl"
                  :ui="!canEditBaseUrl ? { base: 'bg-elevated' } : undefined"
                  @blur="handleBaseUrlBlur"
                />
                <UTooltip :text="t('settings.modelService.copyBaseUrl')">
                  <UButton
                    icon="i-lucide-copy"
                    variant="ghost"
                    color="neutral"
                    :disabled="!providerForm.baseUrl"
                    @click="copyBaseUrl"
                  />
                </UTooltip>
              </div>
            </UFormField>

            <div class="border border-default rounded-lg overflow-hidden">
              <button
                type="button"
                class="w-full px-3 py-2 flex items-center text-left hover:bg-muted/50"
                @click="mediaEndpointPanelOpen = !mediaEndpointPanelOpen"
              >
                <span class="text-sm font-medium">{{ t('settings.modelService.mediaBaseUrls') }}</span>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="w-4 h-4 transition-transform"
                  :class="mediaEndpointPanelOpen ? 'rotate-180' : ''"
                />
              </button>
              <div v-if="mediaEndpointPanelOpen" class="px-3 pb-3 pt-1 flex flex-col gap-3">
                <UFormField
                  :label="t('settings.modelService.imageBaseUrl')"
                  :description="t('settings.modelService.imageBaseUrlDescription')"
                >
                  <UInput
                    v-model="providerForm.imageBaseUrl"
                    class="w-full"
                    :placeholder="providerForm.baseUrl || 'https://api.example.com/v1'"
                    :readonly="!canEditBaseUrl"
                    :ui="!canEditBaseUrl ? { base: 'bg-elevated' } : undefined"
                    @blur="handleSave"
                  />
                </UFormField>
                <UFormField
                  :label="t('settings.modelService.videoBaseUrl')"
                  :description="t('settings.modelService.videoBaseUrlDescription')"
                >
                  <UInput
                    v-model="providerForm.videoBaseUrl"
                    class="w-full"
                    :placeholder="providerForm.baseUrl || 'https://api.example.com/v1'"
                    :readonly="!canEditBaseUrl"
                    :ui="!canEditBaseUrl ? { base: 'bg-elevated' } : undefined"
                    @blur="handleSave"
                  />
                </UFormField>
              </div>
            </div>

            <div class="flex items-center justify-between gap-2 flex-wrap">
              <UButton variant="soft" color="neutral" @click="onTest">{{ t('settings.modelService.test') }}</UButton>
              <div class="ml-auto flex items-center justify-end gap-2 flex-wrap">
                <UChip :show="hasNativeSearchConfig" color="success" size="sm">
                  <UButton
                    size="xs"
                    icon="i-lucide-globe-lock"
                    variant="outline"
                    color="neutral"
                    @click="openNativeSearchModal"
                  >
                    {{ t('settings.modelService.nativeSearch') }}
                  </UButton>
                </UChip>
                <UChip :show="hasCustomParamsConfig" color="success" size="sm">
                  <UButton
                    size="xs"
                    icon="i-lucide-sliders-horizontal"
                    variant="outline"
                    color="neutral"
                    @click="openCustomParamsModal"
                  >
                    {{ t('settings.modelService.customParamsShort') }}
                  </UButton>
                </UChip>
                <UChip :show="hasCustomHeadersConfig" inset color="success" size="sm">
                  <UButton
                    size="xs"
                    icon="i-lucide-waypoints"
                    variant="outline"
                    color="neutral"
                    @click="openCustomHeadersModal"
                  >
                    {{ t('settings.modelService.customHeadersShort') }}
                  </UButton>
                </UChip>
              </div>
            </div>
          </div>
        </UCard>

        <!-- 模型列表卡片 -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">{{ t('settings.modelService.modelList') }}</span>
                <UBadge variant="soft" color="neutral" size="sm">
                  {{ activeProvider?.models?.length ?? 0 }}
                </UBadge>
              </div>
              <div v-if="activeProvider" class="flex items-center gap-2">
                <UButton
                  variant="outline"
                  color="neutral"
                  size="sm"
                  icon="i-lucide-list-check"
                  @click="openFetchModelsModal"
                >
                  {{ t('settings.modelService.fetchModels') }}
                </UButton>
                <UButton
                  variant="outline"
                  color="neutral"
                  size="sm"
                  icon="i-lucide-plus"
                  @click="openManualAddModal"
                >
                  {{ t('settings.modelService.addManually') }}
                </UButton>
              </div>
            </div>
          </template>
          <div v-if="(activeProvider?.models?.length ?? 0) === 0" class="py-8">
            <UEmpty
              :title="t('settings.modelService.noModelsTitle')"
              :description="t('settings.modelService.noModelsDescription')"
              icon="i-lucide-cpu"
              size="sm"
              variant="naked"
            />
          </div>
          <div v-else class="flex flex-col gap-3">
            <UInput
              v-model="modelListSearchQuery"
              :placeholder="t('model.selector.search')"
              icon="i-lucide-search"
              size="md"
              :ui="{ root: 'w-full' }"
            />
            <div v-if="filteredModels.length === 0" class="py-8">
              <UEmpty :title="t('settings.modelService.noModelsTitle')" :description="t('settings.modelService.noSearchResults')" icon="i-lucide-cpu" size="sm" variant="naked" />
            </div>
            <div v-else class="flex flex-col gap-2">
              <ModelListItem
                v-for="m in filteredModels"
                :key="m.id"
                :model="m"
                :is-favorite="isFavoriteModel(m.id)"
                :local-runtime="getLocalRuntime(m.id)"
                :show-local-runtime-actions="activeProvider?.id === 'local'"
                @toggle-favorite="toggleModelFavorite(m.id)"
                @open-config="openModelConfig(m.id)"
                @remove="handleRemoveModel(m.id)"
                @local-download="handleLocalDownload(m.id)"
                @local-cancel-download="handleLocalCancelDownload(m.id)"
                @local-load="handleLocalLoad(m.id)"
                @local-unload="handleLocalUnload(m.id)"
              />
            </div>
          </div>
        </UCard>
      </div>
    </section>
    </div>

    <!-- 全局模型检索 视图 -->
    <GlobalModelSearch
      v-show="activeView === 'search'"
      class="flex-1 min-h-0"
      @go-to-provider="goToProvider"
      @open-config="openModelConfigFromSearch"
    />

    <!-- 获取模型弹窗 -->
    <FetchModelsModal
      v-model:open="fetchModelsModalOpen"
      :provider-id="activeProvider?.id"
      @open-config="openModelConfigForAddFromFetch"
    />

    <!-- 模型配置/添加弹窗（复用：编辑传 modelId，添加不传） -->
    <ModelConfigModal
      v-model:open="modelConfigOpen"
      :provider-id="modelConfigProviderId"
      :model-id="modelFormModelId"
      :initial-model-id="modelFormInitialId"
      :existing-model-ids="modelConfigExistingIds"
    />

    <!-- 添加/编辑自定义供应商弹窗 -->
    <CustomProviderModal
      v-model:open="customProviderModalOpen"
      :edit-provider="editingCustomProvider"
      @submit="handleCustomProviderSubmit"
    />

    <UModal v-model:open="customParamsModalOpen" :title="t('settings.modelService.customParams')" :ui="{ footer: 'justify-end' }">
      <template #body>
        <UFormField :label="t('settings.modelService.customParams')" :description="t('settings.modelService.customParamsDescription')">
          <UTextarea
            ref="customParamsTextareaRef"
            v-model="customParamsTextLocal"
            placeholder='{"key": "value"}'
            :rows="8"
            class="w-full font-mono text-sm"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton variant="outline" color="neutral" @click="customParamsModalOpen = false">{{ t('common.cancel') }}</UButton>
        <UButton @click="saveCustomParamsConfig">{{ t('common.save') }}</UButton>
      </template>
    </UModal>

    <UModal v-model:open="customHeadersModalOpen" :title="t('settings.modelService.customHeaders')" :ui="{ footer: 'justify-end' }">
      <template #body>
        <UFormField :label="t('settings.modelService.customHeaders')" :description="t('settings.modelService.customHeadersDescription')">
          <UTextarea
            ref="customHeadersTextareaRef"
            v-model="customHeadersTextLocal"
            placeholder='{"X-Custom-Header": "value"}'
            :rows="8"
            class="w-full font-mono text-sm"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton variant="outline" color="neutral" @click="customHeadersModalOpen = false">{{ t('common.cancel') }}</UButton>
        <UButton @click="saveCustomHeadersConfig">{{ t('common.save') }}</UButton>
      </template>
    </UModal>

    <UModal v-model:open="nativeSearchModalOpen" :title="t('settings.modelService.nativeSearch')" :ui="{ footer: 'justify-between' }">
      <template #body>
        <div class="flex flex-col gap-3">
          <UFormField :label="t('settings.modelService.nativeSearchMode')" :description="t('settings.modelService.nativeSearchModeDescription')">
            <USelect
              v-model="nativeSearchModeLocal"
              :items="nativeSearchModeOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="nativeSearchModeLocal !== 'none'"
            :label="nativeSearchModeLocal === 'providerOptions'
              ? t('settings.modelService.nativeSearchProviderOptions')
              : nativeSearchModeLocal === 'sdkNative'
                ? t('settings.modelService.nativeSearchSdkNative')
                : t('settings.modelService.nativeSearchTools')"
            :description="nativeSearchModeLocal === 'providerOptions'
              ? t('settings.modelService.nativeSearchProviderOptionsDescription')
              : nativeSearchModeLocal === 'sdkNative'
                ? t('settings.modelService.nativeSearchSdkNativeDescription')
                : t('settings.modelService.nativeSearchToolsDescription')"
          >
            <UTextarea
              v-model="nativeSearchTextLocal"
              :placeholder="nativeSearchPlaceholder"
              :rows="8"
              class="w-full font-mono text-sm"
            />
          </UFormField>
          <p v-else class="text-xs text-muted">{{ t('settings.modelService.nativeSearchNoneDescription') }}</p>
          <p class="text-xs text-muted">{{ t('settings.modelService.nativeSearchEmptyHint') }}</p>
        </div>
      </template>
      <template #footer>
        <UButton variant="soft" color="neutral" @click="clearNativeSearchConfig">{{ t('settings.modelService.nativeSearchClear') }}</UButton>
        <div class="flex items-center gap-2">
          <UButton variant="outline" color="neutral" @click="nativeSearchModalOpen = false">{{ t('common.cancel') }}</UButton>
          <UButton @click="saveNativeSearchConfig">{{ t('common.save') }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import {
  hasNativeWebSearchConfig,
  loggerServiceRenderer,
  type NativeWebSearchConfig,
  type ProviderType
} from "@shared";
import { useConfirm } from "@/composables/useConfirm";
import { useMyToast } from "@/composables/useMyToast";
import { getProviderFallbackIcon, useProviderLogo } from "@/composables/useProviderLogo";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { LocalModelRuntimeStatus } from "@/stores/useSettingsStore";
import UList from "@/components/UList.vue";
import UText from "@/components/UText.vue";
import ModelConfigModal from "./ModelConfigModal.vue";
import FetchModelsModal from "./FetchModelsModal.vue";
import CustomProviderModal from "./CustomProviderModal.vue";
import ModelListItem from "./ModelListItem.vue";
import GlobalModelSearch from "./GlobalModelSearch.vue";

const logger = loggerServiceRenderer.withContext("settings:model-service");
const { t } = useI18n();
const logoLoadFailed = ref(new Set<string>());
function onLogoLoadError(id: string) {
  logoLoadFailed.value = new Set(logoLoadFailed.value).add(id);
}

const activeView = ref<string | number>('provider')
const viewTabs = computed(() => [
  { label: t('settings.modelService.tab.provider'), value: 'provider', icon: 'i-lucide-list' },
  { label: t('settings.modelService.tab.search'), value: 'search', icon: 'i-lucide-search' },
])

const { confirm } = useConfirm();
const toast = useMyToast();
const { providerLogoUrl } = useProviderLogo();
const settingsStore = useSettingsStore();
const route = useRoute();
const router = useRouter();

// ===== providers =====
const providers = computed(() => settingsStore.providers);
const providerListSearchQuery = ref("");
const LOCAL_PROVIDER_ID = "local";
// 排序：local 固定第一，其他已启用在前，再按更新时间倒序
const sortedProviders = computed(() => {
  const localProvider = providers.value.find((provider) => provider.id === LOCAL_PROVIDER_ID) ?? null;
  const otherProviders = providers.value
    .filter((provider) => provider.id !== LOCAL_PROVIDER_ID)
    .sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });

  if (!localProvider) return otherProviders;
  return [localProvider, ...otherProviders];
});

const filteredSortedProviders = computed(() => {
  const query = providerListSearchQuery.value.trim().toLowerCase();
  if (!query) return sortedProviders.value;
  return sortedProviders.value.filter(
    (provider) => provider.name.toLowerCase().includes(query) || provider.id.toLowerCase().includes(query)
  );
});
const selectedProviderId = ref<string>("");

const providerForm = ref({
  id: "" as string,
  name: "" as string,
  logo: "" as string,
  type: "openai-compatible" as ProviderType,
  baseUrl: "" as string,
  imageBaseUrl: "" as string,
  videoBaseUrl: "" as string,
  enabled: true as boolean,
  apiKey: "" as string,
});
const mediaEndpointPanelOpen = ref(false);

const customHeadersText = ref("");
const customHeadersTextLocal = ref("");
const customParamsText = ref("");
const customParamsTextLocal = ref("");
type NativeSearchMode = "none" | "providerOptions" | "tools" | "sdkNative";
const nativeSearchMode = ref<NativeSearchMode>("none");
const nativeSearchText = ref("");
const nativeSearchModeLocal = ref<NativeSearchMode>("none");
const nativeSearchTextLocal = ref("");
const customParamsModalOpen = ref(false);
const customHeadersModalOpen = ref(false);
const nativeSearchModalOpen = ref(false);
const customParamsTextareaRef = ref<{ $el?: HTMLTextAreaElement } | null>(null);
const customHeadersTextareaRef = ref<{ $el?: HTMLTextAreaElement } | null>(null);

const nativeSearchModeOptions = computed(() => [
  { label: t("settings.modelService.nativeSearchModeNone"), value: "none" },
  { label: t("settings.modelService.nativeSearchModeProviderOptions"), value: "providerOptions" },
  { label: t("settings.modelService.nativeSearchModeTools"), value: "tools" },
  { label: t("settings.modelService.nativeSearchModeSdkNative"), value: "sdkNative" },
]);
const nativeSearchPlaceholder = computed(() =>
  nativeSearchModeLocal.value === "providerOptions"
    ? '{"enable_search": true}'
    : nativeSearchModeLocal.value === "tools"
      ? '[{"type": "web_search"}]'
      : nativeSearchModeLocal.value === "sdkNative"
        ? '{"strategy":"anthropic_web_search","args":{"maxUses":5}}'
      : ""
);

const hasCustomParamsConfig = computed(() => customParamsText.value.trim().length > 0);
const hasCustomHeadersConfig = computed(() => customHeadersText.value.trim().length > 0);
const hasNativeSearchConfig = computed(() => {
  const parsed = parseNativeSearchConfigFromText(nativeSearchMode.value, nativeSearchText.value);
  return Boolean(parsed && hasNativeWebSearchConfig(parsed));
});

const activeProvider = computed(() => providers.value.find((p) => p.id === selectedProviderId.value) ?? null);
const providerManagement = computed(() => activeProvider.value?.management ?? {});
const canEditBaseUrl = computed(() => providerManagement.value.canEditBaseUrl ?? true);
const canEditApiKey = computed(() => providerManagement.value.canEditApiKey ?? true);
const canRegenerateApiKey = computed(() => providerManagement.value.canRegenerateApiKey ?? false);
const canToggleEnabled = computed(() => providerManagement.value.canToggleEnabled ?? true);

function hasMediaBaseUrlConfigured(imageBaseUrl?: string | null, videoBaseUrl?: string | null) {
  return Boolean((imageBaseUrl || "").trim() || (videoBaseUrl || "").trim());
}

function openCustomParamsModal() {
  customParamsTextLocal.value = customParamsText.value;
  customParamsModalOpen.value = true;
}

function openCustomHeadersModal() {
  customHeadersTextLocal.value = customHeadersText.value;
  customHeadersModalOpen.value = true;
}

function openNativeSearchModal() {
  nativeSearchModeLocal.value = nativeSearchMode.value;
  nativeSearchTextLocal.value = nativeSearchText.value;
  nativeSearchModalOpen.value = true;
}

watch(customParamsModalOpen, async (open) => {
  if (open) {
    await nextTick();
    const comp = customParamsTextareaRef.value as { $el?: HTMLElement } | null;
    const el = comp?.$el;
    const textarea = el?.tagName === "TEXTAREA" ? el : el?.querySelector?.("textarea");
    (textarea as HTMLTextAreaElement)?.focus();
  }
});

watch(customHeadersModalOpen, async (open) => {
  if (open) {
    await nextTick();
    const comp = customHeadersTextareaRef.value as { $el?: HTMLElement } | null;
    const el = comp?.$el;
    const textarea = el?.tagName === "TEXTAREA" ? el : el?.querySelector?.("textarea");
    (textarea as HTMLTextAreaElement)?.focus();
  }
});

async function saveCustomParamsConfig() {
  const params = parseCustomParamsFromText(customParamsTextLocal.value);
  if (customParamsTextLocal.value.trim() && params === undefined) {
    toast.error({ title: t("settings.modelService.customParamsInvalid"), description: t("settings.modelService.enterValidJsonObject") });
    return;
  }
  customParamsText.value = customParamsTextLocal.value;
  customParamsModalOpen.value = false;
  await saveProviderConfigImmediately();
}

async function saveCustomHeadersConfig() {
  const headers = parseCustomHeadersFromText(customHeadersTextLocal.value);
  if (customHeadersTextLocal.value.trim() && headers === undefined) {
    toast.error({ title: t("settings.modelService.customHeadersInvalid"), description: t("settings.modelService.enterValidJson") });
    return;
  }
  customHeadersText.value = customHeadersTextLocal.value;
  customHeadersModalOpen.value = false;
  await saveProviderConfigImmediately();
}

function clearNativeSearchConfig() {
  nativeSearchModeLocal.value = "none";
  nativeSearchTextLocal.value = "";
}

async function saveNativeSearchConfig() {
  const nativeConfig = parseNativeSearchConfigFromText(nativeSearchModeLocal.value, nativeSearchTextLocal.value);
  if (
    nativeSearchModeLocal.value !== "none"
    && nativeSearchTextLocal.value.trim()
    && nativeConfig === undefined
  ) {
    toast.error({
      title: t("settings.modelService.nativeSearchInvalid"),
      description: (nativeSearchModeLocal.value === "providerOptions" || nativeSearchModeLocal.value === "sdkNative")
        ? t("settings.modelService.enterValidJsonObject")
        : t("settings.modelService.enterValidJsonArray")
    });
    return;
  }
  if (nativeSearchModeLocal.value === "none") {
    nativeSearchTextLocal.value = "";
  }
  nativeSearchMode.value = nativeSearchModeLocal.value;
  nativeSearchText.value = nativeSearchTextLocal.value;
  nativeSearchModalOpen.value = false;
  await saveProviderConfigImmediately();
}

// 编辑自定义供应商时传入的数据，null 表示新建模式
const editingCustomProvider = ref<{ id: string; name: string; type: ProviderType; logo?: string } | null>(null);

// 自定义供应商弹窗
const customProviderModalOpen = ref(false);

function openAddCustomModal() {
  editingCustomProvider.value = null;
  customProviderModalOpen.value = true;
}

function openEditCustomModal() {
  if (!activeProvider.value || activeProvider.value.isBuiltin) return;
  editingCustomProvider.value = {
    id: activeProvider.value.id,
    name: activeProvider.value.name,
    type: activeProvider.value.type,
    logo: activeProvider.value.logo,
  };
  customProviderModalOpen.value = true;
}

function parseCustomHeadersFromText(text: string): Record<string, string> | null | undefined {
  const s = text?.trim();
  if (!s) return null;
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k && v != null && typeof v !== "object") {
          result[String(k)] = String(v);
        }
      }
      return result;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseCustomHeaders(): Record<string, string> | null | undefined {
  return parseCustomHeadersFromText(customHeadersText.value);
}

function parseCustomParamsFromText(text: string): Record<string, unknown> | null | undefined {
  const s = text?.trim();
  if (!s) return null;
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      return obj as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseCustomParams(): Record<string, unknown> | null | undefined {
  return parseCustomParamsFromText(customParamsText.value);
}

function parseSdkNativeConfig(value: unknown): { strategy: "anthropic_web_search" | "google_search"; args?: Record<string, unknown> } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const strategy = (value as Record<string, unknown>).strategy;
  if (strategy !== "anthropic_web_search" && strategy !== "google_search") return undefined;
  const args = (value as Record<string, unknown>).args;
  if (args !== undefined && (!args || typeof args !== "object" || Array.isArray(args))) {
    return undefined;
  }
  return {
    strategy,
    ...(args ? { args: args as Record<string, unknown> } : {}),
  };
}

function parseNativeSearchConfigFromText(
  mode: NativeSearchMode,
  text: string
): NativeWebSearchConfig | null | undefined {
  if (mode === "none") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (mode === "providerOptions" || mode === "sdkNative") {
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return undefined;
      }
      if (mode === "sdkNative") {
        const sdkNative = parseSdkNativeConfig(parsed);
        return sdkNative ? { sdkNative } : undefined;
      }
      return { providerOptions: parsed as Record<string, unknown> };
    }

    if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
      return undefined;
    }
    return { tools: parsed as Array<Record<string, unknown>> };
  } catch {
    return undefined;
  }
}

function resolveNativeSearchDraft(
  config: NativeWebSearchConfig | undefined
): { mode: NativeSearchMode; text: string } {
  if (!config || !hasNativeWebSearchConfig(config)) {
    return { mode: "none", text: "" };
  }

  if (config.providerOptions && Object.keys(config.providerOptions).length > 0) {
    return {
      mode: "providerOptions",
      text: JSON.stringify(config.providerOptions, null, 2),
    };
  }

  if (config.tools && config.tools.length > 0) {
    return {
      mode: "tools",
      text: JSON.stringify(config.tools, null, 2),
    };
  }

  if (config.sdkNative) {
    return {
      mode: "sdkNative",
      text: JSON.stringify(config.sdkNative, null, 2),
    };
  }

  return { mode: "none", text: "" };
}

function openHelpUrl(url: string) {
  window.webPreview?.open(url);
}

// 复制 baseUrl 到剪贴板
const copyBaseUrl = async () => {
  const url = activeProvider.value?.baseUrl;
  if (!url) {
    toast.error({ title: t("contentExport.copyFailed"), description: t("settings.modelService.serviceNotStarted") });
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success({ title: t("settings.modelService.copied"), description: url });
  } catch (e) {
    toast.error({ title: t("contentExport.copyFailed"), description: String(e) });
  }
};

// 复制 API Key 到剪贴板
const copyApiKey = async () => {
  const apiKey = providerForm.value.apiKey?.trim();
  if (!apiKey) {
    toast.error({ title: t("contentExport.copyFailed"), description: t("settings.modelService.apiKeyPlaceholder") });
    return;
  }
  try {
    await navigator.clipboard.writeText(apiKey);
    toast.success({ title: t("settings.modelService.copied"), description: t("settings.modelService.apiKey") });
  } catch (e) {
    toast.error({ title: t("contentExport.copyFailed"), description: String(e) });
  }
};

// 排序后的模型列表：按 id 字母顺序
const sortedModels = computed(() => {
  if (!activeProvider.value?.models) return [];
  return [...activeProvider.value.models].sort((a, b) => a.id.localeCompare(b.id));
});

const modelListSearchQuery = ref("");
const filteredModels = computed(() => {
  const q = modelListSearchQuery.value.trim().toLowerCase();
  if (!q) return sortedModels.value;
  return sortedModels.value.filter((m) => m.id.toLowerCase().includes(q));
});

const localModelRuntimes = computed(() => settingsStore.localModelRuntimes);
const shouldPollLocalModelRuntimes = computed(() => activeProvider.value?.id === "local");

function getLocalRuntime(modelId: string): LocalModelRuntimeStatus | null {
  return localModelRuntimes.value[modelId] ?? null;
}

async function refreshLocalModelRuntimes() {
  await settingsStore.refreshLocalModelRuntimes();
}

async function handleLocalDownload(modelId: string) {
  try {
    await settingsStore.downloadLocalModel(modelId);
    await refreshLocalModelRuntimes();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    toast.error({ title: t("settings.modelService.actionFailed"), description: msg });
    await refreshLocalModelRuntimes();
  }
}

async function handleLocalCancelDownload(modelId: string) {
  try {
    await settingsStore.cancelLocalModelDownload(modelId);
    await refreshLocalModelRuntimes();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    toast.error({ title: t("settings.modelService.actionFailed"), description: msg });
    await refreshLocalModelRuntimes();
  }
}

async function handleLocalLoad(modelId: string) {
  try {
    await settingsStore.loadLocalModel(modelId);
    await refreshLocalModelRuntimes();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    toast.error({ title: t("settings.modelService.actionFailed"), description: msg });
    await refreshLocalModelRuntimes();
  }
}

async function handleLocalUnload(modelId: string) {
  try {
    await settingsStore.unloadLocalModel(modelId);
    await refreshLocalModelRuntimes();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    toast.error({ title: t("settings.modelService.actionFailed"), description: msg });
    await refreshLocalModelRuntimes();
  }
}

const showApiKey = ref(false);
const isRegeneratingLocalApiKey = ref(false);

async function regenerateLocalApiKey() {
  if (!canRegenerateApiKey.value || isRegeneratingLocalApiKey.value) return;
  const confirmed = await confirm({
    title: t("settings.modelService.regenerateApiKeyConfirmTitle"),
    content: t("settings.modelService.regenerateApiKeyConfirmContent"),
    confirmText: t("settings.modelService.regenerateApiKey"),
    cancelText: t("common.cancel"),
    confirmColor: "warning",
  });
  if (!confirmed) return;

  isRegeneratingLocalApiKey.value = true;
  try {
    const result = await settingsStore.regenerateLocalProviderApiKey();
    if (!result?.ok || !result.apiKey) {
      throw new Error(t("settings.modelService.unknown"));
    }
    providerForm.value.apiKey = result.apiKey;
    showApiKey.value = true;
    syncInitialValues();
    toast.success({ title: t("settings.modelService.saved"), description: t("settings.modelService.apiKeyRegenerated") });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    toast.error({ title: t("settings.modelService.actionFailed"), description: msg });
  } finally {
    isRegeneratingLocalApiKey.value = false;
  }
}

watch(selectedProviderId, () => {
  modelListSearchQuery.value = "";
});

watch(shouldPollLocalModelRuntimes, (shouldPoll) => {
  if (shouldPoll) {
    settingsStore.startLocalModelRuntimePolling();
    void settingsStore.refreshLocalModelRuntimes();
  } else {
    settingsStore.stopLocalModelRuntimePolling();
  }
}, { immediate: true });

// 初始化选中第一个 provider
watch(sortedProviders, (newSorted) => {
  if (!selectedProviderId.value && newSorted.length > 0) {
    // 优先从 URL query 参数读取
    const queryProvider = route.query.provider as string;
    if (queryProvider && newSorted.some(p => p.id === queryProvider)) {
      selectedProviderId.value = queryProvider;
    } else {
      selectedProviderId.value = newSorted[0].id;
    }
  }
}, { immediate: true });

async function upsertProvider(): Promise<boolean> {
  const id = providerForm.value.id || selectedProviderId.value;
  const isCustom = activeProvider.value?.isBuiltin === false;
  const headers = parseCustomHeaders();
  const params = parseCustomParams();
  const nativeSearchDefaults = parseNativeSearchConfigFromText(nativeSearchMode.value, nativeSearchText.value);
  if (headers === undefined) {
    toast.error({ title: t("settings.modelService.customHeadersInvalid"), description: t("settings.modelService.enterValidJson") });
    return false;
  }
  if (params === undefined) {
    toast.error({ title: t("settings.modelService.customParamsInvalid"), description: t("settings.modelService.enterValidJsonObject") });
    return false;
  }
  if (nativeSearchText.value.trim() && nativeSearchDefaults === undefined) {
    toast.error({
      title: t("settings.modelService.nativeSearchInvalid"),
      description: (nativeSearchMode.value === "providerOptions" || nativeSearchMode.value === "sdkNative")
        ? t("settings.modelService.enterValidJsonObject")
        : t("settings.modelService.enterValidJsonArray")
    });
    return false;
  }

  if (isCustom) {
    await settingsStore.updateCustomProvider(id, {
      name: providerForm.value.name,
      logo: providerForm.value.logo || undefined,
      type: providerForm.value.type,
      baseUrl: providerForm.value.baseUrl,
      imageBaseUrl: providerForm.value.imageBaseUrl || undefined,
      videoBaseUrl: providerForm.value.videoBaseUrl || undefined,
      apiKey: providerForm.value.apiKey || undefined,
      customHeaders: headers,
      providerOptionsDefaults: params,
      nativeWebSearchDefaults: nativeSearchDefaults,
      enabled: providerForm.value.enabled,
    });
  } else {
    const payload: any = { id, type: activeProvider.value?.type ?? "openai-compatible" };
    if (providerForm.value.baseUrl !== initialValues.value.baseUrl) payload.baseUrl = providerForm.value.baseUrl;
    if (providerForm.value.imageBaseUrl !== initialValues.value.imageBaseUrl) payload.imageBaseUrl = providerForm.value.imageBaseUrl;
    if (providerForm.value.videoBaseUrl !== initialValues.value.videoBaseUrl) payload.videoBaseUrl = providerForm.value.videoBaseUrl;
    if (providerForm.value.apiKey !== initialValues.value.apiKey) payload.apiKey = providerForm.value.apiKey;
    if (providerForm.value.enabled !== initialValues.value.enabled) payload.enabled = providerForm.value.enabled;
    if (customHeadersText.value !== initialValues.value.customHeadersText) {
      payload.customHeaders = headers;
    }
    if (customParamsText.value !== initialValues.value.customParamsText) {
      payload.providerOptionsDefaults = params;
    }
    if (
      nativeSearchMode.value !== initialValues.value.nativeSearchMode
      || nativeSearchText.value !== initialValues.value.nativeSearchText
    ) {
      payload.nativeWebSearchDefaults = nativeSearchDefaults;
    }
    await settingsStore.upsertProvider(payload);
  }
  return true;
}

function syncInitialValues() {
  initialValues.value = {
    baseUrl: providerForm.value.baseUrl,
    imageBaseUrl: providerForm.value.imageBaseUrl,
    videoBaseUrl: providerForm.value.videoBaseUrl,
    apiKey: providerForm.value.apiKey,
    enabled: providerForm.value.enabled,
    name: providerForm.value.name,
    logo: providerForm.value.logo,
    type: providerForm.value.type,
    customHeadersText: customHeadersText.value,
    customParamsText: customParamsText.value,
    nativeSearchMode: nativeSearchMode.value,
    nativeSearchText: nativeSearchText.value,
  };
}

async function saveProviderConfigImmediately() {
  try {
    if (!providerForm.value.id) return;
    const saved = await upsertProvider();
    if (!saved) return;
    syncInitialValues();
    toast.success({ title: t("settings.modelService.saved") });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn("save provider config failed", { msg });
    toast.error({ title: t("settings.modelService.actionFailed"), description: msg });
  }
}

async function testProvider(p: any) {
  const r = await settingsStore.testProvider(p.id);
  return r;
}

watch(
  () => selectedProviderId.value,
  (id) => {
    const p = providers.value.find((x) => x.id === id);
    if (!p) return;
    providerForm.value.id = p.id;
    providerForm.value.name = p.name;
    providerForm.value.logo = p.logo ?? "";
    providerForm.value.type = p.type;
    providerForm.value.baseUrl = p.baseUrl;
    providerForm.value.imageBaseUrl = p.imageBaseUrl ?? "";
    providerForm.value.videoBaseUrl = p.videoBaseUrl ?? "";
    providerForm.value.enabled = p.enabled;
    providerForm.value.apiKey = p.apiKey ?? "";
    mediaEndpointPanelOpen.value = hasMediaBaseUrlConfigured(p.imageBaseUrl, p.videoBaseUrl);
    customHeadersText.value =
      p.customHeaders && Object.keys(p.customHeaders).length > 0
        ? JSON.stringify(p.customHeaders, null, 2)
        : "";
    customParamsText.value =
      p.providerOptionsDefaults && Object.keys(p.providerOptionsDefaults).length > 0
        ? JSON.stringify(p.providerOptionsDefaults, null, 2)
        : "";
    const nativeSearchDraft = resolveNativeSearchDraft(p.nativeWebSearchDefaults);
    nativeSearchMode.value = nativeSearchDraft.mode;
    nativeSearchText.value = nativeSearchDraft.text;
    if (route.query.provider !== id) {
      router.replace({ path: route.path, query: { ...route.query, provider: id } });
    }
  },
  { immediate: true }
);

// 记录当前 provider 的初始值
const initialValues = ref({
  baseUrl: "",
  imageBaseUrl: "",
  videoBaseUrl: "",
  apiKey: "",
  enabled: false,
  name: "",
  logo: "",
  type: "openai-compatible" as ProviderType,
  customHeadersText: "",
  customParamsText: "",
  nativeSearchMode: "none" as NativeSearchMode,
  nativeSearchText: "",
});

watch(
  () => activeProvider.value?.enabled,
  (enabled) => {
    if (activeProvider.value?.id !== LOCAL_PROVIDER_ID || typeof enabled !== "boolean") return;
    providerForm.value.enabled = enabled;
    initialValues.value.enabled = enabled;
  }
);

// 防抖自动保存
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleAutoSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      if (!providerForm.value.id) return;
      const saved = await upsertProvider();
      if (!saved) return;
      syncInitialValues();
      logger.info("auto saved provider config");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn("auto save failed", { msg });
      toast.error({ title: t("settings.modelService.autoSaveFailed"), description: msg });
    }
  }, 500);
};

const hasChanges = () =>
  providerForm.value.baseUrl !== initialValues.value.baseUrl ||
  providerForm.value.imageBaseUrl !== initialValues.value.imageBaseUrl ||
  providerForm.value.videoBaseUrl !== initialValues.value.videoBaseUrl ||
  providerForm.value.apiKey !== initialValues.value.apiKey ||
  providerForm.value.enabled !== initialValues.value.enabled ||
  customHeadersText.value !== initialValues.value.customHeadersText ||
  customParamsText.value !== initialValues.value.customParamsText ||
  nativeSearchMode.value !== initialValues.value.nativeSearchMode ||
  nativeSearchText.value !== initialValues.value.nativeSearchText;

const handleSave = () => {
  if (hasChanges()) {
    scheduleAutoSave();
  }
};

const handleApiKeyBlur = () => {
  if (!canEditApiKey.value) return;
  handleSave();
};

const handleBaseUrlBlur = () => {
  if (!canEditBaseUrl.value) return;
  handleSave();
};

watch(
  () => selectedProviderId.value,
  () => {
    syncInitialValues();
  }
);

async function handleCustomProviderSubmit(
  data:
    | { name: string; logo?: string; type: ProviderType; baseUrl: string; apiKey?: string; customHeaders?: Record<string, string>; providerOptionsDefaults?: Record<string, unknown>; enabled: boolean }
    | { id: string; name: string; logo?: string; type: ProviderType }
) {
  try {
    if ("id" in data) {
      await settingsStore.updateCustomProvider(data.id, { name: data.name, logo: data.logo, type: data.type });
      toast.success({ title: t("settings.modelService.saved"), description: t("settings.modelService.providerUpdated") });
    } else {
      const { id } = await settingsStore.createCustomProvider(data);
      selectedProviderId.value = id;
      toast.success({ title: t("settings.modelService.added"), description: t("settings.modelService.customProviderCreated") });
    }
    editingCustomProvider.value = null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toast.error({ title: t("settings.modelService.actionFailed"), description: msg });
  }
}

async function confirmDeleteCustom() {
  if (!activeProvider.value || activeProvider.value.isBuiltin) return;
  const confirmed = await confirm({
    title: t("settings.modelService.deleteConfirmTitle"),
    content: t("settings.modelService.deleteConfirmContent", { name: activeProvider.value.name }),
    confirmText: t("common.delete"),
    cancelText: t("common.cancel"),
    confirmColor: "error",
  });
  if (!confirmed) return;
  try {
    await settingsStore.deleteProvider(activeProvider.value.id);
    selectedProviderId.value = sortedProviders.value[0]?.id ?? "";
    toast.success({ title: t("settings.modelService.deleted"), description: t("settings.modelService.customProviderDeleted") });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toast.error({ title: t("settings.modelService.deleteFailed"), description: msg });
  }
}

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer);
  settingsStore.stopLocalModelRuntimePolling();
});

const onTest = async () => {
  if (!activeProvider.value) return;
  
  const r = await testProvider(activeProvider.value);
  if (!r?.ok) {
    toast.error({
      title: t("settings.modelService.testFailed"),
      description: r?.error ?? t("settings.modelService.unknown")
    });
  } else {
    toast.success({
      title: t("settings.modelService.testSuccess"),
      description: t("settings.modelService.apiConfigValid")
    });
  }
  logger.info("provider tested", { ok: Boolean(r?.ok) });
};

const fetchModelsModalOpen = ref(false);
function openFetchModelsModal() {
  fetchModelsModalOpen.value = true;
}

const handleRemoveModel = async (modelId: string) => {
  if (!activeProvider.value) return;
  try {
    await settingsStore.removeModelFromCommon(activeProvider.value.id, modelId);
  } catch (error) {
    logger.error("Failed to remove model", { error });
    toast.error({ title: t("settings.modelService.actionFailed"), description: String(error) });
  }
};

// 模型配置/添加弹窗：modelId 有值=编辑，无值=添加
const modelConfigOpen = ref(false);
const modelFormModelId = ref<string>("");
const modelFormInitialId = ref<string>("");
const modelConfigProviderId = ref<string>("");

const modelConfigExistingIds = computed(() => {
  const pid = modelConfigProviderId.value;
  if (!pid) return [];
  const provider = providers.value.find(p => p.id === pid);
  return provider?.models?.map(m => m.id) ?? [];
});

function openModelConfig(modelId: string) {
  modelConfigProviderId.value = activeProvider.value?.id ?? "";
  modelFormModelId.value = modelId;
  modelFormInitialId.value = "";
  modelConfigOpen.value = true;
}

function openManualAddModal() {
  modelConfigProviderId.value = activeProvider.value?.id ?? "";
  modelFormModelId.value = "";
  modelFormInitialId.value = "";
  modelConfigOpen.value = true;
}

function openModelConfigFromSearch(providerId: string, modelId: string) {
  modelConfigProviderId.value = providerId;
  modelFormModelId.value = modelId;
  modelFormInitialId.value = "";
  modelConfigOpen.value = true;
}

function openModelConfigForAddFromFetch(providerId: string, modelId: string) {
  modelConfigProviderId.value = providerId;
  modelFormModelId.value = "";
  modelFormInitialId.value = modelId;
  modelConfigOpen.value = true;
}

function goToProvider(providerId: string) {
  selectedProviderId.value = providerId;
  activeView.value = 'provider';
}

function isFavoriteModel(modelId: string) {
  if (!activeProvider.value) return false;
  return settingsStore.isModelFavorite(activeProvider.value.id, modelId);
}

const toggleModelFavorite = async (modelId: string) => {
  if (!activeProvider.value) return;
  try {
    await settingsStore.toggleModelFavorite(activeProvider.value.id, modelId);
  } catch (error) {
    logger.error("Failed to toggle model favorite", { error });
    toast.error({ title: t("settings.modelService.actionFailed"), description: String(error) });
  }
};

// 从 URL query 参数初始化选中的供应商（响应外部跳转）
watch(() => route.query.provider, (providerId) => {
  if (providerId && typeof providerId === 'string' && providerId !== selectedProviderId.value) {
    const providerExists = providers.value.some(p => p.id === providerId);
    if (providerExists) {
      selectedProviderId.value = providerId;
    }
  }
}, { immediate: true });
</script>
