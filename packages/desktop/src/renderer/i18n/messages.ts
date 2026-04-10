import type { SupportedAppLocale } from "@shared";
import { rendererEn, type LocaleSchema } from "./locales/en";
import { rendererZhCN } from "./locales/zh-CN";
import { rendererZhTW } from "./locales/zh-TW";

export const appMessages: Record<SupportedAppLocale, LocaleSchema> = {
  "zh-CN": rendererZhCN,
  "zh-TW": rendererZhTW,
  en: rendererEn,
};
