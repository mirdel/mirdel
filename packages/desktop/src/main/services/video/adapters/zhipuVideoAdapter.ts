import { loggerServiceMain } from "@shared";
import { tMain } from "../../../i18n";
import { VideoGenerationError } from "./errors";
import { sleep } from "./utils";
import type { ResolvedVideoModel, VideoAdapterResult, VideoProviderAdapter } from "./types";

const logger = loggerServiceMain.withContext("zhipuVideoAdapter");

const ZHIPU_DEFAULT_BASE = "https://open.bigmodel.cn/api/paas/v4";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 8 * 60 * 1000;
const PROCESSING_STATUS = new Set(["SUBMITTED", "QUEUED", "PENDING", "PROCESSING", "RUNNING", "IN_PROGRESS"]);
const FAILED_STATUS = new Set(["FAIL", "FAILED", "ERROR", "CANCELED", "CANCELLED", "REJECTED"]);
const SUCCEEDED_STATUS = new Set(["SUCCESS", "SUCCEEDED", "COMPLETED", "FINISHED", "DONE"]);

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
    payload?.error?.message ||
    payload?.message ||
    payload?.msg ||
    payload?.detail ||
    payload?.error?.code ||
    payload?.code ||
    fallback
  );
}

function resolveZhipuVideoGenerationUrl(baseUrl: string) {
  const normalized = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!normalized) return `${ZHIPU_DEFAULT_BASE}/videos/generations`;
  if (/\/videos\/generations$/i.test(normalized)) return normalized;
  if (/\/async-result$/i.test(normalized)) return `${normalized.replace(/\/async-result$/i, "")}/videos/generations`;
  if (/\/v4$/i.test(normalized)) return `${normalized}/videos/generations`;
  return `${normalized}/v4/videos/generations`;
}

function resolveZhipuAsyncResultUrl(baseUrl: string, taskId: string) {
  const normalized = (baseUrl || "").trim().replace(/\/+$/, "");
  const encodedTaskId = encodeURIComponent(taskId);
  if (!normalized) return `${ZHIPU_DEFAULT_BASE}/async-result/${encodedTaskId}`;
  if (/\/async-result$/i.test(normalized)) return `${normalized}/${encodedTaskId}`;
  if (/\/videos\/generations$/i.test(normalized)) {
    return `${normalized.replace(/\/videos\/generations$/i, "")}/async-result/${encodedTaskId}`;
  }
  if (/\/v4$/i.test(normalized)) return `${normalized}/async-result/${encodedTaskId}`;
  return `${normalized}/v4/async-result/${encodedTaskId}`;
}

async function requestZhipuJson(input: {
  url: string;
  method: "GET" | "POST";
  apiKey: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  abortSignal: AbortSignal;
}) {
  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
        ...(input.headers || {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      signal: input.abortSignal,
    });

    const text = await response.text();
    const payload = parseJsonSafely(text);

    if (!response.ok) {
      const message = extractErrorMessage(payload, response.statusText || "request failed");
      if (response.status === 401) {
        throw new VideoGenerationError({ code: "auth", message: tMain("video.authFailed"), statusCode: 401 });
      }
      if (response.status === 403) {
        throw new VideoGenerationError({ code: "permission", message: tMain("video.permissionDenied"), statusCode: 403 });
      }
      if (response.status === 404) {
        throw new VideoGenerationError({ code: "model_not_found", message: tMain("video.modelUnavailable"), statusCode: 404 });
      }
      if (response.status === 429) {
        throw new VideoGenerationError({ code: "rate_limit", message: tMain("video.rateLimit"), statusCode: 429, retryable: true });
      }
      if (response.status >= 500) {
        throw new VideoGenerationError({
          code: "service_unavailable",
          message: tMain("video.serviceUnavailable"),
          statusCode: response.status,
          retryable: true,
        });
      }
      throw new VideoGenerationError({
        code: "unknown",
        message: tMain("video.generationFailed", { message }),
        statusCode: response.status,
      });
    }

    return payload;
  } catch (error) {
    if ((error as any)?.name === "AbortError") {
      throw new VideoGenerationError({ code: "aborted", message: tMain("video.aborted") });
    }
    if (error instanceof VideoGenerationError) throw error;
    throw new VideoGenerationError({
      code: "network",
      message: tMain("video.networkFailed"),
      retryable: true,
    });
  }
}

function normalizeNumericOptions(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const values = input
    .map((item) => (typeof item === "number" && Number.isFinite(item) ? Math.floor(item) : NaN))
    .filter((item): item is number => Number.isFinite(item));
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function normalizeOptionalInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.floor(value);
}

function validateValueByCaps(input: {
  value: number | undefined;
  caps?: { options?: number[]; min?: number; max?: number; enabled?: boolean };
  optionErrorMessage: (options: string) => string;
  rangeErrorMessage: (min: number, max: number) => string;
}) {
  if (input.value === undefined) return undefined;
  if (input.caps?.enabled === false) return undefined;

  const options = normalizeNumericOptions(input.caps?.options);
  if (options.length > 0 && !options.includes(input.value)) {
    throw new VideoGenerationError({
      code: "validation",
      message: input.optionErrorMessage(options.join(", ")),
    });
  }

  const min = typeof input.caps?.min === "number" ? Math.floor(input.caps.min) : undefined;
  const max = typeof input.caps?.max === "number" ? Math.floor(input.caps.max) : undefined;
  if (min !== undefined && input.value < min) {
    throw new VideoGenerationError({
      code: "validation",
      message: input.rangeErrorMessage(min, max ?? min),
    });
  }
  if (max !== undefined && input.value > max) {
    throw new VideoGenerationError({
      code: "validation",
      message: input.rangeErrorMessage(min ?? max, max),
    });
  }

  return input.value;
}

function collectVideoAssets(payload: any): Array<{ src: string; mediaType?: string }> {
  const assets: Array<{ src: string; mediaType?: string }> = [];
  const result = Array.isArray(payload?.video_result) ? payload.video_result : [];

  for (const item of result) {
    if (typeof item?.url === "string" && item.url.trim().length > 0) {
      assets.push({ src: item.url.trim(), mediaType: "video/mp4" });
    }
  }

  return assets;
}

function extractTaskStatus(payload: any) {
  const raw = payload?.task_status || payload?.status || payload?.output?.task_status;
  if (typeof raw !== "string") return "";
  return raw.trim().toUpperCase();
}

function resolveTaskId(payload: any) {
  const candidate = payload?.id || payload?.task_id || payload?.output?.task_id;
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : "";
}

function readBooleanOption(options: Record<string, unknown>, key: string, fallbackKey: string) {
  const v = options[key];
  if (typeof v === "boolean") return v;
  const fallback = options[fallbackKey];
  if (typeof fallback === "boolean") return fallback;
  return undefined;
}

function isZhipuCogVideoModel(modelId: string) {
  const id = (modelId || "").trim().toLowerCase();
  return id.startsWith("cogvideo");
}

export const zhipuVideoAdapter: VideoProviderAdapter = {
  id: "zhipu-video-native",
  canHandle(resolved: ResolvedVideoModel) {
    return resolved.provider.id === "zhipu"
      && resolved.model.outputModalities?.includes("video")
      && isZhipuCogVideoModel(resolved.modelId);
  },
  async run(ctx): Promise<VideoAdapterResult> {
    const { resolved, input, abortSignal } = ctx;
    const apiKey = resolved.provider.apiKey?.trim();
    if (!apiKey) {
      throw new VideoGenerationError({ code: "auth", message: tMain("provider.apiKeyMissing", { providerId: "zhipu" }) });
    }

    const caps = resolved.model.video;
    const resolutionOptions = (caps?.resolution?.options || []).map((item) => String(item).trim()).filter(Boolean);
    const resolution = caps?.resolution?.enabled === false ? undefined : (input.params?.resolution || "").trim() || undefined;
    if (resolution && resolutionOptions.length > 0 && !resolutionOptions.includes(resolution)) {
      throw new VideoGenerationError({
        code: "validation",
        message: tMain("video.unsupported"),
      });
    }

    const duration = validateValueByCaps({
      value: normalizeOptionalInt(input.params?.duration),
      caps: caps?.duration,
      optionErrorMessage: (options) => tMain("video.durationInvalidOption", { options }),
      rangeErrorMessage: (min, max) => tMain("video.durationOutOfRange", { min, max }),
    });

    const fps = validateValueByCaps({
      value: normalizeOptionalInt(input.params?.fps),
      caps: caps?.fps,
      optionErrorMessage: (options) => tMain("video.fpsInvalidOption", { options }),
      rangeErrorMessage: (min, max) => tMain("video.fpsOutOfRange", { min, max }),
    });

    const sourceImages = Array.isArray(input.params?.referenceImages)
      ? input.params.referenceImages
          .map((item) => item?.url)
          .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      : [];

    const mergedOptions = {
      ...(resolved.provider.providerOptionsDefaults || {}),
      ...(resolved.model.providerOptionsDefaults || {}),
      ...(input.params?.providerOptions || {}),
    } as Record<string, unknown>;

    const body: Record<string, unknown> = {
      model: resolved.modelId,
      prompt: input.prompt,
      ...(resolution ? { size: resolution } : {}),
      ...(duration !== undefined ? { duration } : {}),
      ...(fps !== undefined ? { fps } : {}),
    };

    const passthroughOptions = { ...mergedOptions };
    delete passthroughOptions.model;
    delete passthroughOptions.prompt;
    delete passthroughOptions.size;
    delete passthroughOptions.duration;
    delete passthroughOptions.fps;
    delete passthroughOptions.image_url;
    delete passthroughOptions.quality;
    delete passthroughOptions.generateAudio;
    delete passthroughOptions.with_audio;
    delete passthroughOptions.watermark;
    delete passthroughOptions.watermark_enabled;
    if (Object.keys(passthroughOptions).length > 0) {
      Object.assign(body, passthroughOptions);
    }

    if (sourceImages.length === 1) {
      body.image_url = sourceImages[0];
    } else if (sourceImages.length >= 2) {
      body.image_url = sourceImages.slice(0, 2);
    }

    const qualityRaw = typeof mergedOptions.quality === "string" ? mergedOptions.quality.trim().toLowerCase() : "";
    if (qualityRaw) {
      if (qualityRaw !== "speed" && qualityRaw !== "quality") {
        throw new VideoGenerationError({ code: "validation", message: tMain("video.unsupported") });
      }
      body.quality = qualityRaw;
    }

    const generateAudio = readBooleanOption(mergedOptions, "generateAudio", "with_audio");
    if (typeof generateAudio === "boolean") body.with_audio = generateAudio;

    const watermark = readBooleanOption(mergedOptions, "watermark", "watermark_enabled");
    if (typeof watermark === "boolean") body.watermark_enabled = watermark;

    const submitUrl = resolveZhipuVideoGenerationUrl(resolved.provider.baseUrl);
    logger.info("zhipu video submit", {
      generationId: input.generationId,
      modelId: resolved.modelId,
      endpoint: submitUrl,
      hasReferenceImage: sourceImages.length > 0,
    });

    const submitPayload = await requestZhipuJson({
      url: submitUrl,
      method: "POST",
      body,
      apiKey,
      headers: resolved.provider.customHeaders,
      abortSignal,
    });

    const taskId = resolveTaskId(submitPayload);
    if (!taskId) {
      throw new VideoGenerationError({ code: "unknown", message: tMain("video.zhipuTaskIdMissing") });
    }

    const pollUrl = resolveZhipuAsyncResultUrl(resolved.provider.baseUrl, taskId);
    const startTime = Date.now();
    let lastStatus = "";

    for (;;) {
      if (Date.now() - startTime > POLL_TIMEOUT_MS) {
        throw new VideoGenerationError({ code: "timeout", message: tMain("video.timeout"), retryable: true });
      }

      const pollPayload = await requestZhipuJson({
        url: pollUrl,
        method: "GET",
        apiKey,
        headers: resolved.provider.customHeaders,
        abortSignal,
      });

      const assets = collectVideoAssets(pollPayload);
      if (assets.length > 0) {
        return { assets };
      }

      const status = extractTaskStatus(pollPayload);
      if (status && status !== lastStatus) {
        lastStatus = status;
        logger.info("zhipu video poll", {
          generationId: input.generationId,
          modelId: resolved.modelId,
          taskId,
          status,
        });
      }

      if (status && SUCCEEDED_STATUS.has(status) && assets.length <= 0) {
        throw new VideoGenerationError({ code: "empty_result", message: tMain("video.noUsableVideo") });
      }
      if (status && FAILED_STATUS.has(status)) {
        const message = extractErrorMessage(pollPayload, status);
        throw new VideoGenerationError({ code: "unknown", message: tMain("video.zhipuTaskFailed", { message }) });
      }

      if (!status || PROCESSING_STATUS.has(status) || SUCCEEDED_STATUS.has(status)) {
        await sleep(POLL_INTERVAL_MS, abortSignal);
        continue;
      }

      // Unrecognized status: continue polling conservatively until timeout.
      await sleep(POLL_INTERVAL_MS, abortSignal);
    }
  },
};
