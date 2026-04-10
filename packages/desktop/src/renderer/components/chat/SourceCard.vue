<template>
  <div
    :class="{ 'cursor-pointer': isInteractive, 'source-card--compact': compact }"
    @click="handleClick"
  >
    <!-- 第一行：序号 + favicon（网络搜索）/ book-search（知识库）+ 来源描述 -->
    <div class="flex items-center gap-2 text-sm text-toned dark:text-muted mb-1">
      <div 
        v-if="showIndex" 
        class="text-xs h-5 min-w-5 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center shrink-0"
      >
        {{ source.index }}
      </div>
      <img
        v-if="source.favicon"
        :src="source.favicon"
        loading="lazy"
        decoding="async"
        class="w-4 h-4 rounded shrink-0"
        @error="handleFaviconError"
      />
      <UIcon v-else :name="fallbackIcon" class="w-4 h-4 shrink-0 text-toned dark:text-muted" />
      <span class="truncate">{{ source.source || source.siteName || (source.url ? getDomain(source.url) : source.id) }}</span>
    </div>
    
    <!-- 第二行：标题 -->
    <div 
      v-if="source.title"
      class="font-medium text-sm text-default line-clamp-2"
      :class="showIndex ? 'pl-6' : ''"
    >
      {{ source.title }}
    </div>
    
    <!-- 第三行：正文预览（最多2行） -->
    <div 
      v-if="source.content" 
      class="text-sm text-toned dark:text-muted line-clamp-2 mt-1"
      :class="showIndex ? 'pl-6' : ''"
    >
      {{ source.content }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CitationSource } from '@shared';

const props = withDefaults(defineProps<{
  source: CitationSource;
  showIndex?: boolean;
  compact?: boolean;
  clickable?: boolean;
}>(), {
  showIndex: true,
  compact: false,
  clickable: true
});

const emit = defineEmits<{
  click: [source: CitationSource];
}>();

const isInteractive = computed(() => !!props.clickable);
const fallbackIcon = computed(() => {
  if (props.source.kind === 'web') {
    return 'i-lucide-globe'
  }
  if (!props.source.kind && props.source.url && !props.source.kbId && !props.source.kbItemId) {
    return 'i-lucide-globe'
  }
  return 'i-lucide-book-search'
});

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function handleClick() {
  if (!isInteractive.value) return;
  emit('click', props.source);
}

function handleFaviconError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%239ca3af" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
}
</script>
