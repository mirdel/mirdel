<template>
  <div class="h-full flex flex-col gap-0">
    <section v-if="applets.length === 0" class="flex-1 flex items-center justify-center bg-default rounded-xl">
      <UEmpty
        icon="i-lucide-layout-grid"
        :title="t('applet.emptyTitle')"
        :description="t('applet.emptyDescription')"
        :actions="[{ label: t('applet.new'), icon: 'i-lucide-plus', onClick: openNew }]"
        size="lg"
      />
    </section>

    <section v-else class="flex-1 min-w-0 h-full flex flex-col bg-default rounded-xl overflow-hidden p-5">
      <div class="flex items-center justify-between px-1 py-2">
        <div class="text-md font-medium text-default">{{ t("applet.listTitle") }}</div>
        <UButton icon="i-lucide-plus" size="md" variant="soft" color="neutral" @click="openNew">
          {{ t("applet.new") }}
        </UButton>
      </div>
      <div class="flex-1 min-h-0 overflow-auto p-2">
        <div class="grid grid-cols-3 gap-4">
          <div
            v-for="r in applets"
            :key="r.id"
            class="flex min-w-0 rounded-xl border border-default hover:border-default bg-default p-4 flex-row items-center gap-3"
          >
            <div class="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-elevated flex items-center justify-center">
              <img v-if="r.logo" :src="r.logo" alt="" loading="lazy" decoding="async" class="w-full h-full object-cover" />
              <UIcon v-else :name="r.type === 'web' ? 'i-lucide-globe' : 'i-lucide-app-window'" class="w-5 h-5 text-muted" />
            </div>
            <div class="min-w-0 flex-1 flex flex-col gap-0.5">
              <div class="flex items-center gap-2 min-w-0">
                <div class="text-sm font-medium truncate">{{ r.name }}</div>
                <UBadge
                  :label="t(r.type === 'web' ? 'applet.type.web' : 'applet.type.applet')"
                  variant="outline"
                  color="neutral"
                  size="sm"
                  class="shrink-0"
                />
                <UBadge
                  v-if="r.id.startsWith('__builtin_')"
                  :label="t('applet.builtin')"
                  variant="outline"
                  color="neutral"
                  size="sm"
                  class="shrink-0"
                />
              </div>
              <UText
                v-if="r.description"
                :text="r.description"
                content-class="w-full"
                text-class="text-xs text-muted"
              />
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <UButton size="sm" variant="soft" color="neutral" @click="openApplet(r.id)">
                {{ t("applet.open") }}
              </UButton>
              <UDropdownMenu :items="getMenuItems(r)" size="md">
                <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="sm" />
              </UDropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </section>

    <UModal
      v-model:open="showInfoEditor"
      :title="editingId ? t('applet.editTitle') : t('applet.createTitle')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <div class="flex flex-col gap-3">
          <UFormField v-if="!editingId" :label="t('applet.form.type')" required>
            <UTabs
              v-model="form.type"
              :items="appletTypeTabs"
              :content="false"
              color="neutral"
              variant="pill"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('applet.form.name')" required>
            <UInput ref="nameInputRef" v-model.trim="form.name" :placeholder="t('applet.form.namePlaceholder')" class="w-full" />
          </UFormField>
          <UFormField :label="t('applet.form.description')">
            <UInput v-model="form.description" :placeholder="t('applet.form.descriptionPlaceholder')" class="w-full" />
          </UFormField>
          <UFormField v-if="form.type === 'web'" :label="t('applet.form.webUrl')" :error="webUrlError" required>
            <UInput v-model.trim="form.webUrl" :placeholder="t('applet.form.webUrlPlaceholder')" class="w-full" />
          </UFormField>
          <UFormField :label="t('applet.form.logo')" :description="t('applet.form.logoDescription')" :error="logoError">
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
                <UIcon v-else :name="form.type === 'web' ? 'i-lucide-globe' : 'i-lucide-app-window'" class="w-6 h-6 text-muted" />
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
        <UButton variant="outline" color="neutral" @click="showInfoEditor = false">{{ t("common.cancel") }}</UButton>
        <UButton :disabled="isSaveDisabled()" @click="saveAppletInfo">{{ t("common.save") }}</UButton>
      </template>
    </UModal>

    <AppletFileEditorModal
      v-model:open="showFileEditor"
      :applet="editingAppletForFiles"
      @changed="load"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useConfirm } from "@/composables/useConfirm";
import { useMyToast } from "@/composables/useMyToast";
import AppletFileEditorModal from "@/components/applet/AppletFileEditorModal.vue";
import UText from "@/components/UText.vue";
import { useOpenedAppStore } from "@/stores/useOpenedAppStore";

type Applet = {
  id: string;
  type: "applet" | "web";
  name: string;
  description?: string;
  entryFile: string;
  webUrl?: string;
  logo?: string;
  createdAt: number;
  updatedAt: number;
};

const applets = ref<Applet[]>([]);
const showInfoEditor = ref(false);
const editingId = ref<string | null>(null);
const form = ref<{ type: "applet" | "web"; name: string; description: string; webUrl: string }>({
  type: "applet",
  name: "",
  description: "",
  webUrl: "",
});
const logoFile = ref<File | null>(null);
const logoPreviewBase64 = ref("");
const logoError = ref<string | undefined>(undefined);
const webUrlError = ref<string | undefined>(undefined);
const logoTouched = ref(false);
const nameInputRef = ref<{ $el?: HTMLElement } | null>(null);

const showFileEditor = ref(false);
const editingAppletForFiles = ref<Applet | null>(null);

const { confirm } = useConfirm();
const toast = useMyToast();
const { t } = useI18n();
const router = useRouter();
const openedAppStore = useOpenedAppStore();

const LOGO_ACCEPTED_TYPES = ["image/svg+xml", "image/png", "image/jpeg", "image/jpg"];
const LOGO_MAX_SIZE = 1024 * 1024; // 1MB
const appletTypeTabs = computed(() => [
  { label: t("applet.type.applet"), icon: "i-lucide-app-window", value: "applet" },
  { label: t("applet.type.web"), icon: "i-lucide-globe", value: "web" },
]);

function normalizeWebUrlInput(input: string): string | undefined {
  const raw = input.trim();
  if (!raw) return undefined;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function validateLogoFile(file: File): string | undefined {
  if (!LOGO_ACCEPTED_TYPES.includes(file.type)) {
    return t("applet.logo.invalidType");
  }
  if (file.size > LOGO_MAX_SIZE) {
    return t("applet.logo.sizeExceeded");
  }
  return undefined;
}

watch(showInfoEditor, (open) => {
  if (open) {
    nextTick(() => {
      const el = nameInputRef.value?.$el;
      const input = el?.tagName === "INPUT" ? el : el?.querySelector?.("input");
      (input as HTMLInputElement)?.focus?.();
    });
  }
});

watch(showFileEditor, (open) => {
  if (!open) {
    editingAppletForFiles.value = null;
  }
});

watch(
  () => [form.value.type, form.value.webUrl],
  () => {
    webUrlError.value = undefined;
  }
);

watch(logoFile, async (next, prev) => {
  if (!next) {
    return;
  }
  logoTouched.value = true;
  const err = validateLogoFile(next);
  if (err) {
    logoError.value = err;
    logoFile.value = null;
    toast.error({ title: t("applet.logo.validationFailed"), description: err });
    return;
  }
  logoError.value = undefined;
  logoPreviewBase64.value = await fileToBase64(next);
});

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clearLogo(removeFile: (index?: number) => void) {
  logoTouched.value = true;
  removeFile();
  logoPreviewBase64.value = "";
  logoError.value = undefined;
}

async function load() {
  const list = await window.ipc("applet:list");
  applets.value = list ?? [];
}

function openNew() {
  editingId.value = null;
  logoFile.value = null;
  logoPreviewBase64.value = "";
  logoError.value = undefined;
  webUrlError.value = undefined;
  logoTouched.value = false;
  form.value = { type: "applet", name: "", description: "", webUrl: "" };
  showInfoEditor.value = true;
}

function getMenuItems(r: Applet) {
  const items = [
    {
      label: t("applet.menu.edit"),
      icon: "i-lucide-pencil",
      onClick: () => editAppletInfo(r),
    },
  ];
  if (r.type !== "web") {
    items.push({
      label: t("applet.menu.editCode"),
      icon: "i-lucide-code",
      onClick: () => openFileEditor(r),
    });
  }
  if (!r.id.startsWith("__builtin_")) {
    items.push({
      label: t("common.delete"),
      icon: "i-lucide-trash-2",
      color: "error",
      onClick: () => deleteApplet(r),
    });
  }
  return items;
}

function editAppletInfo(r: Applet) {
  editingId.value = r.id;
  logoFile.value = null;
  logoPreviewBase64.value = r.logo ?? "";
  logoError.value = undefined;
  webUrlError.value = undefined;
  logoTouched.value = false;
  form.value = { type: r.type, name: r.name, description: r.description ?? "", webUrl: r.webUrl ?? "" };
  showInfoEditor.value = true;
}

function isSaveDisabled() {
  if (!form.value.name.trim() || logoError.value) return true;
  if (form.value.type === "web" && !form.value.webUrl.trim()) return true;
  return false;
}

async function saveAppletInfo() {
  if (logoError.value) return;
  const name = form.value.name.trim();
  const webUrl = form.value.type === "web" ? normalizeWebUrlInput(form.value.webUrl) : undefined;
  if (form.value.type === "web" && !webUrl) {
    webUrlError.value = t("applet.webUrl.invalid");
    return;
  }
  let logo: string | undefined;
  if (logoFile.value) {
    logo = await fileToBase64(logoFile.value);
  } else if (editingId.value && logoTouched.value && !logoPreviewBase64.value) {
    logo = "";
  } else {
    logo = undefined;
  }

  if (editingId.value) {
    const updated = await window.ipc("applet:update", {
      id: editingId.value,
      name,
      description: form.value.description || undefined,
      logo,
      webUrl,
    });
    if (updated) {
      openedAppStore.upsertApplet(updated);
    }
    showInfoEditor.value = false;
    await load();
    return;
  }

  const created = await window.ipc("applet:create", {
    type: form.value.type,
    name,
    description: form.value.description || undefined,
    logo: logoFile.value ? logo : undefined,
    entryFile: "main.tsx",
    webUrl,
  });

  showInfoEditor.value = false;
  await load();

  if (created?.id && created.type !== "web") {
    openFileEditor(created as Applet);
  }
}

function openFileEditor(applet: Applet) {
  if (applet.type === "web") return;
  editingAppletForFiles.value = applet;
  showFileEditor.value = true;
}

async function openApplet(id: string) {
  const applet = await openedAppStore.openApplet(id);
  if (!applet) return;
  await router.push({ name: "app-workspace", params: { id } });
}

async function deleteApplet(r: Applet) {
  const confirmed = await confirm({
    title: t("applet.deleteConfirmTitle"),
    content: t("applet.deleteConfirmContent", { name: r.name }),
    confirmText: t("common.delete"),
    cancelText: t("common.cancel"),
    confirmColor: "error",
  });
  if (!confirmed) return;
  await openedAppStore.closeApplet(r.id);
  await window.ipc("applet:delete", { id: r.id });
  await load();
}

onMounted(() => {
  void load();
});
</script>
