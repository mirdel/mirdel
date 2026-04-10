import { app } from "electron";
import {
  DEFAULT_APP_LANGUAGE_PREFERENCE,
  resolveAppLocale,
  type SupportedAppLocale
} from "@shared";
import { getAppLanguagePreference } from "../services/settings/settingsData";
import { mainMessages } from "./messages";

type TranslateParams = Record<string, string | number>;

function formatMessage(template: string, params?: TranslateParams): string {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function getMainAppLocale(): SupportedAppLocale {
  try {
    return resolveAppLocale(getAppLanguagePreference(), app.getLocale());
  } catch {
    return resolveAppLocale(DEFAULT_APP_LANGUAGE_PREFERENCE, "en");
  }
}

export function tMain(key: string, params?: TranslateParams): string {
  const locale = getMainAppLocale();
  const current = mainMessages[locale] || mainMessages.en;
  const template = current[key] || mainMessages.en[key] || key;
  return formatMessage(template, params);
}
