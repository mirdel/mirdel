import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import { finished } from "node:stream/promises";
import { app } from "electron";
import archiver from "archiver";
import { loggerServiceMain } from "@shared";
import { getDb } from "../db";

const logger = loggerServiceMain.withContext("userDataExport");

/** 与包内 manifest.formatVersion 对应，导入时需校验 */
export const USER_DATA_EXPORT_FORMAT_VERSION = 1;

export const DIRS_RELATIVE = ["assets", "applets", "applet-storage", "skills"] as const;
export const ROOT_FILES = ["applet-local-state.json"] as const;
export const OPTIONAL_DIR = "data";

export type UserDataExportResult =
  | { ok: true; filePath: string; byteSize: number }
  | { ok: false; error: string };

let storageChain: Promise<unknown> = Promise.resolve();

/**
 * 串行执行存储相关任务（导出 / 导入），避免并发写库或并发打 ZIP。
 */
export function runStorageSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = storageChain.then(fn, fn) as Promise<T>;
  storageChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function rmRf(targetPath: string): Promise<void> {
  await fsPromises.rm(targetPath, { recursive: true, force: true });
}

/**
 * 将用户数据写入 ZIP（不弹窗、不单独加锁；请通过 runStorageSerialized 或单线程调用）。
 */
export async function buildUserDataArchiveToZip(outZipPath: string): Promise<UserDataExportResult> {
  const userData = app.getPath("userData");
  const tmpRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "mirdel-export-"));
  const tmpDb = path.join(tmpRoot, "app.db");

  try {
    const db = getDb();
    await db.backup(tmpDb);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("database backup failed", { message });
    await rmRf(tmpRoot).catch(() => {});
    return { ok: false, error: message };
  }

  const scopes: string[] = ["database"];
  for (const d of DIRS_RELATIVE) {
    const abs = path.join(userData, d);
    if (fs.existsSync(abs)) scopes.push(d);
  }
  for (const f of ROOT_FILES) {
    const abs = path.join(userData, f);
    if (fs.existsSync(abs)) scopes.push(f);
  }
  const dataAbs = path.join(userData, OPTIONAL_DIR);
  if (fs.existsSync(dataAbs)) scopes.push(OPTIONAL_DIR);

  const manifest = {
    formatVersion: USER_DATA_EXPORT_FORMAT_VERSION,
    exportedAt: Date.now(),
    appVersion: app.getVersion(),
    scopes,
  };

  const outDir = path.dirname(outZipPath);
  try {
    await fsPromises.mkdir(outDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await rmRf(tmpRoot).catch(() => {});
    return { ok: false, error: message };
  }

  const output = fs.createWriteStream(outZipPath);
  const archive = archiver("zip", { zlib: { level: 6 } });

  try {
    archive.pipe(output);

    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
    archive.file(tmpDb, { name: "db/app.db" });

    for (const dir of DIRS_RELATIVE) {
      const abs = path.join(userData, dir);
      if (fs.existsSync(abs)) {
        archive.directory(abs, `files/${dir}`);
      }
    }

    for (const file of ROOT_FILES) {
      const abs = path.join(userData, file);
      if (fs.existsSync(abs)) {
        archive.file(abs, { name: `files/${file}` });
      }
    }

    if (fs.existsSync(dataAbs)) {
      archive.directory(dataAbs, `files/${OPTIONAL_DIR}`);
    }

    await archive.finalize();
    await finished(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("zip archive failed", { message });
    output.destroy();
    await fsPromises.rm(outZipPath, { force: true }).catch(() => {});
    await rmRf(tmpRoot).catch(() => {});
    return { ok: false, error: message };
  }

  await rmRf(tmpRoot).catch(() => {});

  let byteSize = 0;
  try {
    const st = await fsPromises.stat(outZipPath);
    byteSize = st.size;
  } catch {
    // ignore
  }

  logger.info("user data archive written", { outZipPath, byteSize });
  return { ok: true, filePath: outZipPath, byteSize };
}

/**
 * 用户触发的导出（串行）；与导入互斥。
 */
export async function exportUserDataToZip(outZipPath: string): Promise<UserDataExportResult> {
  return runStorageSerialized(() => buildUserDataArchiveToZip(outZipPath));
}
