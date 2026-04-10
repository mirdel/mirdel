import { loggerServiceMain, resolveImageTaskCapabilities } from "@shared";
import { tMain } from "../../../i18n";
import { ImageGenerationError } from "./errors";
import { normalizeSeed } from "./utils";
import type { ImageAdapterResult, ImageProviderAdapter } from "./types";

const logger = loggerServiceMain.withContext("minimaxImageAdapter");

function parseJsonSafely(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function resolveMinimaxApiUrl(baseUrl: string) {
  const normalized = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!normalized) return "https://api.minimaxi.com/v1/image_generation";
  return /\/v1$/i.test(normalized) ? `${normalized}/image_generation` : `${normalized}/v1/image_generation`;
}

function extractMessage(payload: any, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  return (
    payload?.base_resp?.status_msg ||
    payload?.message ||
    payload?.msg ||
    payload?.error ||
    payload?.detail ||
    fallback
  );
}

async function requestMinimaxJson(input: {
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
    const message = extractMessage(payload, response.statusText || "request failed");

    if (!response.ok) {
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

    const baseStatus = Number(payload?.base_resp?.status_code ?? 0);
    if (Number.isFinite(baseStatus) && baseStatus !== 0) {
      throw new ImageGenerationError({ code: "unknown", message });
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
  const urls = Array.isArray(payload?.data?.image_urls) ? payload.data.image_urls : [];
  for (const item of urls) {
    if (typeof item === "string" && item.trim().length > 0) {
      assets.push({ src: item.trim() });
    }
  }
  const base64List = Array.isArray(payload?.data?.image_base64) ? payload.data.image_base64 : [];
  for (const item of base64List) {
    if (typeof item === "string" && item.trim().length > 0) {
      assets.push({ src: `data:image/png;base64,${item.trim()}`, mediaType: "image/png" });
    }
  }
  return assets;
}

export const minimaxImageAdapter: ImageProviderAdapter = {
  id: "minimax-image-native",
  canHandle(resolved) {
    return resolved.provider.id === "minimax" && resolved.model.outputModalities?.includes("image");
  },
  async run(ctx): Promise<ImageAdapterResult> {
    const { resolved, input, abortSignal } = ctx;
    const apiKey = resolved.provider.apiKey?.trim();
    if (!apiKey) {
      throw new ImageGenerationError({ code: "auth", message: tMain("provider.apiKeyMissing", { providerId: "minimax" }) });
    }

    const taskType = input.params?.taskType === "edit" ? "edit" : "generate";
    if (taskType !== "generate") {
      throw new ImageGenerationError({ code: "validation", message: tMain("image.nativeEditUnsupported") });
    }

    const taskCaps = resolveImageTaskCapabilities(resolved.model.image, "generate");
    const supportsN = taskCaps?.n?.enabled !== false;
    const countLimit = supportsN ? Math.max(1, taskCaps?.n?.max || 9) : 1;
    const count = supportsN ? Math.max(1, Math.min(Number(input.params?.count || 1), countLimit)) : 1;
    const sizeMode = taskCaps?.sizeMode || "both";
    const aspectRatioEnabled = taskCaps?.aspectRatio?.enabled !== false;
    const aspectRatio = (sizeMode === "size" || !aspectRatioEnabled) ? undefined : (input.params?.aspectRatio || "").trim() || undefined;
    const seed = taskCaps?.seed?.enabled ? normalizeSeed(input.params?.seed) : undefined;
    const referenceImages = Array.isArray(input.params?.referenceImages)
      ? input.params.referenceImages
          .map((item) => item?.url)
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const warnings: string[] = [];

    const requestBody: Record<string, unknown> = {
      model: resolved.modelId,
      prompt: input.prompt,
      response_format: "url",
      ...(supportsN ? { n: count } : {}),
      ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
      ...(seed !== undefined ? { seed } : {}),
    };

    if ((input.params?.aspectRatio || "").trim() && !aspectRatioEnabled) {
      warnings.push(tMain("image.warningAspectRatioIgnored"));
    }

    if (input.params?.maskImage?.url) {
      warnings.push(tMain("image.warningMaskUnused"));
    }

    const supportsReferenceImage = taskCaps?.referenceImages?.enabled === true;
    if (referenceImages.length > 0 && !supportsReferenceImage) {
      warnings.push(tMain("image.warningReferenceImagesUnused"));
    }

    if (supportsReferenceImage && referenceImages.length > 1) {
      warnings.push(tMain("image.warningReferenceImageLimit1"));
    }
    if (supportsReferenceImage && referenceImages.length > 0) {
      requestBody.subject_reference = referenceImages.slice(0, 1).map((url) => ({
        type: "character",
        image_file: url,
      }));
    }

    const mergedOptions = {
      ...(resolved.provider.providerOptionsDefaults || {}),
      ...(resolved.model.providerOptionsDefaults || {}),
      ...(input.params?.providerOptions || {}),
    } as Record<string, unknown>;
    if (Object.keys(mergedOptions).length > 0) {
      Object.assign(requestBody, mergedOptions);
    }

    const url = resolveMinimaxApiUrl(resolved.provider.baseUrl);
    logger.info("minimax image submit", {
      generationId: input.generationId,
      modelId: resolved.modelId,
      endpoint: url,
      count,
      hasReferenceImage: referenceImages.length > 0,
    });
    const payload = await requestMinimaxJson({
      url,
      body: requestBody,
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
