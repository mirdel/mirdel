import { loggerServiceMain, resolveImageTaskCapabilities, type ProviderPublic } from "@shared";
import { appendImageGenerationAssets, createImageGenerationRun, updateImageGenerationRunStatus } from "../imageWorkspaceData";
import { resolveProviderInvocation } from "../providers/modelInvocation";
import { resolveImageProviderAdapter } from "./adapters";
import { ImageGenerationError, isAbortLikeError, toImageGenerationError } from "./adapters/errors";
import { parseSelectedModel, sleep } from "./adapters/utils";
import type { ImageAdapterResult, ResolvedImageModel, RunImageGenerationInput } from "./adapters/types";
import { tMain } from "../../i18n";

const logger = loggerServiceMain.withContext("imageGenerationService");
const generationAbortControllers = new Map<string, AbortController>();

function resolveImageBaseUrl(provider: ProviderPublic) {
  const imageBaseUrl = (provider.imageBaseUrl || "").trim();
  if (imageBaseUrl) return imageBaseUrl;
  return provider.baseUrl;
}

function resolveImageTaskSupport(model: {
  inputModalities?: string[];
  outputModalities?: string[];
  imageTasks?: string[];
  image?: Record<string, unknown>;
}) {
  const outputModalities = model.outputModalities || [];
  const inputModalities = model.inputModalities || [];
  const rawTasks = Array.isArray(model.imageTasks) ? model.imageTasks : [];
  const normalizedTasks = rawTasks.filter((item): item is "text_to_image" | "image_to_image" | "image_edit" | "inpaint" => (
    item === "text_to_image" || item === "image_to_image" || item === "image_edit" || item === "inpaint"
  ));

  const inferredTasks = (() => {
    if (!outputModalities.includes("image")) return [] as Array<"text_to_image" | "image_to_image" | "image_edit" | "inpaint">;
    const tasks: Array<"text_to_image" | "image_to_image" | "image_edit" | "inpaint"> = ["text_to_image"];
    if (inputModalities.includes("image")) tasks.push("image_to_image", "image_edit");
    const editCaps = resolveImageTaskCapabilities(model.image as any, "edit");
    if (inputModalities.includes("mask") || !!editCaps?.mask?.enabled) tasks.push("inpaint");
    return tasks;
  })();

  const tasks = normalizedTasks.length > 0 ? normalizedTasks : inferredTasks;
  return {
    canGenerate: tasks.includes("text_to_image") || tasks.includes("image_to_image"),
    canImageToImage: tasks.includes("image_to_image"),
    canEdit: tasks.includes("image_edit") || tasks.includes("inpaint"),
    canInpaint: tasks.includes("inpaint"),
  };
}

function resolveProvider(providerId: string): ProviderPublic {
  let provider: ProviderPublic;
  try {
    provider = resolveProviderInvocation(providerId).provider;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === tMain("provider.apiKeyMissing", { providerId })) {
      throw new ImageGenerationError({ code: "auth", message });
    }
    throw new ImageGenerationError({ code: "validation", message });
  }

  provider = { ...provider, baseUrl: resolveImageBaseUrl(provider) };

  return provider;
}

function resolveImageModel(input: RunImageGenerationInput): ResolvedImageModel {
  const { providerId, modelId } = parseSelectedModel(input.selectedModel);
  const provider = resolveProvider(providerId);
  const model = provider.models.find((item) => item.id === modelId);
  if (!model) {
    throw new ImageGenerationError({ code: "model_not_found", message: tMain("image.modelNotFound", { modelId }) });
  }
  if (model.modelType !== "generative") {
    throw new ImageGenerationError({ code: "validation", message: tMain("image.generativeModelRequired") });
  }
  if (!model.outputModalities?.includes("image")) {
    throw new ImageGenerationError({ code: "validation", message: tMain("image.imageOutputRequired") });
  }

  return { providerId, modelId, provider, model };
}

function toUserFacingError(error: unknown) {
  const classified = toImageGenerationError(error);
  if (classified.code === "aborted") return classified;

  // 统一兜底一层，确保前端接收到中文可读文案。
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
      return new ImageGenerationError({ code: "network", message: tMain("image.networkFailed"), retryable: true });
    case "service_unavailable":
      return new ImageGenerationError({ code: "service_unavailable", message: tMain("image.serviceUnavailable"), retryable: true });
    default:
      return classified;
  }
}

function clampRetryCount(_value: unknown) {
  // 图片生成是高成本调用，默认且固定关闭自动重试，避免重复计费和重复任务。
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
  adapterRun: (signal: AbortSignal) => Promise<ImageAdapterResult>;
  maxRetries: number;
  generationId: string;
  providerId: string;
  modelId: string;
  adapterId: string;
  globalAbortSignal: AbortSignal;
}) {
  const attemptTimeoutMs = 3 * 60 * 1000;

  for (let attempt = 0; ; attempt += 1) {
    const { signal, isTimedOut, cleanup } = createAttemptSignal(input.globalAbortSignal, attemptTimeoutMs);

    try {
      return await input.adapterRun(signal);
    } catch (error) {
      const mapped = toUserFacingError(error);
      const timedOut = isTimedOut();

      if (timedOut && mapped.code === "aborted") {
        const timeoutError = new ImageGenerationError({
          code: "timeout",
          message: tMain("image.timeout"),
          retryable: true,
        });
        if (attempt < input.maxRetries) {
          logger.warn("image generation timeout, retrying", {
            generationId: input.generationId,
            providerId: input.providerId,
            modelId: input.modelId,
            adapterId: input.adapterId,
            attempt: attempt + 1,
            maxRetries: input.maxRetries,
          });
          await sleep(Math.min(2500, 600 * (attempt + 1)), input.globalAbortSignal);
          continue;
        }
        throw timeoutError;
      }

      if (mapped.code === "aborted") {
        throw mapped;
      }

      if (mapped.retryable && attempt < input.maxRetries) {
        logger.warn("image generation failed, retrying", {
          generationId: input.generationId,
          providerId: input.providerId,
          modelId: input.modelId,
          adapterId: input.adapterId,
          attempt: attempt + 1,
          maxRetries: input.maxRetries,
          code: mapped.code,
          message: mapped.message,
        });
        await sleep(Math.min(2500, 600 * (attempt + 1)), input.globalAbortSignal);
        continue;
      }

      throw mapped;
    } finally {
      cleanup();
    }
  }
}

export async function runImageGeneration(input: RunImageGenerationInput) {
  const startedAt = Date.now();
  const resolved = resolveImageModel(input);
  const taskType = input.params?.taskType === "edit" ? "edit" : "generate";
  const taskSupport = resolveImageTaskSupport(resolved.model);
  if (taskType === "generate" && !taskSupport.canGenerate) {
    throw new ImageGenerationError({ code: "validation", message: tMain("image.generateUnsupported") });
  }
  if (taskType === "generate") {
    const sourceCount = Array.isArray(input.params?.referenceImages) ? input.params.referenceImages.length : 0;
    const generateCaps = resolveImageTaskCapabilities(resolved.model.image, "generate");
    const supportsReferenceImages = taskSupport.canImageToImage || !!generateCaps?.referenceImages?.enabled;
    if (sourceCount > 0 && !supportsReferenceImages) {
      throw new ImageGenerationError({ code: "validation", message: tMain("image.imageToImageUnsupported") });
    }
    const hasMask = typeof input.params?.maskImage?.url === "string" && input.params.maskImage.url.trim().length > 0;
    if (hasMask) {
      throw new ImageGenerationError({ code: "validation", message: tMain("image.maskEditOnly") });
    }
  }
  if (taskType === "edit") {
    const inputModalities = resolved.model.inputModalities || [];
    if (!taskSupport.canEdit) {
      throw new ImageGenerationError({ code: "validation", message: tMain("image.editUnsupported") });
    }
    if (!inputModalities.includes("image")) {
      throw new ImageGenerationError({ code: "validation", message: tMain("image.editInputUnsupported") });
    }
    const sourceCount = Array.isArray(input.params?.referenceImages) ? input.params.referenceImages.length : 0;
    if (sourceCount <= 0) {
      throw new ImageGenerationError({ code: "validation", message: tMain("image.editInputRequired") });
    }
    const hasMask = typeof input.params?.maskImage?.url === "string" && input.params.maskImage.url.trim().length > 0;
    const editCaps = resolveImageTaskCapabilities(resolved.model.image, "edit");
    const supportsMask = taskSupport.canInpaint && (inputModalities.includes("mask") || !!editCaps?.mask?.enabled);
    if (hasMask && !supportsMask) {
      throw new ImageGenerationError({ code: "validation", message: tMain("image.maskUnsupported") });
    }
  }
  const adapter = resolveImageProviderAdapter(resolved);
  const maxRetries = clampRetryCount(input.params?.maxRetries);
  const run = createImageGenerationRun({
    generationId: input.generationId,
    prompt: input.prompt,
    status: "running",
    selectedModel: input.selectedModel,
    params: input.params || {},
  });

  logger.info("run image generation", {
    providerId: resolved.providerId,
    modelId: resolved.modelId,
    taskType,
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
      adapterRun: (signal) =>
        adapter.run({
          input,
          resolved,
          abortSignal: signal,
        }),
      maxRetries,
      generationId: input.generationId,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      adapterId: adapter.id,
      globalAbortSignal: abortController.signal,
    });

    if (!Array.isArray(result.assets) || result.assets.length === 0) {
      throw new ImageGenerationError({ code: "empty_result", message: tMain("image.noUsableImage") });
    }

    const inserted = await appendImageGenerationAssets({
      generationId: input.generationId,
      runId: run.id,
      assets: result.assets.map((item) => ({ src: item.src, mediaType: item.mediaType })),
    });
    updateImageGenerationRunStatus({
      runId: run.id,
      status: "succeeded",
      warningMessage: Array.isArray(result.warnings) && result.warnings.length > 0 ? result.warnings.join("\n") : undefined,
    });
    const completedAt = Date.now();

    logger.info("run image generation succeeded", {
      generationId: input.generationId,
      runId: run.id,
      workspaceId: input.workspaceId,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      taskType,
      adapterId: adapter.id,
      outputCount: inserted.length,
      durationMs: Date.now() - startedAt,
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
    const mapped = error instanceof ImageGenerationError ? error : toUserFacingError(error);
    updateImageGenerationRunStatus({
      runId: run.id,
      status: mapped.code === "aborted" ? "cancelled" : "failed",
      errorMessage: mapped.message,
    });
    logger.warn("run image generation failed", {
      generationId: input.generationId,
      runId: run.id,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      taskType,
      adapterId: adapter.id,
      type: mapped.code,
      error: mapped.message,
    });
    throw new Error(mapped.message);
  } finally {
    generationAbortControllers.delete(input.generationId);
  }
}

export function abortImageGeneration(input: { generationId: string }) {
  const controller = generationAbortControllers.get(input.generationId);
  if (!controller) return { ok: false, error: tMain("image.taskNotRunning") };
  controller.abort();
  generationAbortControllers.delete(input.generationId);
  return { ok: true };
}

export { isAbortLikeError };
