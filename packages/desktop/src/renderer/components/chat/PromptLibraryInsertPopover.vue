<template>
  <UPopover
    :open="open"
    :content="{ side: 'top', align: 'center' }"
    :ui="{ content: 'w-80 p-0 overflow-hidden' }"
    @update:open="onUpdateOpen"
  >
    <div class="inline-flex" @pointerdown.capture="emit('before-open')">
      <slot />
    </div>
    <template #content>
      <div class="flex h-80 flex-col bg-default">
        <div class="shrink-0 p-2 border-b border-default">
          <UInput
            v-model="searchQuery"
            :placeholder="t('chat.input.promptLibrary.search')"
            icon="i-lucide-search"
            size="sm"
            :ui="{ root: 'w-full' }"
          />
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto flex flex-col">
          <template v-if="filteredFavorites.length > 0">
            <div class="px-3 pt-2 pb-1 text-xs font-medium text-muted">
              {{ t("chat.input.promptLibrary.favorited") }}
            </div>
            <div class="flex flex-col gap-0.5 px-1 pb-2">
              <button
                v-for="item in filteredFavorites"
                :key="item.id"
                type="button"
                class="w-full flex flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left min-w-0 hover:bg-elevated/50 transition-colors"
                @click="pick(item)"
              >
                <div class="flex items-center gap-1.5 w-full min-w-0">
                  <UIcon
                    name="i-heroicons-star-solid"
                    class="w-3.5 h-3.5 shrink-0 text-warning"
                  />
                  <span class="text-xs font-medium truncate flex-1 min-w-0">{{ item.title }}</span>
                </div>
                <UText
                  :text="listItemSubtitle(item)"
                  class="text-xs opacity-70 w-full min-w-0 pl-5"
                  content-class="break-all"
                />
              </button>
            </div>
          </template>

          <template v-if="filteredOthers.length > 0">
            <div
              :class="[
                'px-3 pt-2 pb-1 text-xs font-medium text-muted',
                filteredFavorites.length > 0 && 'border-t border-default'
              ]"
            >
              {{ t("chat.input.promptLibrary.others") }}
            </div>
            <div class="flex flex-col gap-0.5 px-1 pb-2">
              <button
                v-for="item in filteredOthers"
                :key="item.id"
                type="button"
                class="w-full flex flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left min-w-0 hover:bg-elevated/50 transition-colors"
                @click="pick(item)"
              >
                <span class="text-xs font-medium truncate w-full min-w-0 pl-0.5">{{ item.title }}</span>
                <UText
                  :text="listItemSubtitle(item)"
                  class="text-xs opacity-70 w-full min-w-0"
                  content-class="break-all"
                />
              </button>
            </div>
          </template>

          <div
            v-if="filteredFavorites.length === 0 && filteredOthers.length === 0"
            class="flex-1 min-h-32 flex flex-col items-center justify-center p-4"
          >
            <UEmpty
              v-if="entries.length === 0"
              :title="t('settings.promptLibrary.emptyTitle')"
              icon="i-lucide-book-marked"
              size="sm"
              variant="naked"
            />
            <UEmpty
              v-else
              :title="t('common.listSearchNoResults')"
              icon="i-lucide-search"
              size="sm"
              variant="naked"
            />
          </div>
        </div>
      </div>
    </template>
  </UPopover>

  <UModal
    v-model:open="variablesModalOpen"
    :title="t('chat.input.promptLibrary.fillVariablesTitle')"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="flex flex-col gap-3 max-h-[min(60vh,420px)] overflow-y-auto">
        <div
          v-for="(name, index) in variableNames"
          :key="name"
          class="flex w-full items-center justify-between gap-6"
        >
          <span class="shrink-0 text-sm text-default">{{ name }}</span>
          <UInput
            :ref="(el) => bindFirstVariableInputRef(el, index)"
            v-model="variableForm[name]"
            size="md"
            class="min-w-0 flex-1 max-w-[280px]"
            :placeholder="t('chat.input.promptLibrary.variableValuePlaceholder')"
            :ui="{ root: 'w-full' }"
          />
        </div>
      </div>
    </template>
    <template #footer>
      <UButton variant="outline" color="neutral" @click="variablesModalOpen = false">
        {{ t("common.cancel") }}
      </UButton>
      <UButton color="neutral" @click="confirmVariableInsert">
        {{ t("chat.input.promptLibrary.confirmInsert") }}
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { storeToRefs } from "pinia";
import UText from "@/components/UText.vue";
import { useSettingsStore, type PromptLibraryEntry } from "@/stores/useSettingsStore";

defineOptions({
  inheritAttrs: false
});

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  insert: [text: string];
  "before-open": [];
}>();

const { t } = useI18n();
const settingsStore = useSettingsStore();
const { promptLibraryEntries } = storeToRefs(settingsStore);

const searchQuery = ref("");

const PROMPT_VAR_RE = /\{\{\s*([^}]*?)\s*\}\}/g;

function parseVariableNames(content: string): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const re = new RegExp(PROMPT_VAR_RE.source, PROMPT_VAR_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const name = m[1].trim();
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    order.push(name);
  }
  return order;
}

function applyVariableReplacements(
  template: string,
  map: Record<string, string>
): string {
  return template.replace(/\{\{\s*([^}]*?)\s*\}\}/g, (full, inner: string) => {
    const key = inner.trim();
    if (!key) return "";
    if (!Object.prototype.hasOwnProperty.call(map, key)) return full;
    return map[key] ?? "";
  });
}

type VariableValueInputInstance = {
  inputRef?: HTMLInputElement | null;
};

const variablesModalOpen = ref(false);
const pendingTemplate = ref("");
const variableNames = ref<string[]>([]);
const variableForm = ref<Record<string, string>>({});
const firstVariableInputRef = ref<VariableValueInputInstance | null>(null);

function bindFirstVariableInputRef(el: unknown, index: number) {
  if (index !== 0) return;
  if (el && typeof el === "object" && "inputRef" in el) {
    firstVariableInputRef.value = el as VariableValueInputInstance;
  } else {
    firstVariableInputRef.value = null;
  }
}

const entries = computed(() => promptLibraryEntries.value);

function entryMatchesQuery(entry: PromptLibraryEntry, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const blob = [entry.title, entry.description, entry.content, ...entry.tags]
    .join("\n")
    .toLowerCase();
  return blob.includes(needle);
}

const filteredAll = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return entries.value;
  return entries.value.filter((e) => entryMatchesQuery(e, q));
});

const filteredFavorites = computed(() =>
  filteredAll.value.filter((e) => e.favorite)
);

const filteredOthers = computed(() =>
  filteredAll.value.filter((e) => !e.favorite)
);

function listItemSubtitle(item: PromptLibraryEntry) {
  const d = (item.description ?? "").trim();
  if (d) return d;
  const c = (item.content ?? "").trim();
  if (c) return c.slice(0, 160);
  return "—";
}

function pick(item: PromptLibraryEntry) {
  const raw = item.content ?? "";
  const names = parseVariableNames(raw);
  emit("update:open", false);
  if (names.length === 0) {
    emit("insert", raw);
    return;
  }
  pendingTemplate.value = raw;
  variableNames.value = names;
  variableForm.value = Object.fromEntries(names.map((n) => [n, ""]));
  variablesModalOpen.value = true;
}

function confirmVariableInsert() {
  const out = applyVariableReplacements(pendingTemplate.value, variableForm.value);
  emit("insert", out);
  variablesModalOpen.value = false;
}

function onUpdateOpen(value: boolean) {
  if (value) {
    void settingsStore.loadPromptLibrary();
  }
  emit("update:open", value);
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      searchQuery.value = "";
    }
  }
);

watch(variablesModalOpen, async (open) => {
  if (!open) {
    pendingTemplate.value = "";
    variableNames.value = [];
    variableForm.value = {};
    firstVariableInputRef.value = null;
    return;
  }
  await nextTick();
  setTimeout(() => {
    firstVariableInputRef.value?.inputRef?.focus();
  }, 50);
});
</script>
