<template>
  <div class="flex flex-col gap-3 p-4 border border-default rounded-xl">
    <div class="flex items-center justify-between gap-4">
      <div class="min-w-0">
        <div class="text-sm font-medium">{{ title }}</div>
        <div v-if="description" class="text-sm text-muted mt-1">
          {{ description }}
        </div>
      </div>
      <div class="shrink-0 flex items-center justify-end">
        <slot name="trailing" />
      </div>
    </div>
    <div v-if="$slots.footer" class="min-w-0 pt-3 border-t border-default">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>
