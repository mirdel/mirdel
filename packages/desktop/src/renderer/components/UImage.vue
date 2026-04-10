<template>
  <img
    :class="classes"
    v-bind="$attrs"
    :src="src"
    :alt="alt"
    :loading="resolvedLoading"
    :decoding="resolvedDecoding"
    @click="handleClick"
  />
</template>

<script setup lang="ts">
import { computed, useAttrs } from "vue";

type ImagePreviewPayload = {
  src: string;
  name?: string;
};

const props = withDefaults(defineProps<{
  src: string;
  alt?: string;
  /**
   * 图片加载策略，默认懒加载
   */
  loading?: "eager" | "lazy" | "auto";
  /**
   * 图片解码策略，默认异步解码
   */
  decoding?: "sync" | "async" | "auto";
  /**
   * 是否启用点击预览
   */
  preview?: boolean;
  /**
   * 预览窗口里用于命名/显示的名称（目前仅在下载时使用）
   */
  previewName?: string;
}>(), {
  loading: "lazy",
  decoding: "async",
  preview: true
});

const attrs = useAttrs() as Record<string, unknown>;

const classes = computed(() => [
  "max-h-full max-w-full object-cover select-none",
  props.preview && "cursor-zoom-in"
]);

const resolvedLoading = computed<"eager" | "lazy" | "auto">(() => {
  const value = attrs.loading;
  if (value === "eager" || value === "lazy" || value === "auto") return value;
  return props.loading;
});

const resolvedDecoding = computed<"sync" | "async" | "auto">(() => {
  const value = attrs.decoding;
  if (value === "sync" || value === "async" || value === "auto") return value;
  return props.decoding;
});

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
}>();

function handleClick(event: MouseEvent) {
  // 先把 click 事件透传给外部（如果有监听）
  emit("click", event);

  if (!props.preview) return;
  if (!props.src) return;

  const payload: ImagePreviewPayload = {
    src: props.src
  };

  if (props.previewName) {
    payload.name = props.previewName;
  }

  if (window.imagePreview?.open) {
    window.imagePreview.open(payload);
  }
}
</script>
