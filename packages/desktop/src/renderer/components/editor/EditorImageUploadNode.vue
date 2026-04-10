<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { NodeViewProps } from "@tiptap/vue-3";
import { NodeViewWrapper } from "@tiptap/vue-3";
import type { EditorImageUploadResult, EditorImageUploader } from "./EditorImageUploadExtension";

const props = defineProps<NodeViewProps>();
const { t } = useI18n();

const file = ref<File | null>(null);
const loading = ref(false);
const errorMessage = ref("");

const extensionOptions = computed(() => {
  return (props.extension?.options || {}) as { upload?: EditorImageUploader; accept?: string };
});

const accept = computed(() => extensionOptions.value.accept || "image/*");

function readFileAsDataUrl(input: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error(t("editor.imageUpload.readFailed")));
    };
    reader.onerror = () => {
      reject(reader.error || new Error(t("editor.imageUpload.readFailed")));
    };
    reader.readAsDataURL(input);
  });
}

watch(file, async (newFile) => {
  if (!newFile) return;

  loading.value = true;
  errorMessage.value = "";

  try {
    let uploaded: EditorImageUploadResult;
    if (typeof extensionOptions.value.upload === "function") {
      uploaded = await extensionOptions.value.upload(newFile);
    } else {
      uploaded = {
        src: await readFileAsDataUrl(newFile),
        alt: newFile.name,
      };
    }

    if (!uploaded.src) {
      throw new Error(t("editor.imageUpload.uploadFailed"));
    }

    const pos = props.getPos();
    if (typeof pos !== "number") {
      throw new Error(t("editor.imageUpload.insertFailed"));
    }

    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + 1 })
      .setImage({
        src: uploaded.src,
        alt: (uploaded.alt || newFile.name || "image").replace(/[\r\n]/g, " "),
        title: uploaded.title,
      })
      .run();

    file.value = null;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <NodeViewWrapper>
    <div class="space-y-2">
      <UFileUpload
        v-model="file"
        :accept="accept"
        :preview="false"
        :disabled="loading"
        :label="t('editor.imageUpload.label')"
        :description="t('editor.imageUpload.description')"
        class="min-h-40"
      >
        <template #leading>
          <UAvatar
            :icon="loading ? 'i-lucide-loader-circle' : 'i-lucide-image'"
            size="xl"
            :ui="{ icon: [loading && 'animate-spin'] }"
          />
        </template>
      </UFileUpload>

      <div v-if="errorMessage" class="text-xs text-red-500">
        {{ errorMessage }}
      </div>
    </div>
  </NodeViewWrapper>
</template>
