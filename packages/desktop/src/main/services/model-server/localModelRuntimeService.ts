import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { loggerServiceMain } from "@shared";
import { modelServerManager } from "./ModelServerManager";
import {
  getLocalModelCatalogEntry,
  listLocalModelCatalog,
  type LocalModelCatalogEntry,
  type LocalModelExtraFile,
  type LocalModelResourceRequirements,
} from "./localModelCatalog";

const logger = loggerServiceMain.withContext("LocalModelRuntimeService");

export type LocalModelRuntimeState =
  | "not_downloaded"
  | "downloading"
  | "downloaded"
  | "loading"
  | "loaded"
  | "error";

export type LocalModelAvailability =
  | "available"
  | "limited"
  | "unavailable"
  | "unknown";

export type LocalModelAvailabilityReason =
  | "total_meets_recommended"
  | "total_below_recommended"
  | "total_below_min"
  | "requirements_missing"
  | "device_memory_unavailable";

export type LocalModelRuntimeStatus = {
  modelId: string;
  modelName: string;
  modelType: LocalModelCatalogEntry["modelType"];
  fileName: string;
  sizeBytes?: number;
  resourceRequirements?: LocalModelResourceRequirements;
  deviceTotalMemoryBytes?: number;
  availability: LocalModelAvailability;
  availabilityReason: LocalModelAvailabilityReason;
  state: LocalModelRuntimeState;
  progress?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  speedBps?: number;
  error?: string;
};

type DownloadTask = {
  modelId: string;
  startedAt: number;
  downloadedBytes: number;
  totalBytes?: number;
  speedBps?: number;
  controller: AbortController;
};

type RuntimeError = {
  message: string;
  at: number;
};

type ModelDownloadArtifact = {
  fileName: string;
  sha256: string;
  sizeBytes?: number;
  downloadUrls: string[];
};

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "Unknown error");
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (
    error
    && typeof error === "object"
    && "name" in error
    && (error as { name?: unknown }).name === "AbortError"
  ) {
    return true;
  }
  const message = toSafeErrorMessage(error).toLowerCase();
  return message.includes("abort") || message.includes("cancel");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function computeProgress(downloadedBytes: number, totalBytes?: number): number | undefined {
  if (!totalBytes || totalBytes <= 0) return undefined;
  const ratio = downloadedBytes / totalBytes;
  const value = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LocalModelRuntimeService {
  private readonly downloading = new Map<string, DownloadTask>();
  private readonly runtimeErrors = new Map<string, RuntimeError>();
  private readonly ensuringReady = new Map<string, Promise<void>>();

  async listStatuses(): Promise<LocalModelRuntimeStatus[]> {
    const catalog = listLocalModelCatalog();
    const deviceTotalMemoryBytes = resolveDeviceTotalMemoryBytes();
    const serverStatus = await modelServerManager.fetchServerStatus();
    const modelsStatus = isObjectRecord(serverStatus?.models) ? (serverStatus?.models as Record<string, unknown>) : {};

    const statuses: LocalModelRuntimeStatus[] = [];

    for (const entry of catalog) {
      const status = await this.resolveModelStatus(entry, modelsStatus[entry.id], deviceTotalMemoryBytes);
      statuses.push(status);
    }

    return statuses;
  }

  downloadModel(modelId: string): void {
    const entry = getLocalModelCatalogEntry(modelId);
    if (!entry) throw new Error(`Unknown local model: ${modelId}`);
    if (this.downloading.has(entry.id)) return;

    const task: DownloadTask = {
      modelId: entry.id,
      startedAt: Date.now(),
      downloadedBytes: 0,
      controller: new AbortController(),
    };
    this.downloading.set(entry.id, task);
    this.runtimeErrors.delete(entry.id);

    void this.runDownload(entry, task).catch((error) => {
      logger.error("Background download task failed", { modelId: entry.id, error: toSafeErrorMessage(error) });
    });
  }

  private async runDownload(entry: LocalModelCatalogEntry, task: DownloadTask): Promise<void> {
    const artifacts = resolveModelArtifacts(entry);
    const totalBytes = artifacts
      .map((artifact) => artifact.sizeBytes)
      .reduce<number | undefined>((sum, current) => {
        if (sum === undefined || current === undefined) return undefined;
        return sum + current;
      }, 0);
    let completedBytes = 0;
    task.totalBytes = totalBytes;
    task.downloadedBytes = 0;
    task.speedBps = undefined;

    try {
      for (const artifact of artifacts) {
        const downloadedBytes = await this.ensureArtifactDownloaded({
          entry,
          artifact,
          task,
          completedBytes,
          totalBytes,
        });
        completedBytes += downloadedBytes;
        task.downloadedBytes = completedBytes;
      }
      this.runtimeErrors.delete(entry.id);
    } catch (error) {
      if (isAbortError(error)) {
        this.runtimeErrors.delete(entry.id);
        logger.info("Download canceled", { modelId: entry.id });
        return;
      } else {
        this.runtimeErrors.set(entry.id, { message: toSafeErrorMessage(error), at: Date.now() });
        logger.error("Download failed", { modelId: entry.id, error });
      }
      throw error;
    } finally {
      this.downloading.delete(entry.id);
    }
  }

  cancelDownload(modelId: string): void {
    const key = String(modelId || "").trim();
    const task = this.downloading.get(key);
    if (!task) return;
    task.controller.abort(new Error("download canceled by user"));
  }

  async loadModel(modelId: string): Promise<void> {
    const entry = getLocalModelCatalogEntry(modelId);
    if (!entry) throw new Error(`Unknown local model: ${modelId}`);

    const artifacts = resolveModelArtifacts(entry);
    for (const artifact of artifacts) {
      const artifactPath = modelServerManager.getModelFilePath(artifact.fileName);
      if (!(await fileExists(artifactPath))) {
        throw new Error(`Model artifact is not downloaded: ${artifact.fileName}`);
      }
    }

    await modelServerManager.preloadModel(entry.id);
    this.runtimeErrors.delete(entry.id);
  }

  async ensureModelReady(modelId: string, options?: { timeoutMs?: number; pollIntervalMs?: number }): Promise<void> {
    const normalizedModelId = String(modelId || "").trim();
    if (!normalizedModelId) throw new Error("modelId is required");
    const entry = getLocalModelCatalogEntry(normalizedModelId);
    if (!entry) throw new Error(`Unknown local model: ${modelId}`);

    const existing = this.ensuringReady.get(entry.id);
    if (existing) {
      await existing;
      return;
    }

    const task = this.ensureModelReadyInternal(entry.id, options)
      .finally(() => {
        this.ensuringReady.delete(entry.id);
      });
    this.ensuringReady.set(entry.id, task);
    await task;
  }

  async unloadModel(modelId: string): Promise<void> {
    const entry = getLocalModelCatalogEntry(modelId);
    if (!entry) throw new Error(`Unknown local model: ${modelId}`);

    await modelServerManager.unloadModel(entry.id);
    this.runtimeErrors.delete(entry.id);
  }

  private async ensureModelReadyInternal(modelId: string, options?: { timeoutMs?: number; pollIntervalMs?: number }): Promise<void> {
    const runtime = await this.getStatusById(modelId);
    if (!runtime) {
      throw new Error(`Unknown local model runtime: ${modelId}`);
    }

    if (runtime.state === "loaded") return;

    if (runtime.state === "loading") {
      await this.waitUntilLoaded(modelId, options);
      return;
    }

    if (runtime.state === "downloaded") {
      await this.loadModel(modelId);
      await this.waitUntilLoaded(modelId, options);
      return;
    }

    if (runtime.state === "downloading") {
      throw new Error(`Local model is downloading: ${modelId}`);
    }

    if (runtime.state === "not_downloaded") {
      throw new Error(`Local model is not downloaded: ${modelId}`);
    }

    if (runtime.state === "error") {
      throw new Error(runtime.error || `Local model runtime error: ${modelId}`);
    }

    throw new Error(`Unsupported local model runtime state: ${runtime.state}`);
  }

  private async waitUntilLoaded(modelId: string, options?: { timeoutMs?: number; pollIntervalMs?: number }): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? 120000;
    const pollIntervalMs = options?.pollIntervalMs ?? 500;
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      const runtime = await this.getStatusById(modelId);
      if (!runtime) {
        throw new Error(`Unknown local model runtime: ${modelId}`);
      }
      if (runtime.state === "loaded") return;
      if (runtime.state === "error") {
        throw new Error(runtime.error || `Local model runtime error: ${modelId}`);
      }
      if (runtime.state === "not_downloaded" || runtime.state === "downloading") {
        throw new Error(`Local model is not ready: ${modelId}`);
      }
      await sleep(pollIntervalMs);
    }

    throw new Error(`Local model load timeout: ${modelId}`);
  }

  private async getStatusById(modelId: string): Promise<LocalModelRuntimeStatus | null> {
    const list = await this.listStatuses();
    return list.find((item) => item.modelId === modelId) ?? null;
  }

  private async resolveModelStatus(
    entry: LocalModelCatalogEntry,
    rawServerModelStatus: unknown,
    deviceTotalMemoryBytes: number | undefined
  ): Promise<LocalModelRuntimeStatus> {
    const availability = evaluateAvailability(entry.resourceRequirements, deviceTotalMemoryBytes);
    const base: LocalModelRuntimeStatus = {
      modelId: entry.id,
      modelName: entry.name,
      modelType: entry.modelType,
      fileName: entry.fileName,
      sizeBytes: entry.sizeBytes,
      resourceRequirements: entry.resourceRequirements ? { ...entry.resourceRequirements } : undefined,
      deviceTotalMemoryBytes,
      availability: availability.availability,
      availabilityReason: availability.reason,
      state: "not_downloaded",
    };

    const task = this.downloading.get(entry.id);
    if (task) {
      return {
        ...base,
        state: "downloading",
        downloadedBytes: task.downloadedBytes,
        totalBytes: task.totalBytes,
        speedBps: task.speedBps,
        progress: computeProgress(task.downloadedBytes, task.totalBytes),
      };
    }

    const downloaded = await this.isModelDownloaded(entry);
    if (!downloaded) {
      const error = this.runtimeErrors.get(entry.id);
      if (error) {
        return { ...base, state: "error", error: error.message };
      }
      return base;
    }

    const serverState = extractServerModelState(rawServerModelStatus);
    if (serverState === "ready") {
      return { ...base, state: "loaded" };
    }
    if (serverState === "loading") {
      return { ...base, state: "loading" };
    }

    const error = this.runtimeErrors.get(entry.id);
    if (error) {
      return { ...base, state: "error", error: error.message };
    }

    return { ...base, state: "downloaded" };
  }

  private async downloadWithFallback(
    context: {
      entry: LocalModelCatalogEntry;
      artifact: ModelDownloadArtifact;
      task: DownloadTask;
      targetFilePath: string;
      completedBytes: number;
      totalBytes?: number;
    }
  ): Promise<number> {
    const { entry, artifact, task, targetFilePath, completedBytes, totalBytes } = context;
    const errors: string[] = [];

    for (const url of artifact.downloadUrls) {
      try {
        return await this.downloadSingleUrl({
          entry,
          artifact,
          task,
          targetFilePath,
          url,
          completedBytes,
          totalBytes,
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        errors.push(`${url} => ${toSafeErrorMessage(error)}`);
        logger.warn("Download URL failed, try next", {
          modelId: entry.id,
          fileName: artifact.fileName,
          url,
          error: toSafeErrorMessage(error),
        });
      }
    }

    throw new Error(`All download URLs failed for ${artifact.fileName}: ${errors.join(" | ")}`);
  }

  private async downloadSingleUrl(
    context: {
      entry: LocalModelCatalogEntry;
      artifact: ModelDownloadArtifact;
      task: DownloadTask;
      targetFilePath: string;
      url: string;
      completedBytes: number;
      totalBytes?: number;
    }
  ): Promise<number> {
    const { artifact, task, targetFilePath, url, completedBytes, totalBytes } = context;
    const response = await fetch(url, { signal: task.controller.signal });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    const tempFilePath = `${targetFilePath}.downloading`;
    await fsp.rm(tempFilePath, { force: true });

    const expectedBytes = resolveContentLength(response.headers.get("content-length"), artifact.sizeBytes);
    task.totalBytes = totalBytes ?? expectedBytes;
    task.downloadedBytes = completedBytes;
    task.speedBps = undefined;

    const hash = createHash("sha256");
    const stream = fs.createWriteStream(tempFilePath, { flags: "w" });
    let downloadedCurrent = 0;

    try {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.length === 0) continue;
        downloadedCurrent += value.length;
        task.downloadedBytes = completedBytes + downloadedCurrent;
        const elapsedMs = Math.max(1, Date.now() - task.startedAt);
        task.speedBps = Math.round((task.downloadedBytes * 1000) / elapsedMs);
        hash.update(value);
        await writeChunk(stream, value);
      }
      await closeStream(stream);
    } catch (error) {
      stream.destroy();
      await fsp.rm(tempFilePath, { force: true });
      throw error;
    }

    const finalHash = hash.digest("hex").toLowerCase();
    if (finalHash !== artifact.sha256) {
      await fsp.rm(tempFilePath, { force: true });
      throw new Error(`SHA256 mismatch: expected=${artifact.sha256} actual=${finalHash}`);
    }

    await fsp.rename(tempFilePath, targetFilePath);
    return downloadedCurrent;
  }

  private async ensureArtifactDownloaded(params: {
    entry: LocalModelCatalogEntry;
    artifact: ModelDownloadArtifact;
    task: DownloadTask,
    completedBytes: number;
    totalBytes?: number;
  }): Promise<number> {
    const { entry, artifact, task, completedBytes, totalBytes } = params;
    const targetFilePath = modelServerManager.getModelFilePath(artifact.fileName);
    await fsp.mkdir(path.dirname(targetFilePath), { recursive: true });

    const existing = await fileExists(targetFilePath);
    if (existing) {
      const existingHash = await this.computeFileSha256(targetFilePath);
      if (existingHash === artifact.sha256) {
        const stat = await fsp.stat(targetFilePath);
        return stat.size;
      }
      await fsp.rm(targetFilePath, { force: true });
    }

    return this.downloadWithFallback({
      entry,
      artifact,
      task,
      targetFilePath,
      completedBytes,
      totalBytes,
    });
  }

  private async computeFileSha256(filePath: string): Promise<string> {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);
    for await (const chunk of stream) {
      hash.update(chunk as Buffer);
    }
    return hash.digest("hex").toLowerCase();
  }

  private async isModelDownloaded(entry: LocalModelCatalogEntry): Promise<boolean> {
    const artifacts = resolveModelArtifacts(entry);
    for (const artifact of artifacts) {
      const artifactPath = modelServerManager.getModelFilePath(artifact.fileName);
      if (!(await fileExists(artifactPath))) {
        return false;
      }
    }
    return true;
  }
}

function resolveContentLength(raw: string | null, fallback?: number): number | undefined {
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }
  return undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractServerModelState(raw: unknown): string | null {
  if (!isObjectRecord(raw)) return null;
  const state = raw.state;
  return typeof state === "string" ? state : null;
}

function resolveDeviceTotalMemoryBytes(): number | undefined {
  const total = os.totalmem();
  if (!Number.isFinite(total) || total <= 0) {
    return undefined;
  }
  return Math.round(total);
}

function evaluateAvailability(
  requirements: LocalModelResourceRequirements | undefined,
  deviceTotalMemoryBytes: number | undefined
): { availability: LocalModelAvailability; reason: LocalModelAvailabilityReason } {
  const minRamBytes = requirements?.minRamBytes;
  const recommendedRamBytes = requirements?.recommendedRamBytes;
  if (!minRamBytes && !recommendedRamBytes) {
    return { availability: "unknown", reason: "requirements_missing" };
  }
  if (!deviceTotalMemoryBytes) {
    return { availability: "unknown", reason: "device_memory_unavailable" };
  }

  if (minRamBytes && deviceTotalMemoryBytes < minRamBytes) {
    return { availability: "unavailable", reason: "total_below_min" };
  }

  if (recommendedRamBytes && deviceTotalMemoryBytes < recommendedRamBytes) {
    return { availability: "limited", reason: "total_below_recommended" };
  }

  return { availability: "available", reason: "total_meets_recommended" };
}

function resolveModelArtifacts(entry: LocalModelCatalogEntry): ModelDownloadArtifact[] {
  const artifacts: ModelDownloadArtifact[] = [
    {
      fileName: entry.fileName,
      sha256: entry.sha256,
      sizeBytes: entry.sizeBytes,
      downloadUrls: [...entry.downloadUrls],
    },
  ];

  if (entry.projector) {
    artifacts.push(normalizeExtraArtifact(entry.projector));
  }

  return artifacts;
}

function normalizeExtraArtifact(file: LocalModelExtraFile): ModelDownloadArtifact {
  return {
    fileName: file.fileName,
    sha256: file.sha256,
    sizeBytes: file.sizeBytes,
    downloadUrls: [...file.downloadUrls],
  };
}

function writeChunk(stream: fs.WriteStream, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function closeStream(stream: fs.WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });
}

export const localModelRuntimeService = new LocalModelRuntimeService();
