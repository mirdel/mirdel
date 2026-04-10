import { loggerServiceMain, type ProviderPublic } from "@shared";
import { tMain } from "../../i18n";
import {
  appendVideoGenerationAssets,
  createVideoGenerationRun,
  updateVideoGenerationRunStatus,
} from "../videoWorkspaceData";
import { resolveProviderInvocation } from "../providers/modelInvocation";
import { resolveVideoProviderAdapter } from "./adapters";
import { VideoGenerationError, toVideoGenerationError } from "./adapters/errors";
import { parseSelectedModel, sleep } from "./adapters/utils";
import type { ResolvedVideoModel, RunVideoGenerationInput, VideoAdapterResult } from "./adapters/types";

const logger = loggerServiceMain.withContext("videoGenerationService");
const generationAbortControllers = new Map<string, AbortController>();

function resolveVideoBaseUrl(provider: ProviderPublic) {
  const videoBaseUrl = (provider.videoBaseUrl || "").trim();
  if (videoBaseUrl) return videoBaseUrl;
  return provider.baseUrl;
}

function resolveProvider(providerId: string): ProviderPublic {
  let provider: ProviderPublic;
  try {
    provider = resolveProviderInvocation(providerId).provider;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === tMain("provider.apiKeyMissing", { providerId })) {
      throw new VideoGenerationError({ code: "auth", message });
    }
    throw new VideoGenerationError({ code: "validation", message });
  }

  provider = { ...provider, baseUrl: resolveVideoBaseUrl(provider) };

  return provider;
}

function resolveVideoModel(input: RunVideoGenerationInput): ResolvedVideoModel {
  const { providerId, modelId } = parseSelectedModel(input.selectedModel);
  const provider = resolveProvider(providerId);
  const model = provider.models.find((item) => item.id === modelId);
  if (!model) {
    throw new VideoGenerationError({ code: "model_not_found", message: tMain("video.modelNotFound", { modelId }) });
  }
  if (model.modelType !== "generative") {
    throw new VideoGenerationError({ code: "validation", message: tMain("video.generativeModelRequired") });
  }
  if (!model.outputModalities?.includes("video")) {
    throw new VideoGenerationError({ code: "validation", message: tMain("video.videoOutputRequired") });
  }

  return { providerId, modelId, provider, model };
}

function normalizeOptionalInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.floor(value);
}

function normalizeNumericOptions(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const values = input
    .map((item) => (typeof item === "number" && Number.isFinite(item) ? Math.floor(item) : NaN))
    .filter((item): item is number => Number.isFinite(item) && item > 0);
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function validateDurationInput(inputDuration: unknown, caps: ResolvedVideoModel["model"]["video"]): number | null {
  if (!caps?.duration?.enabled) return null;
  if (inputDuration === undefined || inputDuration === null) return null;

  const duration = normalizeOptionalInt(inputDuration);
  if (duration === null) {
    throw new VideoGenerationError({ code: "validation", message: tMain("video.durationInvalidNumber") });
  }

  const options = normalizeNumericOptions(caps.duration.options);
  if (options.length > 0) {
    if (!options.includes(duration)) {
      throw new VideoGenerationError({
        code: "validation",
        message: tMain("video.durationInvalidOption", { options: options.join(", ") }),
      });
    }
    return duration;
  }

  const min = typeof caps.duration.min === "number" ? Math.floor(caps.duration.min) : undefined;
  const max = typeof caps.duration.max === "number" ? Math.floor(caps.duration.max) : undefined;
  if (min !== undefined && duration < min) {
    throw new VideoGenerationError({
      code: "validation",
      message: tMain("video.durationOutOfRange", { min, max: max ?? min }),
    });
  }
  if (max !== undefined && duration > max) {
    throw new VideoGenerationError({
      code: "validation",
      message: tMain("video.durationOutOfRange", { min: min ?? max, max }),
    });
  }
  return duration;
}

function toUserFacingError(error: unknown) {
  const classified = toVideoGenerationError(error);
  if (classified.code === "aborted") return classified;

  switch (classified.code) {
    case "auth":
    case "permission":
    case "rate_limit":
    case "timeout":
    case "unsupported":
    case "model_not_found":
    case "validation":
    case "empty_result":
      return classified;
    case "network":
      return new VideoGenerationError({ code: "network", message: tMain("video.networkFailed"), retryable: true });
    case "service_unavailable":
      return new VideoGenerationError({
        code: "service_unavailable",
        message: tMain("video.serviceUnavailable"),
        retryable: true,
      });
    default:
      return classified;
  }
}

function clampRetryCount(_value: unknown) {
  // 视频生成成本高，默认固定不自动重试，避免重复计费。
  return 0;
}

function createAttemptSignal(globalAbortSignal: AbortSignal, timeoutMs: number) {
  const timeoutController = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);

  const signal = AbortSignal.any([globalAbortSignal, timeoutController.signal]);

  return {
    signal,
    isTimedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
    },
  };
}

async function runWithRetry(input: {
  adapterRun: (signal: AbortSignal) => Promise<VideoAdapterResult>;
  maxRetries: number;
  generationId: string;
  providerId: string;
  modelId: string;
  adapterId: string;
  globalAbortSignal: AbortSignal;
}) {
  const attemptTimeoutMs = 10 * 60 * 1000;

  for (let attempt = 0; ; attempt += 1) {
    const { signal, isTimedOut, cleanup } = createAttemptSignal(input.globalAbortSignal, attemptTimeoutMs);
    try {
      return await input.adapterRun(signal);
    } catch (error) {
      const mapped = toUserFacingError(error);
      const timedOut = isTimedOut();
      if (timedOut && mapped.code === "aborted") {
        const timeoutError = new VideoGenerationError({
          code: "timeout",
          message: tMain("video.timeout"),
          retryable: true,
        });
        if (attempt < input.maxRetries) {
          logger.warn("video generation timeout, retrying", {
            generationId: input.generationId,
            providerId: input.providerId,
            modelId: input.modelId,
            adapterId: input.adapterId,
            attempt: attempt + 1,
            maxRetries: input.maxRetries,
          });
          await sleep(Math.min(3000, 800 * (attempt + 1)), input.globalAbortSignal);
          continue;
        }
        throw timeoutError;
      }

      if (mapped.code === "aborted") {
        throw mapped;
      }

      if (mapped.retryable && attempt < input.maxRetries) {
        logger.warn("video generation failed, retrying", {
          generationId: input.generationId,
          providerId: input.providerId,
          modelId: input.modelId,
          adapterId: input.adapterId,
          attempt: attempt + 1,
          maxRetries: input.maxRetries,
          code: mapped.code,
          message: mapped.message,
        });
        await sleep(Math.min(3000, 800 * (attempt + 1)), input.globalAbortSignal);
        continue;
      }

      throw mapped;
    } finally {
      cleanup();
    }
  }
}

export async function runVideoGeneration(input: RunVideoGenerationInput) {
  const startedAt = Date.now();
  const resolved = resolveVideoModel(input);
  const inputModalities = resolved.model.inputModalities || [];
  const caps = resolved.model.video;

  const prompt = (input.prompt || "").trim();
  if (!prompt) {
    throw new VideoGenerationError({ code: "validation", message: tMain("video.promptRequired") });
  }

  const sourceImages = Array.isArray(input.params?.referenceImages) ? input.params.referenceImages : [];
  const sourceCount = sourceImages.length;
  const supportsReferenceImages = inputModalities.includes("image") || !!caps?.referenceImages?.enabled;
  if (sourceCount > 0 && !supportsReferenceImages) {
    throw new VideoGenerationError({ code: "validation", message: tMain("video.referenceImageUnsupported") });
  }
  const requiresReferenceImage = resolved.providerId === "dashscope" && /-r2v/i.test(resolved.modelId);
  if (requiresReferenceImage && sourceCount <= 0) {
    throw new VideoGenerationError({ code: "validation", message: tMain("video.referenceImageRequired") });
  }
  if (sourceCount > 0 && caps?.referenceImages?.enabled && typeof caps.referenceImages.max === "number" && caps.referenceImages.max > 0) {
    if (sourceCount > caps.referenceImages.max) {
      throw new VideoGenerationError({
        code: "validation",
        message: tMain("video.referenceImageTooMany", { count: caps.referenceImages.max }),
      });
    }
  }

  const normalizedDuration = validateDurationInput(input.params?.duration, caps);
  if (normalizedDuration !== null) {
    input.params = {
      ...(input.params || {}),
      duration: normalizedDuration,
    };
  }

  const adapter = resolveVideoProviderAdapter(resolved);
  const maxRetries = clampRetryCount(input.params?.maxRetries);
  const run = createVideoGenerationRun({
    generationId: input.generationId,
    prompt: input.prompt,
    status: "running",
    selectedModel: input.selectedModel,
    params: input.params || {},
  });

  logger.info("run video generation", {
    providerId: resolved.providerId,
    modelId: resolved.modelId,
    generationId: input.generationId,
    runId: run.id,
    workspaceId: input.workspaceId,
    adapterId: adapter.id,
    maxRetries,
  });

  const previousController = generationAbortControllers.get(input.generationId);
  if (previousController) {
    previousController.abort();
    generationAbortControllers.delete(input.generationId);
  }

  const abortController = new AbortController();
  generationAbortControllers.set(input.generationId, abortController);

  try {
    const result = await runWithRetry({
      adapterRun: (signal) => adapter.run({ input, resolved, abortSignal: signal }),
      maxRetries,
      generationId: input.generationId,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      adapterId: adapter.id,
      globalAbortSignal: abortController.signal,
    });

    if (!Array.isArray(result.assets) || result.assets.length === 0) {
      throw new VideoGenerationError({ code: "empty_result", message: tMain("video.noUsableVideo") });
    }

    const inserted = await appendVideoGenerationAssets({
      generationId: input.generationId,
      runId: run.id,
      assets: result.assets.map((item) => ({ src: item.src, mediaType: item.mediaType })),
    });
    updateVideoGenerationRunStatus({
      runId: run.id,
      status: "succeeded",
      warningMessage: Array.isArray(result.warnings) && result.warnings.length > 0 ? result.warnings.join("\n") : undefined,
    });
    const completedAt = Date.now();

    logger.info("run video generation succeeded", {
      generationId: input.generationId,
      runId: run.id,
      workspaceId: input.workspaceId,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      adapterId: adapter.id,
      outputCount: inserted.length,
      durationMs: completedAt - startedAt,
      warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
    });

    return {
      assets: inserted,
      count: inserted.length,
      warnings: result.warnings,
      run: {
        id: run.id,
        prompt: run.prompt,
        selectedModel: run.selectedModel,
        params: run.params,
        status: "succeeded" as const,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        completedAt,
        durationMs: completedAt - run.startedAt,
      },
    };
  } catch (error) {
    const mapped = error instanceof VideoGenerationError ? error : toUserFacingError(error);
    updateVideoGenerationRunStatus({
      runId: run.id,
      status: mapped.code === "aborted" ? "cancelled" : "failed",
      errorMessage: mapped.message,
    });
    logger.warn("run video generation failed", {
      generationId: input.generationId,
      runId: run.id,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      adapterId: adapter.id,
      type: mapped.code,
      error: mapped.message,
    });
    throw new Error(mapped.message);
  } finally {
    generationAbortControllers.delete(input.generationId);
  }
}

export function abortVideoGeneration(input: { generationId: string }) {
  const controller = generationAbortControllers.get(input.generationId);
  if (!controller) return { ok: false, error: tMain("video.taskNotRunning") };
  controller.abort();
  generationAbortControllers.delete(input.generationId);
  return { ok: true };
}
