<template>
  <div
    :class="[
      'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all hover:shadow-sm',
      data.isMain 
        ? 'bg-green-100 text-green-700 hover:bg-green-200' 
        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
    ]"
  >
    <UIcon 
      v-if="data.hasBranches"
      :name="data.isMain ? 'i-lucide-home' : 'i-lucide-git-branch'"
      class="w-3 h-3"
    />
    <span>{{ data.title }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  data: {
    sessionId: string
    title: string
    isMain: boolean
    hasBranches?: boolean  // 是否存在分支关系
  }
}>()
</script>

