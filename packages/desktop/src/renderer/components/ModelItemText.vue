<template>
  <div class="flex-1 min-w-0 flex items-center">
    <template v-if="prefix && providerName">
      <!-- 有前缀的情况：场景模型（gpt-4o | openai） -->
      <div class="min-w-0 flex items-center gap-1">
        <span class="truncate text-xs">{{ prefix }}（{{ modelName }}</span>
        <span
          v-if="modelTag"
          class="shrink-0 rounded border border-default px-1 py-0 text-[10px] leading-4 text-muted"
        >
          {{ modelTag }}
        </span>
      </div>
      <USeparator orientation="vertical" class="h-3 mx-1.5" />
      <span class="text-muted dark:text-toned text-xs truncate">{{ providerName }}</span>
      <span class="text-xs">）</span>
    </template>
    <template v-else-if="providerName">
      <!-- 无前缀但有供应商：gpt-4o | openai -->
      <div class="min-w-0 flex items-center gap-1">
        <span class="truncate text-xs">{{ modelName }}</span>
        <span
          v-if="modelTag"
          class="shrink-0 rounded border border-default px-1 py-0 text-[10px] leading-4 text-muted"
        >
          {{ modelTag }}
        </span>
      </div>
      <USeparator orientation="vertical" class="h-3 mx-1.5" />
      <span class="text-muted dark:text-toned text-xs truncate">{{ providerName }}</span>
    </template>
    <template v-else>
      <!-- 只有模型名：gpt-4o -->
      <div class="min-w-0 flex items-center gap-1">
        <span class="truncate text-xs">{{ modelName }}</span>
        <span
          v-if="modelTag"
          class="shrink-0 rounded border border-default px-1 py-0 text-[10px] leading-4 text-muted"
        >
          {{ modelTag }}
        </span>
      </div>
    </template>
  </div>
  <div class="flex items-center gap-1">
    <UTooltip
      v-for="cap in activeCapabilities"
      :key="cap.value"
      :text="cap.label"
    >
      <UIcon
        :name="cap.icon"
        class="w-3 h-3 shrink-0"
        :class="cap.color"
      />
    </UTooltip>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  prefix?: string  // 前缀文本，如"默认模型"、"场景模型"
  modelName: string
  modelTag?: string
  providerName?: string
  capabilities?: Record<string, boolean>
}>()
const { t } = useI18n()

// 能力配置
const capabilityConfig = computed(() => [
  {
    label: t('model.capability.reasoning'),
    value: 'reasoning',
    icon: 'i-lucide-brain',
    color: 'text-purple-600 dark:text-purple-400'
  },
  {
    label: t('model.capability.functionCalling'),
    value: 'functionCalling',
    icon: 'i-lucide-wrench',
    color: 'text-blue-600 dark:text-blue-400'
  },
  {
    label: t('model.capability.webSearch'),
    value: 'webSearch',
    icon: 'i-lucide-globe',
    color: 'text-green-600 dark:text-green-400'
  },
  {
    label: t('model.capability.vision'),
    value: 'vision',
    icon: 'i-lucide-eye',
    color: 'text-orange-600 dark:text-orange-400'
  },
  {
    label: t('model.capability.streaming'),
    value: 'streaming',
    icon: 'i-lucide-activity',
    color: 'text-cyan-600 dark:text-cyan-400'
  }
])

// 根据 capabilities 自动判断显示哪些 icon
const activeCapabilities = computed(() => {
  if (!props.capabilities) return []
  return capabilityConfig.value.filter(cap => props.capabilities?.[cap.value] === true)
})
</script>
