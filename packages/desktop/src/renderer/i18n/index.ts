import { createI18n } from "vue-i18n";
import {
  DEFAULT_APP_LANGUAGE_PREFERENCE,
  resolveAppLocale,
  type SupportedAppLocale
} from "@shared";
import { appMessages } from "@/i18n/messages";

export const i18n = createI18n({
  legacy: false,
  locale: "en",
  fallbackLocale: "en",
  messages: appMessages
});

export async function applyRendererLocalePreference(): Promise<SupportedAppLocale> {
  let nextLocale = resolveAppLocale(
    DEFAULT_APP_LANGUAGE_PREFERENCE,
    typeof navigator !== "undefined" ? navigator.language : "en"
  );

  if (typeof window !== "undefined" && typeof window.ipc === "function") {
    try {
      const result = await window.ipc("settings:getAppLanguage");
      if (result?.resolved) {
        nextLocale = result.resolved;
      }
    } catch {
      // Ignore and fall back to system locale mapping.
    }
  }

  i18n.global.locale.value = nextLocale;

  if (typeof document !== "undefined") {
    document.documentElement.lang = nextLocale;
  }

  return nextLocale;
}
