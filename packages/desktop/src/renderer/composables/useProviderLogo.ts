import { computed } from "vue";
import { createGlobalState } from "@vueuse/core";
import { useAppColorModeState } from "./useAppColorModeState";

type ProviderLogoUrlFn = (logo: string | null | undefined) => string | undefined;
type ProviderLogoState = { providerLogoUrl: ProviderLogoUrlFn };

function createProviderLogoState(): ProviderLogoState {
  const { isDark } = useAppColorModeState();
  const iconsBase = computed(
    () => `${import.meta.env.BASE_URL}lobe-icons/${isDark.value ? "dark" : "light"}`
  );

  function providerLogoUrl(logo: string | null | undefined): string | undefined {
    const s = logo?.trim();
    if (!s) return undefined;
    if (s.startsWith("data:")) return s;
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    return `${iconsBase.value}/${s}.png`;
  }

  return { providerLogoUrl };
}

let useProviderLogoState = createGlobalState(createProviderLogoState);

/**
 * 供应商 Logo 解析（根据当前主题选择 light/dark 图标）
 * 复用全局主题状态，避免列表里重复创建 useColorMode 实例
 * - 若 logo 以 data: 开头：作为 base64 内联图片使用
 * - 若 logo 以 http 开头：作为远程 URL 使用
 * - 否则若 logo 有值：从本地 public/lobe-icons 加载（light/dark 随主题）
 * - 若 logo 为空：返回 undefined（显示默认图标）
 */
export function useProviderLogo() {
  return useProviderLogoState();
}

const LOCAL_PROVIDER_ID = "local";

/** 供应商列表/详情无 Logo 时的占位图标：本地模型与其它供应商区分 */
export function getProviderFallbackIcon(providerId: string): string {
  return providerId === LOCAL_PROVIDER_ID ? "i-lucide-monitor" : "i-lucide-server";
}

/** 仅用于单测隔离，勿在生产代码调用 */
export function __resetProviderLogoSingletonForTesting() {
  useProviderLogoState = createGlobalState(createProviderLogoState);
}
