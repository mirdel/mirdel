import type { SupportedAppLocale } from "@shared";
import { mainEn, type LocaleSchema } from "./locales/en";
import { mainZhCN } from "./locales/zh-CN";
import { mainZhTW } from "./locales/zh-TW";

export const mainMessages: Record<SupportedAppLocale, LocaleSchema> = {
  "zh-CN": mainZhCN,
  "zh-TW": mainZhTW,
  en: mainEn,
};
