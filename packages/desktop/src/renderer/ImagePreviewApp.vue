<template>
  <UApp
    :tooltip="{ disableHoverableContent: true, ignoreNonKeyboardFocus: true, delayDuration: 300 }"
    :toaster="{ position: 'top-right' }"
  >
  <div class="h-screen w-screen flex flex-col bg-muted text-default">
    <!-- 工具栏 -->
    <div class="flex items-center gap-2 px-3 py-2 bg-muted/95">
      <!-- 为了避开 macOS 三色灯，预留一段左侧空白 -->
      <div class="w-16 shrink-0"></div>

      <div class="flex items-center gap-1">
        <UTooltip :text="t('imagePreview.zoomIn')">
          <UButton
            icon="i-lucide-zoom-in"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            @click="handleZoomIn"
          />
        </UTooltip>
        <span v-if="displayScale" class="text-xs text-muted min-w-12 text-center">
          {{ displayScale }}
        </span>
        <UTooltip :text="t('imagePreview.zoomOut')">
          <UButton
            icon="i-lucide-zoom-out"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            @click="handleZoomOut"
          />
        </UTooltip>
        <UTooltip :text="fitMode === 'fit' ? t('imagePreview.originalSize') : t('imagePreview.fitPage')">
          <UButton
            :icon="fitMode === 'fit' ? 'i-lucide-scan-eye' : 'i-lucide-fullscreen'"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            @click="toggleFitMode"
          />
        </UTooltip>
      </div>

      <USeparator orientation="vertical" class="h-5" />

      <div class="flex items-center gap-1">
        <UTooltip :text="t('imagePreview.rotateLeft')">
          <UButton
            icon="i-lucide-rotate-ccw"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            @click="rotateLeft"
          />
        </UTooltip>
        <UTooltip :text="t('imagePreview.rotateRight')">
          <UButton
            icon="i-lucide-rotate-cw"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            @click="rotateRight"
          />
        </UTooltip>
        <UTooltip :text="t('imagePreview.flipHorizontal')">
          <UButton
            icon="i-lucide-flip-horizontal"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            @click="flipHorizontal"
          />
        </UTooltip>
        <UTooltip :text="t('imagePreview.flipVertical')">
          <UButton
            icon="i-lucide-flip-vertical"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            @click="flipVertical"
          />
        </UTooltip>
      </div>

      <USeparator orientation="vertical" class="h-5" />

      <div class="flex items-center gap-1">
        <UTooltip :text="t('imagePreview.reset')">
          <UButton
            icon="i-lucide-rotate-ccw-square"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            @click="reset"
          />
        </UTooltip>
        <UTooltip :text="t('imagePreview.copy')">
          <UButton
            icon="i-lucide-copy"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            :loading="copying"
            @click="handleCopy"
          />
        </UTooltip>
        <UTooltip :text="t('imagePreview.download')">
          <UButton
            icon="i-lucide-download"
            size="sm"
            color="neutral"
            variant="ghost"
            square
            :loading="downloading"
            @click="handleDownload"
          />
        </UTooltip>
      </div>

      <div class="ml-auto flex items-center gap-2 text-xs text-muted">
        <!-- 预留区域（目前不展示图片名称） -->
      </div>
    </div>

    <!-- 图片区域 -->
    <div
      ref="containerRef"
      class="flex-1 overflow-auto bg-muted"
      @wheel="handleWheel"
    >
      <div class="min-h-full min-w-max flex items-center justify-center">
        <template v-if="currentImage">
          <img
            ref="imageRef"
            :src="currentImage.src"
            :alt="t('imagePreview.alt')"
            class="select-none flex-none"
            :style="imageStyle"
            @load="handleImageLoaded"
          />
        </template>
        <template v-else>
          <div class="text-muted text-sm">
            {{ t('imagePreview.empty') }}
          </div>
        </template>
      </div>
    </div>
  </div>
  </UApp>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { initColorModeForWindow } from "@/utils/initColorMode";

type ImagePreviewInfo = {
  src?: string;
  filePath?: string;
  name?: string;
};

type FitMode = "fit" | "original";

const { t } = useI18n();

const containerRef = ref<HTMLElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);

const state = reactive({
  currentImage: null as ImagePreviewInfo | null,
  fitMode: "fit" as FitMode,
  // 缩放倍数（1 = 100%，范围 0.05 ~ 10）
  scale: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
  // 图片原始尺寸
  naturalWidth: 0,
  naturalHeight: 0,
  downloading: false,
  copying: false
});

const currentImage = computed(() => state.currentImage);
const fitMode = computed(() => state.fitMode);
const downloading = computed(() => state.downloading);
const copying = computed(() => state.copying);

const displayScale = computed(() => {
  const percent = Math.round(state.scale * 100);
  if (!Number.isFinite(percent)) return "";
  return `${percent}%`;
});

const imageStyle = computed(() => {
  const transforms = [
    `rotate(${state.rotation}deg)`,
    state.flipX ? "scaleX(-1)" : "",
    state.flipY ? "scaleY(-1)" : ""
  ]
    .filter(Boolean)
    .join(" ");
  
  const width =
    state.naturalWidth > 0
      ? Math.max(state.naturalWidth * state.scale, 1)
      : undefined;

  return {
    transform: transforms,
    transformOrigin: "center center",
    width: width ? `${width}px` : "auto",
    height: "auto",
    maxWidth: "none",
    maxHeight: "none",
    // 缩放 / 旋转 / 翻转 / 适应页面切换时的过渡效果
    transition: "transform 0.18s ease-out, width 0.18s ease-out",
    display: "block"
  } as const;
});

function computeFitScale() {
  const container = containerRef.value;
  const img = imageRef.value;
  if (!container || !img || !img.naturalWidth || !img.naturalHeight) return 1;

  const padding = 40;
  const availableWidth = Math.max(container.clientWidth - padding, 1);
  const availableHeight = Math.max(container.clientHeight - padding, 1);

  // 考虑旋转后的有效宽高（90/270 度时宽高互换）
  const rotated = state.rotation % 180 !== 0;
  const imgWidth = rotated ? img.naturalHeight : img.naturalWidth;
  const imgHeight = rotated ? img.naturalWidth : img.naturalHeight;

  const scaleX = availableWidth / imgWidth;
  const scaleY = availableHeight / imgHeight;

  const fitScale = Math.min(scaleX, scaleY);
  // 限制在 5% ~ 1000% 范围内
  return Math.min(Math.max(fitScale, 0.05), 10);
}

function applyFitScale() {
  if (!imageRef.value) return;
  const fitScale = computeFitScale();
  state.scale = fitScale;
}

function resetTransforms() {
  state.rotation = 0;
  state.flipX = false;
  state.flipY = false;
  if (state.fitMode === "fit") {
    applyFitScale();
  } else {
    state.scale = 1;
  }
}

function handleZoomIn() {
  const step = 0.1;
  const next = state.scale + step;
  state.scale = Math.min(next, 10);
}

function handleZoomOut() {
  const step = 0.1;
  const next = state.scale - step;
  state.scale = next < 0.05 ? 0.05 : next;
}

function handleWheel(event: WheelEvent) {
  if (!state.currentImage) return;

  // 仅在触控板缩放（通常 ctrlKey 为 true）时处理
  if (!event.ctrlKey) return;

  event.preventDefault();

  const delta = event.deltaY;
  const factor = -0.003; // 略快一些的缩放速率
  const nextScale = state.scale + delta * factor;

  const clamped = Math.min(Math.max(nextScale, 0.05), 10);
  state.scale = clamped;
}

function toggleFitMode() {
  if (!imageRef.value) return;
  if (state.fitMode === "fit") {
    state.fitMode = "original";
    state.scale = 1;
  } else {
    state.fitMode = "fit";
    applyFitScale();
  }
}

function rotateLeft() {
  state.rotation = (state.rotation - 90 + 360) % 360;
}

function rotateRight() {
  state.rotation = (state.rotation + 90) % 360;
}

function flipHorizontal() {
  state.flipX = !state.flipX;
}

function flipVertical() {
  state.flipY = !state.flipY;
}

function reset() {
  resetTransforms();
}

function handleImageLoaded() {
  const img = imageRef.value;
  if (img) {
    state.naturalWidth = img.naturalWidth;
    state.naturalHeight = img.naturalHeight;
  }

  if (state.fitMode === "fit") {
    applyFitScale();
  } else if (!state.scale || !Number.isFinite(state.scale)) {
    state.scale = 1;
  }
}

async function handleDownload() {
  if (!state.currentImage) return;
  if (!state.currentImage.src && !state.currentImage.filePath) return;
  if (!window.imageAsset?.download) return;

  state.downloading = true;
  try {
    // 避免直接传递 reactive 对象，创建一个可序列化的普通对象
    const payload = {
      src: state.currentImage.src,
      filePath: state.currentImage.filePath,
      name: state.currentImage.name
    };
    await window.imageAsset.download(payload);
  } finally {
    state.downloading = false;
  }
}

async function handleCopy() {
  if (!state.currentImage) return;
  if (!state.currentImage.src && !state.currentImage.filePath) return;
  if (!window.imageAsset?.copy) return;

  state.copying = true;
  try {
    const payload = {
      src: state.currentImage.src,
      filePath: state.currentImage.filePath,
      name: state.currentImage.name
    };
    await window.imageAsset.copy(payload);
  } finally {
    state.copying = false;
  }
}

function handleImageUpdate(info: ImagePreviewInfo) {
  if (!info?.src) return;
  state.currentImage = info;
  state.fitMode = "fit";
  state.scale = 1;
  state.rotation = 0;
  state.flipX = false;
  state.flipY = false;

  // 等待图片加载后重新计算适配比例
  requestAnimationFrame(() => {
    applyFitScale();
  });
}

let removeUpdateListener: (() => void) | null = null;
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  initColorModeForWindow();
  if (window.imagePreview?.onUpdate) {
    removeUpdateListener = window.imagePreview.onUpdate(handleImageUpdate);
  }

  if (containerRef.value && "ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(() => {
      if (state.fitMode === "fit" && state.currentImage) {
        applyFitScale();
      }
    });
    resizeObserver.observe(containerRef.value);
  }
});

onUnmounted(() => {
  if (removeUpdateListener) {
    removeUpdateListener();
    removeUpdateListener = null;
  }
  if (resizeObserver && containerRef.value) {
    resizeObserver.unobserve(containerRef.value);
  }
  resizeObserver = null;
});

watch(
  () => state.fitMode,
  (mode) => {
    if (mode === "fit" && state.currentImage) {
      applyFitScale();
    }
  }
);
</script>

<style scoped>
</style>
