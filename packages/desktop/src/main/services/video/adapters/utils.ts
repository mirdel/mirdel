import type { ProviderPublic } from "@shared";
import { tMain } from "../../../i18n";
import { VideoGenerationError } from "./errors";

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

export function parseSelectedModel(selectedModel: string) {
  const [providerId, modelId] = (selectedModel || "").split("::");
  if (!providerId || !modelId) {
    throw new VideoGenerationError({ code: "validation", message: tMain("video.invalidModelId") });
  }
  return { providerId, modelId };
}

export function resolveProviderOptionScope(providerId: string) {
  if (providerId === "dashscope") return "alibaba";
  if (providerId === "doubao") return "bytedance";
  return providerId;
}

export function mergeProviderOptions(params: {
  providerId: string;
  provider: ProviderPublic;
  model: ProviderPublic["models"][number];
  requestOptions?: Record<string, unknown>;
  negativePrompt?: string;
  negativePromptProviderKey?: string;
}) {
  const scope = resolveProviderOptionScope(params.providerId);
  const base = {
    ...(params.provider.providerOptionsDefaults || {}),
    ...(params.model.providerOptionsDefaults || {}),
    ...(params.requestOptions || {}),
  } as Record<string, unknown>;

  const negativePrompt = (params.negativePrompt || "").trim();
  if (negativePrompt) {
    const key =
      typeof params.negativePromptProviderKey === "string" && params.negativePromptProviderKey.trim().length > 0
        ? params.negativePromptProviderKey.trim()
        : "negativePrompt";
    setPath(base, key, negativePrompt);
  }

  if (Object.keys(base).length === 0) return undefined;
  return { [scope]: base };
}

export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new VideoGenerationError({ code: "aborted", message: tMain("video.aborted") }));
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new VideoGenerationError({ code: "aborted", message: tMain("video.aborted") }));
    };

    const cleanup = () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    };

    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function toDashscopeVideoApiRoot(baseUrl: string) {
  const raw = (baseUrl || "").trim();
  const normalized = raw.replace(/\/+$/, "");
  if (!normalized) return "https://dashscope.aliyuncs.com";

  return normalized
    .replace(/\/compatible-mode\/v1$/i, "")
    .replace(/\/api\/v1$/i, "")
    .replace(/\/v1$/i, "");
}
