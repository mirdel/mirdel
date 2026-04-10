import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import fg from "fast-glob";
import { getAppletDistDir, getAppletSourceDir, resolvePathUnderAppletRoot } from "./appletPaths";

export type AppletBuildResult = {
  runId: string;
  outDir: string;
  entryFile: string;
  stylesheetFile: string;
};

const MAX_TAILWIND_CANDIDATE_LENGTH = 180;
const CANDIDATE_TOKEN = /^[A-Za-z0-9!_-][A-Za-z0-9!_:/.%#,[\]()+\-]*$/;
const APPLET_ENTRY_EXTENSION = ".tsx";
const APPLET_JSX_INJECT_FILE = "__applet_jsx_inject.ts";
const APPLET_CORE_RUNTIME_GLOBAL_KEY = "__MIRDEL_APPLET_CORE__";
const APPLET_CORE_VIRTUAL_NAMESPACE = "applet-core-virtual";
const APPLET_CORE_VIRTUAL_PATH = "__applet_core_virtual__";

const APPLET_CORE_VIRTUAL_SOURCE = `const runtimeKey = ${JSON.stringify(APPLET_CORE_RUNTIME_GLOBAL_KEY)};
const runtime = (globalThis as Record<string, unknown>)[runtimeKey] as
  | {
      defineApplet?: (...args: unknown[]) => unknown;
      createUIApi?: (...args: unknown[]) => unknown;
      createEngine?: (...args: unknown[]) => unknown;
      setStateByPath?: (...args: unknown[]) => unknown;
    }
  | undefined;

if (!runtime) {
  throw new Error("Applet core runtime bridge is not initialized.");
}

export const defineApplet = runtime.defineApplet as (...args: unknown[]) => unknown;
export const createUIApi = runtime.createUIApi as (...args: unknown[]) => unknown;
export const createEngine = runtime.createEngine as (...args: unknown[]) => unknown;
export const setStateByPath = runtime.setStateByPath as (...args: unknown[]) => unknown;

export default runtime;
`;

const APPLET_JSX_INJECT_SOURCE = `import type { UINode } from "@mirdel/applet-core";

type UiNodeLike = { type?: unknown; props?: unknown };
type UiComponent = (props: Record<string, unknown>, children?: UINode[]) => UINode;

const APPLET_FRAGMENT = Symbol.for("applet.jsx.fragment");

function isUiNode(value: unknown): value is UINode {
  if (!value || typeof value !== "object") return false;
  const row = value as UiNodeLike;
  return typeof row.type === "string" && !!row.props && typeof row.props === "object";
}

function toTextNode(value: string | number | bigint): UINode {
  return { type: "Text", props: { value: String(value) } };
}

function appendChild(out: UINode[], child: unknown): void {
  if (Array.isArray(child)) {
    for (const item of child) appendChild(out, item);
    return;
  }
  if (child == null || child === false || child === true) return;
  if (isUiNode(child)) {
    out.push(child);
    return;
  }
  if (typeof child === "string" || typeof child === "number" || typeof child === "bigint") {
    out.push(toTextNode(child));
    return;
  }
  throw new Error("Unsupported JSX child. Only UI nodes, primitive text, null, false and arrays are allowed.");
}

function collectChildren(props: Record<string, unknown>, rawChildren: unknown[]): UINode[] {
  const out: UINode[] = [];
  appendChild(out, props.children);
  for (const child of rawChildren) appendChild(out, child);
  return out;
}

export const __appletFragment = APPLET_FRAGMENT;

export function __appletJsx(type: unknown, inputProps: Record<string, unknown> | null, ...rawChildren: unknown[]): UINode {
  const props = inputProps && typeof inputProps === "object" ? { ...inputProps } : {};
  const children = collectChildren(props, rawChildren);
  delete (props as Record<string, unknown>).children;

  if (type === APPLET_FRAGMENT) {
    return { type: "View", props: {}, children };
  }
  if (typeof type === "function") {
    return (type as UiComponent)(props, children);
  }

  throw new Error("Unsupported JSX element type. Use <ui.Component /> tags.");
}
`;

function createRunId(appletId: string): string {
  const normalized = appletId.trim();
  const runId = normalized.replace(/[^a-zA-Z0-9_-]/g, "_");
  return runId || "applet";
}

function ensureTsxEntry(entryRelativePath: string): void {
  if (!entryRelativePath.toLowerCase().endsWith(APPLET_ENTRY_EXTENSION)) {
    throw new Error(`applet entry file must be ${APPLET_ENTRY_EXTENSION}`);
  }
}

function isPathInside(parent: string, target: string): boolean {
  const relative = path.relative(parent, target);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function resolveBaseDir(base: string | undefined, fallbackDir: string): string {
  if (typeof base !== "string" || base.trim() === "") {
    return path.resolve(fallbackDir);
  }
  const normalized = path.resolve(base);
  return path.extname(normalized) ? path.dirname(normalized) : normalized;
}

function normalizeImportPath(sourceDir: string, filePath: string): string {
  const rel = path.relative(sourceDir, filePath).replace(/\\/g, "/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function stripTemplateExpressions(value: string): string {
  return value.replace(/\$\{[^}]*\}/g, " ");
}

function maybeAddCandidate(set: Set<string>, raw: string): void {
  const value = raw.trim();
  if (!value) return;
  if (value.length > MAX_TAILWIND_CANDIDATE_LENGTH) return;
  if (!CANDIDATE_TOKEN.test(value)) return;
  set.add(value);
}

function extractCandidatesFromSource(content: string, out: Set<string>): void {
  const classPatterns = [
    /\bclass(?:Name)?\s*[:=]\s*"([^"]*)"/g,
    /\bclass(?:Name)?\s*[:=]\s*'([^']*)'/g,
    /\bclass(?:Name)?\s*[:=]\s*`([\s\S]*?)`/g,
    /\bclass\s*=\s*"([^"]*)"/g,
    /\bclass\s*=\s*'([^']*)'/g,
  ];

  for (const pattern of classPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) {
      const text = stripTemplateExpressions(match[1]);
      for (const token of text.split(/\s+/)) {
        maybeAddCandidate(out, token);
      }
    }
  }
}

async function collectTailwindCandidates(sourceDir: string): Promise<string[]> {
  const sourceFiles = await fg(["**/*.{ts,tsx,js,jsx,mjs,cjs,vue,html,json,md,mdx}"], {
    cwd: sourceDir,
    absolute: true,
    onlyFiles: true,
    dot: true,
  });
  const candidates = new Set<string>();

  for (const file of sourceFiles) {
    let content = "";
    try {
      content = await fs.readFile(file, "utf-8");
    } catch {
      continue;
    }
    extractCandidatesFromSource(content, candidates);
  }

  return Array.from(candidates);
}

async function buildAppletStylesheet(sourceDir: string, outDir: string): Promise<string> {
  const [tailwind, candidates, cssFiles] = await Promise.all([
    import("tailwindcss"),
    collectTailwindCandidates(sourceDir),
    fg(["**/*.css"], {
      cwd: sourceDir,
      absolute: true,
      onlyFiles: true,
      dot: true,
    }),
  ]);

  cssFiles.sort((a, b) => a.localeCompare(b));

  const entryCss = [
    '@import "tailwindcss";',
    ...cssFiles.map((filePath) => `@import "${normalizeImportPath(sourceDir, filePath)}";`),
  ].join("\n");

  const require = createRequire(import.meta.url);
  const tailwindRoot = path.dirname(require.resolve("tailwindcss/package.json"));
  const sourceDirResolved = path.resolve(sourceDir);

  const compiled = await tailwind.compile(entryCss, {
    from: path.join(sourceDir, "__applet_tailwind_entry__.css"),
    loadStylesheet: async (id, base) => {
      let filePath: string;
      if (id === "tailwindcss") {
        filePath = path.join(tailwindRoot, "index.css");
      } else if (id.startsWith("tailwindcss/")) {
        filePath = path.join(tailwindRoot, id.slice("tailwindcss/".length));
      } else if (id.startsWith(".")) {
        const baseDir = resolveBaseDir(base, sourceDirResolved);
        filePath = path.resolve(path.join(baseDir, id));
        if (!isPathInside(sourceDirResolved, filePath)) {
          throw new Error(`invalid stylesheet import path: ${id}`);
        }
      } else {
        throw new Error(`unsupported stylesheet import: ${id}`);
      }

      const resolvedFile = path.resolve(filePath);
      const content = await fs.readFile(resolvedFile, "utf-8");
      return {
        path: resolvedFile,
        base: path.dirname(resolvedFile),
        content,
      };
    },
  });

  const stylesheetFile = path.join(outDir, "applet.css");
  const css = compiled.build(candidates);
  await fs.writeFile(stylesheetFile, css, "utf-8");
  return stylesheetFile;
}

export async function buildAppletSource(appletId: string, entryRelativePath: string): Promise<AppletBuildResult> {
  const sourceDir = getAppletSourceDir(appletId);
  const outDir = getAppletDistDir(appletId);
  ensureTsxEntry(entryRelativePath);
  const entryAbsPath = resolvePathUnderAppletRoot(sourceDir, entryRelativePath);
  if (!entryAbsPath) throw new Error("invalid applet entry file");

  try {
    const stat = await fs.stat(entryAbsPath);
    if (!stat.isFile()) throw new Error("entry file is not a file");
  } catch {
    throw new Error(`applet entry file not found: ${entryRelativePath}`);
  }

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  const jsxInjectPath = path.join(outDir, APPLET_JSX_INJECT_FILE);
  await fs.writeFile(jsxInjectPath, APPLET_JSX_INJECT_SOURCE, "utf-8");

  const runId = createRunId(appletId);

  const esbuild = await import("esbuild");
  const appletCoreAliasPlugin: import("esbuild").Plugin = {
    name: "applet-core-virtual-module",
    setup(build) {
      build.onResolve({ filter: /^@mirdel\/applet-core$/ }, () => ({
        path: APPLET_CORE_VIRTUAL_PATH,
        namespace: APPLET_CORE_VIRTUAL_NAMESPACE,
      }));
      build.onLoad({ filter: /.*/, namespace: APPLET_CORE_VIRTUAL_NAMESPACE }, () => ({
        loader: "ts",
        contents: APPLET_CORE_VIRTUAL_SOURCE,
      }));
    },
  };

  await esbuild.build({
    entryPoints: [entryAbsPath],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    outfile: path.join(outDir, "main.mjs"),
    absWorkingDir: sourceDir,
    sourcemap: "inline",
    logLevel: "silent",
    assetNames: "assets/[name]-[hash]",
    publicPath: `applet-asset://${runId}/`,
    jsxFactory: "__appletJsx",
    jsxFragment: "__appletFragment",
    inject: [jsxInjectPath],
    loader: {
      ".json": "json",
      ".png": "file",
      ".jpg": "file",
      ".jpeg": "file",
      ".gif": "file",
      ".webp": "file",
      ".svg": "file",
      ".css": "empty",
      ".txt": "text",
      ".md": "text",
    },
    plugins: [appletCoreAliasPlugin],
  });

  const stylesheetFile = await buildAppletStylesheet(sourceDir, outDir);

  return {
    runId,
    outDir,
    entryFile: path.join(outDir, "main.mjs"),
    stylesheetFile,
  };
}
