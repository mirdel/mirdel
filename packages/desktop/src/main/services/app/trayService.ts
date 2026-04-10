import path from "node:path";
import { app, Menu, Tray, nativeImage } from "electron";
import { loggerServiceMain } from "@shared";
import { tMain } from "../../i18n";

const logger = loggerServiceMain.withContext("trayService");

let tray: Tray | null = null;

type TrayServiceOptions = {
  showMainWindow: () => void | Promise<void>;
  quitApp: () => void;
};

function resolveTrayIcon() {
  const iconFileName = process.platform === "darwin"
    ? "mirdelTrayTemplate.png"
    : "mirdelTray.png";
  const iconCandidates = [
    path.join(process.resourcesPath, "tray", iconFileName),
    path.join(app.getAppPath(), "build", "tray", iconFileName),
  ];

  for (const iconPath of iconCandidates) {
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) continue;

    if (process.platform === "darwin") {
      icon.setTemplateImage(true);
    }

    return icon;
  }

  logger.warn("failed to load tray icon", { iconCandidates });
  return nativeImage.createEmpty();
}

function buildTrayMenu(options: TrayServiceOptions) {
  return Menu.buildFromTemplate([
    {
      label: tMain("tray.showMainWindow"),
      click: () => {
        void options.showMainWindow();
      }
    },
    {
      type: "separator"
    },
    {
      label: tMain("tray.quit"),
      click: () => {
        options.quitApp();
      }
    }
  ]);
}

export function ensureTray(options: TrayServiceOptions) {
  if (!tray) {
    tray = new Tray(resolveTrayIcon());
    tray.on("click", () => {
      void options.showMainWindow();
    });
  }

  tray.setToolTip(app.name);
  tray.setContextMenu(buildTrayMenu(options));
  return tray;
}

export function destroyTray() {
  if (!tray) return;
  tray.destroy();
  tray = null;
}
