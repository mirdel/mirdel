import { app } from "electron";

export function getSystemLocale(): string {
  try {
    const preferredLanguages = app.getPreferredSystemLanguages?.() || [];
    const preferredLocale = preferredLanguages
      .map((item) => String(item || "").trim())
      .find(Boolean);
    if (preferredLocale) return preferredLocale;
  } catch {
    // Fall back to Electron's application locale below.
  }

  try {
    return app.getLocale() || "en";
  } catch {
    return "en";
  }
}
