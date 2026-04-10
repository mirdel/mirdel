<template>
  <UModal
    v-model:open="isOpen"
    :title="editProvider ? t('settings.customProvider.editTitle') : t('settings.customProvider.createTitle')"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField :label="t('settings.customProvider.name')" required>
          <UInput
            v-model="form.name"
            :placeholder="t('settings.customProvider.namePlaceholder')"
            class="w-full"
            autofocus
          />
        </UFormField>

        <UFormField :label="t('settings.customProvider.type')" required>
          <USelect
            v-model="form.type"
            :items="typeOptions"
            value-key="value"
            :placeholder="t('settings.customProvider.typePlaceholder')"
            class="w-full"
          />
        </UFormField>

        <UFormField
          :label="t('settings.customProvider.logo')"
          :description="t('settings.customProvider.logoDescription')"
          :error="logoError"
        >
          <UFileUpload
            v-slot="{ open, removeFile }"
            v-model="logoFile"
            accept="image/svg+xml,image/png,image/jpeg,image/jpg"
            :preview="false"
          >
            <div
              class="relative w-20 h-20 flex items-center justify-center overflow-hidden rounded-lg bg-default border border-dashed border-default shrink-0 cursor-pointer hover:bg-elevated/25 transition-[background]"
              @click="open()"
            >
              <img v-if="logoPreviewBase64" :src="logoPreviewBase64" alt="" class="w-full h-full object-cover" />
              <UIcon v-else name="i-lucide-image" class="w-6 h-6 text-muted" />
              <button
                v-if="logoPreviewBase64"
                type="button"
                class="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                @click.stop="clearLogo(removeFile)"
              >
                <UIcon name="i-lucide-x" class="w-3 h-3" />
              </button>
            </div>
          </UFileUpload>
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="outline" color="neutral" @click="close">{{ t('common.cancel') }}</UButton>
        <UButton @click="submit" :disabled="!canSubmit">
          {{ editProvider ? t('common.save') : t('settings.customProvider.add') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { ProviderType } from "@shared";
import { useProviderLogo } from "@/composables/useProviderLogo";
import { useMyToast } from "@/composables/useMyToast";

const props = defineProps<{
  open: boolean;
  editProvider?: { id: string; name: string; type: ProviderType; logo?: string } | null;
}>();

const emit = defineEmits<{
  (e: "update:open", v: boolean): void;
  (
    e: "submit",
    data:
      | { name: string; logo?: string; type: ProviderType; baseUrl: string; apiKey?: string; customHeaders?: Record<string, string>; providerOptionsDefaults?: Record<string, unknown>; enabled: boolean }
      | { id: string; name: string; logo?: string; type: ProviderType }
  ): void;
}>();

const typeOptions = [
  { value: "openai-compatible" as ProviderType, label: "OpenAI Compatible" },
  { value: "anthropic" as ProviderType, label: "Anthropic" },
  { value: "google-generative-ai" as ProviderType, label: "Google AI" },
];

const isOpen = computed({
  get: () => props.open,
  set: (v) => emit("update:open", v),
});

const form = ref({
  name: "",
  type: "openai-compatible" as ProviderType,
});

const logoFile = ref<File | null>(null);
const logoPreviewBase64 = ref("");
const logoError = ref<string | undefined>(undefined);
const { t } = useI18n();
const toast = useMyToast();
const { providerLogoUrl } = useProviderLogo();

const LOGO_ACCEPTED_TYPES = ["image/svg+xml", "image/png", "image/jpeg", "image/jpg"];
const LOGO_MAX_SIZE = 1024 * 1024; // 1MB

function validateLogoFile(file: File): string | undefined {
  if (!LOGO_ACCEPTED_TYPES.includes(file.type)) {
    return t("settings.customProvider.logoInvalidType");
  }
  if (file.size > LOGO_MAX_SIZE) {
    return t("settings.customProvider.logoSizeExceeded");
  }
  return undefined;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

watch(logoFile, async (next, prev) => {
  if (prev && !next) {
    logoPreviewBase64.value = "";
    logoError.value = undefined;
  }
  if (!next) {
    logoPreviewBase64.value = "";
    return;
  }
  const err = validateLogoFile(next);
  if (err) {
    logoError.value = err;
    logoFile.value = null;
    logoPreviewBase64.value = "";
    toast.error({ title: t("settings.customProvider.logoValidationFailed"), description: err });
    return;
  }
  logoError.value = undefined;
  logoPreviewBase64.value = await fileToBase64(next);
});

function clearLogo(removeFile: (index?: number) => void) {
  removeFile();
  logoPreviewBase64.value = "";
  logoError.value = undefined;
}

const canSubmit = computed(() => Boolean(form.value.name?.trim()) && !logoError.value);

function close() {
  isOpen.value = false;
}

async function submit() {
  if (!canSubmit.value || logoError.value) return;
  const name = form.value.name.trim();
  let logo: string | undefined;
  if (logoFile.value) {
    logo = await fileToBase64(logoFile.value);
  } else if (logoPreviewBase64.value) {
    logo =
      props.editProvider?.logo && !props.editProvider.logo.startsWith("data:")
        ? props.editProvider.logo
        : logoPreviewBase64.value;
  } else {
    logo = undefined;
  }
  const type = form.value.type;

  if (props.editProvider) {
    emit("submit", { id: props.editProvider.id, name, logo, type });
  } else {
    emit("submit", {
      name,
      logo,
      type,
      baseUrl: "",
      apiKey: undefined,
      customHeaders: undefined,
      providerOptionsDefaults: undefined,
      enabled: false,
    });
  }
  close();
}

watch(
  () => [props.open, props.editProvider] as const,
  ([open, edit]) => {
    if (open) {
      if (edit) {
        form.value = { name: edit.name, type: edit.type };
        logoFile.value = null;
        logoPreviewBase64.value = edit.logo?.startsWith("data:") ? edit.logo : (providerLogoUrl(edit.logo) || "");
        logoError.value = undefined;
      } else {
        form.value = { name: "", type: "openai-compatible" };
        logoFile.value = null;
        logoPreviewBase64.value = "";
        logoError.value = undefined;
      }
    }
  }
);
</script>
