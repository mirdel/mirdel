<template>
  <section class="flex-1 min-w-0 bg-default rounded-xl overflow-y-auto">
    <div class="min-h-full px-6 py-10">
      <div class="mx-auto w-full max-w-3xl flex flex-col items-center text-center">
        <div
          class="size-28 text-primary"
          v-html="mirdelIconSvg"
        ></div>

        <div class="mt-6 flex flex-col items-center gap-3">
          <h1 class="text-3xl font-semibold text-default leading-tight">Mirdel</h1>
          <p class="text-lg text-toned leading-8">{{ t("settings.about.tagline") }}</p>
          <div class="flex flex-wrap items-center justify-center gap-2">
            <UBadge color="neutral" variant="soft" size="md">
              {{ t("settings.about.version", { version: appVersion }) }}
            </UBadge>
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :loading="updateStore.checking || updateStore.downloading"
              @click="handleUpdateAction"
            >
              {{ updateButtonLabel }}
            </UButton>
          </div>
          <p v-if="updateStatusText" class="text-sm text-muted leading-6">
            {{ updateStatusText }}
          </p>
        </div>

        <div class="mt-10 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          <UButton
            v-for="item in linkItems"
            :key="item.url"
            block
            size="lg"
            color="neutral"
            variant="outline"
            :icon="item.icon"
            trailing-icon="i-lucide-external-link"
            @click="openLink(item.url)"
          >
            {{ item.label }}
          </UButton>
        </div>

        <p class="mt-8 text-sm text-muted leading-6">
          {{ t("settings.about.copyright") }}
        </p>
      </div>

      <div class="mx-auto mt-12 w-full max-w-3xl text-left">
        <div class="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-default">{{ t("settings.about.changelogTitle") }}</h2>
            <p class="text-sm text-muted mt-1">{{ t("settings.about.changelogDescription") }}</p>
          </div>
        </div>

        <UTimeline
          v-if="timelineItems.length"
          color="neutral"
          size="sm"
          :items="timelineItems"
          :ui="{ root: 'w-full' }"
        >
          <template #description="{ item }">
            <div class="mt-3 space-y-4">
              <section
                v-for="section in item.raw.sections"
                :key="section.title"
                class="space-y-2"
              >
                <h3 class="text-sm font-medium text-default">{{ section.title }}</h3>
                <ul class="space-y-1.5 text-sm leading-6 text-toned">
                  <li
                    v-for="entry in section.items"
                    :key="entry"
                    class="flex gap-2"
                  >
                    <span class="mt-[0.6em] size-1.5 rounded-full bg-primary shrink-0"></span>
                    <span>{{ entry }}</span>
                  </li>
                </ul>
              </section>
            </div>
          </template>
        </UTimeline>
        <UEmpty
          v-else
          icon="i-lucide-file-text"
          :title="t('settings.about.changelogEmptyTitle')"
          :description="t('settings.about.changelogEmptyDescription')"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { TimelineItem } from "@nuxt/ui";
import mirdelIconSvgRaw from "@/assets/mirdel-icon.svg?raw";
import { APP_LINKS } from "@/config/app-links";
import { useUpdateStore } from "@/stores/useUpdateStore";
import { useMyToast } from "@/composables/useMyToast";
import desktopPackage from "../../../../package.json";

const { t } = useI18n();
const toast = useMyToast();
const updateStore = useUpdateStore();
const mirdelIconSvg = mirdelIconSvgRaw;
const appVersion = desktopPackage.version;

type ChangelogItem = TimelineItem & {
  raw: typeof updateStore.changelog[number];
};

const linkItems = computed(() => [
  {
    label: t("settings.about.website"),
    icon: "i-lucide-globe",
    url: APP_LINKS.website
  },
  {
    label: t("settings.about.github"),
    icon: "i-lucide-code-xml",
    url: APP_LINKS.github
  },
  {
    label: t("settings.about.releases"),
    icon: "i-lucide-notepad-text",
    url: APP_LINKS.releases
  },
  {
    label: t("settings.about.issues"),
    icon: "i-lucide-bug",
    url: APP_LINKS.issues
  }
]);

const updateButtonLabel = computed(() => {
  if (updateStore.state.status === "checking") return t("updates.status.checking");
  if (updateStore.state.status === "downloading") {
    return t("updates.status.downloading", { percent: Math.round(updateStore.progressPercent) });
  }
  if (updateStore.updateReady) return t("updates.status.restartToUpdate");
  return t("updates.check");
});

const updateStatusText = computed(() => {
  if (updateStore.state.status === "not-available") return t("updates.status.upToDate");
  if (updateStore.state.status === "available") {
    return t("updates.status.available", { version: updateStore.targetVersion || "" });
  }
  if (updateStore.state.status === "error" && updateStore.state.error) {
    return t("updates.checkFailed");
  }
  if (!updateStore.state.isPackaged) return t("updates.status.devMode");
  return "";
});

const timelineItems = computed<ChangelogItem[]>(() =>
  updateStore.changelog.map((item) => ({
    value: item.version,
    title: `Mirdel ${item.version}`,
    date: item.date || "",
    icon: "i-lucide-history",
    raw: item,
  }))
);

function openLink(url: string) {
  window.webPreview.open(url);
}

async function handleUpdateAction() {
  if (updateStore.updateReady) {
    updateStore.openRestartModal();
    return;
  }

  try {
    await updateStore.checkForUpdates();
    if (updateStore.state.status === "not-available") {
      toast.success({ title: t("updates.status.upToDate") });
    }
  } catch (error) {
    toast.error({
      title: t("updates.checkFailed"),
    });
  }
}
</script>
