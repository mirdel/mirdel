<template>
  <div
    class="wave-sweep min-w-0"
    :class="{ 'wave-sweep--active': active }"
    :style="rootStyle"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface WaveSweepProps {
  active?: boolean
  durationMs?: number
  bandPercent?: number
  baseColor?: string
  highlightColor?: string
}

const props = withDefaults(defineProps<WaveSweepProps>(), {
  active: false,
  durationMs: 3600,
  bandPercent: 20,
  baseColor: 'rgb(71 85 105)',
  highlightColor: 'rgb(71 85 105 / 30%)'
})

const rootStyle = computed(() => ({
  '--wave-sweep-duration': `${props.durationMs}ms`,
  '--wave-sweep-band': `${props.bandPercent}%`,
  '--wave-sweep-base': props.baseColor,
  '--wave-sweep-highlight': props.highlightColor
}))
</script>

<style scoped>
.wave-sweep {
  position: relative;
}

.wave-sweep--active :deep(.wave-sweep-text) {
  color: transparent;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(
    110deg,
    var(--wave-sweep-base) 0%,
    var(--wave-sweep-base) calc(50% - var(--wave-sweep-band)),
    var(--wave-sweep-highlight) 50%,
    var(--wave-sweep-base) calc(50% + var(--wave-sweep-band)),
    var(--wave-sweep-base) 100%
  );
  background-size: 200% 100%;
  background-position: 200% 0;
  -webkit-background-clip: text;
  background-clip: text;
  will-change: background-position;
  animation: wave-sweep-text var(--wave-sweep-duration) linear infinite;
}

@keyframes wave-sweep-text {
  to {
    background-position: -200% 0;
  }
}
</style>
