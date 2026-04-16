import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import type { BrowserWindow } from "electron";
import { app, dialog } from "electron";
import extract from "extract-zip";
import Database from "better-sqlite3";
import { loggerServiceMain } from "@shared";
import { closeDb, getCurrentDbPath } from "../db";
import { tMain } from "../../i18n";
import {
  buildUserDataArchiveToZip,
  DIRS_RELATIVE,
  OPTIONAL_DIR,
  ROOT_FILES,
  runStorageSerialized,
  USER_DATA_EXPORT_FORMAT_VERSION,
} from "./userDataExport";

const logger = loggerServiceMain.withContext("userDataImport");

const AUTO_BACKUP_DIR = path.join("backups", "auto-before-import");

export type UserDataImportResult =
  | { ok: true; backupPath: string; willRelaunch: true }
  | { ok: false; canceled: true }
  | { ok: false; error: string; backupPath?: string };

type ManifestV1 = {
  formatVersion?: number;
  exportedAt?: number;
  appVersion?: string;
  scopes?: string[];
};

async function rmRf(targetPath: string): Promise<void> {
  await fsPromises.rm(targetPath, { recursive: true, force: true });
}

function readManifest(extractRoot: string): ManifestV1 {
  const manifestPath = path.join(extractRoot, "manifest.json");
  const raw = fs.readFileSync(manifestPath, "utf8");
  return JSON.parse(raw) as ManifestV1;
}

function validateImportedDatabaseFile(dbFile: string): void {
  let d: InstanceType<typeof Database> | null = null;
  try {
    d = new Database(dbFile, { readonly: true, fileMustExist: true });
    d.prepare("select 1 as n").get();
  } finally {
    d?.close();
  }
}

async function applyImportFromZip(zipPath: string): Promise<UserDataImportResult> {
  const userData = app.getPath("userData");
  const extractRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "mirdel-import-"));

  try {
    await extract(zipPath, { dir: extractRoot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("extract zip failed", { message, zipPath });
    await rmRf(extractRoot).catch(() => {});
    return { ok: false, error: message };
  }

  try {
    const manifest = readManifest(extractRoot);
    if (manifest.formatVersion !== USER_DATA_EXPORT_FORMAT_VERSION) {
      await rmRf(extractRoot).catch(() => {});
      return { ok: false, error: "import_bad_format_version" };
    }

    const importedDbPath = path.join(extractRoot, "db", "app.db");
    if (!fs.existsSync(importedDbPath)) {
      await rmRf(extractRoot).catch(() => {});
      return { ok: false, error: "import_missing_db" };
    }

    validateImportedDatabaseFile(importedDbPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("import validation failed", { message, zipPath });
    await rmRf(extractRoot).catch(() => {});
    return { ok: false, error: message };
  }

  const backupDir = path.join(userData, AUTO_BACKUP_DIR);
  await fsPromises.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `mirdel-auto-backup-${Date.now()}.zip`);

  const backupResult = await buildUserDataArchiveToZip(backupPath);
  if (!backupResult.ok) {
    await rmRf(extractRoot).catch(() => {});
    logger.error("auto backup before import failed", { error: backupResult.error });
    return { ok: false, error: `auto_backup_failed:${backupResult.error}` };
  }

  const liveDbPath = getCurrentDbPath();

  try {
    closeDb();

    for (const suffix of ["-wal", "-shm", ""] as const) {
      const p = suffix === "" ? liveDbPath : `${liveDbPath}${suffix}`;
      await fsPromises.rm(p, { force: true });
    }

    await fsPromises.copyFile(path.join(extractRoot, "db", "app.db"), liveDbPath);

    const filesRoot = path.join(extractRoot, "files");
    if (fs.existsSync(filesRoot)) {
      for (const dir of DIRS_RELATIVE) {
        const src = path.join(filesRoot, dir);
        if (fs.existsSync(src)) {
          const dest = path.join(userData, dir);
          await fsPromises.rm(dest, { recursive: true, force: true });
          await fsPromises.cp(src, dest, { recursive: true });
        }
      }

      for (const file of ROOT_FILES) {
        const src = path.join(filesRoot, file);
        if (fs.existsSync(src)) {
          await fsPromises.copyFile(src, path.join(userData, file));
        }
      }

      const dataSrc = path.join(filesRoot, OPTIONAL_DIR);
      if (fs.existsSync(dataSrc)) {
        const dataDest = path.join(userData, OPTIONAL_DIR);
        await fsPromises.rm(dataDest, { recursive: true, force: true });
        await fsPromises.cp(dataSrc, dataDest, { recursive: true });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("import apply failed", { message, backupPath });
    await rmRf(extractRoot).catch(() => {});
    return { ok: false, error: `import_apply_failed:${message}`, backupPath };
  }

  await rmRf(extractRoot).catch(() => {});

  logger.info("import applied, scheduling relaunch", { backupPath, zipPath });

  setImmediate(() => {
    try {
      app.relaunch();
      app.exit(0);
    } catch (e) {
      logger.error("relaunch failed", { error: e instanceof Error ? e.message : String(e) });
    }
  });

  return { ok: true, backupPath, willRelaunch: true };
}

export async function runImportUserDataArchiveWithDialog(
  getWindow: () => BrowserWindow | null | undefined
): Promise<UserDataImportResult> {
  const win = getWindow() ?? undefined;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: tMain("storage.importDialogTitle"),
    properties: ["openFile"],
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  });
  if (canceled || !filePaths?.[0]) {
    return { ok: false, canceled: true };
  }
  return runStorageSerialized(() => applyImportFromZip(filePaths[0]));
}
