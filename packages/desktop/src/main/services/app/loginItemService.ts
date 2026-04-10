import { app } from "electron";
import { loggerServiceMain } from "@shared";

const logger = loggerServiceMain.withContext("loginItemService");

export function applyLaunchAtLoginSetting(enabled: boolean) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
    });
    logger.info("launch at login setting applied", { enabled });
  } catch (error) {
    logger.error("failed to apply launch at login setting", { enabled, error });
  }
}
