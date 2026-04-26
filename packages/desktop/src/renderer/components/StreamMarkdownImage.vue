<template>
  <figure class="my-4 inline-block max-w-full">
    <button
      v-if="resolvedSrc && !loadFailed"
      type="button"
      class="block max-w-full cursor-zoom-in rounded-lg text-left"
      @click="openPreview"
    >
      <img
        class="block h-auto max-w-full rounded-lg object-contain"
        :src="resolvedSrc"
        :alt="altText"
        loading="lazy"
        decoding="async"
        @error="handleError"
      />
    </button>
    <div
      v-else
      class="inline-flex min-h-16 min-w-48 items-center justify-center rounded-lg border border-default bg-elevated px-4 py-3 text-sm text-muted"
    >
      {{ titleText || altText || t("imagePreview.alt") }}
    </div>
    <figcaption v-if="caption" class="mt-1 text-center text-xs italic text-muted">
      {{ caption }}
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

type MarkdownImageNode = {
  url?: string;
  alt?: string;
  title?: string;
  loading?: boolean;
};

const props = defineProps<{
  node: MarkdownImageNode;
}>();

const { t } = useI18n();
const loadFailed = ref(false);

const resolvedSrc = computed(() => {
  const raw = typeof props.node.url === "string" ? props.node.url.trim() : "";
  if (!raw || props.node.loading) return "";
  return raw;
});

const altText = computed(() => String(props.node.alt ?? ""));
const titleText = computed(() => String(props.node.title ?? ""));
const caption = computed(() => titleText.value || altText.value);

watch(resolvedSrc, () => {
  loadFailed.value = false;
});

function handleError() {
  loadFailed.value = true;
}

function openPreview() {
  if (!resolvedSrc.value || loadFailed.value) return;
  window.imagePreview?.open?.({
    src: resolvedSrc.value,
    name: titleText.value || altText.value || undefined,
  });
}
</script>
