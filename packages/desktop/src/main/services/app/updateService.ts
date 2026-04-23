import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { loggerServiceMain } from "@shared";

const logger = loggerServiceMain.withContext("updates");

export type UpdateStatus =
  | "idle"
  | "unsupported"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "error";

export type UpdateProgress = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

export type UpdateState = {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  downloadedVersion: string | null;
  progress: UpdateProgress | null;
  error: string | null;
  canCheck: boolean;
  isPackaged: boolean;
};

type UpdateServiceOptions = {
  getWindows: () => BrowserWindow[];
  beforeQuitForUpdate: () => void;
};

let initialized = false;
let autoCheckTimer: NodeJS.Timeout | null = null;
let options: UpdateServiceOptions | null = null;

const state: UpdateState = {
  status: app.isPackaged ? "idle" : "unsupported",
  currentVersion: app.getVersion(),
  availableVersion: null,
  downloadedVersion: null,
  progress: null,
  error: app.isPackaged ? null : "Updates are available only in packaged builds.",
  canCheck: app.isPackaged,
  isPackaged: app.isPackaged,
};

function normalizeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "Unknown update error");
}

function setState(next: Partial<UpdateState>) {
  Object.assign(state, next);
  broadcastState();
}

function broadcastState() {
  const windows = options?.getWindows() || [];
  for (const window of windows) {
    if (window.isDestroyed()) continue;
    window.webContents.send("updates:state", getUpdateState());
  }
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "mirdel",
    repo: "mirdel",
  } as any);
}

function bindAutoUpdaterEvents() {
  autoUpdater.on("checking-for-update", () => {
    logger.info("checking for update");
    setState({
      status: "checking",
      error: null,
      progress: null,
    });
  });

  autoUpdater.on("update-available", (info) => {
    logger.info("update available", { version: info.version });
    setState({
      status: "available",
      availableVersion: info.version || null,
      downloadedVersion: null,
      error: null,
      progress: null,
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    logger.info("update not available", { version: info.version });
    setState({
      status: "not-available",
      availableVersion: null,
      downloadedVersion: null,
      progress: null,
      error: null,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    setState({
      status: "downloading",
      progress: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      },
      error: null,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    logger.info("update downloaded", { version: info.version });
    setState({
      status: "downloaded",
      availableVersion: info.version || state.availableVersion,
      downloadedVersion: info.version || state.availableVersion,
      progress: null,
      error: null,
    });
  });

  autoUpdater.on("error", (error) => {
    logger.warn("update failed", { error });
    setState({
      status: "error",
      error: normalizeError(error),
    });
  });

  autoUpdater.on("before-quit-for-update", () => {
    options?.beforeQuitForUpdate();
  });
}

export function initializeUpdateService(nextOptions: UpdateServiceOptions) {
  options = nextOptions;
  if (initialized) return;
  initialized = true;

  if (!app.isPackaged) {
    logger.info("update service disabled outside packaged builds");
    return;
  }

  configureAutoUpdater();
  bindAutoUpdaterEvents();
}

export function getUpdateState(): UpdateState {
  return { ...state, progress: state.progress ? { ...state.progress } : null };
}

export async function checkForUpdates() {
  if (!app.isPackaged) {
    setState({
      status: "unsupported",
      error: "Updates are available only in packaged builds.",
      canCheck: false,
    });
    return getUpdateState();
  }

  if (state.status === "checking" || state.status === "downloading") {
    return getUpdateState();
  }

  if (state.status === "downloaded") {
    return getUpdateState();
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setState({
      status: "error",
      error: normalizeError(error),
    });
  }

  return getUpdateState();
}

export function scheduleAutomaticUpdateCheck(delayMs = 15_000) {
  if (!app.isPackaged || autoCheckTimer) return;
  autoCheckTimer = setTimeout(() => {
    autoCheckTimer = null;
    void checkForUpdates();
  }, delayMs);
}

export function quitAndInstallUpdate() {
  if (state.status !== "downloaded") {
    return { ok: false, error: "No downloaded update is ready to install." };
  }

  options?.beforeQuitForUpdate();
  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true);
  });
  return { ok: true };
}
