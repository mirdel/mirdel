export const APP_LANGUAGE_PREFERENCES = ["auto", "zh-CN", "zh-TW", "en"] as const;

export type AppLanguagePreference = (typeof APP_LANGUAGE_PREFERENCES)[number];
export type SupportedAppLocale = Exclude<AppLanguagePreference, "auto">;

export const DEFAULT_APP_LANGUAGE_PREFERENCE: AppLanguagePreference = "auto";
export const DEFAULT_APP_LOCALE: SupportedAppLocale = "en";

export function isAppLanguagePreference(value: unknown): value is AppLanguagePreference {
  return typeof value === "string" && APP_LANGUAGE_PREFERENCES.includes(value as AppLanguagePreference);
}

export function resolveSystemLocale(systemLocale?: string | null): SupportedAppLocale {
  const normalized = String(systemLocale || "").trim().toLowerCase();
  if (!normalized) return DEFAULT_APP_LOCALE;

  if (normalized.startsWith("en")) {
    return "en";
  }

  if (normalized.startsWith("zh")) {
    if (
      normalized.includes("hant")
      || normalized.includes("-tw")
      || normalized.includes("_tw")
      || normalized.includes("-hk")
      || normalized.includes("_hk")
      || normalized.includes("-mo")
      || normalized.includes("_mo")
    ) {
      return "zh-TW";
    }

    return "zh-CN";
  }

  return DEFAULT_APP_LOCALE;
}

export function resolveAppLocale(
  preference?: AppLanguagePreference | null,
  systemLocale?: string | null
): SupportedAppLocale {
  if (preference && preference !== "auto") {
    return preference;
  }

  return resolveSystemLocale(systemLocale);
}
