<template>
  <UModal
    v-model:open="updateStore.restartModalOpen"
    :ui="{
      content: 'max-w-md',
      footer: 'justify-end gap-3'
    }"
  >
    <template #header>
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-download-check" class="size-5 text-primary" />
        <div class="text-base font-semibold text-default">
          {{ t("updates.ready.title") }}
        </div>
      </div>
    </template>

    <template #body>
      <p class="text-sm leading-6 text-toned">
        {{ t("updates.ready.description", { version: updateStore.targetVersion || "" }) }}
      </p>
    </template>

    <template #footer>
      <UButton color="neutral" variant="outline" @click="updateStore.closeRestartModal">
        {{ t("updates.ready.later") }}
      </UButton>
      <UButton :loading="installing" @click="handleRestart">
        {{ t("updates.ready.restartNow") }}
      </UButton>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useUpdateStore } from "@/stores/useUpdateStore";
import { useMyToast } from "@/composables/useMyToast";

const { t } = useI18n();
const toast = useMyToast();
const updateStore = useUpdateStore();
const installing = ref(false);

async function handleRestart() {
  installing.value = true;
  try {
    await updateStore.installUpdate();
  } catch (error) {
    installing.value = false;
    toast.error({
      title: t("updates.installFailed"),
      description: error instanceof Error ? error.message : String(error),
    });
  }
}
</script>
