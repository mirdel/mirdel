import { computed, onScopeDispose, watch } from "vue";
import { createGlobalState } from "@vueuse/core";
import { usePersistentState } from "@/utils/persistentState";

export const APP_COLOR_MODE_STORAGE_KEY = "mirdel-color-scheme";
type AppColorMode = "auto" | "light" | "dark";

function getSystemColorMode(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyColorMode(mode: AppColorMode) {
  const resolved = mode === "auto" ? getSystemColorMode() : mode;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

function createAppColorModeState() {
  const store = usePersistentState<AppColorMode>(APP_COLOR_MODE_STORAGE_KEY, "auto");
  const state = computed(() => (store.value === "auto" ? getSystemColorMode() : store.value));
  const colorMode = { store, state };
  const isDark = computed(() => state.value === "dark");
  const mediaQuery = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const onSystemColorModeChange = () => {
    if (store.value === "auto") applyColorMode("auto");
  };

  watch(store, (mode) => applyColorMode(mode), { immediate: true });
  mediaQuery?.addEventListener("change", onSystemColorModeChange);
  onScopeDispose(() => mediaQuery?.removeEventListener("change", onSystemColorModeChange));

  return { colorMode, isDark };
}

const useAppColorModeStateInternal = createGlobalState(createAppColorModeState);

export function useAppColorModeState() {
  return useAppColorModeStateInternal();
}
