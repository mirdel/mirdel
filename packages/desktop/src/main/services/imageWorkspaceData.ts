import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { app, nativeImage } from "electron";
import { getDb } from "./db";
import { tMain } from "../i18n";

type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
type ImageTaskType = "generate" | "edit";

type ComposerTaskConfig = {
  modelKey: string;
  aspectRatio: string;
  size: string;
  quality: string;
  sizeInputMode: "preset" | "custom";
  count: number;
  seed: number | null;
  negativePrompt: string;
  promptExtend: boolean;
  watermark: boolean;
  editFunction: string;
  providerOptions: Record<string, unknown>;
};

type ComposerConfig = {
  activeTask: ImageTaskType;
  byTask: {
    generate: ComposerTaskConfig;
    edit: ComposerTaskConfig;
  };
};

export type ImageWorkspaceRecord = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastComposer?: ComposerConfig;
};

export type ImageGenerationRunRecord = {
  id: string;
  generationId: string;
  prompt: string;
  status: GenerationStatus;
  selectedModel: string;
  params: Record<string, any>;
  errorMessage?: string;
  warningMessage?: string;
  startedAt: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type ImageAssetRecord = {
  id: string;
  assetId: string;
  generationId: string;
  runId: string;
  filePath: string;
  mediaType: string;
  width?: number;
  height?: number;
  sortOrder: number;
  createdAt: number;
  runPrompt?: string;
  runSelectedModel?: string;
  runParams?: Record<string, any>;
  runStatus?: GenerationStatus;
  runCreatedAt?: number;
  runStartedAt?: number;
  runCompletedAt?: number;
};

export type ImageGenerationRecord = {
  id: string;
  workspaceId: string;
  prompt: string;
  status: GenerationStatus;
  selectedModel: string;
  params: Record<string, any>;
  errorMessage?: string;
  warningMessage?: string;
  createdAt: number;
  updatedAt: number;
  runs: ImageGenerationRunRecord[];
  images: ImageAssetRecord[];
};

type AssetInput = {
  id?: string;
  src?: string;
  filePath?: string;
  mediaType?: string;
  createdAt?: number;
};

function now() {
  return Date.now();
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

function uuidV7() {
  const bytes = randomBytes(16);
  const ts = BigInt(Date.now());

  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);

  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeParseJson<T>(input: string | null | undefined, fallback: T): T {
  if (!input) return fallback;
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function sanitizeComposerTaskConfig(input: Partial<ComposerTaskConfig> | undefined): ComposerTaskConfig {
  return {
    modelKey: typeof input?.modelKey === "string" ? input.modelKey : "",
    aspectRatio: typeof input?.aspectRatio === "string" ? input.aspectRatio : "",
    size: typeof input?.size === "string" ? input.size : "",
    quality: typeof input?.quality === "string" ? input.quality : "",
    sizeInputMode: input?.sizeInputMode === "custom" ? "custom" : "preset",
    count: typeof input?.count === "number" ? input.count : 1,
    seed: typeof input?.seed === "number" && Number.isFinite(input.seed) ? Math.floor(input.seed) : null,
    negativePrompt: typeof input?.negativePrompt === "string" ? input.negativePrompt : "",
    promptExtend: typeof input?.promptExtend === "boolean" ? input.promptExtend : false,
    watermark: typeof input?.watermark === "boolean" ? input.watermark : false,
    editFunction: typeof input?.editFunction === "string" ? input.editFunction : "",
    providerOptions: input?.providerOptions && typeof input.providerOptions === "object" && !Array.isArray(input.providerOptions)
      ? { ...input.providerOptions }
      : {},
  };
}

function sanitizeComposerConfig(input: Partial<ComposerConfig> | undefined): ComposerConfig {
  return {
    activeTask: input?.activeTask === "edit" ? "edit" : "generate",
    byTask: {
      generate: sanitizeComposerTaskConfig(input?.byTask?.generate),
      edit: sanitizeComposerTaskConfig(input?.byTask?.edit),
    },
  };
}

function normalizeGenerationParams(input: Record<string, any> | undefined): Record<string, any> {
  const params = input && typeof input === "object" ? input : {};
  const maskImageRaw = params.maskImage;
  const maskImage =
    maskImageRaw && typeof maskImageRaw === "object" && typeof maskImageRaw.url === "string" && maskImageRaw.url.trim().length > 0
      ? {
          ...(typeof maskImageRaw.id === "string" ? { id: maskImageRaw.id } : {}),
          ...(typeof maskImageRaw.name === "string" ? { name: maskImageRaw.name } : {}),
          url: maskImageRaw.url,
        }
      : undefined;
  return {
    taskType: params.taskType === "edit" ? "edit" : "generate",
    modelKey: typeof params.modelKey === "string" ? params.modelKey : "",
    aspectRatio: typeof params.aspectRatio === "string" ? params.aspectRatio : "",
    size: typeof params.size === "string" ? params.size : "",
    quality: typeof params.quality === "string" ? params.quality : "",
    count: typeof params.count === "number" ? params.count : 1,
    seed: typeof params.seed === "number" && Number.isFinite(params.seed) ? Math.floor(params.seed) : null,
    negativePrompt: typeof params.negativePrompt === "string" ? params.negativePrompt : "",
    promptExtend: typeof params.promptExtend === "boolean" ? params.promptExtend : false,
    watermark: typeof params.watermark === "boolean" ? params.watermark : false,
    editFunction: typeof params.editFunction === "string" ? params.editFunction : "",
    providerOptions: params.providerOptions && typeof params.providerOptions === "object" && !Array.isArray(params.providerOptions)
      ? { ...params.providerOptions }
      : {},
    referenceImages: Array.isArray(params.referenceImages) ? params.referenceImages : [],
    ...(maskImage ? { maskImage } : {}),
  };
}

function extFromMediaType(mediaType: string) {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/gif") return "gif";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/svg+xml") return "svg";
  return "bin";
}

function inferMediaTypeFromPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function parseDataUrl(input: string): { mediaType: string; bytes: Buffer } | null {
  const match = input.match(/^data:([^,]*?),(.*)$/i);
  if (!match) return null;

  const meta = match[1] || "";
  const payload = match[2] || "";
  const isBase64 = /;base64/i.test(meta);
  const mediaTypeToken = meta
    .split(";")
    .map((token) => token.trim())
    .find((token) => token.length > 0 && token.includes("/"));
  const mediaType = mediaTypeToken || "application/octet-stream";

  if (isBase64) {
    return { mediaType, bytes: Buffer.from(payload, "base64") };
  }

  try {
    return { mediaType, bytes: Buffer.from(decodeURIComponent(payload), "utf8") };
  } catch {
    return { mediaType, bytes: Buffer.from(payload, "utf8") };
  }
}

function getAssetDir() {
  return path.join(app.getPath("userData"), "assets");
}

function isPathInside(parent: string, target: string) {
  const relative = path.relative(parent, target);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function persistAssetToStore(
  input: AssetInput & { assetId: string }
): Promise<{ filePath: string; mediaType: string; size: number; wroteNewFile: boolean } | null> {
  const existingPath = typeof input.filePath === "string" ? input.filePath : "";
  if (existingPath) {
    const abs = path.resolve(existingPath);
    const assetRoot = path.resolve(getAssetDir());
    if (isPathInside(assetRoot, abs) && (await fileExists(abs))) {
      const stat = await fs.stat(abs);
      return {
        filePath: abs,
        mediaType: input.mediaType || inferMediaTypeFromPath(abs),
        size: Number(stat.size) || 0,
        wroteNewFile: false,
      };
    }
  }

  const src = typeof input.src === "string" ? input.src : "";
  if (!src) return null;

  let mediaType = input.mediaType || "application/octet-stream";
  let bytes: Buffer | null = null;

  const parsed = parseDataUrl(src);
  if (parsed) {
    mediaType = parsed.mediaType;
    bytes = parsed.bytes;
  } else if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src);
    const arr = await res.arrayBuffer();
    bytes = Buffer.from(arr);
    mediaType = res.headers.get("content-type") || mediaType;
  } else if (/^[A-Za-z0-9+/=\s]+$/.test(src)) {
    bytes = Buffer.from(src.replace(/\s+/g, ""), "base64");
  } else {
    return null;
  }

  const assetId = input.assetId.replace(/[^a-zA-Z0-9_-]/g, "");
  const ext = extFromMediaType(mediaType);
  const dir = getAssetDir();
  const target = path.join(dir, `${assetId}.${ext}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(target, bytes);
  return { filePath: target, mediaType, size: bytes.length, wroteNewFile: true };
}

function readImageDimensions(filePath: string, mediaType: string): { width?: number; height?: number } {
  if (!mediaType.startsWith("image/")) return {};
  try {
    const img = nativeImage.createFromPath(filePath);
    const size = img.getSize();
    if (!size || size.width <= 0 || size.height <= 0) return {};
    return { width: size.width, height: size.height };
  } catch {
    return {};
  }
}

async function cleanupOrphanAsset(assetId: string, filePath?: string) {
  const db = getDb();
  const ref = db.prepare("SELECT id FROM asset_links WHERE assetId = ? LIMIT 1").get(assetId) as { id: string } | undefined;
  if (ref) return;

  const row = db
    .prepare("SELECT filePath FROM assets WHERE id = ?")
    .get(assetId) as { filePath: string } | undefined;
  db.prepare("DELETE FROM assets WHERE id = ?").run(assetId);

  const targetPath = filePath || row?.filePath;
  if (!targetPath) return;
  try {
    await fs.unlink(targetPath);
  } catch {
    // ignore
  }
}

export function listImageWorkspaces(): ImageWorkspaceRecord[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, name, lastComposerJson, createdAt, updatedAt FROM image_workspaces ORDER BY updatedAt DESC")
    .all() as Array<{ id: string; name: string; lastComposerJson: string | null; createdAt: number; updatedAt: number }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastComposer: sanitizeComposerConfig(safeParseJson<ComposerConfig | undefined>(row.lastComposerJson, undefined)),
  }));
}

export function createImageWorkspace(input: { name?: string; lastComposer?: Partial<ComposerConfig> }) {
  const db = getDb();
  const ts = now();
  const workspace: ImageWorkspaceRecord = {
    id: uid("workspace"),
    name: (input.name || "").trim() || tMain("image.workspaceDefaultName"),
    createdAt: ts,
    updatedAt: ts,
    lastComposer: sanitizeComposerConfig(input.lastComposer),
  };

  db.prepare(
    "INSERT INTO image_workspaces (id, name, lastComposerJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)"
  ).run(workspace.id, workspace.name, JSON.stringify(workspace.lastComposer), workspace.createdAt, workspace.updatedAt);
  return workspace;
}

export function renameImageWorkspace(input: { workspaceId: string; name: string }) {
  const db = getDb();
  const ts = now();
  db.prepare("UPDATE image_workspaces SET name = ?, updatedAt = ? WHERE id = ?").run(
    input.name.trim() || tMain("image.workspaceDefaultName"),
    ts,
    input.workspaceId
  );
  return { ok: true };
}

export async function deleteImageWorkspace(input: { workspaceId: string }) {
  const db = getDb();
  const deleteTx = db.transaction((workspaceId: string) => {
    const assetRows = db
      .prepare(
        `SELECT DISTINCT l.assetId AS assetId, a.filePath AS filePath
         FROM asset_links l
         JOIN assets a ON a.id = l.assetId
         JOIN image_generation_runs r ON r.id = l.ownerId
         JOIN image_generations g ON g.id = r.generationId
         WHERE l.ownerType = 'image_generation_run'
           AND g.workspaceId = ?`
      )
      .all(workspaceId) as Array<{ assetId: string; filePath: string }>;

    db.prepare(
      `DELETE FROM asset_links
       WHERE ownerType = 'image_generation_run'
         AND ownerId IN (
           SELECT r.id
           FROM image_generation_runs r
           JOIN image_generations g ON g.id = r.generationId
           WHERE g.workspaceId = ?
         )`
    ).run(workspaceId);
    db.prepare("DELETE FROM image_generation_runs WHERE generationId IN (SELECT id FROM image_generations WHERE workspaceId = ?)").run(workspaceId);
    db.prepare("DELETE FROM image_generations WHERE workspaceId = ?").run(workspaceId);
    db.prepare("DELETE FROM image_workspaces WHERE id = ?").run(workspaceId);

    return assetRows;
  });

  const assetRows = deleteTx(input.workspaceId);

  for (const row of assetRows) {
    await cleanupOrphanAsset(row.assetId, row.filePath);
  }

  return { ok: true };
}

export function updateImageWorkspaceLastComposer(input: { workspaceId: string; lastComposer: Partial<ComposerConfig> }) {
  const db = getDb();
  const current = db.prepare("SELECT lastComposerJson FROM image_workspaces WHERE id = ?").get(input.workspaceId) as { lastComposerJson: string | null } | undefined;
  const currentConfig = sanitizeComposerConfig(safeParseJson<ComposerConfig | undefined>(current?.lastComposerJson, undefined));
  const nextInput = input.lastComposer || {};
  const merged = sanitizeComposerConfig({
    activeTask: nextInput.activeTask ?? currentConfig.activeTask,
    byTask: {
      generate: {
        ...currentConfig.byTask.generate,
        ...(nextInput.byTask?.generate || {}),
      },
      edit: {
        ...currentConfig.byTask.edit,
        ...(nextInput.byTask?.edit || {}),
      },
    },
  });
  const nextJson = JSON.stringify(merged);
  const currentJson = JSON.stringify(currentConfig);
  if (nextJson === currentJson) return { ok: true };
  db.prepare("UPDATE image_workspaces SET lastComposerJson = ? WHERE id = ?").run(
    nextJson,
    input.workspaceId
  );
  return { ok: true };
}

function listRunsByWorkspace(workspaceId: string): ImageGenerationRunRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.id, r.generationId, r.prompt, r.status, r.selectedModel, r.paramsJson, r.errorMessage, r.warningMessage, r.createdAt, r.updatedAt
       , r.startedAt, r.completedAt
       FROM image_generation_runs r
       JOIN image_generations g ON g.id = r.generationId
       WHERE g.workspaceId = ?
       ORDER BY r.createdAt ASC`
    )
    .all(workspaceId) as Array<{
    id: string;
    generationId: string;
    prompt: string;
    status: GenerationStatus;
    selectedModel: string;
    paramsJson: string | null;
    errorMessage: string | null;
    warningMessage: string | null;
    startedAt: number | null;
    completedAt: number | null;
    createdAt: number;
    updatedAt: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    generationId: row.generationId,
    prompt: row.prompt,
    status: row.status,
    selectedModel: row.selectedModel,
    params: safeParseJson<Record<string, any>>(row.paramsJson, {}),
    errorMessage: row.errorMessage || undefined,
    warningMessage: row.warningMessage || undefined,
    startedAt: row.startedAt ?? row.createdAt,
    completedAt: row.completedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function listImageGenerationsByWorkspace(input: { workspaceId: string }): ImageGenerationRecord[] {
  const db = getDb();
  const generationRows = db
    .prepare("SELECT id, workspaceId, createdAt, updatedAt FROM image_generations WHERE workspaceId = ? ORDER BY createdAt ASC")
    .all(input.workspaceId) as Array<{
    id: string;
    workspaceId: string;
    createdAt: number;
    updatedAt: number;
  }>;

  const runs = listRunsByWorkspace(input.workspaceId);
  const runsByGeneration = new Map<string, ImageGenerationRunRecord[]>();
  const runById = new Map<string, ImageGenerationRunRecord>();
  for (const run of runs) {
    const list = runsByGeneration.get(run.generationId) || [];
    list.push(run);
    runsByGeneration.set(run.generationId, list);
    runById.set(run.id, run);
  }

  const assetRows = db
    .prepare(
      `SELECT l.id AS linkId, l.assetId AS assetId, l.ownerId AS runId, r.generationId AS generationId,
              a.filePath AS filePath, a.mediaType AS mediaType, a.width AS width, a.height AS height,
              l.sortOrder AS sortOrder, l.createdAt AS linkCreatedAt, a.createdAt AS assetCreatedAt
       FROM asset_links l
       JOIN assets a ON a.id = l.assetId
       JOIN image_generation_runs r ON r.id = l.ownerId
       JOIN image_generations g ON g.id = r.generationId
       WHERE l.ownerType = 'image_generation_run'
         AND g.workspaceId = ?
       ORDER BY r.generationId ASC, r.createdAt ASC, l.sortOrder ASC, l.createdAt ASC`
    )
    .all(input.workspaceId) as Array<{
    linkId: string;
    assetId: string;
    generationId: string;
    runId: string;
    filePath: string;
    mediaType: string | null;
    width: number | null;
    height: number | null;
    sortOrder: number;
    linkCreatedAt: number;
    assetCreatedAt: number;
  }>;

  const assetsByGeneration = new Map<string, ImageAssetRecord[]>();
  for (const row of assetRows) {
    const run = runById.get(row.runId);
    const list = assetsByGeneration.get(row.generationId) || [];
    list.push({
      id: row.linkId,
      assetId: row.assetId,
      generationId: row.generationId,
      runId: row.runId,
      filePath: row.filePath,
      mediaType: row.mediaType || inferMediaTypeFromPath(row.filePath),
      width: row.width ?? undefined,
      height: row.height ?? undefined,
      sortOrder: row.sortOrder,
      createdAt: row.assetCreatedAt || row.linkCreatedAt,
      runPrompt: run?.prompt,
      runSelectedModel: run?.selectedModel,
      runParams: normalizeGenerationParams(run?.params),
      runStatus: run?.status,
      runCreatedAt: run?.createdAt,
      runStartedAt: run?.startedAt,
      runCompletedAt: run?.completedAt,
    });
    assetsByGeneration.set(row.generationId, list);
  }

  return generationRows.map((row) => {
    const generationRuns = runsByGeneration.get(row.id) || [];
    const latestRun = generationRuns[generationRuns.length - 1];
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      prompt: latestRun?.prompt || "",
      status: latestRun?.status || "queued",
      selectedModel: latestRun?.selectedModel || "",
      params: normalizeGenerationParams(latestRun?.params),
      errorMessage: latestRun?.errorMessage,
      warningMessage: latestRun?.warningMessage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      runs: generationRuns,
      images: assetsByGeneration.get(row.id) || [],
    };
  });
}

export function createImageGeneration(input: {
  workspaceId: string;
  prompt?: string;
  status?: GenerationStatus;
  selectedModel?: string;
  params?: Record<string, any>;
}) {
  const db = getDb();
  const workspace = db.prepare("SELECT id FROM image_workspaces WHERE id = ?").get(input.workspaceId) as { id: string } | undefined;
  if (!workspace) {
    throw new Error("image workspace not found");
  }
  const ts = now();
  const generation: ImageGenerationRecord = {
    id: uid("generation"),
    workspaceId: input.workspaceId,
    prompt: input.prompt || "",
    status: input.status || "queued",
    selectedModel: input.selectedModel || "",
    params: normalizeGenerationParams(input.params),
    createdAt: ts,
    updatedAt: ts,
    runs: [],
    images: [],
  };

  db.prepare(
    `INSERT INTO image_generations (id, workspaceId, prompt, status, selectedModel, paramsJson, errorMessage, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(
    generation.id,
    generation.workspaceId,
    generation.prompt,
    generation.status,
    generation.selectedModel,
    JSON.stringify(generation.params),
    generation.createdAt,
    generation.updatedAt
  );

  db.prepare("UPDATE image_workspaces SET updatedAt = ? WHERE id = ?").run(ts, input.workspaceId);
  return generation;
}

export function createImageGenerationRun(input: {
  generationId: string;
  prompt: string;
  status: GenerationStatus;
  selectedModel: string;
  params: Record<string, any>;
}) {
  const db = getDb();
  const ts = now();
  const run: ImageGenerationRunRecord = {
    id: uid("run"),
    generationId: input.generationId,
    prompt: input.prompt,
    status: input.status,
    selectedModel: input.selectedModel,
    params: normalizeGenerationParams(input.params),
    startedAt: ts,
    createdAt: ts,
    updatedAt: ts,
  };

  db.prepare(
    `INSERT INTO image_generation_runs (id, generationId, prompt, status, selectedModel, paramsJson, errorMessage, warningMessage, startedAt, completedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?)`
  ).run(run.id, run.generationId, run.prompt, run.status, run.selectedModel, JSON.stringify(run.params), run.startedAt, run.createdAt, run.updatedAt);

  db.prepare("UPDATE image_generations SET updatedAt = ? WHERE id = ?").run(ts, input.generationId);
  db.prepare(
    "UPDATE image_workspaces SET updatedAt = ? WHERE id = (SELECT workspaceId FROM image_generations WHERE id = ?)"
  ).run(ts, input.generationId);
  return run;
}

export function updateImageGenerationStatus(input: {
  generationId: string;
  status: GenerationStatus;
  errorMessage?: string;
  warningMessage?: string;
}) {
  const db = getDb();
  const latestRun = db
    .prepare("SELECT id FROM image_generation_runs WHERE generationId = ? ORDER BY createdAt DESC LIMIT 1")
    .get(input.generationId) as { id: string } | undefined;
  if (!latestRun) return { ok: false, error: "run not found" };

  const ts = now();
  const isTerminal = input.status === "succeeded" || input.status === "failed" || input.status === "cancelled";
  db.prepare("UPDATE image_generation_runs SET status = ?, errorMessage = ?, warningMessage = ?, completedAt = ?, updatedAt = ? WHERE id = ?").run(
    input.status,
    input.errorMessage || null,
    input.warningMessage || null,
    isTerminal ? ts : null,
    ts,
    latestRun.id
  );
  db.prepare("UPDATE image_generations SET updatedAt = ? WHERE id = ?").run(ts, input.generationId);
  db.prepare(
    "UPDATE image_workspaces SET updatedAt = ? WHERE id = (SELECT workspaceId FROM image_generations WHERE id = ?)"
  ).run(ts, input.generationId);
  return { ok: true, runId: latestRun.id };
}

export function updateImageGenerationRunStatus(input: {
  runId: string;
  status: GenerationStatus;
  errorMessage?: string;
  warningMessage?: string;
}) {
  const db = getDb();
  const row = db
    .prepare("SELECT generationId FROM image_generation_runs WHERE id = ?")
    .get(input.runId) as { generationId: string } | undefined;
  if (!row) return { ok: false, error: "run not found" };

  const ts = now();
  const isTerminal = input.status === "succeeded" || input.status === "failed" || input.status === "cancelled";
  db.prepare("UPDATE image_generation_runs SET status = ?, errorMessage = ?, warningMessage = ?, completedAt = ?, updatedAt = ? WHERE id = ?").run(
    input.status,
    input.errorMessage || null,
    input.warningMessage || null,
    isTerminal ? ts : null,
    ts,
    input.runId
  );
  db.prepare("UPDATE image_generations SET updatedAt = ? WHERE id = ?").run(ts, row.generationId);
  db.prepare(
    "UPDATE image_workspaces SET updatedAt = ? WHERE id = (SELECT workspaceId FROM image_generations WHERE id = ?)"
  ).run(ts, row.generationId);
  return { ok: true };
}

export async function appendImageGenerationAssets(input: {
  generationId: string;
  runId: string;
  assets: AssetInput[];
}) {
  const db = getDb();
  const runRow = db
    .prepare("SELECT generationId FROM image_generation_runs WHERE id = ?")
    .get(input.runId) as { generationId: string } | undefined;
  if (!runRow) {
    throw new Error("run not found");
  }
  if (runRow.generationId !== input.generationId) {
    throw new Error("run does not belong to generation");
  }

  const existedCountRow = db
    .prepare("SELECT COUNT(1) AS c FROM asset_links WHERE ownerType = 'image_generation_run' AND ownerId = ?")
    .get(input.runId) as { c: number };
  let sortOrder = existedCountRow?.c ?? 0;

  type PendingInsert = {
    linkId: string;
    assetId: string;
    filePath: string;
    mediaType: string;
    size: number;
    width?: number;
    height?: number;
    sortOrder: number;
    createdAt: number;
    needsAssetInsert: boolean;
    deleteOnFailure: boolean;
  };

  const pending: PendingInsert[] = [];
  for (const rawAsset of input.assets || []) {
    const newAssetId = uuidV7();
    const linkId = uuidV7();
    const persisted = await persistAssetToStore({ ...rawAsset, assetId: newAssetId });
    if (!persisted) continue;
    const createdAt = typeof rawAsset.createdAt === "number" ? rawAsset.createdAt : now();
    const existingAsset = db
      .prepare("SELECT id, mediaType, size, width, height, createdAt FROM assets WHERE filePath = ?")
      .get(persisted.filePath) as {
      id: string;
      mediaType: string | null;
      size: number | null;
      width: number | null;
      height: number | null;
      createdAt: number;
    } | undefined;

    if (existingAsset) {
      pending.push({
        linkId,
        assetId: existingAsset.id,
        filePath: persisted.filePath,
        mediaType: existingAsset.mediaType || persisted.mediaType,
        size: existingAsset.size ?? persisted.size,
        width: existingAsset.width ?? undefined,
        height: existingAsset.height ?? undefined,
        sortOrder,
        createdAt: existingAsset.createdAt,
        needsAssetInsert: false,
        deleteOnFailure: false,
      });
    } else {
      const dims = readImageDimensions(persisted.filePath, persisted.mediaType);
      pending.push({
        linkId,
        assetId: newAssetId,
        filePath: persisted.filePath,
        mediaType: persisted.mediaType,
        size: persisted.size,
        width: dims.width,
        height: dims.height,
        sortOrder,
        createdAt,
        needsAssetInsert: true,
        deleteOnFailure: persisted.wroteNewFile,
      });
    }
    sortOrder += 1;
  }

  const commitTx = db.transaction((rows: PendingInsert[]) => {
    const run = db
      .prepare("SELECT generationId FROM image_generation_runs WHERE id = ?")
      .get(input.runId) as { generationId: string } | undefined;
    if (!run) throw new Error("run not found");
    if (run.generationId !== input.generationId) throw new Error("run does not belong to generation");

    for (const row of rows) {
      if (row.needsAssetInsert) {
        db.prepare(
          `INSERT INTO assets (id, filePath, mediaType, size, width, height, sha256, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`
        ).run(
          row.assetId,
          row.filePath,
          row.mediaType,
          row.size,
          row.width ?? null,
          row.height ?? null,
          row.createdAt,
          row.createdAt
        );
      }

      db.prepare(
        `INSERT INTO asset_links (id, assetId, ownerType, ownerId, role, sortOrder, createdAt, metaJson)
         VALUES (?, ?, 'image_generation_run', ?, 'output', ?, ?, ?)`
      ).run(
        row.linkId,
        row.assetId,
        input.runId,
        row.sortOrder,
        row.createdAt,
        JSON.stringify({ generationId: input.generationId })
      );
    }

    const ts = now();
    db.prepare("UPDATE image_generation_runs SET updatedAt = ? WHERE id = ?").run(ts, input.runId);
    db.prepare("UPDATE image_generations SET updatedAt = ? WHERE id = ?").run(ts, input.generationId);
    db.prepare(
      "UPDATE image_workspaces SET updatedAt = ? WHERE id = (SELECT workspaceId FROM image_generations WHERE id = ?)"
    ).run(ts, input.generationId);
  });

  try {
    commitTx(pending);
  } catch (error) {
    for (const row of pending) {
      if (!row.deleteOnFailure) continue;
      try {
        await fs.unlink(row.filePath);
      } catch {
        // ignore
      }
    }
    throw error;
  }

  return pending.map((row) => ({
    id: row.linkId,
    assetId: row.assetId,
    generationId: input.generationId,
    runId: input.runId,
    filePath: row.filePath,
    mediaType: row.mediaType,
    width: row.width,
    height: row.height,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  }));
}

export async function deleteImageAsset(input: { linkId: string }) {
  const db = getDb();
  const deleteTx = db.transaction((linkId: string) => {
    const row = db
      .prepare(
        `SELECT l.assetId AS assetId, a.filePath AS filePath, r.id AS runId, r.generationId AS generationId, g.workspaceId AS workspaceId
         FROM asset_links l
         JOIN assets a ON a.id = l.assetId
         JOIN image_generation_runs r ON r.id = l.ownerId
         JOIN image_generations g ON g.id = r.generationId
         WHERE l.id = ? AND l.ownerType = 'image_generation_run'`
      )
      .get(linkId) as { assetId: string; filePath: string; generationId: string; runId: string; workspaceId: string } | undefined;
    if (!row) return undefined;

    db.prepare("DELETE FROM asset_links WHERE id = ?").run(linkId);
    const ts = now();
    db.prepare("UPDATE image_generation_runs SET updatedAt = ? WHERE id = ?").run(ts, row.runId);
    db.prepare("UPDATE image_generations SET updatedAt = ? WHERE id = ?").run(ts, row.generationId);
    db.prepare("UPDATE image_workspaces SET updatedAt = ? WHERE id = ?").run(ts, row.workspaceId);
    return row;
  });

  const row = deleteTx(input.linkId);
  if (!row) return { ok: false, error: "asset not found" };

  await cleanupOrphanAsset(row.assetId, row.filePath);

  return { ok: true };
}

export async function deleteImageGeneration(input: { generationId: string }) {
  const db = getDb();
  const deleteTx = db.transaction((generationId: string) => {
    const generation = db
      .prepare("SELECT workspaceId FROM image_generations WHERE id = ?")
      .get(generationId) as { workspaceId: string } | undefined;
    if (!generation) return undefined;

    const assets = db
      .prepare(
        `SELECT DISTINCT l.assetId AS assetId, a.filePath AS filePath
         FROM asset_links l
         JOIN assets a ON a.id = l.assetId
         WHERE l.ownerType = 'image_generation_run'
           AND l.ownerId IN (SELECT id FROM image_generation_runs WHERE generationId = ?)`
      )
      .all(generationId) as Array<{ assetId: string; filePath: string }>;

    db.prepare(
      `DELETE FROM asset_links
       WHERE ownerType = 'image_generation_run'
         AND ownerId IN (SELECT id FROM image_generation_runs WHERE generationId = ?)`
    ).run(generationId);
    db.prepare("DELETE FROM image_generation_runs WHERE generationId = ?").run(generationId);
    db.prepare("DELETE FROM image_generations WHERE id = ?").run(generationId);
    db.prepare("UPDATE image_workspaces SET updatedAt = ? WHERE id = ?").run(now(), generation.workspaceId);
    return assets;
  });

  const assets = deleteTx(input.generationId);
  if (!assets) return { ok: false, error: "generation not found" };

  for (const asset of assets) {
    await cleanupOrphanAsset(asset.assetId, asset.filePath);
  }

  return { ok: true };
}
