import { nextTick } from "vue";

/**
 * 子窗口主题初始化：读取主窗口的 theme 配置并应用到当前窗口
 * 含 storage 事件监听，主窗口切换 theme 时子窗口实时跟随
 * 与 GlobalSidebar 的 useColorMode 使用相同 storageKey，保持一致
 * 请在子窗口 App 的 onMounted 中调用
 */
const STORAGE_KEY = "mirdel-color-scheme";

function getEffectiveTheme(): "light" | "dark" {
  const stored = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (stored === "dark") return "dark";
  if (stored === "light") return "light";
  return prefersDark ? "dark" : "light";
}

export function applyColorModeFromStorage() {
  const isDark = getEffectiveTheme() === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
}

/**
 * 在子窗口 App 的 onMounted 中调用：应用主题 + 监听主窗口切换
 */
export function initColorModeForWindow() {
  nextTick(() => applyColorModeFromStorage());
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) applyColorModeFromStorage();
  });
}
