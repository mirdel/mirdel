<template>
  <div class="flex items-center justify-between px-3 py-2 rounded-lg border border-default hover:border-default transition-colors">
    <div class="flex items-center gap-2 min-w-0 flex-1">
      <ModelLogo :model-id="model.id" />
      <div class="min-w-0 flex-1 flex flex-col gap-1">
        <div class="flex items-center gap-2 flex-wrap min-h-[20px]">
          <span :class="modelIdClass">{{ model.id }}</span>
          <UBadge
            v-if="showLocalRuntimeActions && localRuntime"
            variant="soft"
            size="sm"
            :class="localRuntimeBadgeClass"
          >
            {{ localRuntimeText }}
          </UBadge>
          <UBadge v-for="tag in capabilityTags" :key="tag.label" variant="soft" :class="tag.class" size="sm">
            {{ tag.label }}
          </UBadge>
        </div>
        <div
          v-if="showLocalRuntimeActions && (localSizeTag || localRamTag || localAvailabilityTag)"
          class="flex items-center gap-2 flex-wrap min-h-[20px]"
        >
          <UTooltip
            v-if="localSizeTag"
            :text="localSizeTag.tooltip"
          >
            <UBadge
              variant="soft"
              size="sm"
              class="bg-muted text-toned"
            >
              {{ localSizeTag.label }}
            </UBadge>
          </UTooltip>
          <UTooltip
            v-if="localRamTag"
            :text="localRamTag.tooltip"
          >
            <UBadge
              variant="soft"
              size="sm"
              class="bg-muted text-toned"
            >
              {{ localRamTag.label }}
            </UBadge>
          </UTooltip>
          <UTooltip
            v-if="localAvailabilityTag"
            :text="localAvailabilityTag.tooltip"
          >
            <UBadge
              variant="soft"
              size="sm"
              :class="localAvailabilityTag.class"
            >
              {{ localAvailabilityTag.label }}
            </UBadge>
          </UTooltip>
        </div>
      </div>
      <!-- <template v-if="showModalities && model.modelType !== 'embedding' && model.modelType !== 'rerank'">
        <div v-if="model.inputModalities?.length" class="flex items-center gap-0.5 ml-1">
          <span class="text-[10px] text-muted mr-0.5">入</span>
          <UBadge v-for="m in model.inputModalities" :key="`in-${m}`" variant="subtle" color="neutral" size="xs">
            {{ modalityLabel(m) }}
          </UBadge>
        </div>
        <div v-if="model.outputModalities?.length" class="flex items-center gap-0.5">
          <span class="text-[10px] text-muted mr-0.5">出</span>
          <UBadge v-for="m in model.outputModalities" :key="`out-${m}`" variant="subtle" color="neutral" size="xs">
            {{ modalityLabel(m) }}
          </UBadge>
        </div>
      </template> -->
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <UTooltip v-if="showLocalRuntimeActions && localAction" :text="localAction.tooltip">
        <UButton
          :icon="localAction.icon"
          variant="ghost"
          :color="localAction.color"
          size="xs"
          :loading="localAction.loading"
          :disabled="localAction.disabled"
          @click="emitLocalAction(localAction.action)"
        />
      </UTooltip>
      <UTooltip v-if="showConfigFavButton" :text="isFavorite ? t('settings.modelList.unfavorite') : t('settings.modelList.favorite')">
        <UButton
          :icon="isFavorite ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
          variant="ghost"
          color="warning"
          size="xs"
          @click="$emit('toggle-favorite')"
        />
      </UTooltip>
      <UTooltip v-if="showConfigFavButton" :text="t('settings.modelList.configure')">
        <UButton
          icon="i-lucide-settings"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="$emit('open-config')"
        />
      </UTooltip>
      <UTooltip v-if="showRemove" :text="t('settings.modelList.remove')">
        <UButton
          icon="i-lucide-minus"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="$emit('remove')"
        />
      </UTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { resolveImageTaskCapabilities } from "@shared";
import ModelLogo from "@/components/ModelLogo.vue";
import type { LocalModelRuntimeStatus } from "@/stores/useSettingsStore";

const props = withDefaults(defineProps<{
  model: any
  isFavorite?: boolean
  showModalities?: boolean
  showRemove?: boolean
  localRuntime?: LocalModelRuntimeStatus | null
  showLocalRuntimeActions?: boolean
}>(), {
  isFavorite: false,
  showModalities: false,
  showRemove: true,
  localRuntime: null,
  showLocalRuntimeActions: false,
})

const { t } = useI18n()
const emit = defineEmits<{
  'toggle-favorite': []
  'open-config': []
  'remove': []
  'local-download': []
  'local-cancel-download': []
  'local-load': []
  'local-unload': []
}>()

const capabilityTags = computed(() => {
  const tags: Array<{ label: string; class: string }> = []
  const mt = props.model.modelType || 'generative'
  const output: string[] = props.model.outputModalities || []
  const input: string[] = props.model.inputModalities || []

  const normalizeImageTasks = () => {
    const raw = Array.isArray(props.model.imageTasks) ? props.model.imageTasks : []
    const typed = raw.filter((item: unknown) => (
      item === 'text_to_image' || item === 'image_to_image' || item === 'image_edit' || item === 'inpaint'
    )) as Array<'text_to_image' | 'image_to_image' | 'image_edit' | 'inpaint'>
    if (typed.length > 0) return typed
    if (!output.includes('image')) return [] as Array<'text_to_image' | 'image_to_image' | 'image_edit' | 'inpaint'>
    const tasks: Array<'text_to_image' | 'image_to_image' | 'image_edit' | 'inpaint'> = ['text_to_image']
    if (input.includes('image')) tasks.push('image_to_image', 'image_edit')
    const editCaps = resolveImageTaskCapabilities(props.model.image, 'edit')
    if (input.includes('mask') || !!editCaps?.mask?.enabled) tasks.push('inpaint')
    return tasks
  }

  if (mt === 'embedding') {
    tags.push({ label: t('settings.modelList.tag.embedding'), class: 'bg-sky-50 text-sky-600' })
  } else if (mt === 'rerank') {
    tags.push({ label: t('settings.modelList.tag.rerank'), class: 'bg-amber-50 text-amber-600' })
  } else {
    const imageTasks = normalizeImageTasks()
    const canImageGenerate = imageTasks.includes('text_to_image') || imageTasks.includes('image_to_image')
    const canImageEdit = imageTasks.includes('image_edit') || imageTasks.includes('inpaint')
    if (canImageGenerate) {
      tags.push({ label: t('settings.modelList.tag.imageGenerate'), class: 'bg-violet-50 text-violet-600' })
    }
    if (canImageEdit) {
      tags.push({ label: t('settings.modelList.tag.imageEdit'), class: 'bg-violet-50 text-violet-600' })
    }
    if (output.includes('video')) {
      tags.push({ label: t('settings.modelList.tag.video'), class: 'bg-rose-50 text-rose-500' })
    }
  }
  return tags
})

const modalityLabelMap: Record<string, string> = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  file: 'file',
  mask: 'Mask',
}

function modalityLabel(value: string) {
  const key = modalityLabelMap[value]
  return key ? t(`settings.modelList.modality.${key}`) : value
}

const localRuntimeText = computed(() => {
  const runtime = props.localRuntime
  if (!runtime) return ""
  if (runtime.state === "downloading") {
    const progress = typeof runtime.progress === "number" ? `${runtime.progress}%` : "..."
    return `${t("settings.modelService.localModel.state.downloading")} ${progress}`
  }
  if (runtime.state === "error") {
    return t("settings.modelService.localModel.state.error")
  }
  return t(`settings.modelService.localModel.state.${runtime.state}`)
})

const localRuntimeBadgeClass = computed(() => {
  const runtime = props.localRuntime
  if (!runtime) return "bg-muted text-toned"
  if (runtime.state === "loaded") return "bg-emerald-50 text-emerald-700"
  if (runtime.state === "loading" || runtime.state === "downloading") return "bg-sky-50 text-sky-700"
  if (runtime.state === "error") return "bg-red-50 text-red-700"
  return "bg-muted text-toned"
})

const localSizeTag = computed(() => {
  const runtime = props.localRuntime
  if (!runtime || typeof runtime.sizeBytes !== "number" || runtime.sizeBytes <= 0) return null
  const size = formatBytes(runtime.sizeBytes)
  return {
    label: t("settings.modelService.localModel.tag.size", { size }),
    tooltip: t("settings.modelService.localModel.tooltip.size", { size }),
  }
})

const localRamTag = computed(() => {
  const runtime = props.localRuntime
  const req = runtime?.resourceRequirements
  if (!req) return null

  const min = typeof req.minRamBytes === "number" && req.minRamBytes > 0
    ? formatBytes(req.minRamBytes)
    : null
  const recommended = typeof req.recommendedRamBytes === "number" && req.recommendedRamBytes > 0
    ? formatBytes(req.recommendedRamBytes)
    : null

  if (!min && !recommended) return null

  if (min && recommended) {
    return {
      label: t("settings.modelService.localModel.tag.ramRange", { min, recommended }),
      tooltip: t("settings.modelService.localModel.tooltip.ramRange", { min, recommended }),
    }
  }

  if (min) {
    return {
      label: t("settings.modelService.localModel.tag.ramMin", { min }),
      tooltip: t("settings.modelService.localModel.tooltip.ramMin", { min }),
    }
  }

  return {
    label: t("settings.modelService.localModel.tag.ramRecommended", { recommended }),
    tooltip: t("settings.modelService.localModel.tooltip.ramRecommended", { recommended }),
  }
})

const localAvailabilityTag = computed(() => {
  const runtime = props.localRuntime
  if (!runtime) return null

  const reason = runtime.availabilityReason
  const total = typeof runtime.deviceTotalMemoryBytes === "number" && runtime.deviceTotalMemoryBytes > 0
    ? formatBytes(runtime.deviceTotalMemoryBytes)
    : t("settings.modelService.localModel.tooltip.memoryUnknown")
  const min = runtime.resourceRequirements?.minRamBytes
    ? formatBytes(runtime.resourceRequirements.minRamBytes)
    : t("settings.modelService.localModel.tooltip.memoryUnknown")
  const recommended = runtime.resourceRequirements?.recommendedRamBytes
    ? formatBytes(runtime.resourceRequirements.recommendedRamBytes)
    : t("settings.modelService.localModel.tooltip.memoryUnknown")

  const classMap: Record<string, string> = {
    available: "bg-emerald-50 text-emerald-700",
    limited: "bg-amber-50 text-amber-700",
    unavailable: "bg-red-50 text-red-700",
    unknown: "bg-muted text-toned",
  }

  const tooltipKeyMap: Record<string, string> = {
    total_meets_recommended: "settings.modelService.localModel.tooltip.availability.totalMeetsRecommended",
    total_below_recommended: "settings.modelService.localModel.tooltip.availability.totalBelowRecommended",
    total_below_min: "settings.modelService.localModel.tooltip.availability.totalBelowMin",
    requirements_missing: "settings.modelService.localModel.tooltip.availability.requirementsMissing",
    device_memory_unavailable: "settings.modelService.localModel.tooltip.availability.deviceMemoryUnavailable",
  }

  return {
    label: t(`settings.modelService.localModel.availability.${runtime.availability}`),
    class: classMap[runtime.availability] || "bg-muted text-toned",
    tooltip: t(tooltipKeyMap[reason] || tooltipKeyMap.requirements_missing, {
      total,
      min,
      recommended,
    }),
  }
})

const modelIdClass = computed(() => {
  const base = "text-sm truncate"
  if (!props.showLocalRuntimeActions) return base
  const runtime = props.localRuntime
  if (!runtime) return base
  if (runtime.state === "not_downloaded" || runtime.state === "downloading") {
    return `${base} text-dimmed`
  }
  return base
})

const localAction = computed(() => {
  const runtime = props.localRuntime
  if (!props.showLocalRuntimeActions || !runtime) return null

  if (runtime.state === "downloading") {
    return {
      action: "cancel" as const,
      icon: "i-lucide-square",
      color: "neutral" as const,
      tooltip: t("settings.modelService.localModel.action.cancelDownload"),
      loading: false,
      disabled: false,
    }
  }

  if (runtime.state === "loading") {
    return {
      action: "loading" as const,
      icon: "i-lucide-loader-circle",
      color: "neutral" as const,
      tooltip: t("settings.modelService.localModel.action.loading"),
      loading: true,
      disabled: true,
    }
  }

  if (runtime.state === "loaded") {
    return {
      action: "unload" as const,
      icon: "i-lucide-square-arrow-right-exit",
      color: "warning" as const,
      tooltip: t("settings.modelService.localModel.action.unload"),
      loading: false,
      disabled: false,
    }
  }

  if (runtime.state === "downloaded") {
    return {
      action: "load" as const,
      icon: "i-lucide-square-arrow-right-enter",
      color: "primary" as const,
      tooltip: t("settings.modelService.localModel.action.load"),
      loading: false,
      disabled: false,
    }
  }

  return {
    action: "download" as const,
    icon: "i-lucide-download",
    color: runtime.state === "error" ? "error" as const : "neutral" as const,
    tooltip: runtime.state === "error"
      ? t("settings.modelService.localModel.action.retryDownload")
      : t("settings.modelService.localModel.action.download"),
    loading: false,
    disabled: false,
  }
})

const showConfigFavButton = computed(() => {
  if (!props.showLocalRuntimeActions) return true
  const runtime = props.localRuntime
  if (!runtime) return false
  return runtime.state === "downloaded" || runtime.state === "loading" || runtime.state === "loaded"
})

function emitLocalAction(action: "cancel" | "loading" | "unload" | "load" | "download") {
  if (action === "cancel") {
    emit("local-cancel-download")
    return
  }
  if (action === "unload") {
    emit("local-unload")
    return
  }
  if (action === "load") {
    emit("local-load")
    return
  }
  if (action === "download") {
    emit("local-download")
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  const fixed = value >= 10 || idx === 0 ? 0 : 1
  return `${value.toFixed(fixed)} ${units[idx]}`
}
</script>
