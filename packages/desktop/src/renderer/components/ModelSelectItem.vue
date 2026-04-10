<template>
  <ModelItemText
    :prefix="prefix"
    :model-name="modelName"
    :model-tag="modelTag"
    :provider-name="showProvider ? providerName : undefined"
    :capabilities="capabilities"
  />
  <UTooltip
    v-if="showAction && actionIcon"
    :text="actionTooltip || ''"
    :disabled="!actionTooltip"
  >
    <UButton
      :icon="actionIcon"
      variant="ghost"
      :color="actionColor"
      size="xs"
      :loading="actionLoading"
      :disabled="actionDisabled"
      :class="[
        'shrink-0 transition-opacity',
        actionLoading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      ]"
      @click.stop="$emit('actionClick')"
    />
  </UTooltip>
  <UTooltip
    v-if="showFavorite"
    :text="isFavorite ? t('settings.modelList.unfavorite') : t('settings.modelList.favorite')"
  >
    <UButton
      :icon="isFavorite ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
      variant="ghost"
      color="warning"
      size="xs"
      class="shrink-0 transition-opacity"
      :class="isFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
      @click.stop="$emit('toggleFavorite')"
    />
  </UTooltip>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import ModelItemText from './ModelItemText.vue'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  prefix?: string  // 前缀文本，如"默认模型"、"场景模型"
  modelName: string
  modelTag?: string
  providerName?: string
  showProvider?: boolean
  showFavorite?: boolean  // 是否显示收藏按钮
  isFavorite?: boolean
  capabilities?: Record<string, boolean>
  showAction?: boolean
  actionIcon?: string
  actionTooltip?: string
  actionColor?: 'neutral' | 'primary' | 'warning' | 'error'
  actionLoading?: boolean
  actionDisabled?: boolean
}>(), {
  showProvider: false,
  showFavorite: true,
  isFavorite: false,
  showAction: false,
  actionColor: 'neutral',
  actionLoading: false,
  actionDisabled: false
})

defineEmits<{
  toggleFavorite: []
  actionClick: []
}>()
</script>
