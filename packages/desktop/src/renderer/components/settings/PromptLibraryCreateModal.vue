<template>
  <UModal
    v-model:open="modalOpen"
    :title="t('settings.promptLibrary.editorModalCreateTitle')"
    :ui="{ footer: 'justify-end', body: 'max-h-[min(80vh,640px)] overflow-y-auto' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField
          :label="t('settings.promptLibrary.fieldTitle')"
          required
          :error="titleError || undefined"
        >
          <UInput
            ref="editorTitleInputRef"
            v-model="editorTitle"
            size="md"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="t('settings.promptLibrary.fieldDescription')">
          <UInput v-model="editorDescription" size="md" class="w-full" />
        </UFormField>
        <UFormField
          :label="t('settings.promptLibrary.fieldContent')"
          required
          :hint="contentLengthHint"
          :description="t('settings.promptLibrary.placeholderHint')"
          :error="contentError || undefined"
        >
          <UTextarea
            v-model="editorContent"
            :rows="12"
            autoresize
            :maxlength="CONTENT_MAX"
            class="w-full text-sm"
          />
        </UFormField>
        <UFormField :label="t('settings.promptLibrary.fieldTags')">
          <USelectMenu
            v-model="editorTags"
            :items="editorTagMenuItems"
            multiple
            create-item="always"
            variant="outline"
            color="neutral"
            size="md"
            class="w-full"
            :placeholder="t('settings.promptLibrary.tagSelectPlaceholder')"
            :search-input="{
              placeholder: t('settings.promptLibrary.tagPanelSearchPlaceholder'),
              variant: 'none'
            }"
            :ui="{
              trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
            }"
            @create="onEditorTagCreate"
          >
            <template #default="{ modelValue }">
              <div
                v-if="Array.isArray(modelValue) && modelValue.length > 0"
                class="flex flex-wrap gap-1 items-center"
              >
                <UBadge
                  v-for="tag in modelValue"
                  :key="String(tag)"
                  size="lg"
                  color="neutral"
                  variant="soft"
                  class="max-w-[220px] inline-flex items-center gap-0.5 pl-2 pr-0.5 py-0.5"
                >
                  <span class="truncate">{{ tag }}</span>
                  <UTooltip :text="t('common.delete')">
                    <UButton
                      icon="i-lucide-x"
                      variant="ghost"
                      color="neutral"
                      size="xs"
                      class="p-0.5 shrink-0"
                      @click.stop="removeEditorTag(String(tag))"
                    />
                  </UTooltip>
                </UBadge>
              </div>
              <span v-else class="text-sm text-muted">{{
                t("settings.promptLibrary.tagSelectPlaceholder")
              }}</span>
            </template>
          </USelectMenu>
        </UFormField>
      </div>
    </template>
    <template #footer>
      <UButton variant="outline" color="neutral" @click="modalOpen = false">
        {{ t("common.cancel") }}
      </UButton>
      <UButton color="neutral" :loading="editorSubmitting" @click="submitCreate">
        {{ t("settings.promptLibrary.editorSave") }}
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { storeToRefs } from "pinia";
import {
  useSettingsStore,
  type PromptLibraryCreateAfterSave
} from "@/stores/useSettingsStore";

const { t } = useI18n();
const settingsStore = useSettingsStore();
const { promptLibraryEntries, promptLibraryCreateRequest } = storeToRefs(settingsStore);

const CONTENT_MAX = 2000;

const modalOpen = ref(false);
const afterSave = ref<PromptLibraryCreateAfterSave>("none");
const editorTitle = ref("");
const editorDescription = ref("");
const editorContent = ref("");
const editorTags = ref<string[]>([]);
const titleError = ref("");
const contentError = ref("");
const editorSubmitting = ref(false);
const editorTitleInputRef = ref<{ inputRef?: HTMLInputElement | null } | null>(null);

const contentLengthHint = computed(
  () => `${editorContent.value.length}/${CONTENT_MAX}`
);

const editorTagMenuItems = computed(() => {
  const set = new Set<string>();
  for (const entry of promptLibraryEntries.value) {
    for (const raw of entry.tags ?? []) {
      const s = String(raw).trim();
      if (s) set.add(s);
    }
  }
  for (const tag of editorTags.value) {
    const s = String(tag).trim();
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
});

function resetForm() {
  editorTitle.value = "";
  editorDescription.value = "";
  editorContent.value = "";
  editorTags.value = [];
  titleError.value = "";
  contentError.value = "";
}

function onEditorTagCreate(term: unknown) {
  const s = String(term ?? "").trim();
  if (!s || editorTags.value.includes(s)) return;
  editorTags.value = [...editorTags.value, s];
}

function removeEditorTag(tag: string) {
  editorTags.value = editorTags.value.filter((x) => x !== tag);
}

function applyIncomingRequest(req: {
  presetContent: string;
  afterSave: PromptLibraryCreateAfterSave;
}) {
  const body =
    req.presetContent.length > CONTENT_MAX
      ? req.presetContent.slice(0, CONTENT_MAX)
      : req.presetContent;
  afterSave.value = req.afterSave;
  resetForm();
  editorContent.value = body;
  modalOpen.value = true;
}

watch(
  promptLibraryCreateRequest,
  (req) => {
    if (!req) return;
    const payload = settingsStore.takePromptLibraryCreateRequest();
    if (!payload) return;
    applyIncomingRequest(payload);
  },
  { immediate: true }
);

watch(modalOpen, (open) => {
  if (!open) {
    titleError.value = "";
    contentError.value = "";
    return;
  }
  nextTick(() => {
    setTimeout(() => {
      editorTitleInputRef.value?.inputRef?.focus();
    }, 50);
  });
});

async function submitCreate() {
  titleError.value = "";
  contentError.value = "";

  const titleTrimmed = editorTitle.value.trim();
  if (!titleTrimmed) {
    titleError.value = t("settings.promptLibrary.titleRequired");
  }

  const raw = editorContent.value;
  if (raw.length > CONTENT_MAX) {
    contentError.value = t("settings.promptLibrary.contentTooLong", {
      max: CONTENT_MAX
    });
  } else {
    const body = raw.trim();
    if (!body) {
      contentError.value = t("settings.promptLibrary.contentRequired");
    }
  }

  if (titleError.value || contentError.value) {
    return;
  }

  const body = raw.trim();
  editorSubmitting.value = true;
  try {
    await settingsStore.createPromptLibraryEntry({
      title: titleTrimmed,
      description: editorDescription.value.trim(),
      content: body,
      tags: [...editorTags.value]
    });
    modalOpen.value = false;
    if (afterSave.value === "reload-prompt-library") {
      await settingsStore.loadPromptLibrary();
    }
  } finally {
    editorSubmitting.value = false;
  }
}
</script>
