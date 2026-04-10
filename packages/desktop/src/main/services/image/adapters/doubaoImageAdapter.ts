import { loggerServiceMain, resolveImageTaskCapabilities } from "@shared";
import { tMain } from "../../../i18n";
import { ImageGenerationError } from "./errors";
import { normalizeSeed } from "./utils";
import type { ImageAdapterResult, ImageProviderAdapter } from "./types";

const logger = loggerServiceMain.withContext("doubaoImageAdapter");

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
    fallback
  );
}

function resolveDoubaoGenerationUrl(baseUrl: string) {
  const normalized = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!normalized) return "https://ark.cn-beijing.volces.com/api/v3/images/generations";
  if (/\/images\/generations$/i.test(normalized)) return normalized;
  if (/\/v3$/i.test(normalized)) return `${normalized}/images/generations`;
  return `${normalized}/v3/images/generations`;
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

async function requestDoubaoJson(input: {
  url: string;
  body: Record<string, unknown>;
  apiKey: string;
  headers?: Record<string, string>;
  abortSignal: AbortSignal;
}) {
  try {
    const response = await fetch(input.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
        ...(input.headers || {}),
      },
      body: JSON.stringify(input.body),
      signal: input.abortSignal,
    });

    const text = await response.text();
    const payload = parseJsonSafely(text);

    if (!response.ok) {
      const message = extractErrorMessage(payload, response.statusText || "request failed");
      if (response.status === 401) {
        throw new ImageGenerationError({ code: "auth", message: tMain("image.authFailedWithDetail", { message }), statusCode: 401 });
      }
      if (response.status === 403) {
        throw new ImageGenerationError({ code: "permission", message: tMain("image.permissionDeniedWithDetail", { message }), statusCode: 403 });
      }
      if (response.status === 404) {
        throw new ImageGenerationError({ code: "model_not_found", message: tMain("image.modelUnavailableWithDetail", { message }), statusCode: 404 });
      }
      if (response.status === 429) {
        throw new ImageGenerationError({ code: "rate_limit", message: tMain("image.rateLimitWithDetail", { message }), statusCode: 429, retryable: true });
      }
      if (response.status >= 500) {
        throw new ImageGenerationError({
          code: "service_unavailable",
          message: tMain("image.serviceUnavailableWithDetail", { message }),
          statusCode: response.status,
          retryable: true,
        });
      }
      throw new ImageGenerationError({ code: "unknown", message, statusCode: response.status });
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
      retryable: true,
    });
  }
}

function collectAssets(payload: any): Array<{ src: string; mediaType?: string }> {
  const assets: Array<{ src: string; mediaType?: string }> = [];
  const data = Array.isArray(payload?.data) ? payload.data : [];
  for (const item of data) {
    if (typeof item?.url === "string" && item.url.trim().length > 0) {
      assets.push({ src: item.url.trim() });
      continue;
    }
    if (typeof item?.b64_json === "string" && item.b64_json.trim().length > 0) {
      assets.push({ src: `data:image/png;base64,${item.b64_json.trim()}`, mediaType: "image/png" });
    }
  }
  return assets;
}

export const doubaoImageAdapter: ImageProviderAdapter = {
  id: "doubao-image-native",
  canHandle(resolved) {
    return resolved.provider.id === "doubao" && resolved.model.outputModalities?.includes("image");
  },
  async run(ctx): Promise<ImageAdapterResult> {
    const { resolved, input, abortSignal } = ctx;
    const apiKey = resolved.provider.apiKey?.trim();
    if (!apiKey) {
      throw new ImageGenerationError({ code: "auth", message: tMain("provider.apiKeyMissing", { providerId: "doubao" }) });
    }

    const taskType = input.params?.taskType === "edit" ? "edit" : "generate";
    if (taskType !== "generate") {
      throw new ImageGenerationError({ code: "validation", message: tMain("image.nativeEditUnsupported") });
    }

    const taskCaps = resolveImageTaskCapabilities(resolved.model.image, "generate");
    const supportsN = taskCaps?.n?.enabled !== false;
    const countLimit = supportsN ? Math.max(1, taskCaps?.n?.max || 4) : 1;
    let count = supportsN ? Math.max(1, Math.min(Number(input.params?.count || 1), countLimit)) : 1;
    const sizeMode = taskCaps?.sizeMode || "both";
    const sizeEnabled = taskCaps?.size?.enabled === true;
    const size = (sizeMode === "aspectRatio" || !sizeEnabled) ? undefined : (input.params?.size || "").trim() || undefined;
    const aspectRatioEnabled = taskCaps?.aspectRatio?.enabled === true;
    const aspectRatio = (sizeMode === "size" || !aspectRatioEnabled)
      ? undefined
      : (input.params?.aspectRatio || "").trim() || undefined;
    const seed = taskCaps?.seed?.enabled ? normalizeSeed(input.params?.seed) : undefined;

    const body: Record<string, unknown> = {
      model: resolved.modelId,
      prompt: input.prompt,
      response_format: "url",
      ...(size ? { size } : {}),
      ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
      ...(seed !== undefined ? { seed } : {}),
    };

    const mergedOptions = {
      ...(resolved.provider.providerOptionsDefaults || {}),
      ...(resolved.model.providerOptionsDefaults || {}),
      ...(input.params?.providerOptions || {}),
    } as Record<string, unknown>;
    if (Object.keys(mergedOptions).length > 0) {
      Object.assign(body, mergedOptions);
    }

    if (taskCaps?.watermark?.enabled && typeof input.params?.watermark === "boolean") {
      const key = (taskCaps?.watermark?.providerKey || "watermark").trim();
      setPath(body, key, input.params.watermark);
    }

    if (taskCaps?.quality?.enabled) {
      const quality = (input.params?.quality || "").trim();
      if (quality) {
        const key = (taskCaps.quality.providerKey || "quality").trim();
        setPath(body, key, quality);
      }
    }

    const warnings: string[] = [];
    const sourceImages = Array.isArray(input.params?.referenceImages)
      ? input.params.referenceImages
          .map((item) => item?.url)
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const supportsReferences = taskCaps?.referenceImages?.enabled === true;
    const maxReferences = Math.max(1, taskCaps?.referenceImages?.max || 14);
    if (supportsReferences && sourceImages.length > 0) {
      body.reference_images = sourceImages.slice(0, maxReferences);
      if (supportsN) {
        const maxImagesByCombinedLimit = Math.max(1, 15 - Math.min(sourceImages.length, maxReferences));
        count = Math.min(count, maxImagesByCombinedLimit);
      }
    } else if (sourceImages.length > 0) {
      warnings.push(tMain("image.warningReferenceImagesUnused"));
    }

    if (input.params?.maskImage?.url) {
      warnings.push(tMain("image.warningMaskUnused"));
    }

    if (supportsN && count > 1) {
      body.sequential_image_generation = "auto";
      body.sequential_image_generation_options = { max_images: count };
    }

    const url = resolveDoubaoGenerationUrl(resolved.provider.baseUrl);
    logger.info("doubao image submit", {
      generationId: input.generationId,
      modelId: resolved.modelId,
      endpoint: url,
      count,
      hasReferenceImage: sourceImages.length > 0,
    });

    const payload = await requestDoubaoJson({
      url,
      body,
      apiKey,
      headers: resolved.provider.customHeaders,
      abortSignal,
    });

    const assets = collectAssets(payload);
    if (assets.length === 0) {
      throw new ImageGenerationError({ code: "empty_result", message: tMain("image.noUsableImage") });
    }
    return {
      assets,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  },
};
