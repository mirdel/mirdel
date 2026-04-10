import { loggerServiceMain, resolveImageTaskCapabilities } from "@shared";
import { tMain } from "../../../i18n";
import { ImageGenerationError } from "./errors";
import type { ImageAdapterResult, ImageProviderAdapter } from "./types";
import { normalizeSeed, sleep, toDashscopeApiRoot } from "./utils";

const logger = loggerServiceMain.withContext("dashscopeImageAdapter");

function isQwenImageModel(modelId: string) {
  return modelId === "qwen-image" || modelId.startsWith("qwen-image-");
}

function isQwenImageEditModel(modelId: string) {
  return modelId.startsWith("qwen-image-edit");
}

function isQwenImage20Model(modelId: string) {
  return modelId.startsWith("qwen-image-2.0");
}

function isWanLegacyTextToImageModel(modelId: string) {
  return /^wan2\.(5|2|1|0)-t2i/i.test(modelId) || /^wanx2\.(0|1)-t2i/i.test(modelId);
}

function isWan26TextToImageModel(modelId: string) {
  return /^wan2\.6-t2i/i.test(modelId);
}

function isWan26ImageModel(modelId: string) {
  return /^wan2\.6-image/i.test(modelId);
}

function isWanImageEditModel(modelId: string) {
  return /^wan(?:x)?2\.(0|1)-imageedit/i.test(modelId);
}

function isWan25ImageEditModel(modelId: string) {
  return /^wan2\.5-i2i/i.test(modelId);
}

function isWanXPaintingModel(modelId: string) {
  return /^wanx-x-painting/i.test(modelId);
}

function isZImageModel(modelId: string) {
  return modelId === "z-image-turbo";
}

function useAsyncTaskMode(modelId: string) {
  return modelId === "qwen-image" || modelId.startsWith("qwen-image-plus") || isWanLegacyTextToImageModel(modelId);
}

function normalizeDashscopeSize(size?: string) {
  if (!size) return undefined;
  const value = size.trim();
  return value.length > 0 ? value : undefined;
}

function parseJsonSafely(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractErrorMessage(payload: any, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  return (
    payload?.output?.message ||
    payload?.message ||
    payload?.msg ||
    payload?.error ||
    payload?.output?.code ||
    payload?.code ||
    fallback
  );
}

function extractErrorCode(payload: any): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const code = payload?.output?.code || payload?.code;
  return typeof code === "string" && code.trim().length > 0 ? code : undefined;
}

async function requestDashscopeJson(input: {
  url: string;
  method: "GET" | "POST";
  apiKey: string;
  headers?: Record<string, string>;
  body?: unknown;
  abortSignal: AbortSignal;
  asyncMode?: boolean;
}) {
  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
        ...(input.asyncMode ? { "X-DashScope-Async": "enable" } : {}),
        ...(input.headers || {}),
      },
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
      signal: input.abortSignal,
    });

    const text = await response.text();
    const payload = parseJsonSafely(text);

    if (!response.ok) {
      const msg = extractErrorMessage(payload, response.statusText || "request failed");
      if (response.status === 401) {
        throw new ImageGenerationError({ code: "auth", message: tMain("image.authFailedWithDetail", { message: msg }), statusCode: 401 });
      }
      if (response.status === 403) {
        throw new ImageGenerationError({ code: "permission", message: tMain("image.permissionDeniedWithDetail", { message: msg }), statusCode: 403 });
      }
      if (response.status === 404) {
        throw new ImageGenerationError({ code: "model_not_found", message: tMain("image.modelUnavailableWithDetail", { message: msg }), statusCode: 404 });
      }
      if (response.status === 429) {
        throw new ImageGenerationError({ code: "rate_limit", message: tMain("image.rateLimitWithDetail", { message: msg }), statusCode: 429, retryable: true });
      }
      if (response.status >= 500) {
        throw new ImageGenerationError({
          code: "service_unavailable",
          message: tMain("image.serviceUnavailableWithDetail", { message: msg }),
          statusCode: response.status,
          retryable: true,
        });
      }
      throw new ImageGenerationError({ code: "unknown", message: msg, statusCode: response.status });
    }

    return payload;
  } catch (error) {
    if ((error as any)?.name === "AbortError") {
      throw new ImageGenerationError({ code: "aborted", message: tMain("image.aborted") });
    }
    if (error instanceof ImageGenerationError) throw error;
    throw new ImageGenerationError({
      code: "network",
      message: tMain("image.networkFailedWithDetail", { message: error instanceof Error ? error.message : String(error) }),
      retryable: true
    });
  }
}

function collectImageAssets(payload: any): Array<{ src: string; mediaType?: string }> {
  const assets: Array<{ src: string; mediaType?: string }> = [];

  const pushUrl = (src: unknown, mediaType?: string) => {
    if (typeof src === "string" && src.length > 0) {
      assets.push({ src, ...(mediaType ? { mediaType } : {}) });
    }
  };

  const output = payload?.output;

  if (Array.isArray(output?.results)) {
    for (const item of output.results) {
      pushUrl(item?.url, item?.mime_type || item?.mediaType);
    }
  }

  if (Array.isArray(output?.choices)) {
    for (const choice of output.choices) {
      const content = choice?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (typeof part?.image === "string") pushUrl(part.image, "image/png");
        if (typeof part?.image_url === "string") pushUrl(part.image_url, "image/png");
        if (typeof part?.url === "string") pushUrl(part.url, part?.mediaType);
      }
    }
  }

  pushUrl(output?.result_url);
  if (Array.isArray(output?.images)) {
    for (const image of output.images) {
      if (typeof image === "string") pushUrl(image, "image/png");
      else pushUrl(image?.url, image?.mediaType);
    }
  }

  return assets;
}

function mergeNativeParameters(input: {
  providerDefaults?: Record<string, unknown>;
  modelDefaults?: Record<string, unknown>;
  requestOptions?: Record<string, unknown>;
}) {
  const merged = {
    ...(input.providerDefaults || {}),
    ...(input.modelDefaults || {}),
    ...(input.requestOptions || {}),
  } as Record<string, unknown>;

  return merged;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.split(".").map((item) => item.trim()).filter(Boolean);
  if (segments.length === 0) return;
  let cursor: Record<string, unknown> = target;
  for (let idx = 0; idx < segments.length - 1; idx += 1) {
    const key = segments[idx];
    const current = cursor[key];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

function applyNegativePromptToPayload(input: {
  negativePrompt?: string;
  providerKey?: string;
  payloadInput: Record<string, unknown>;
  payloadParameters: Record<string, unknown>;
}) {
  const negativePrompt = (input.negativePrompt || "").trim();
  if (!negativePrompt) return;
  const providerKey = input.providerKey?.trim();

  if (!providerKey) {
    input.payloadParameters.negative_prompt = negativePrompt;
    return;
  }

  if (providerKey.startsWith("input.")) {
    setPath(input.payloadInput, providerKey.slice("input.".length), negativePrompt);
    return;
  }
  if (providerKey.startsWith("parameters.")) {
    setPath(input.payloadParameters, providerKey.slice("parameters.".length), negativePrompt);
    return;
  }
  setPath(input.payloadParameters, providerKey, negativePrompt);
}

function applyBooleanOptionToPayload(input: {
  value: boolean | undefined;
  providerKey?: string;
  defaultKey: string;
  payloadInput: Record<string, unknown>;
  payloadParameters: Record<string, unknown>;
}) {
  if (typeof input.value !== "boolean") return;
  const providerKey = input.providerKey?.trim() || input.defaultKey;
  if (providerKey.startsWith("input.")) {
    setPath(input.payloadInput, providerKey.slice("input.".length), input.value);
    return;
  }
  if (providerKey.startsWith("parameters.")) {
    setPath(input.payloadParameters, providerKey.slice("parameters.".length), input.value);
    return;
  }
  setPath(input.payloadParameters, providerKey, input.value);
}

async function runSyncGeneration(input: {
  generationId: string;
  baseApiRoot: string;
  apiKey: string;
  modelId: string;
  payloadInput: Record<string, unknown>;
  parameters: Record<string, unknown>;
  headers?: Record<string, string>;
  abortSignal: AbortSignal;
}) {
  const url = `${input.baseApiRoot}/services/aigc/multimodal-generation/generation`;
  logger.info("dashscope sync submit", {
    generationId: input.generationId,
    modelId: input.modelId,
    endpoint: url,
  });
  return requestDashscopeJson({
    url,
    method: "POST",
    apiKey: input.apiKey,
    headers: input.headers,
    body: {
      model: input.modelId,
      input: input.payloadInput,
      parameters: input.parameters,
    },
    abortSignal: input.abortSignal,
  });
}

async function runAsyncGeneration(input: {
  generationId: string;
  submitUrl: string;
  pollBaseApiRoot: string;
  apiKey: string;
  modelId: string;
  payloadInput: Record<string, unknown>;
  parameters: Record<string, unknown>;
  headers?: Record<string, string>;
  abortSignal: AbortSignal;
}) {
  logger.info("dashscope async submit", {
    generationId: input.generationId,
    modelId: input.modelId,
    endpoint: input.submitUrl,
  });
  const submitPayload = await requestDashscopeJson({
    url: input.submitUrl,
    method: "POST",
    apiKey: input.apiKey,
    headers: input.headers,
    body: {
      model: input.modelId,
      input: input.payloadInput,
      parameters: input.parameters,
    },
    abortSignal: input.abortSignal,
    asyncMode: true,
  });

  const taskId = submitPayload?.output?.task_id;
  if (!taskId || typeof taskId !== "string") {
    throw new ImageGenerationError({ code: "unknown", message: tMain("image.dashscopeTaskIdMissing") });
  }
  logger.info("dashscope async submit ok", {
    generationId: input.generationId,
    modelId: input.modelId,
    taskId,
  });

  const pollUrl = `${input.pollBaseApiRoot}/tasks/${taskId}`;
  const startTime = Date.now();
  const timeoutMs = 3 * 60 * 1000;
  let lastStatus = "";

  for (;;) {
    if (Date.now() - startTime > timeoutMs) {
      throw new ImageGenerationError({ code: "timeout", message: tMain("image.timeout"), retryable: true });
    }

    const pollPayload = await requestDashscopeJson({
      url: pollUrl,
      method: "GET",
      apiKey: input.apiKey,
      headers: input.headers,
      abortSignal: input.abortSignal,
    });

    const status = String(pollPayload?.output?.task_status || "").toUpperCase();
    if (status !== lastStatus) {
      logger.info("dashscope async poll", {
        generationId: input.generationId,
        modelId: input.modelId,
        taskId,
        status,
      });
      lastStatus = status;
    }
    if (status === "SUCCEEDED") return pollPayload;
    if (status === "FAILED" || status === "CANCELED") {
      const message = extractErrorMessage(pollPayload, tMain("image.dashscopeTaskFailed"));
      const code = extractErrorCode(pollPayload);
      const requestId = typeof pollPayload?.request_id === "string" ? pollPayload.request_id : undefined;
      logger.warn("dashscope async task failed", {
        generationId: input.generationId,
        modelId: input.modelId,
        taskId,
        status,
        code,
        message,
        requestId,
      });
      const detail = [code, message].filter(Boolean).join(": ");
      throw new ImageGenerationError({ code: "unknown", message: detail || tMain("image.dashscopeTaskFailed") });
    }

    await sleep(5000, input.abortSignal);
  }
}

export const dashscopeImageAdapter: ImageProviderAdapter = {
  id: "dashscope-image-native",
  canHandle(resolved) {
    if (resolved.provider.id !== "dashscope") return false;
    if (isWanImageEditModel(resolved.modelId)) return true;
    if (isWan25ImageEditModel(resolved.modelId)) return true;
    if (isWanXPaintingModel(resolved.modelId)) return true;
    if (isQwenImageEditModel(resolved.modelId)) return true;
    if (isZImageModel(resolved.modelId)) return true;
    if (isWan26ImageModel(resolved.modelId)) return true;
    if (isWan26TextToImageModel(resolved.modelId)) return true;
    if (isWanLegacyTextToImageModel(resolved.modelId)) return true;
    return isQwenImageModel(resolved.modelId) && !isQwenImageEditModel(resolved.modelId);
  },
  async run(ctx): Promise<ImageAdapterResult> {
    const { resolved, input, abortSignal } = ctx;
    const startedAt = Date.now();
    const apiKey = resolved.provider.apiKey?.trim();
    if (!apiKey) {
      throw new ImageGenerationError({ code: "auth", message: tMain("provider.apiKeyMissing", { providerId: "dashscope" }) });
    }
    const taskType = input.params?.taskType === "edit" ? "edit" : "generate";
    const taskCaps = resolveImageTaskCapabilities(resolved.model.image, taskType);

    const countMaxByModel = Math.max(1, taskCaps?.n?.max || 4);
    const count = Math.max(1, Math.min(Number(input.params?.count || 1), countMaxByModel));
    const seed = normalizeSeed(input.params?.seed);
    const isWanLegacy = isWanLegacyTextToImageModel(resolved.modelId);
    const isWan26 = isWan26TextToImageModel(resolved.modelId);
    const isWan26Image = isWan26ImageModel(resolved.modelId);
    const isQwenEdit = isQwenImageEditModel(resolved.modelId);
    const isQwenImage20 = isQwenImage20Model(resolved.modelId);
    const isWanEdit = isWanImageEditModel(resolved.modelId);
    const isWan25Edit = isWan25ImageEditModel(resolved.modelId);
    const isWanXPainting = isWanXPaintingModel(resolved.modelId);
    const sizeMode = taskCaps?.sizeMode || "both";
    const normalizedSize = sizeMode === "aspectRatio" ? undefined : normalizeDashscopeSize(input.params?.size);
    const pickedAspectRatio = sizeMode === "size" ? undefined : (input.params?.aspectRatio || "").trim() || undefined;
    const sourceImages = Array.isArray(input.params?.referenceImages)
      ? input.params.referenceImages
          .map((item) => item?.url)
          .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      : [];
    const maskImage = typeof input.params?.maskImage?.url === "string" && input.params.maskImage.url.trim().length > 0
      ? input.params.maskImage.url.trim()
      : undefined;

    const parameters = mergeNativeParameters({
      providerDefaults: resolved.provider.providerOptionsDefaults,
      modelDefaults: resolved.model.providerOptionsDefaults,
      requestOptions: input.params?.providerOptions,
    });
    const warnings: string[] = [];
    const baseApiRoot = toDashscopeApiRoot(resolved.provider.baseUrl);
    if (taskType === "edit") {
      if (isQwenEdit || isQwenImage20) {
        if (sourceImages.length === 0) {
          throw new ImageGenerationError({ code: "validation", message: tMain("image.editInputRequired") });
        }
        if (sourceImages.length > 3) {
          warnings.push(tMain("image.warningInputImageLimit3"));
        }
        if (maskImage) {
          warnings.push(tMain("image.warningMaskIgnored"));
        }
        const qwenSourceImages = sourceImages.slice(0, 3);
        const content: Array<Record<string, unknown>> = [
          { text: input.prompt },
          ...qwenSourceImages.map((url) => ({ image: url })),
        ];
        const payloadInputForSync: Record<string, unknown> = {
          messages: [
            {
              role: "user",
              content,
            },
          ],
        };
        if (taskCaps?.negativePrompt?.enabled) {
          applyNegativePromptToPayload({
            negativePrompt: input.params?.negativePrompt,
            providerKey: taskCaps?.negativePrompt?.providerKey || "parameters.negative_prompt",
            payloadInput: payloadInputForSync,
            payloadParameters: parameters,
          });
        }
        if (taskCaps?.promptExtend?.enabled) {
          applyBooleanOptionToPayload({
            value: input.params?.promptExtend,
            providerKey: taskCaps?.promptExtend?.providerKey || "parameters.prompt_extend",
            defaultKey: "prompt_extend",
            payloadInput: payloadInputForSync,
            payloadParameters: parameters,
          });
        }
        if (taskCaps?.watermark?.enabled) {
          applyBooleanOptionToPayload({
            value: input.params?.watermark,
            providerKey: taskCaps?.watermark?.providerKey || "parameters.watermark",
            defaultKey: "watermark",
            payloadInput: payloadInputForSync,
            payloadParameters: parameters,
          });
        }
        if (count > 0) parameters.n = count;
        if (normalizedSize) parameters.size = normalizedSize;
        if (seed !== undefined) parameters.seed = seed;
        if (pickedAspectRatio) {
          warnings.push(tMain("image.warningAspectRatioIgnored"));
        }

        const payload = await runSyncGeneration({
          generationId: input.generationId,
          baseApiRoot,
          apiKey,
          modelId: resolved.modelId,
          payloadInput: payloadInputForSync,
          parameters,
          headers: resolved.provider.customHeaders,
          abortSignal,
        });
        const assets = collectImageAssets(payload);
        if (assets.length === 0) {
          throw new ImageGenerationError({ code: "empty_result", message: tMain("image.noUsableImage") });
        }
        logger.info("dashscope image task finished", {
          generationId: input.generationId,
          modelId: resolved.modelId,
          taskType,
          outputCount: assets.length,
          durationMs: Date.now() - startedAt,
        });
        return {
          assets,
          ...(warnings.length > 0 ? { warnings } : {}),
        };
      }

      if (isWan26Image) {
        if (sourceImages.length === 0) {
          throw new ImageGenerationError({ code: "validation", message: tMain("image.editInputRequired") });
        }
        if (sourceImages.length > 1) {
          warnings.push(tMain("image.warningInputImageLimit1"));
        }
        if (maskImage) {
          warnings.push(tMain("image.warningMaskIgnored"));
        }

        const payloadInputForSync: Record<string, unknown> = {
          messages: [
            {
              role: "user",
              content: [{ text: input.prompt }, { image: sourceImages[0] }],
            },
          ],
        };

        if (taskCaps?.negativePrompt?.enabled) {
          applyNegativePromptToPayload({
            negativePrompt: input.params?.negativePrompt,
            providerKey: taskCaps?.negativePrompt?.providerKey || "parameters.negative_prompt",
            payloadInput: payloadInputForSync,
            payloadParameters: parameters,
          });
        }
        if (taskCaps?.promptExtend?.enabled) {
          applyBooleanOptionToPayload({
            value: input.params?.promptExtend,
            providerKey: taskCaps?.promptExtend?.providerKey || "parameters.prompt_extend",
            defaultKey: "prompt_extend",
            payloadInput: payloadInputForSync,
            payloadParameters: parameters,
          });
        }
        if (taskCaps?.watermark?.enabled) {
          applyBooleanOptionToPayload({
            value: input.params?.watermark,
            providerKey: taskCaps?.watermark?.providerKey || "parameters.watermark",
            defaultKey: "watermark",
            payloadInput: payloadInputForSync,
            payloadParameters: parameters,
          });
        }

        parameters.enable_interleave = false;
        if (count > 0) parameters.n = count;
        if (normalizedSize) parameters.size = normalizedSize;
        if (seed !== undefined) parameters.seed = seed;
        if (pickedAspectRatio) {
          warnings.push(tMain("image.warningAspectRatioIgnored"));
        }

        const payload = await runSyncGeneration({
          generationId: input.generationId,
          baseApiRoot,
          apiKey,
          modelId: resolved.modelId,
          payloadInput: payloadInputForSync,
          parameters,
          headers: resolved.provider.customHeaders,
          abortSignal,
        });
        const assets = collectImageAssets(payload);
        if (assets.length === 0) {
          throw new ImageGenerationError({ code: "empty_result", message: tMain("image.noUsableImage") });
        }
        logger.info("dashscope image task finished", {
          generationId: input.generationId,
          modelId: resolved.modelId,
          taskType,
          outputCount: assets.length,
          durationMs: Date.now() - startedAt,
        });
        return {
          assets,
          ...(warnings.length > 0 ? { warnings } : {}),
        };
      }

      if (isWanEdit) {
        if (sourceImages.length === 0) {
          throw new ImageGenerationError({ code: "validation", message: tMain("image.editInputRequired") });
        }
        if (sourceImages.length > 1) {
          warnings.push(tMain("image.warningInputImageUse1"));
        }
        const explicitEditFunction = typeof input.params?.editFunction === "string" ? input.params.editFunction.trim() : "";
        const requestOptionFunctionA =
          typeof input.params?.providerOptions?.function === "string" ? input.params.providerOptions.function.trim() : "";
        const requestOptionFunctionB =
          typeof input.params?.providerOptions?.["input.function"] === "string"
            ? input.params.providerOptions["input.function"].trim()
            : "";
        const mergedFunctionA = typeof parameters.function === "string" ? parameters.function.trim() : "";
        const mergedFunctionB =
          typeof parameters["input.function"] === "string" ? String(parameters["input.function"]).trim() : "";
        if ("function" in parameters) delete parameters.function;
        if ("input.function" in parameters) delete parameters["input.function"];

        const pickedFunction =
          explicitEditFunction ||
          requestOptionFunctionA ||
          requestOptionFunctionB ||
          mergedFunctionA ||
          mergedFunctionB ||
          (maskImage ? "description_edit_with_mask" : "description_edit");
        if (pickedFunction === "description_edit_with_mask" && !maskImage) {
          throw new ImageGenerationError({ code: "validation", message: tMain("image.editMaskRequired") });
        }

        const payloadInputForAsync: Record<string, unknown> = {
          function: pickedFunction,
          prompt: input.prompt,
          base_image_url: sourceImages[0],
          ...(maskImage ? { mask_image_url: maskImage } : {}),
        };
        if (taskCaps?.negativePrompt?.enabled) {
          applyNegativePromptToPayload({
            negativePrompt: input.params?.negativePrompt,
            providerKey: taskCaps?.negativePrompt?.providerKey,
            payloadInput: payloadInputForAsync,
            payloadParameters: parameters,
          });
        }
        if (taskCaps?.promptExtend?.enabled) {
          const promptExtendProviderKey = taskCaps?.promptExtend?.providerKey?.trim();
          if (promptExtendProviderKey) {
            applyBooleanOptionToPayload({
              value: input.params?.promptExtend,
              providerKey: promptExtendProviderKey,
              defaultKey: "prompt_extend",
              payloadInput: payloadInputForAsync,
              payloadParameters: parameters,
            });
          } else if (typeof input.params?.promptExtend === "boolean") {
            warnings.push(tMain("image.warningPromptExtendMappingMissing"));
          }
        }
        if (taskCaps?.watermark?.enabled) {
          const watermarkProviderKey = taskCaps?.watermark?.providerKey?.trim();
          if (watermarkProviderKey) {
            applyBooleanOptionToPayload({
              value: input.params?.watermark,
              providerKey: watermarkProviderKey,
              defaultKey: "watermark",
              payloadInput: payloadInputForAsync,
              payloadParameters: parameters,
            });
          } else if (typeof input.params?.watermark === "boolean") {
            warnings.push(tMain("image.warningWatermarkMappingMissing"));
          }
        }

        if (count > 0) parameters.n = count;
        if (normalizedSize) parameters.size = normalizedSize;
        if (seed !== undefined) parameters.seed = seed;
        if (pickedAspectRatio) {
          warnings.push(tMain("image.warningAspectRatioIgnored"));
        }

        const payload = await runAsyncGeneration({
          generationId: input.generationId,
          submitUrl: `${baseApiRoot}/services/aigc/image2image/image-synthesis`,
          pollBaseApiRoot: baseApiRoot,
          apiKey,
          modelId: resolved.modelId,
          payloadInput: payloadInputForAsync,
          parameters,
          headers: resolved.provider.customHeaders,
          abortSignal,
        });
        const assets = collectImageAssets(payload);
        if (assets.length === 0) {
          throw new ImageGenerationError({ code: "empty_result", message: tMain("image.noUsableImage") });
        }
        logger.info("dashscope image task finished", {
          generationId: input.generationId,
          modelId: resolved.modelId,
          taskType,
          outputCount: assets.length,
          durationMs: Date.now() - startedAt,
        });
        return {
          assets,
          ...(warnings.length > 0 ? { warnings } : {}),
        };
      }

      if (isWan25Edit) {
        if (sourceImages.length === 0) {
          throw new ImageGenerationError({ code: "validation", message: tMain("image.editInputRequired") });
        }
        if (sourceImages.length > 3) {
          warnings.push(tMain("image.warningInputImageLimit3"));
        }
        if (maskImage) {
          warnings.push(tMain("image.warningMaskIgnored"));
        }

        const payloadInputForAsync: Record<string, unknown> = {
          prompt: input.prompt,
          images: sourceImages.slice(0, 3),
        };
        if (taskCaps?.negativePrompt?.enabled) {
          applyNegativePromptToPayload({
            negativePrompt: input.params?.negativePrompt,
            providerKey: taskCaps?.negativePrompt?.providerKey || "input.negative_prompt",
            payloadInput: payloadInputForAsync,
            payloadParameters: parameters,
          });
        }
        if (taskCaps?.promptExtend?.enabled) {
          applyBooleanOptionToPayload({
            value: input.params?.promptExtend,
            providerKey: taskCaps?.promptExtend?.providerKey,
            defaultKey: "prompt_extend",
            payloadInput: payloadInputForAsync,
            payloadParameters: parameters,
          });
        }
        if (taskCaps?.watermark?.enabled) {
          applyBooleanOptionToPayload({
            value: input.params?.watermark,
            providerKey: taskCaps?.watermark?.providerKey,
            defaultKey: "watermark",
            payloadInput: payloadInputForAsync,
            payloadParameters: parameters,
          });
        }

        if (count > 0) parameters.n = count;
        if (normalizedSize) parameters.size = normalizedSize;
        if (seed !== undefined) parameters.seed = seed;
        if (pickedAspectRatio) {
          warnings.push(tMain("image.warningAspectRatioIgnored"));
        }

        const payload = await runAsyncGeneration({
          generationId: input.generationId,
          submitUrl: `${baseApiRoot}/services/aigc/image2image/image-synthesis`,
          pollBaseApiRoot: baseApiRoot,
          apiKey,
          modelId: resolved.modelId,
          payloadInput: payloadInputForAsync,
          parameters,
          headers: resolved.provider.customHeaders,
          abortSignal,
        });
        const assets = collectImageAssets(payload);
        if (assets.length === 0) {
          throw new ImageGenerationError({ code: "empty_result", message: tMain("image.noUsableImage") });
        }
        logger.info("dashscope image task finished", {
          generationId: input.generationId,
          modelId: resolved.modelId,
          taskType,
          outputCount: assets.length,
          durationMs: Date.now() - startedAt,
        });
        return {
          assets,
          ...(warnings.length > 0 ? { warnings } : {}),
        };
      }

      if (isWanXPainting) {
        if (sourceImages.length === 0) {
          throw new ImageGenerationError({ code: "validation", message: tMain("image.inpaintInputRequired") });
        }
        if (!maskImage) {
          throw new ImageGenerationError({ code: "validation", message: tMain("image.inpaintMaskRequired") });
        }
        if (sourceImages.length > 1) {
          warnings.push(tMain("image.warningInputImageUse1"));
        }
        if ((input.params?.negativePrompt || "").trim()) {
          warnings.push(tMain("image.warningNegativePromptIgnored"));
        }
        if (typeof input.params?.promptExtend === "boolean") {
          warnings.push(tMain("image.warningPromptExtendIgnored"));
        }
        if (typeof input.params?.watermark === "boolean") {
          warnings.push(tMain("image.warningWatermarkParamIgnored"));
        }
        if (seed !== undefined) {
          warnings.push(tMain("image.warningSeedIgnored"));
        }
        if (pickedAspectRatio) {
          warnings.push(tMain("image.warningAspectRatioIgnored"));
        }

        const payloadInputForAsync: Record<string, unknown> = {
          prompt: input.prompt,
          base_image_url: sourceImages[0],
          mask_image_url: maskImage,
        };
        if (count > 0) parameters.n = count;
        if (normalizedSize) parameters.size = normalizedSize;

        const payload = await runAsyncGeneration({
          generationId: input.generationId,
          submitUrl: `${baseApiRoot}/services/aigc/image2image/image-synthesis`,
          pollBaseApiRoot: baseApiRoot,
          apiKey,
          modelId: resolved.modelId,
          payloadInput: payloadInputForAsync,
          parameters,
          headers: resolved.provider.customHeaders,
          abortSignal,
        });
        const assets = collectImageAssets(payload);
        if (assets.length === 0) {
          throw new ImageGenerationError({ code: "empty_result", message: tMain("image.noUsableImage") });
        }
        logger.info("dashscope image task finished", {
          generationId: input.generationId,
          modelId: resolved.modelId,
          taskType,
          outputCount: assets.length,
          durationMs: Date.now() - startedAt,
        });
        return {
          assets,
          ...(warnings.length > 0 ? { warnings } : {}),
        };
      }

      throw new ImageGenerationError({ code: "validation", message: tMain("image.nativeEditUnsupported") });
    }

    if (isWan26Image && sourceImages.length > 1) {
      warnings.push(tMain("image.warningReferenceImageLimit1"));
    }

    const payloadInputForSync: Record<string, unknown> = isWan26Image
      ? {
          messages: [
            {
              role: "user",
              content: [{ text: input.prompt }, ...(sourceImages.length > 0 ? [{ image: sourceImages[0] }] : [])],
            },
          ],
        }
      : isWan26
      ? {
          messages: [
            {
              role: "user",
              content: [{ text: input.prompt }],
            },
          ],
        }
      : isWanLegacy
      ? { prompt: input.prompt }
      : {
          messages: [
            {
              role: "user",
              content: [{ text: input.prompt }],
            },
          ],
        };
    const payloadInputForAsync: Record<string, unknown> = { prompt: input.prompt };
    if (taskCaps?.negativePrompt?.enabled) {
      applyNegativePromptToPayload({
        negativePrompt: input.params?.negativePrompt,
        providerKey: taskCaps?.negativePrompt?.providerKey || ((isWan26 || isWan26Image) ? "parameters.negative_prompt" : (isWanLegacy ? "input.negative_prompt" : "negative_prompt")),
        payloadInput: useAsyncTaskMode(resolved.modelId) ? payloadInputForAsync : payloadInputForSync,
        payloadParameters: parameters,
      });
    }
    if (taskCaps?.promptExtend?.enabled) {
      applyBooleanOptionToPayload({
        value: input.params?.promptExtend,
        providerKey: taskCaps?.promptExtend?.providerKey,
        defaultKey: "prompt_extend",
        payloadInput: useAsyncTaskMode(resolved.modelId) ? payloadInputForAsync : payloadInputForSync,
        payloadParameters: parameters,
      });
    }
    if (taskCaps?.watermark?.enabled) {
      applyBooleanOptionToPayload({
        value: input.params?.watermark,
        providerKey: taskCaps?.watermark?.providerKey,
        defaultKey: "watermark",
        payloadInput: useAsyncTaskMode(resolved.modelId) ? payloadInputForAsync : payloadInputForSync,
        payloadParameters: parameters,
      });
    }

    if (count > 0) parameters.n = count;
    if (normalizedSize) parameters.size = normalizedSize;
    if (pickedAspectRatio) parameters.aspect_ratio = pickedAspectRatio;
    if (seed !== undefined) parameters.seed = seed;
    if (isWan26Image) {
      parameters.enable_interleave = false;
    }

    if ((isWan26 || isWan26Image || isWanLegacy) && input.params?.aspectRatio && sizeMode === "size" && !normalizedSize) {
      warnings.push(tMain("image.warningUseSizeNotAspectRatio"));
    }
    if (sourceImages.length > 0 && !isWan26Image) {
      warnings.push(tMain("image.warningReferenceImagesUnused"));
    }
    if (maskImage) {
      warnings.push(tMain("image.warningMaskUnused"));
    }

    const payload = useAsyncTaskMode(resolved.modelId)
      ? await runAsyncGeneration({
          generationId: input.generationId,
          submitUrl: `${baseApiRoot}/services/aigc/text2image/image-synthesis`,
          pollBaseApiRoot: baseApiRoot,
          apiKey,
          modelId: resolved.modelId,
          payloadInput: payloadInputForAsync,
          parameters,
          headers: resolved.provider.customHeaders,
          abortSignal,
        })
      : await runSyncGeneration({
          generationId: input.generationId,
          baseApiRoot,
          apiKey,
          modelId: resolved.modelId,
          payloadInput: payloadInputForSync,
          parameters,
          headers: resolved.provider.customHeaders,
          abortSignal,
        });

    const assets = collectImageAssets(payload);
    if (assets.length === 0) {
      throw new ImageGenerationError({ code: "empty_result", message: tMain("image.noUsableImage") });
    }

    logger.info("dashscope image task finished", {
      generationId: input.generationId,
      modelId: resolved.modelId,
      taskType,
      outputCount: assets.length,
      durationMs: Date.now() - startedAt,
    });

    return {
      assets,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  },
};
