import type { ProviderPublic } from "@shared";
import { ImageGenerationError } from "./errors";
import { tMain } from "../../../i18n";

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

export function normalizeSeed(seed: number | undefined): number | undefined {
  if (typeof seed === "number" && Number.isFinite(seed)) return Math.floor(seed);
  return undefined;
}

export function toDataUrl(mediaType: string, bytes: Uint8Array) {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

export function normalizeGeneratedImageToSrc(item: any): { src: string; mediaType?: string } | null {
  if (!item) return null;
  if (typeof item === "string") return { src: item };

  if (typeof item.url === "string") {
    return { src: item.url, mediaType: typeof item.mediaType === "string" ? item.mediaType : undefined };
  }
  if (typeof item.base64 === "string") {
    const mediaType = typeof item.mediaType === "string" ? item.mediaType : "image/png";
    return { src: `data:${mediaType};base64,${item.base64}`, mediaType };
  }
  if (item.uint8Array instanceof Uint8Array) {
    const mediaType = typeof item.mediaType === "string" ? item.mediaType : "image/png";
    return { src: toDataUrl(mediaType, item.uint8Array), mediaType };
  }
  if (item.bytes instanceof Uint8Array) {
    const mediaType = typeof item.mediaType === "string" ? item.mediaType : "image/png";
    return { src: toDataUrl(mediaType, item.bytes), mediaType };
  }
  if (item.image) return normalizeGeneratedImageToSrc(item.image);
  return null;
}

export function normalizeImageResults(result: any): Array<{ src: string; mediaType?: string }> {
  const images = Array.isArray(result?.images) ? result.images : result?.image ? [result.image] : [];
  return images
    .map((item: any) => normalizeGeneratedImageToSrc(item))
    .filter((item: { src: string; mediaType?: string } | null): item is { src: string; mediaType?: string } => !!item && !!item.src);
}

export function mergeProviderOptions(params: {
  providerId: string;
  provider: ProviderPublic;
  model: ProviderPublic["models"][number];
  requestOptions?: Record<string, unknown>;
  quality?: string;
  qualityProviderKey?: string;
  negativePrompt?: string;
  negativePromptProviderKey?: string;
  promptExtend?: boolean;
  promptExtendProviderKey?: string;
  watermark?: boolean;
  watermarkProviderKey?: string;
}) {
  const base = {
    ...(params.provider.providerOptionsDefaults || {}),
    ...(params.model.providerOptionsDefaults || {}),
    ...(params.requestOptions || {}),
  } as Record<string, unknown>;

  const negativePrompt = (params.negativePrompt || "").trim();
  if (negativePrompt) {
    const declaredKey =
      typeof params.negativePromptProviderKey === "string" && params.negativePromptProviderKey.trim().length > 0
        ? params.negativePromptProviderKey.trim()
        : "negative_prompt";
    setPath(base, declaredKey, negativePrompt);
  }

  if (typeof params.promptExtend === "boolean") {
    const declaredKey =
      typeof params.promptExtendProviderKey === "string" && params.promptExtendProviderKey.trim().length > 0
        ? params.promptExtendProviderKey.trim()
        : "prompt_extend";
    setPath(base, declaredKey, params.promptExtend);
  }

  if (typeof params.watermark === "boolean") {
    const declaredKey =
      typeof params.watermarkProviderKey === "string" && params.watermarkProviderKey.trim().length > 0
        ? params.watermarkProviderKey.trim()
        : "watermark";
    setPath(base, declaredKey, params.watermark);
  }

  const quality = (params.quality || "").trim();
  if (quality) {
    const declaredKey =
      typeof params.qualityProviderKey === "string" && params.qualityProviderKey.trim().length > 0
        ? params.qualityProviderKey.trim()
        : "quality";
    setPath(base, declaredKey, quality);
  }

  if (Object.keys(base).length === 0) return undefined;
  return { [params.providerId]: base };
}

export function parseSelectedModel(selectedModel: string) {
  const [providerId, modelId] = (selectedModel || "").split("::");
  if (!providerId || !modelId) {
    throw new ImageGenerationError({ code: "validation", message: tMain("image.invalidModelId") });
  }
  return { providerId, modelId };
}

export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ImageGenerationError({ code: "aborted", message: tMain("image.aborted") }));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new ImageGenerationError({ code: "aborted", message: tMain("image.aborted") }));
    };

    const cleanup = () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    };

    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function toDashscopeApiRoot(baseUrl: string) {
  const raw = (baseUrl || "").trim();
  const normalized = raw.replace(/\/+$/, "");
  if (!normalized) return "https://dashscope.aliyuncs.com/api/v1";

  if (/\/api\/v1$/i.test(normalized)) return normalized;

  return normalized
    .replace(/\/compatible-mode\/v1$/i, "")
    .replace(/\/v1$/i, "")
    .replace(/\/+$/, "") + "/api/v1";
}
