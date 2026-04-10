import path from "node:path";
import fs from "node:fs/promises";
import { app } from "electron";
import type { AppletStorageValue } from "@mirdel/applet-core";

type AppletStorageFile = {
  version: 1;
  updatedAt: number;
  values: Record<string, AppletStorageValue>;
};

const APPLET_STORAGE_DIR_NAME = "applet-storage";
const APPLET_STORAGE_FILE_NAME = "storage.json";
const storageQueues = new Map<string, Promise<void>>();

function assertAppletId(appletId: string): string {
  const normalized = String(appletId || "").trim();
  if (!normalized || !/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    throw new Error(`Invalid applet id: ${appletId}`);
  }
  return normalized;
}

function getAppletStorageRoot(): string {
  return path.join(app.getPath("userData"), APPLET_STORAGE_DIR_NAME);
}

function getAppletStorageFilePath(appletId: string): string {
  return path.join(getAppletStorageRoot(), assertAppletId(appletId), APPLET_STORAGE_FILE_NAME);
}

function normalizeStorageValue(value: unknown): AppletStorageValue {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw new Error("Applet storage value must be JSON-serializable");
  }
  return JSON.parse(encoded) as AppletStorageValue;
}

async function readStorageFile(appletId: string): Promise<AppletStorageFile> {
  const filePath = getAppletStorageFilePath(appletId);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppletStorageFile> | null;
    const values = parsed && typeof parsed === "object" && parsed.values && typeof parsed.values === "object"
      ? normalizeStorageValue(parsed.values) as Record<string, AppletStorageValue>
      : {};
    return {
      version: 1,
      updatedAt: Number.isFinite(parsed?.updatedAt) ? Number(parsed?.updatedAt) : Date.now(),
      values,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return {
        version: 1,
        updatedAt: Date.now(),
        values: {},
      };
    }
    throw error;
  }
}

async function writeStorageFile(appletId: string, values: Record<string, AppletStorageValue>): Promise<void> {
  const filePath = getAppletStorageFilePath(appletId);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const payload: AppletStorageFile = {
    version: 1,
    updatedAt: Date.now(),
    values: normalizeStorageValue(values) as Record<string, AppletStorageValue>,
  };
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  await fs.rename(tempPath, filePath);
}

async function withStorageLock<T>(appletId: string, fn: () => Promise<T>): Promise<T> {
  const normalizedAppletId = assertAppletId(appletId);
  const previous = storageQueues.get(normalizedAppletId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  storageQueues.set(normalizedAppletId, previous.catch(() => {}).then(() => current));
  await previous.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (storageQueues.get(normalizedAppletId) === current) {
      storageQueues.delete(normalizedAppletId);
    }
  }
}

export async function getAppletStorageValue(appletId: string, key: string): Promise<AppletStorageValue | undefined> {
  return withStorageLock(appletId, async () => {
    const storage = await readStorageFile(appletId);
    return storage.values[String(key)] as AppletStorageValue | undefined;
  });
}

export async function getAllAppletStorageValues(appletId: string): Promise<Record<string, AppletStorageValue>> {
  return withStorageLock(appletId, async () => {
    const storage = await readStorageFile(appletId);
    return normalizeStorageValue(storage.values) as Record<string, AppletStorageValue>;
  });
}

export async function setAppletStorageValue(appletId: string, key: string, value: unknown): Promise<void> {
  return withStorageLock(appletId, async () => {
    const storage = await readStorageFile(appletId);
    storage.values[String(key)] = normalizeStorageValue(value);
    await writeStorageFile(appletId, storage.values);
  });
}

export async function removeAppletStorageValue(appletId: string, key: string): Promise<void> {
  return withStorageLock(appletId, async () => {
    const storage = await readStorageFile(appletId);
    delete storage.values[String(key)];
    await writeStorageFile(appletId, storage.values);
  });
}

export async function clearAppletStorage(appletId: string): Promise<void> {
  return withStorageLock(appletId, async () => {
    await writeStorageFile(appletId, {});
  });
}
