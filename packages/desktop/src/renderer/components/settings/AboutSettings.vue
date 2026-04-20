<template>
  <section class="flex-1 min-w-0 bg-default rounded-xl overflow-y-auto">
    <div class="min-h-full px-6 py-12 flex items-center justify-center">
      <div class="w-full max-w-lg flex flex-col items-center text-center">
        <div
          class="size-28 text-primary"
          v-html="mirdelIconSvg"
        ></div>

        <div class="mt-6 flex flex-col items-center gap-3">
          <h1 class="text-3xl font-semibold text-default leading-tight">Mirdel</h1>
          <p class="text-lg text-toned leading-8">{{ t("settings.about.tagline") }}</p>
          <UBadge color="neutral" variant="soft" size="md">
            {{ t("settings.about.version", { version: appVersion }) }}
          </UBadge>
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
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import mirdelIconSvgRaw from "@/assets/mirdel-icon.svg?raw";
import { APP_LINKS } from "@/config/app-links";
import desktopPackage from "../../../../package.json";

const { t } = useI18n();
const mirdelIconSvg = mirdelIconSvgRaw;
const appVersion = desktopPackage.version;

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

function openLink(url: string) {
  window.webPreview.open(url);
}
</script>
