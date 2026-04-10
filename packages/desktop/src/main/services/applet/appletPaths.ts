import path from "node:path";
import fs from "node:fs/promises";
import { app } from "electron";

const APPLETS_DIR_NAME = "applets";
const APPLET_SRC_DIR_NAME = "src";
const APPLET_DIST_DIR_NAME = "dist";

export function getAppletsRoot(): string {
  return path.join(app.getPath("userData"), APPLETS_DIR_NAME);
}

export function getAppletRootDir(appletId: string): string {
  return path.join(getAppletsRoot(), appletId);
}

export function getAppletSrcDir(appletId: string): string {
  return path.join(getAppletRootDir(appletId), APPLET_SRC_DIR_NAME);
}

export function getAppletDistDir(appletId: string): string {
  return path.join(getAppletRootDir(appletId), APPLET_DIST_DIR_NAME);
}

/** Backward-compatible alias in current codebase usage. */
export function getAppletSourceDir(appletId: string): string {
  return getAppletSrcDir(appletId);
}

export async function ensureAppletsRoot(): Promise<string> {
  const root = getAppletsRoot();
  await fs.mkdir(root, { recursive: true });
  return root;
}

export function normalizeRelativePath(input: string): string {
  const normalized = input.replace(/\\/g, "/").trim().replace(/^\/+/, "");
  const collapsed = path.posix.normalize(normalized);
  return collapsed === "." ? "" : collapsed.replace(/^(\.\/)+/, "");
}

export function isSafeRelativePath(relativePath: string): boolean {
  if (!relativePath) return false;
  if (relativePath.includes("\0")) return false;
  if (path.isAbsolute(relativePath)) return false;
  const segments = relativePath.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function resolvePathUnderAppletRoot(appletRoot: string, relativePath: string): string | null {
  const normalized = normalizeRelativePath(relativePath);
  if (!isSafeRelativePath(normalized)) return null;
  const fullPath = path.resolve(path.join(appletRoot, normalized));
  const resolvedRoot = path.resolve(appletRoot);
  const rel = path.relative(resolvedRoot, fullPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return fullPath;
}
