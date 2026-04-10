<template>
  <div
    v-if="shouldShowMindmap"
    ref="rootRef"
    class="mt-4 rounded-xl border border-default bg-muted/20"
    :class="{ 'markmap-dark': isDark }"
  >
    <div class="px-3 py-2 flex items-center justify-between gap-2">
      <span class="text-xs text-muted select-none">{{ t("chat.mindmap.title") }}</span>
      <div class="flex items-center gap-1">
        <UTooltip :text="t('chat.mindmap.fit')">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-locate"
            square
            @click="handleFit"
          />
        </UTooltip>
        <UTooltip :text="t('chat.mindmap.downloadPng')">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-download"
            square
            @click="handleDownloadPng(svgRef)"
          />
        </UTooltip>
        <UTooltip :text="t('chat.mindmap.fullscreen')">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-maximize"
            square
            @click="modalOpen = true"
          />
        </UTooltip>
      </div>
    </div>
    <div class="relative border-t border-default/60 overflow-x-auto">
      <svg ref="svgRef" class="w-full h-[360px] min-w-[640px]"></svg>
      <div
        v-if="overlayVisible"
        class="absolute inset-0 z-10 bg-transparent"
        @click="handleActivateMindmap"
      />
    </div>
  </div>

  <!-- 全屏查看 Modal -->
  <UModal
    v-model:open="modalOpen"
    :close="false"
    :ui="{
      content: 'w-[90%] h-[90%] max-w-[90%] max-h-[90%] flex flex-col overflow-hidden',
      header: 'border-b-0 px-4 pt-4 pb-2',
      body: 'flex-1 min-h-0 !p-0',
    }"
  >
    <template #header>
      <div class="flex items-center justify-between w-full">
        <span class="text-md font-medium select-none">{{ t("chat.mindmap.title") }}</span>
        <div class="flex items-center gap-1">
          <UTooltip :text="t('chat.mindmap.fit')">
            <UButton
              size="md"
              color="neutral"
              variant="ghost"
              icon="i-lucide-locate"
              square
              @click="handleModalFit"
            />
          </UTooltip>
          <UTooltip :text="t('chat.mindmap.downloadPng')">
            <UButton
              size="md"
              color="neutral"
              variant="ghost"
              icon="i-lucide-download"
              square
              @click="handleDownloadPng(modalSvgRef)"
            />
          </UTooltip>
          <UButton
            size="md"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            square
            @click="modalOpen = false"
          />
        </div>
      </div>
    </template>

    <template #body>
      <div
        class="w-full h-full"
        :class="{ 'markmap-dark': isDark }"
      >
        <svg ref="modalSvgRef" class="w-full h-full"></svg>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onClickOutside } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";
import { useAppColorModeState } from "@/composables/useAppColorModeState";

type MindmapNode = {
  children?: MindmapNode[];
};

const props = defineProps<{
  markdown: string;
}>();

const { t } = useI18n();
const { isDark } = useAppColorModeState();
const rootRef = ref<HTMLElement | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const modalSvgRef = ref<SVGSVGElement | null>(null);
const overlayVisible = ref(true);
const modalOpen = ref(false);
const transformer = new Transformer();
let markmap: Markmap | null = null;
let modalMarkmap: Markmap | null = null;

function collectMindmapStats(root: MindmapNode) {
  let nodeCount = 0;

  const walk = (node: MindmapNode, depth: number) => {
    if (depth > 0) {
      nodeCount += 1;
    }
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      walk(child, depth + 1);
    }
  };

  walk(root, 0);
  return { nodeCount };
}

const transformedRoot = computed(() => {
  const source = props.markdown.trim();
  if (!source) return null;

  try {
    const { root } = transformer.transform(source);
    const stats = collectMindmapStats(root as MindmapNode);
    const passThreshold = stats.nodeCount >= 2;

    if (!passThreshold) return null;
    return root;
  } catch {
    return null;
  }
});

const shouldShowMindmap = computed(() => !!transformedRoot.value);

function disposeMarkmap() {
  if (markmap && typeof (markmap as any).destroy === "function") {
    (markmap as any).destroy();
  }
  markmap = null;
  if (svgRef.value) {
    svgRef.value.innerHTML = "";
  }
}

async function renderMindmap() {
  const root = transformedRoot.value;
  if (!root || !svgRef.value) return;

  await nextTick();
  if (!svgRef.value) return;

  if (!markmap) {
    markmap = Markmap.create(
      svgRef.value,
      {
        autoFit: true,
        duration: 0
      },
      root as any
    );
    return;
  }

  markmap.setData(root as any);
  markmap.fit();
}

function handleFit() {
  if (!markmap) return;
  void markmap.fit();
}

function handleActivateMindmap() {
  overlayVisible.value = false;
}

function handleDownloadPng(targetSvg: typeof svgRef) {
  const svg = targetSvg.value;
  if (!svg) return;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = svg.getBoundingClientRect();
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width * 2));
  clone.setAttribute("height", String(height * 2));

  const styles = document.querySelectorAll("style");
  const styleEl = document.createElement("style");
  styles.forEach((s) => { styleEl.textContent += s.textContent; });
  clone.insertBefore(styleEl, clone.firstChild);

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(clone);
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = isDark.value ? "#1e1e1e" : "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    const a = document.createElement("a");
    a.download = `mindmap-${Date.now()}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };
  img.src = url;
}

function disposeModalMarkmap() {
  if (modalMarkmap && typeof (modalMarkmap as any).destroy === "function") {
    (modalMarkmap as any).destroy();
  }
  modalMarkmap = null;
  if (modalSvgRef.value) {
    modalSvgRef.value.innerHTML = "";
  }
}

async function renderModalMindmap() {
  const root = transformedRoot.value;
  if (!root || !modalSvgRef.value) return;

  await nextTick();
  if (!modalSvgRef.value) return;

  disposeModalMarkmap();
  modalMarkmap = Markmap.create(
    modalSvgRef.value,
    { autoFit: true, duration: 0 },
    root as any
  );
}

function handleModalFit() {
  if (!modalMarkmap) return;
  void modalMarkmap.fit();
}

watch(modalOpen, async (open) => {
  if (open) {
    await nextTick();
    await renderModalMindmap();
  } else {
    disposeModalMarkmap();
  }
});

watch(
  transformedRoot,
  async (root) => {
    if (!root) {
      overlayVisible.value = true;
      disposeMarkmap();
      return;
    }
    await renderMindmap();
  },
  { immediate: true }
);

onClickOutside(rootRef, () => {
  if (!overlayVisible.value) {
    overlayVisible.value = true;
  }
});

onMounted(() => {
  void renderMindmap();
});

onBeforeUnmount(() => {
  disposeMarkmap();
  disposeModalMarkmap();
});
</script>
