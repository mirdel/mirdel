<template>
  <!-- app-drag: 让第一列整体可拖拽窗口；可点击元素需 app-no-drag -->
  <div class="w-16 h-screen flex flex-col items-center py-3 app-drag">
    <!-- 顶部固定区域：traffic lights + Logo -->
    <div class="flex flex-col items-center gap-2 shrink-0">
      <div class="h-7 w-full"></div>
      <div
        class="size-8 text-primary app-no-drag"
        v-html="mirdelLogoSvg"
      ></div>
    </div>

    <!-- 可滚动的导航区域 -->
    <div class="flex-1 min-h-0 overflow-y-auto mt-2 w-full scrollbar-hide app-no-drag">
      <div class="flex flex-col items-center gap-1">
        <div
          v-for="item in topItems"
          :key="item.key"
          class="flex flex-col items-center justify-center gap-0.5 w-14 h-11 rounded-lg text-neutral-50 cursor-pointer transition-all app-no-drag shrink-0"
          :class="[
            isActive(item.to)
              ? 'bg-neutral-500'
              : 'hover:bg-neutral-500/70',
            item.disabled && 'opacity-40 cursor-not-allowed'
          ]"
          @click="onClick(item)"
        >
          <UIcon :name="item.icon" class="text-md" />
          <span class="text-[11px] font-medium mt-0.5 leading-none">{{ item.label }}</span>
        </div>
      </div>
    </div>

    <!-- 底部固定区域：搜索 + 主题切换 + 设置 -->
    <div class="flex flex-col items-center gap-1 shrink-0 mt-2">
      <UTooltip :text="t('tooltip.globalSearch')" :kbds="searchShortcutKbds" :content="{ side: 'right' }">
        <div
          class="size-8 flex items-center justify-center app-no-drag mb-2 rounded-full bg-neutral-400/30 hover:bg-neutral-400/80 cursor-pointer"
          @click="emit('open-search')"
        >
          <UIcon name="i-lucide-search" class="size-4 text-neutral-50" />
        </div>
      </UTooltip>

      <UTooltip :text="themeTooltipText" :content="{ side: 'right' }">
        <div
          ref="themeButtonRef"
          class="size-8 flex items-center justify-center app-no-drag mb-2 rounded-full bg-neutral-400/30 hover:bg-neutral-400/80 cursor-pointer"
          @click="cycleTheme"
        >
          <UIcon :name="themeIcon" class="size-4 text-neutral-50" />
        </div>
      </UTooltip>

      <div
        v-for="item in bottomItems"
        :key="item.key"
        class="flex flex-col items-center justify-center gap-0.5 w-14 h-11 rounded-lg text-neutral-50 cursor-pointer transition-all app-no-drag shrink-0"
        :class="[
          isActive(item.to)
            ? 'bg-neutral-500'
            : 'hover:bg-neutral-500/70',
          item.disabled && 'opacity-40 cursor-not-allowed'
        ]"
        @click="onClick(item)"
      >
        <UIcon :name="item.icon" class="text-md" />
        <span class="text-[11px] font-medium mt-0.5 leading-none">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAppColorModeState } from "@/composables/useAppColorModeState";
import { useRouteMemory } from "@/composables/useRouteMemory";
import mirdelLogoSvgRaw from "@/assets/mirdel.svg?raw";

const emit = defineEmits<{
  (e: "open-search"): void;
}>();
const { t } = useI18n();
const mirdelLogoSvg = mirdelLogoSvgRaw;

// VueUse useColorMode: store 为 "auto"|"light"|"dark"，对应 system|light|dark
const { colorMode } = useAppColorModeState();
const themeButtonRef = ref<HTMLElement>();
const themeIcon = computed(() => {
  const val = colorMode.store.value;
  if (val === "auto") return "i-proicons:dark-theme";
  return val === "dark" ? "i-lucide-moon" : "i-lucide-sun";
});
const themeTooltipText = computed(() => {
  const val = colorMode.store.value;
  if (val === "auto") return t("theme.followSystem");
  return val === "dark" ? t("theme.dark") : t("theme.light");
});
function cycleTheme() {
  const next = colorMode.store.value === "auto" ? "light" : colorMode.store.value === "light" ? "dark" : "auto";
  const hasTransition =
    themeButtonRef.value &&
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!hasTransition) {
    colorMode.store.value = next;
    return;
  }
  const { top, left, width, height } = themeButtonRef.value.getBoundingClientRect();
  const x = left + width / 2;
  const y = top + height / 2;
  const maxRadius = Math.hypot(
    Math.max(left, window.innerWidth - left),
    Math.max(top, window.innerHeight - top)
  );
  document.startViewTransition(() => {
    colorMode.store.value = next;
  }).ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRadius}px at ${x}px ${y}px)`],
      },
      {
        duration: 800,
        easing: "ease-in-out",
        pseudoElement: "::view-transition-new(root)",
      }
    );
  });
}

type NavItem = {
  key: string;
  label: string;
  icon: string;
  to?: string;
  disabled?: boolean;
};

const route = useRoute();
const router = useRouter();
const { resolve } = useRouteMemory();
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const searchShortcutKbds = computed(() => (isMac ? ["meta", "K"] : ["ctrl", "K"]));

const topItems = computed<NavItem[]>(() => [
  { key: "chat", label: t("nav.chat"), icon: "i-lucide-message-square", to: "/chat" },
  { key: "images", label: t("nav.images"), icon: "i-lucide-image-up", to: "/images" },
  { key: "videos", label: t("nav.videos"), icon: "i-lucide-clapperboard", to: "/videos" },
  { key: "translate", label: t("nav.translate"), icon: "i-lucide-languages", to: "/translate" },
  { key: "knowledge", label: t("nav.knowledge"), icon: "i-lucide-book-search", to: "/knowledge" },
  { key: "notes", label: t("nav.notes"), icon: "i-lucide-notebook-pen", to: "/notes" },
  { key: "applet", label: t("nav.applet"), icon: "i-lucide-layout-grid", to: "/applet" },
]);

const bottomItems = computed<NavItem[]>(() => [
  { key: "settings", label: t("nav.settings"), icon: "i-lucide-settings-2", to: "/settings" }
]);

const isActive = (to?: string) => {
  if (!to) return false;
  return route.path === to || route.path.startsWith(`${to}/`);
};

const onClick = async (item: NavItem) => {
  if (item.disabled || !item.to) return;
  const target = resolve(item.to);
  if (route.path === target) return;
  await router.push(target);
};
</script>
