<template>
  <div
    :class="[
      'shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-elevated',
      sizeClass
    ]"
  >
    <img
      v-if="logoUrl && !loadFailed"
      :src="logoUrl"
      :alt="modelId"
      loading="lazy"
      decoding="async"
      :class="size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'"
      class="object-contain"
      @error="loadFailed = true"
    />
    <UIcon v-else name="i-lucide-bot" :class="iconClass" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useProviderLogo } from "@/composables/useProviderLogo";
import { getModelLogo } from "@/composables/useModelLogo";

const { providerLogoUrl } = useProviderLogo();

const props = withDefaults(
  defineProps<{
    modelId: string;
    size?: "sm" | "md";
  }>(),
  { size: "md" }
);

const loadFailed = ref(false);

const logoUrl = computed(() => {
  const logo = getModelLogo(props.modelId);
  return logo ? providerLogoUrl(logo) : undefined;
});

const sizeClass = computed(() =>
  props.size === "md" ? "w-8 h-8" : "w-6 h-6"
);

const iconClass = computed(() =>
  props.size === "md" ? "w-4 h-4 text-muted" : "w-4 h-4 text-muted"
);
</script>
