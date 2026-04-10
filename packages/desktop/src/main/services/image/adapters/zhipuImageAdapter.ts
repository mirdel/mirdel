import { loggerServiceMain, resolveImageTaskCapabilities } from "@shared";
import { tMain } from "../../../i18n";
import { ImageGenerationError } from "./errors";
import { normalizeSeed } from "./utils";
import type { ImageAdapterResult, ImageProviderAdapter } from "./types";

const logger = loggerServiceMain.withContext("zhipuImageAdapter");

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

function resolveZhipuGenerationUrl(baseUrl: string) {
  const normalized = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!normalized) return "https://open.bigmodel.cn/api/paas/v4/images/generations";
  if (/\/images\/generations$/i.test(normalized)) return normalized;
  if (/\/v4$/i.test(normalized)) return `${normalized}/images/generations`;
  return `${normalized}/v4/images/generations`;
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

async function requestZhipuJson(input: {
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

export const zhipuImageAdapter: ImageProviderAdapter = {
  id: "zhipu-image-native",
  canHandle(resolved) {
    return resolved.provider.id === "zhipu" && resolved.model.outputModalities?.includes("image");
  },
  async run(ctx): Promise<ImageAdapterResult> {
    const { resolved, input, abortSignal } = ctx;
    const apiKey = resolved.provider.apiKey?.trim();
    if (!apiKey) {
      throw new ImageGenerationError({ code: "auth", message: tMain("provider.apiKeyMissing", { providerId: "zhipu" }) });
    }

    const taskType = input.params?.taskType === "edit" ? "edit" : "generate";
    if (taskType !== "generate") {
      throw new ImageGenerationError({ code: "validation", message: tMain("image.nativeEditUnsupported") });
    }

    const taskCaps = resolveImageTaskCapabilities(resolved.model.image, "generate");
    const supportsN = taskCaps?.n?.enabled !== false;
    const countLimit = supportsN ? Math.max(1, taskCaps?.n?.max || 4) : 1;
    const count = supportsN ? Math.max(1, Math.min(Number(input.params?.count || 1), countLimit)) : 1;
    const sizeMode = taskCaps?.sizeMode || "both";
    const sizeEnabled = taskCaps?.size?.enabled !== false;
    const size = (sizeMode === "aspectRatio" || !sizeEnabled) ? undefined : (input.params?.size || "").trim() || undefined;
    const qualityEnabled = taskCaps?.quality?.enabled === true;
    const quality = qualityEnabled ? (input.params?.quality || "").trim() || undefined : undefined;
    const seed = taskCaps?.seed?.enabled ? normalizeSeed(input.params?.seed) : undefined;

    const body: Record<string, unknown> = {
      model: resolved.modelId,
      prompt: input.prompt,
      ...(supportsN ? { n: count } : {}),
      ...(size ? { size } : {}),
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

    if (quality) {
      const key = (taskCaps?.quality?.providerKey || "quality").trim();
      setPath(body, key, quality);
    }

    if (taskCaps?.watermark?.enabled && typeof input.params?.watermark === "boolean") {
      const key = (taskCaps?.watermark?.providerKey || "watermark_enabled").trim();
      setPath(body, key, input.params.watermark);
    }

    const warnings: string[] = [];
    if ((input.params?.aspectRatio || "").trim()) {
      warnings.push(tMain("image.warningAspectRatioIgnored"));
    }
    const refs = Array.isArray(input.params?.referenceImages) ? input.params.referenceImages : [];
    if (refs.length > 0) {
      warnings.push(tMain("image.warningReferenceImagesUnused"));
    }
    if (input.params?.maskImage?.url) {
      warnings.push(tMain("image.warningMaskUnused"));
    }

    const url = resolveZhipuGenerationUrl(resolved.provider.baseUrl);
    logger.info("zhipu image submit", {
      generationId: input.generationId,
      modelId: resolved.modelId,
      endpoint: url,
      count,
    });

    const payload = await requestZhipuJson({
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

