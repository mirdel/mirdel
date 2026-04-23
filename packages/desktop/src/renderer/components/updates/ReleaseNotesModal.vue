<template>
  <UModal
    v-model:open="updateStore.releaseNotesModalOpen"
    :close="false"
    :dismissible="false"
    :ui="{
      content: 'max-w-2xl',
      body: 'max-h-[60vh] overflow-y-auto',
      footer: 'justify-end'
    }"
  >
    <template #header>
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-party-popper" class="size-5 text-primary" />
        <div>
          <div class="text-base font-semibold text-default">
            {{ t("updates.releaseNotes.title", { version }) }}
          </div>
          <div v-if="notes?.date" class="text-xs text-muted mt-1">
            {{ notes.date }}
          </div>
        </div>
      </div>
    </template>

    <template #body>
      <div v-if="notes?.sections.length" class="space-y-5">
        <section
          v-for="section in notes.sections"
          :key="section.title"
          class="space-y-2"
        >
          <h3 class="text-sm font-medium text-default">{{ section.title }}</h3>
          <ul class="space-y-1.5 text-sm leading-6 text-toned">
            <li
              v-for="item in section.items"
              :key="item"
              class="flex gap-2"
            >
              <span class="mt-[0.6em] size-1.5 rounded-full bg-primary shrink-0"></span>
              <span>{{ item }}</span>
            </li>
          </ul>
        </section>
      </div>
      <UEmpty
        v-else
        icon="i-lucide-file-text"
        :title="t('updates.releaseNotes.emptyTitle')"
        :description="t('updates.releaseNotes.emptyDescription')"
      />
    </template>

    <template #footer>
      <UButton @click="updateStore.markPendingReleaseNotesSeen">
        {{ t("common.close") }}
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useUpdateStore } from "@/stores/useUpdateStore";

const { t } = useI18n();
const updateStore = useUpdateStore();
const version = computed(() => updateStore.pendingReleaseNotes?.version || "");
const notes = computed(() => updateStore.pendingReleaseNotes?.notes || null);
</script>
