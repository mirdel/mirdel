import { nanoid } from "nanoid";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { app } from "electron";
import {
  ensureAppletsRoot,
  getAppletsRoot,
  getAppletDistDir,
  getAppletRootDir,
  getAppletSourceDir,
  isSafeRelativePath,
  normalizeRelativePath,
  resolvePathUnderAppletRoot,
} from "./appletPaths";

export type Applet = {
  id: string;
  name: string;
  description?: string;
  entryFile: string;
  logo?: string;
  windowWidth?: number;
  windowHeight?: number;
  createdAt: number;
  updatedAt: number;
};

export type AppletFsEntry = {
  path: string;
  kind: "file" | "dir";
};

type AppletManifest = {
  id: string;
  name: string;
  description?: string;
  entryFile: string;
  logo?: string;
  createdAt: number;
  updatedAt: number;
};

type AppletLocalState = {
  windowWidth?: number;
  windowHeight?: number;
};

type AppletLocalStateFile = {
  byAppletId?: Record<string, AppletLocalState>;
};

type BuiltinAppletDefinition = {
  id: string;
  fallbackName: string;
  fallbackDescription: string;
  fallbackEntryFile: string;
};

const BUILTIN_EXAMPLES_DOCS_APPLET_ID = "__builtin_examples_docs__";
const BUILTIN_EXAMPLES_DOCS_ENTRY_FILE = "main.tsx";
const BUILTIN_EXAMPLES_DOCS_NAME = "Applet Examples and Docs";
const BUILTIN_EXAMPLES_DOCS_DESCRIPTION = "Built-in examples and API documentation for applet components and runtime methods";
const APPLET_DEFAULT_ENTRY_FILE = "main.tsx";
const APPLET_MANIFEST_FILE = "applet.json";
const APPLET_LOCAL_STATE_FILE = "applet-local-state.json";
const BUILTIN_APPLETS_DIR_NAME = "builtin-applets";
const APPLET_LOGO_BASENAME = "logo";
const APPLET_LOGO_EXTENSIONS = ["png", "jpg", "jpeg", "svg", "webp", "gif"] as const;

function isBuiltinAppletId(appletId: string): boolean {
  return String(appletId || "").startsWith("__builtin_");
}

function getAppletManifestPath(appletId: string): string {
  return path.join(getAppletRootDir(appletId), APPLET_MANIFEST_FILE);
}

function getAppletLocalStateFilePath(): string {
  return path.join(app.getPath("userData"), APPLET_LOCAL_STATE_FILE);
}

function getBuiltinAppletsSourcePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, BUILTIN_APPLETS_DIR_NAME);
  }
  const fromCwd = path.join(process.cwd(), BUILTIN_APPLETS_DIR_NAME);
  if (fsSync.existsSync(fromCwd)) return fromCwd;
  return path.join(__dirname, "../../../../builtin-applets");
}

function getBuiltinAppletSourceDir(appletId: string): string {
  return path.join(getBuiltinAppletsSourcePath(), appletId);
}

function encodePathSegments(relativePath: string): string {
  return relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildAppletAssetUrl(appletId: string, relativePath: string): string {
  return `applet-asset://${encodeURIComponent(appletId)}/${encodePathSegments(relativePath)}`;
}

function parseAppletAssetPathFromUrl(appletId: string, rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "applet-asset:") return null;
    const hostAppletId = decodeURIComponent(url.hostname || "").trim();
    if (hostAppletId !== appletId) return null;
    const relativePath = normalizeRelativePath(decodeURIComponent(url.pathname.replace(/^\/+/, "")));
    if (!relativePath || !isSafeRelativePath(relativePath)) return null;
    return relativePath;
  } catch {
    return null;
  }
}

function toAppletLogoUrl(appletId: string, storedLogo: string | undefined): string | undefined {
  const raw = typeof storedLogo === "string" ? storedLogo.trim() : "";
  if (!raw) return undefined;
  if (raw.startsWith("data:")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("applet-asset://")) return raw;
  const relativePath = normalizeRelativePath(raw);
  if (!relativePath || !isSafeRelativePath(relativePath)) return undefined;
  return buildAppletAssetUrl(appletId, relativePath);
}

type ParsedLogoDataUrl = {
  ext: string;
  bytes: Buffer;
};

function parseLogoDataUrl(dataUrl: string): ParsedLogoDataUrl | null {
  const text = dataUrl.trim();
  const match = text.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const base64 = match[2].replace(/\s+/g, "");
  const ext =
    mime === "image/png"
      ? "png"
      : mime === "image/jpeg" || mime === "image/jpg"
        ? "jpg"
        : mime === "image/svg+xml"
          ? "svg"
          : mime === "image/webp"
            ? "webp"
            : mime === "image/gif"
              ? "gif"
              : null;
  if (!ext) return null;
  try {
    return { ext, bytes: Buffer.from(base64, "base64") };
  } catch {
    return null;
  }
}

async function removeAppletLogoFiles(appletId: string): Promise<void> {
  const rootDir = getAppletRootDir(appletId);
  await Promise.all(
    APPLET_LOGO_EXTENSIONS.map((ext) =>
      fs.rm(path.join(rootDir, `${APPLET_LOGO_BASENAME}.${ext}`), { force: true }).catch(() => {})
    )
  );
}

async function persistAppletLogo(appletId: string, logo: string): Promise<string | undefined> {
  const normalized = (logo || "").trim();
  if (!normalized) {
    await removeAppletLogoFiles(appletId);
    return undefined;
  }
  if (normalized.startsWith("data:")) {
    const parsed = parseLogoDataUrl(normalized);
    if (!parsed) throw new Error("invalid applet logo data url");
    const rootDir = getAppletRootDir(appletId);
    await fs.mkdir(rootDir, { recursive: true });
    const fileName = `${APPLET_LOGO_BASENAME}.${parsed.ext}`;
    const relativePath = normalizeRelativePath(fileName);
    const fullPath = resolvePathUnderAppletRoot(rootDir, relativePath);
    if (!fullPath) throw new Error("invalid applet logo path");
    await removeAppletLogoFiles(appletId);
    await fs.writeFile(fullPath, parsed.bytes);
    return relativePath;
  }
  const fromAppletAssetUrl = parseAppletAssetPathFromUrl(appletId, normalized);
  if (fromAppletAssetUrl) return fromAppletAssetUrl;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const relativePath = normalizeRelativePath(normalized);
  if (!relativePath || !isSafeRelativePath(relativePath)) {
    throw new Error("invalid applet logo");
  }
  return relativePath;
}

function normalizeAppletEntryFile(input: string | undefined): string {
  const normalized = normalizeRelativePath(input || APPLET_DEFAULT_ENTRY_FILE) || APPLET_DEFAULT_ENTRY_FILE;
  if (!normalized.toLowerCase().endsWith(".tsx")) {
    throw new Error("applet entry file must be .tsx");
  }
  return normalized;
}

function getBlankMainSource(): string {
  return `import { defineApplet, type ActionOf } from "@mirdel/applet-core";

type Action = ActionOf<{
  increment: {};
}>;

const applet = defineApplet({
  init() {
    return { count: 0 };
  },

  onAction(ctx, action: Action) {
    if (action.type === "increment") ctx.state.count += 1;
  },

  render(ctx) {
    const { ui, state } = ctx;
    return (
      <ui.Col class="p-4 gap-3">
        <ui.Text value={"Count: " + String(state.count)} size="lg" bold />
        <ui.Button text="+1" onClick={{ type: "increment" }} />
      </ui.Col>
    );
  },
});

export default applet;
`;
}

function getInitialMainSource(): string {
  return getBlankMainSource();
}

function sanitizeWindowSizeValue(input: unknown): number | undefined {
  const n = Number(input);
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.max(1, Math.round(n));
  return rounded;
}

function normalizeAppletManifest(raw: unknown): AppletManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const name = typeof obj.name === "string" ? obj.name : "";
  const entryFile = normalizeAppletEntryFile(typeof obj.entryFile === "string" ? obj.entryFile : APPLET_DEFAULT_ENTRY_FILE);
  if (!id || !name) return null;
  const description = typeof obj.description === "string" ? obj.description : undefined;
  const logo = typeof obj.logo === "string" ? obj.logo.trim() || undefined : undefined;
  const createdAt = Number.isFinite(Number(obj.createdAt)) ? Math.round(Number(obj.createdAt)) : Date.now();
  const updatedAt = Number.isFinite(Number(obj.updatedAt)) ? Math.round(Number(obj.updatedAt)) : createdAt;
  return {
    id,
    name,
    description,
    entryFile,
    logo,
    createdAt,
    updatedAt,
  };
}

function manifestToApplet(manifest: AppletManifest, localState?: AppletLocalState): Applet {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    entryFile: manifest.entryFile,
    logo: toAppletLogoUrl(manifest.id, manifest.logo),
    windowWidth: localState?.windowWidth,
    windowHeight: localState?.windowHeight,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

async function readAppletManifest(appletId: string): Promise<AppletManifest | null> {
  const parsed = await readJsonFile<unknown>(getAppletManifestPath(appletId));
  const normalized = normalizeAppletManifest(parsed);
  if (!normalized || normalized.id !== appletId) return null;
  return normalized;
}

async function writeAppletManifest(manifest: AppletManifest): Promise<void> {
  await writeJsonFile(getAppletManifestPath(manifest.id), {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    entryFile: manifest.entryFile,
    logo: manifest.logo,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
  });
}

async function readAppletLocalStateMap(): Promise<Record<string, AppletLocalState>> {
  const parsed = await readJsonFile<AppletLocalStateFile | Record<string, unknown>>(getAppletLocalStateFilePath());
  if (!parsed || typeof parsed !== "object") return {};

  const maybeV2 = (parsed as AppletLocalStateFile).byAppletId;
  const source = maybeV2 && typeof maybeV2 === "object" ? maybeV2 : parsed;

  const result: Record<string, AppletLocalState> = {};
  for (const [appletId, value] of Object.entries(source as Record<string, unknown>)) {
    if (!appletId || !value || typeof value !== "object") continue;
    const obj = value as Record<string, unknown>;
    const width = sanitizeWindowSizeValue(obj.windowWidth);
    const height = sanitizeWindowSizeValue(obj.windowHeight);
    if (width === undefined && height === undefined) continue;
    result[appletId] = {
      windowWidth: width,
      windowHeight: height,
    };
  }
  return result;
}

async function writeAppletLocalStateMap(stateByAppletId: Record<string, AppletLocalState>): Promise<void> {
  const next: Record<string, AppletLocalState> = {};
  for (const [appletId, value] of Object.entries(stateByAppletId)) {
    if (!appletId || !value || typeof value !== "object") continue;
    const width = sanitizeWindowSizeValue(value.windowWidth);
    const height = sanitizeWindowSizeValue(value.windowHeight);
    if (width === undefined && height === undefined) continue;
    next[appletId] = {
      windowWidth: width,
      windowHeight: height,
    };
  }
  await writeJsonFile(getAppletLocalStateFilePath(), { byAppletId: next });
}

async function hasApplet(appletId: string): Promise<boolean> {
  const manifest = await readAppletManifest(appletId);
  return !!manifest;
}

async function ensureAppletSourceInitialized(appletId: string, entryFile: string): Promise<void> {
  await ensureAppletsRoot();
  const rootDir = getAppletRootDir(appletId);
  const sourceDir = getAppletSourceDir(appletId);
  const distDir = getAppletDistDir(appletId);
  await fs.mkdir(rootDir, { recursive: true });
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(distDir, { recursive: true });
  const resolvedEntry = resolvePathUnderAppletRoot(sourceDir, entryFile);
  if (!resolvedEntry) throw new Error("invalid entryFile");
  await fs.mkdir(path.dirname(resolvedEntry), { recursive: true });
  try {
    await fs.access(resolvedEntry);
  } catch {
    await fs.writeFile(resolvedEntry, getInitialMainSource(), "utf-8");
  }
}

async function ensureBuiltinApplet(definition: BuiltinAppletDefinition): Promise<void> {
  const sourceDir = getBuiltinAppletSourceDir(definition.id);
  if (!fsSync.existsSync(sourceDir)) {
    throw new Error(`builtin applet source not found: ${sourceDir}`);
  }

  const existing = await readAppletManifest(definition.id);
  if (existing) return;

  const now = Date.now();
  const appletRoot = getAppletRootDir(definition.id);
  await fs.mkdir(path.dirname(appletRoot), { recursive: true });
  await fs.cp(sourceDir, appletRoot, { recursive: true, force: true });

  const copied = await readAppletManifest(definition.id);
  const entryFile = normalizeAppletEntryFile(copied?.entryFile ?? definition.fallbackEntryFile);
  await ensureAppletSourceInitialized(definition.id, entryFile);

  const nextManifest: AppletManifest = {
    id: definition.id,
    name: copied?.name || definition.fallbackName,
    description: copied?.description || definition.fallbackDescription,
    entryFile,
    logo: copied?.logo,
    createdAt: copied?.createdAt ?? now,
    updatedAt: copied?.updatedAt ?? now,
  };
  await writeAppletManifest(nextManifest);
}

export async function ensureBuiltinExamplesDocsApplet(): Promise<void> {
  await ensureBuiltinApplet({
    id: BUILTIN_EXAMPLES_DOCS_APPLET_ID,
    fallbackName: BUILTIN_EXAMPLES_DOCS_NAME,
    fallbackDescription: BUILTIN_EXAMPLES_DOCS_DESCRIPTION,
    fallbackEntryFile: BUILTIN_EXAMPLES_DOCS_ENTRY_FILE,
  });
}

export async function ensureBuiltinApplets(): Promise<void> {
  await ensureBuiltinExamplesDocsApplet();
}

export async function listApplets(): Promise<Applet[]> {
  const appletsRoot = getAppletsRoot();
  await fs.mkdir(appletsRoot, { recursive: true });
  let entries: Array<import("node:fs").Dirent> = [];
  try {
    entries = await fs.readdir(appletsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const localStateMap = await readAppletLocalStateMap();
  const applets: Applet[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifest = await readAppletManifest(entry.name);
    if (!manifest) continue;
    applets.push(manifestToApplet(manifest, localStateMap[manifest.id]));
  }
  applets.sort((a, b) => b.updatedAt - a.updatedAt);
  return applets;
}

export async function getApplet(id: string): Promise<Applet | null> {
  const [manifest, localStateMap] = await Promise.all([readAppletManifest(id), readAppletLocalStateMap()]);
  if (!manifest) return null;
  return manifestToApplet(manifest, localStateMap[id]);
}

export async function createApplet(input: {
  name: string;
  description?: string;
  logo?: string;
  entryFile?: string;
}): Promise<Applet> {
  const id = nanoid();
  const now = Date.now();
  const entryFile = normalizeAppletEntryFile(input.entryFile);
  await ensureAppletSourceInitialized(id, entryFile);
  const persistedLogo = input.logo !== undefined ? await persistAppletLogo(id, input.logo) : undefined;
  const manifest: AppletManifest = {
    id,
    name: input.name,
    description: input.description,
    entryFile,
    logo: persistedLogo,
    createdAt: now,
    updatedAt: now,
  };
  await writeAppletManifest(manifest);
  return manifestToApplet(manifest);
}

export async function updateApplet(
  id: string,
  updates: { name?: string; description?: string; logo?: string; entryFile?: string }
): Promise<Applet | null> {
  const existing = await readAppletManifest(id);
  if (!existing) return null;
  const now = Date.now();
  const persistedLogo = updates.logo !== undefined ? await persistAppletLogo(id, updates.logo) : existing.logo;
  const entryFile = updates.entryFile ? normalizeAppletEntryFile(updates.entryFile) : existing.entryFile;
  if (entryFile !== existing.entryFile) {
    await ensureAppletSourceInitialized(id, entryFile);
  }

  const nextManifest: AppletManifest = {
    id,
    name: updates.name ?? existing.name,
    description: updates.description !== undefined ? updates.description : existing.description,
    entryFile,
    logo: persistedLogo,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
  await writeAppletManifest(nextManifest);

  const localStateMap = await readAppletLocalStateMap();
  return manifestToApplet(nextManifest, localStateMap[id]);
}

export async function updateAppletWindowSize(
  id: string,
  size: { width: number; height: number }
): Promise<boolean> {
  if (!(await hasApplet(id))) return false;
  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));
  const localStateMap = await readAppletLocalStateMap();
  localStateMap[id] = {
    ...(localStateMap[id] ?? {}),
    windowWidth: width,
    windowHeight: height,
  };
  await writeAppletLocalStateMap(localStateMap);
  return true;
}

export async function deleteApplet(id: string): Promise<boolean> {
  if (!(await hasApplet(id))) return false;
  if (isBuiltinAppletId(id)) return false;
  const rootDir = getAppletRootDir(id);
  await fs.rm(rootDir, { recursive: true, force: true }).catch(() => {});

  const localStateMap = await readAppletLocalStateMap();
  if (id in localStateMap) {
    delete localStateMap[id];
    await writeAppletLocalStateMap(localStateMap);
  }
  return true;
}

function isTextFileByExt(relativePath: string): boolean {
  const ext = path.extname(relativePath).toLowerCase();
  if (!ext) return true;
  return new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".css",
    ".scss",
    ".less",
    ".md",
    ".txt",
    ".yml",
    ".yaml",
    ".html",
    ".xml",
  ]).has(ext);
}

async function listFilesRecursively(dirPath: string, prefix = ""): Promise<string[]> {
  let entries: Array<import("node:fs").Dirent> = [];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const result: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...(await listFilesRecursively(path.join(dirPath, entry.name), rel)));
      continue;
    }
    if (!entry.isFile()) continue;
    result.push(rel.replace(/\\/g, "/"));
  }
  return result;
}

async function listEntriesRecursively(dirPath: string, prefix = ""): Promise<AppletFsEntry[]> {
  let entries: Array<import("node:fs").Dirent> = [];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const result: AppletFsEntry[] = [];
  for (const entry of entries) {
    const rel = (prefix ? `${prefix}/${entry.name}` : entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      result.push({ path: rel, kind: "dir" });
      result.push(...(await listEntriesRecursively(path.join(dirPath, entry.name), rel)));
      continue;
    }
    if (!entry.isFile()) continue;
    result.push({ path: rel, kind: "file" });
  }
  return result;
}

async function touchAppletUpdatedAt(appletId: string): Promise<void> {
  const manifest = await readAppletManifest(appletId);
  if (!manifest) return;
  manifest.updatedAt = Date.now();
  await writeAppletManifest(manifest);
}

export async function listAppletFiles(id: string): Promise<string[]> {
  if (!(await hasApplet(id))) return [];
  const sourceDir = getAppletSourceDir(id);
  await fs.mkdir(sourceDir, { recursive: true });
  const files = await listFilesRecursively(sourceDir);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

export async function listAppletEntries(id: string): Promise<AppletFsEntry[]> {
  if (!(await hasApplet(id))) return [];
  const sourceDir = getAppletSourceDir(id);
  await fs.mkdir(sourceDir, { recursive: true });
  const entries = await listEntriesRecursively(sourceDir);
  entries.sort((a, b) => {
    const depthDiff = a.path.split("/").length - b.path.split("/").length;
    if (depthDiff !== 0) return depthDiff;
    if (a.path === b.path) return 0;
    return a.path.localeCompare(b.path);
  });
  return entries;
}

export async function readAppletFile(id: string, relativePath: string): Promise<{
  path: string;
  content?: string;
  isText: boolean;
  size: number;
} | null> {
  if (!(await hasApplet(id))) return null;
  const sourceDir = getAppletSourceDir(id);
  const fullPath = resolvePathUnderAppletRoot(sourceDir, relativePath);
  if (!fullPath) return null;
  let stat: import("node:fs").Stats;
  try {
    stat = await fs.stat(fullPath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  const normalized = normalizeRelativePath(relativePath);
  const isText = isTextFileByExt(normalized);
  if (!isText) {
    return { path: normalized, isText: false, size: stat.size };
  }
  const content = await fs.readFile(fullPath, "utf-8");
  return { path: normalized, content, isText: true, size: stat.size };
}

export async function writeAppletTextFile(id: string, relativePath: string, content: string): Promise<{ ok: boolean; path: string } | null> {
  if (!(await hasApplet(id))) return null;
  const sourceDir = getAppletSourceDir(id);
  await fs.mkdir(sourceDir, { recursive: true });
  const normalized = normalizeRelativePath(relativePath);
  const fullPath = resolvePathUnderAppletRoot(sourceDir, normalized);
  if (!fullPath) return null;
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
  await touchAppletUpdatedAt(id);
  return { ok: true, path: normalized };
}

export async function writeAppletBase64File(id: string, relativePath: string, base64: string): Promise<{ ok: boolean; path: string } | null> {
  if (!(await hasApplet(id))) return null;
  const sourceDir = getAppletSourceDir(id);
  await fs.mkdir(sourceDir, { recursive: true });
  const normalized = normalizeRelativePath(relativePath);
  const fullPath = resolvePathUnderAppletRoot(sourceDir, normalized);
  if (!fullPath) return null;
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, Buffer.from(base64, "base64"));
  await touchAppletUpdatedAt(id);
  return { ok: true, path: normalized };
}

export async function createAppletFile(id: string, relativePath: string, content = ""): Promise<{ ok: boolean; path: string } | null> {
  if (!(await hasApplet(id))) return null;
  const normalized = normalizeRelativePath(relativePath);
  const existing = await readAppletFile(id, normalized);
  if (existing) return null;
  return writeAppletTextFile(id, normalized, content);
}

export async function createAppletDirectory(id: string, relativePath: string): Promise<{ ok: boolean; path: string } | null> {
  if (!(await hasApplet(id))) return null;
  const sourceDir = getAppletSourceDir(id);
  await fs.mkdir(sourceDir, { recursive: true });
  const normalized = normalizeRelativePath(relativePath);
  const fullPath = resolvePathUnderAppletRoot(sourceDir, normalized);
  if (!fullPath) return null;
  try {
    await fs.stat(fullPath);
    return null;
  } catch {
    // path not exists, continue
  }
  await fs.mkdir(fullPath, { recursive: true });
  await touchAppletUpdatedAt(id);
  return { ok: true, path: normalized };
}

export async function renameAppletFile(id: string, fromPath: string, toPath: string): Promise<{ ok: boolean; path: string } | null> {
  if (!(await hasApplet(id))) return null;
  const sourceDir = getAppletSourceDir(id);
  const fromFullPath = resolvePathUnderAppletRoot(sourceDir, fromPath);
  const toFullPath = resolvePathUnderAppletRoot(sourceDir, toPath);
  if (!fromFullPath || !toFullPath) return null;
  try {
    await fs.stat(fromFullPath);
  } catch {
    return null;
  }
  try {
    await fs.stat(toFullPath);
    return null;
  } catch {
    // target path does not exist, continue
  }
  await fs.mkdir(path.dirname(toFullPath), { recursive: true });
  await fs.rename(fromFullPath, toFullPath);
  await touchAppletUpdatedAt(id);
  return { ok: true, path: normalizeRelativePath(toPath) };
}

export async function deleteAppletFile(id: string, relativePath: string): Promise<boolean> {
  if (!(await hasApplet(id))) return false;
  const sourceDir = getAppletSourceDir(id);
  const fullPath = resolvePathUnderAppletRoot(sourceDir, relativePath);
  if (!fullPath) return false;
  await fs.rm(fullPath, { recursive: true, force: true });
  await touchAppletUpdatedAt(id);
  return true;
}
