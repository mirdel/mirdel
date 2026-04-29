import { nativeTheme } from "electron";
import { loggerServiceMain } from "@shared";
import { getRendererStateValue } from "../rendererStateData";

const logger = loggerServiceMain.withContext("appearance-theme");

export const APP_COLOR_MODE_STORAGE_KEY = "mirdel-color-scheme";

type AppColorMode = "auto" | "light" | "dark";

function normalizeAppColorMode(value: unknown): AppColorMode {
  if (value === "light" || value === "dark" || value === "auto") return value;
  return "auto";
}

function toNativeThemeSource(mode: AppColorMode): "system" | "light" | "dark" {
  return mode === "auto" ? "system" : mode;
}

export function applyAppColorModeToNativeTheme(value: unknown) {
  const mode = normalizeAppColorMode(value);
  const themeSource = toNativeThemeSource(mode);
  if (nativeTheme.themeSource === themeSource) return;

  nativeTheme.themeSource = themeSource;
  logger.info("native theme source updated", { mode, themeSource });
}

export function applyStoredAppColorModeToNativeTheme() {
  const entry = getRendererStateValue(APP_COLOR_MODE_STORAGE_KEY);
  applyAppColorModeToNativeTheme(entry?.value ?? "auto");
}

export function applyRendererStateThemeChange(input: { key: string; value?: unknown; removed?: boolean }) {
  if (input.key !== APP_COLOR_MODE_STORAGE_KEY) return;
  applyAppColorModeToNativeTheme(input.removed ? "auto" : input.value);
}
