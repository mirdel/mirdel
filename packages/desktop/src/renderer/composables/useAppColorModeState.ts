import { computed } from "vue";
import { createGlobalState, useColorMode } from "@vueuse/core";

export const APP_COLOR_MODE_STORAGE_KEY = "mirdel-color-scheme";

function createAppColorModeState() {
  const colorMode = useColorMode({
    storageKey: APP_COLOR_MODE_STORAGE_KEY,
    initialValue: "auto",
  });
  const isDark = computed(() => colorMode.state.value === "dark");
  return { colorMode, isDark };
}

const useAppColorModeStateInternal = createGlobalState(createAppColorModeState);

export function useAppColorModeState() {
  return useAppColorModeStateInternal();
}
