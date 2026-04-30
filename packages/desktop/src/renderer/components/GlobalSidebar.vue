<template>
  <!-- app-drag: 让第一列整体可拖拽窗口；可点击元素需 app-no-drag -->
  <div class="w-16 h-screen flex flex-col items-center py-1.5 app-drag select-none">
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
          v-for="item in visibleTopItems"
          :key="item.key"
          class="relative w-14 shrink-0"
          :draggable="item.key !== FIXED_NAV_KEY"
          @contextmenu.stop.prevent="openVisibleNavContextMenu($event, item)"
          @dragstart="onNavDragStart($event, item)"
          @dragover="onNavDragOver($event, item)"
          @dragleave="onNavDragLeave(item)"
          @drop="onNavDrop($event, item)"
          @dragend="onNavDragEnd"
        >
          <div
            v-if="getDropIndicator(item.key) === 'before'"
            class="pointer-events-none absolute -top-0.5 left-2 right-2 z-10 h-0.5 rounded-full bg-primary"
          ></div>
          <div
            class="flex h-11 w-14 flex-col items-center justify-center gap-0.5 rounded-lg text-neutral-50 cursor-pointer transition-all app-no-drag"
            :class="[
              isActive(item.to)
                ? 'bg-neutral-500'
                : 'hover:bg-neutral-500/70',
              draggedNavKey === item.key && 'opacity-45',
              item.disabled && 'opacity-40 cursor-not-allowed'
            ]"
            @click="onClick(item)"
          >
            <UIcon :name="item.icon" class="text-md" />
            <span class="text-[11px] font-medium mt-0.5 leading-none">{{ item.label }}</span>
          </div>
          <div
            v-if="getDropIndicator(item.key) === 'after'"
            class="pointer-events-none absolute -bottom-0.5 left-2 right-2 z-10 h-0.5 rounded-full bg-primary"
          ></div>
        </div>

        <template v-if="moreTopItems.length > 0">
          <div
            class="flex flex-col items-center justify-center gap-0.5 w-14 h-11 rounded-lg text-neutral-50 cursor-pointer transition-all app-no-drag shrink-0"
            :class="isMoreActive || isMoreExpanded ? 'bg-neutral-500' : 'hover:bg-neutral-500/70'"
            @click="toggleMoreExpanded"
          >
            <UIcon :name="isMoreExpanded ? 'i-lucide-circle-arrow-down' : 'i-lucide-ellipsis'" class="text-md" />
            <span class="text-[11px] font-medium mt-0.5 leading-none">{{ t("nav.more") }}</span>
          </div>

          <Transition name="sidebar-more">
            <div v-if="isMoreExpanded" class="flex flex-col items-center gap-1 overflow-hidden">
              <div
                v-for="item in moreTopItems"
                :key="item.key"
                class="flex h-11 w-14 flex-col items-center justify-center gap-0.5 rounded-lg text-neutral-50 cursor-pointer transition-all app-no-drag shrink-0"
                :class="isActive(item.to) ? 'bg-neutral-500' : 'hover:bg-neutral-500/70'"
                @click="onClick(item)"
                @contextmenu.stop.prevent="openMoreNavContextMenu($event, item)"
              >
                <UIcon :name="item.icon" class="text-md" />
                <span class="text-[11px] font-medium mt-0.5 leading-none">{{ item.label }}</span>
              </div>
            </div>
          </Transition>
        </template>

        <div v-if="openedAppStore.openedApplets.length > 0" class="w-8 h-px my-2 bg-neutral-400/40 shrink-0"></div>

        <div
          v-for="applet in openedAppStore.openedApplets"
          :key="applet.id"
          class="group relative flex flex-col items-center justify-center gap-0.5 w-14 h-11 rounded-lg text-neutral-50 cursor-pointer transition-all app-no-drag shrink-0"
          :class="isActiveApplet(applet.id) ? 'bg-neutral-500' : 'hover:bg-neutral-500/70'"
          @click="openApplet(applet.id)"
        >
          <div class="size-4 overflow-hidden flex items-center justify-center">
            <img
              v-if="applet.logo"
              :src="applet.logo"
              alt=""
              loading="lazy"
              decoding="async"
              class="size-full rounded-sm object-cover"
            />
            <UIcon v-else :name="applet.type === 'web' ? 'i-lucide-globe' : 'i-lucide-app-window'" class="text-md" />
          </div>
          <span class="max-w-12 truncate text-center text-[11px] font-medium mt-0.5 leading-none">{{ applet.name }}</span>
          <UTooltip :text="t('nav.closeApplet', { name: applet.name })" :content="{ side: 'right' }">
            <button
              type="button"
              class="absolute top-0.5 right-0.5 size-4 rounded-full bg-neutral-500/95 text-neutral-50 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:bg-neutral-400"
              @click.stop="closeOpenedApplet(applet.id)"
            >
              <UIcon name="i-lucide-x" class="mx-auto size-3" />
            </button>
          </UTooltip>
        </div>
      </div>
    </div>

    <!-- 底部固定区域：搜索 + 主题切换 + 设置 -->
    <div class="flex flex-col items-center gap-1 shrink-0 mt-2">
      <UTooltip
        v-if="updateStore.updateReady"
        :disabled="disableBottomNavTooltips"
        :text="t('updates.sidebar.ready')"
        :content="{ side: 'right' }"
      >
        <div
          class="size-8 flex items-center justify-center app-no-drag mb-2 rounded-full bg-primary hover:bg-primary/90 cursor-pointer shadow-sm"
          @click="updateStore.openRestartModal"
        >
          <UIcon name="i-lucide-refresh-cw" class="size-4 text-white" />
        </div>
      </UTooltip>

      <UTooltip
        :disabled="disableBottomNavTooltips"
        :text="t('tooltip.globalSearch')"
        :kbds="searchShortcutKbds"
        :content="{ side: 'right' }"
      >
        <div
          class="size-8 flex items-center justify-center app-no-drag mb-2 rounded-full bg-neutral-400/30 hover:bg-neutral-400/80 cursor-pointer"
          @click="emit('open-search')"
        >
          <UIcon name="i-lucide-search" class="size-4 text-neutral-50" />
        </div>
      </UTooltip>

      <UTooltip
        :disabled="disableBottomNavTooltips"
        :text="themeTooltipText"
        :content="{ side: 'right' }"
      >
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
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAppColorModeState } from "@/composables/useAppColorModeState";
import { useRouteMemory } from "@/composables/useRouteMemory";
import { useOpenedAppStore } from "@/stores/useOpenedAppStore";
import { useUpdateStore } from "@/stores/useUpdateStore";
import { usePersistentState } from "@/utils/persistentState";
import mirdelLogoSvgRaw from "@/assets/mirdel.svg?raw";

const emit = defineEmits<{
  (e: "open-search"): void;
}>();
const { t } = useI18n();
const updateStore = useUpdateStore();
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

type SidebarNavLayout = {
  visible: string[];
  more: string[];
};

const FIXED_NAV_KEY = "chat";
const SIDEBAR_NAV_LAYOUT_STORAGE_KEY = "mirdel.sidebarNavLayout";
const DEFAULT_TOP_NAV_KEYS = ["chat", "images", "videos", "translate", "knowledge", "notes", "applet"];

function createDefaultNavLayout(): SidebarNavLayout {
  return {
    visible: [...DEFAULT_TOP_NAV_KEYS],
    more: [],
  };
}

const route = useRoute();
const router = useRouter();
const { resolve } = useRouteMemory();
const openedAppStore = useOpenedAppStore();
const navLayout = usePersistentState<SidebarNavLayout>(SIDEBAR_NAV_LAYOUT_STORAGE_KEY, createDefaultNavLayout());
const isMoreExpanded = ref(false);
const draggedNavKey = ref<string | null>(null);
const dragOverKey = ref<string | null>(null);
const dragOverPosition = ref<"before" | "after">("before");
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const searchShortcutKbds = computed(() => (isMac ? ["meta", "K"] : ["ctrl", "K"]));

const topItems = computed<NavItem[]>(() => [
  { key: "chat", label: t("nav.chat"), icon: "i-lucide-message-square", to: "/chat" },
  // { key: "ai-search", label: t("nav.aiSearch"), icon: "i-mingcute-search-ai-line", to: "/ai-search" },
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

const topItemMap = computed(() => new Map(topItems.value.map((item) => [item.key, item])));
const normalizedNavLayout = computed(() => normalizeNavLayout(navLayout.value));
const visibleTopItems = computed(() => mapNavKeysToItems(normalizedNavLayout.value.visible));
const moreTopItems = computed(() => mapNavKeysToItems(normalizedNavLayout.value.more));
const isMoreActive = computed(() => moreTopItems.value.some((item) => isActive(item.to)));

function normalizeNavLayout(layout: SidebarNavLayout): SidebarNavLayout {
  const knownKeys = topItems.value.map((item) => item.key);
  const knownKeySet = new Set(knownKeys);
  const rawVisible = Array.isArray(layout?.visible) ? layout.visible : [];
  const rawMore = Array.isArray(layout?.more) ? layout.more : [];
  const visible = dedupeNavKeys(rawVisible.filter((key) => key !== FIXED_NAV_KEY && knownKeySet.has(key)));
  const more = dedupeNavKeys(rawMore.filter((key) => key !== FIXED_NAV_KEY && knownKeySet.has(key) && !visible.includes(key)));
  const assigned = new Set([FIXED_NAV_KEY, ...visible, ...more]);
  const newKeys = knownKeys.filter((key) => !assigned.has(key));

  return {
    visible: [FIXED_NAV_KEY, ...visible, ...newKeys],
    more,
  };
}

function dedupeNavKeys(keys: string[]) {
  const seen = new Set<string>();
  return keys.filter((key) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapNavKeysToItems(keys: string[]) {
  return keys.map((key) => topItemMap.value.get(key)).filter((item): item is NavItem => Boolean(item));
}

function setNavLayout(layout: SidebarNavLayout) {
  navLayout.value = normalizeNavLayout(layout);
}

const isActive = (to?: string) => {
  if (!to) return false;
  return route.path === to || route.path.startsWith(`${to}/`);
};

const isActiveApplet = (appletId: string) => route.name === "app-workspace" && route.params.id === appletId;

/** 网页应用工作区内嵌 BrowserView，悬停侧栏易误触 tooltip；此时关闭底部几项的 tooltip */
const disableBottomNavTooltips = computed(() => {
  if (route.name !== "app-workspace") return false;
  const raw = route.params.id;
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? (raw[0] ?? "") : "";
  if (!id) return false;
  const applet = openedAppStore.openedApplets.find((a) => a.id === id);
  return applet?.type === "web";
});

const onClick = async (item: NavItem) => {
  if (item.disabled || !item.to) return;
  const target = resolve(item.to);
  if (route.path === target) return;
  await router.push(target);
};

function toggleMoreExpanded() {
  isMoreExpanded.value = !isMoreExpanded.value;
}

async function openVisibleNavContextMenu(event: MouseEvent, item: NavItem) {
  if (item.key === FIXED_NAV_KEY) return;
  const result = await window.sidebarNavMenu.show({
    x: event.clientX,
    y: event.clientY,
    items: [
      { type: "item", id: "move-to-more", label: t("nav.moveToMore") },
      { type: "separator" },
      { type: "item", id: "restore-default", label: t("nav.restoreDefault") },
    ],
  });
  if (result.action === "move-to-more") moveToMore(item.key);
  if (result.action === "restore-default") restoreDefaultNavLayout();
}

async function openMoreNavContextMenu(event: MouseEvent, item: NavItem) {
  const result = await window.sidebarNavMenu.show({
    x: event.clientX,
    y: event.clientY,
    items: [
      { type: "item", id: "move-out-of-more", label: t("nav.moveOutOfMore") },
    ],
  });
  if (result.action === "move-out-of-more") moveOutOfMore(item.key);
}

function moveToMore(key: string) {
  if (key === FIXED_NAV_KEY) return;
  const layout = normalizedNavLayout.value;
  if (!layout.visible.includes(key)) return;
  setNavLayout({
    visible: layout.visible.filter((itemKey) => itemKey !== key),
    more: [...layout.more, key],
  });
}

function moveOutOfMore(key: string) {
  if (!key) return;
  const layout = normalizedNavLayout.value;
  if (!layout.more.includes(key)) return;
  setNavLayout({
    visible: [...layout.visible, key],
    more: layout.more.filter((itemKey) => itemKey !== key),
  });
}

function restoreDefaultNavLayout() {
  setNavLayout(createDefaultNavLayout());
}

function getDropIndicator(key: string) {
  if (dragOverKey.value !== key) return null;
  return dragOverPosition.value;
}

function onNavDragStart(event: DragEvent, item: NavItem) {
  if (item.key === FIXED_NAV_KEY) {
    event.preventDefault();
    return;
  }
  draggedNavKey.value = item.key;
  event.dataTransfer?.setData("text/plain", item.key);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onNavDragOver(event: DragEvent, item: NavItem) {
  if (!draggedNavKey.value || item.key === FIXED_NAV_KEY || item.key === draggedNavKey.value) return;
  event.preventDefault();
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  const rect = target?.getBoundingClientRect();
  dragOverKey.value = item.key;
  dragOverPosition.value = rect && event.clientY > rect.top + rect.height / 2 ? "after" : "before";
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function onNavDragLeave(item: NavItem) {
  if (dragOverKey.value === item.key) {
    dragOverKey.value = null;
  }
}

function onNavDrop(event: DragEvent, item: NavItem) {
  event.preventDefault();
  const draggedKey = draggedNavKey.value ?? event.dataTransfer?.getData("text/plain");
  if (!draggedKey || draggedKey === FIXED_NAV_KEY || item.key === FIXED_NAV_KEY || draggedKey === item.key) {
    onNavDragEnd();
    return;
  }

  const layout = normalizedNavLayout.value;
  const nextVisible = layout.visible.filter((key) => key !== draggedKey);
  const targetIndex = nextVisible.indexOf(item.key);
  if (targetIndex === -1) {
    onNavDragEnd();
    return;
  }

  nextVisible.splice(targetIndex + (dragOverPosition.value === "after" ? 1 : 0), 0, draggedKey);
  setNavLayout({
    visible: nextVisible,
    more: layout.more,
  });
  onNavDragEnd();
}

function onNavDragEnd() {
  draggedNavKey.value = null;
  dragOverKey.value = null;
  dragOverPosition.value = "before";
}

async function openApplet(appletId: string) {
  await openedAppStore.markAppletOpened(appletId);
  await router.push({ name: "app-workspace", params: { id: appletId } });
}

async function closeOpenedApplet(appletId: string) {
  const wasActive = isActiveApplet(appletId);
  await openedAppStore.closeApplet(appletId);
  if (wasActive) {
    await router.push({ name: "applet" });
  }
}

onMounted(() => {
  void openedAppStore.restoreOpenedApplets();
});
</script>

<style scoped>
.sidebar-more-enter-active,
.sidebar-more-leave-active {
  max-height: 28rem;
  overflow: hidden;
  transition:
    max-height 180ms ease,
    opacity 160ms ease,
    transform 160ms ease;
}

.sidebar-more-enter-from,
.sidebar-more-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
}

.sidebar-more-enter-to,
.sidebar-more-leave-from {
  max-height: 28rem;
  opacity: 1;
  transform: translateY(0);
}
</style>
