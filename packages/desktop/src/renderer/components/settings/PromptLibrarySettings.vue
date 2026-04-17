<template>
  <div class="flex min-w-0 flex-1 min-h-0 bg-default rounded-xl overflow-hidden">
    <section class="w-[260px] flex flex-col border-r border-default min-h-0">
      <div class="px-4 py-3 border-b border-default shrink-0">
        <div class="text-sm font-medium">{{ t("settings.promptLibrary.title") }}</div>
      </div>
      <div class="p-3 pb-2 shrink-0">
        <UInput
          v-model="listSearchQuery"
          :placeholder="t('settings.promptLibrary.listSearchPlaceholder')"
          icon="i-lucide-search"
          size="md"
          :ui="{ root: 'w-full' }"
        />
      </div>

      <div v-if="allEntries.length === 0" class="flex-1 min-h-0 flex flex-col items-center justify-center p-4">
        <UEmpty
          :title="t('settings.promptLibrary.emptyTitle')"
          icon="i-lucide-book-marked"
          size="sm"
          variant="naked"
        />
      </div>
      <div
        v-else-if="filteredEntries.length === 0"
        class="flex-1 min-h-0 flex items-center justify-center p-2"
      >
        <UEmpty
          :title="t('common.listSearchNoResults')"
          icon="i-lucide-search"
          size="sm"
          variant="naked"
        />
      </div>
      <div v-else class="flex-1 min-h-0 min-w-0 px-2 flex flex-col">
        <UScrollArea class="flex-1 min-h-0 h-full">
          <div class="flex flex-col gap-1 pb-2 pr-1">
            <UListItem
              v-for="item in filteredEntries"
              :key="item.id"
              size="md"
              :active="item.id === selectedId"
              @click="selectEntry(item.id)"
            >
              <div class="flex flex-col items-start gap-0.5 min-w-0 w-full">
                <div class="flex items-center gap-1 w-full min-w-0">
                  <UIcon
                    v-if="item.favorite"
                    name="i-heroicons-star-solid"
                    class="w-3.5 h-3.5 shrink-0 text-warning"
                  />
                  <UText :text="item.title" class="text-sm font-medium flex-1 min-w-0" />
                </div>
                <UText
                  :text="listItemSubtitle(item)"
                  class="text-xs opacity-70 w-full min-w-0"
                  content-class="break-all"
                />
              </div>
            </UListItem>
          </div>
        </UScrollArea>
      </div>

      <div class="p-3 border-t border-default shrink-0">
        <UButton
          icon="i-lucide-plus"
          variant="soft"
          color="neutral"
          block
          @click="openCreateModal"
        >
          {{ t("settings.promptLibrary.create") }}
        </UButton>
      </div>
    </section>

    <section class="flex-1 min-w-0 flex flex-col min-h-0">
      <div v-if="!selectedEntry" class="h-full flex items-center justify-center">
        <div class="text-center opacity-70">
          <UIcon name="i-lucide-book-marked" class="w-12 h-12 mx-auto mb-2" />
          <div class="text-sm">{{ t("settings.promptLibrary.selectPrompt") }}</div>
        </div>
      </div>

      <div v-else :key="selectedId ?? ''" class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="shrink-0 px-4 py-3 border-b border-default bg-muted">
          <div class="flex items-center justify-between gap-3">
            <div class="flex-1 min-w-0 flex flex-col">
              <h3 class="text-base font-semibold truncate">{{ selectedEntry.title }}</h3>
              <p
                v-if="detailDescriptionTrimmed"
                class="text-muted text-sm line-clamp-2 wrap-break-word h-full"
                :title="detailDescriptionTrimmed"
              >
                {{ detailDescriptionTrimmed }}
              </p>
            </div>
            <div class="flex items-center gap-1 shrink-0 pt-0.5">
              <UTooltip :text="t('settings.promptLibrary.edit')">
                <UButton
                  icon="i-lucide-pencil"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  @click="openEditModal"
                />
              </UTooltip>
              <UTooltip
                :text="
                  selectedEntry.favorite
                    ? t('settings.modelList.unfavorite')
                    : t('settings.modelList.favorite')
                "
              >
                <UButton
                  :icon="selectedEntry.favorite ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
                  variant="ghost"
                  color="warning"
                  size="sm"
                  :loading="favoriteLoading"
                  @click="toggleFavorite"
                />
              </UTooltip>
              <UTooltip :text="t('settings.promptLibrary.delete')">
                <UButton
                  icon="i-lucide-trash-2"
                  variant="ghost"
                  color="error"
                  size="sm"
                  @click="deleteModalOpen = true"
                />
              </UTooltip>
            </div>
          </div>
        </div>

        <div class="flex-1 min-h-0 min-w-0 overflow-y-auto p-4">
          <div class="w-full text-md whitespace-pre-wrap wrap-break-word">
            <template v-for="(seg, idx) in detailContentSegments" :key="idx">
              <code
                v-if="seg.kind === 'var'"
                class="mx-0.5 rounded px-0.5 py-0.5 font-mono text-sm text-primary border border-default align-baseline"
              >
                {{ seg.value }}
              </code>
              <template v-else>{{ seg.value }}</template>
            </template>
          </div>
        </div>

        <div
          v-if="(selectedEntry.tags ?? []).length > 0"
          class="shrink-0 bg-default p-4"
        >
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="tag in selectedEntry.tags ?? []"
              :key="tag"
              size="md"
              color="neutral"
              variant="soft"
              class="max-w-[220px]"
            >
              <span class="truncate">{{ tag }}</span>
            </UBadge>
          </div>
        </div>
      </div>
    </section>

    <UModal
      v-model:open="editorModalOpen"
      :title="editorModalTitle"
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
              ref="editorContentTextareaRef"
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
                <span v-else class="text-sm text-muted">{{ t("settings.promptLibrary.tagSelectPlaceholder") }}</span>
              </template>
            </USelectMenu>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton variant="outline" color="neutral" @click="editorModalOpen = false">
          {{ t("common.cancel") }}
        </UButton>
        <UButton color="neutral" :loading="editorSubmitting" @click="submitEditorModal">
          {{ t("settings.promptLibrary.editorSave") }}
        </UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteModalOpen"
      :title="t('settings.promptLibrary.deleteConfirmTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <p class="text-sm">
          {{ t("settings.promptLibrary.deleteConfirmContent", { title: deleteTargetTitle }) }}
        </p>
      </template>
      <template #footer>
        <UButton variant="outline" color="neutral" @click="deleteModalOpen = false">
          {{ t("common.cancel") }}
        </UButton>
        <UButton color="error" :loading="deleting" @click="confirmDelete">
          {{ t("common.delete") }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { storeToRefs } from "pinia";
import UListItem from "@/components/UListItem.vue";
import UText from "@/components/UText.vue";
import { useSettingsStore, type PromptLibraryEntry } from "@/stores/useSettingsStore";

const { t } = useI18n();
const settingsStore = useSettingsStore();
const { promptLibraryEntries } = storeToRefs(settingsStore);

const listSearchQuery = ref("");
const selectedId = ref<string | null>(null);

const editorModalOpen = ref(false);
const editorMode = ref<"create" | "edit">("create");
const editorTitle = ref("");
const editorDescription = ref("");
const editorContent = ref("");
const editorTags = ref<string[]>([]);
const titleError = ref("");
const contentError = ref("");
const editorSubmitting = ref(false);
const editorContentTextareaRef = ref<{ textareaRef?: HTMLTextAreaElement | null } | null>(null);
const editorTitleInputRef = ref<{ inputRef?: HTMLInputElement | null } | null>(null);

const CONTENT_MAX = 2000;

const contentLengthHint = computed(
  () => `${editorContent.value.length}/${CONTENT_MAX}`
);

const deleteModalOpen = ref(false);
const deleteTargetTitle = ref("");
const deleting = ref(false);
const favoriteLoading = ref(false);

const allEntries = computed(() => promptLibraryEntries.value);

function entryMatchesQuery(entry: PromptLibraryEntry, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const blob = [
    entry.title,
    entry.description,
    entry.content,
    ...entry.tags
  ]
    .join("\n")
    .toLowerCase();
  return blob.includes(needle);
}

const filteredEntries = computed(() =>
  allEntries.value.filter((e) => entryMatchesQuery(e, listSearchQuery.value))
);

const editorModalTitle = computed(() =>
  editorMode.value === "create"
    ? t("settings.promptLibrary.editorModalCreateTitle")
    : t("settings.promptLibrary.editorModalEditTitle")
);

const editorTagMenuItems = computed(() => {
  const set = new Set<string>();
  for (const entry of promptLibraryEntries.value) {
    for (const raw of entry.tags ?? []) {
      const s = String(raw).trim();
      if (s) set.add(s);
    }
  }
  for (const t of editorTags.value) {
    const s = String(t).trim();
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
});

function onEditorTagCreate(term: unknown) {
  const s = String(term ?? "").trim();
  if (!s || editorTags.value.includes(s)) return;
  editorTags.value = [...editorTags.value, s];
}

function removeEditorTag(tag: string) {
  editorTags.value = editorTags.value.filter((x) => x !== tag);
}

const selectedEntry = computed(() =>
  selectedId.value ? allEntries.value.find((e) => e.id === selectedId.value) ?? null : null
);

const detailDescriptionTrimmed = computed(() => {
  const entry = selectedEntry.value;
  if (!entry) return "";
  return (entry.description ?? "").trim();
});

type DetailContentSegment = { kind: "text" | "var"; value: string };

function splitPromptContentByVariables(text: string): DetailContentSegment[] {
  const re = /\{\{[\s\S]*?\}\}/g;
  const segments: DetailContentSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ kind: "text", value: text.slice(last, m.index) });
    }
    segments.push({ kind: "var", value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ kind: "text", value: text.slice(last) });
  }
  if (segments.length === 0 && text.length > 0) {
    segments.push({ kind: "text", value: text });
  }
  return segments;
}

const detailContentSegments = computed(() => {
  const entry = selectedEntry.value;
  if (!entry) return [];
  return splitPromptContentByVariables(entry.content ?? "");
});

function listItemSubtitle(item: PromptLibraryEntry) {
  const d = (item.description ?? "").trim();
  if (d) return d;
  const c = (item.content ?? "").trim();
  if (c) return c.slice(0, 160);
  return "—";
}

function resetEditorForm() {
  editorTitle.value = "";
  editorDescription.value = "";
  editorContent.value = "";
  editorTags.value = [];
  titleError.value = "";
  contentError.value = "";
}

function openCreateModal() {
  editorMode.value = "create";
  resetEditorForm();
  editorModalOpen.value = true;
}

function openEditModal() {
  const entry = selectedEntry.value;
  if (!entry) return;
  editorMode.value = "edit";
  titleError.value = "";
  contentError.value = "";
  editorTitle.value = entry.title;
  editorDescription.value = entry.description ?? "";
  editorContent.value = entry.content ?? "";
  editorTags.value = [...entry.tags];
  editorModalOpen.value = true;
}

function selectEntry(id: string) {
  selectedId.value = id;
}

watch(editorModalOpen, (open) => {
  if (!open) {
    titleError.value = "";
    contentError.value = "";
    return;
  }
  nextTick(() => {
    if (editorMode.value === "create") {
      setTimeout(() => {
        editorTitleInputRef.value?.inputRef?.focus();
      }, 50);
    } else {
      editorContentTextareaRef.value?.textareaRef?.focus();
    }
  });
});

watch(deleteModalOpen, (open) => {
  if (open && selectedEntry.value) {
    deleteTargetTitle.value = selectedEntry.value.title;
  }
});

watch(allEntries, (entries) => {
  if (selectedId.value && !entries.some((e) => e.id === selectedId.value)) {
    selectedId.value = filteredEntries.value[0]?.id ?? null;
  }
});

watch(filteredEntries, (list) => {
  if (selectedId.value && !list.some((e) => e.id === selectedId.value)) {
    selectedId.value = list[0]?.id ?? null;
  }
});

onMounted(async () => {
  await settingsStore.loadPromptLibrary();
  if (filteredEntries.value.length > 0 && !selectedId.value) {
    selectedId.value = filteredEntries.value[0].id;
  }
});

async function submitEditorModal() {
  titleError.value = "";
  contentError.value = "";

  const titleTrimmed = editorTitle.value.trim();
  if (!titleTrimmed) {
    titleError.value = t("settings.promptLibrary.titleRequired");
  }

  const raw = editorContent.value;
  if (raw.length > CONTENT_MAX) {
    contentError.value = t("settings.promptLibrary.contentTooLong", { max: CONTENT_MAX });
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
    if (editorMode.value === "create") {
      const entry = await settingsStore.createPromptLibraryEntry({
        title: titleTrimmed,
        description: editorDescription.value.trim(),
        content: body,
        tags: [...editorTags.value]
      });
      editorModalOpen.value = false;
      listSearchQuery.value = "";
      await nextTick();
      selectedId.value = entry.id;
    } else {
      const id = selectedId.value;
      if (!id) return;
      await settingsStore.updatePromptLibraryEntry(id, {
        title: titleTrimmed,
        description: editorDescription.value.trim(),
        content: body,
        tags: [...editorTags.value]
      });
      editorModalOpen.value = false;
    }
  } finally {
    editorSubmitting.value = false;
  }
}

async function toggleFavorite() {
  if (!selectedEntry.value) return;
  favoriteLoading.value = true;
  try {
    await settingsStore.updatePromptLibraryEntry(selectedEntry.value.id, {
      favorite: !selectedEntry.value.favorite
    });
  } finally {
    favoriteLoading.value = false;
  }
}

async function confirmDelete() {
  if (!selectedId.value) return;
  deleting.value = true;
  try {
    const id = selectedId.value;
    await settingsStore.deletePromptLibraryEntry(id);
    deleteModalOpen.value = false;
    selectedId.value = filteredEntries.value[0]?.id ?? null;
  } finally {
    deleting.value = false;
  }
}
</script>
