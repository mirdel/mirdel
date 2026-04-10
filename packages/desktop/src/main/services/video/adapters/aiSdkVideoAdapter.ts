import { experimental_generateVideo as generateVideo } from "ai";
import { createAlibaba } from "@ai-sdk/alibaba";
import { createByteDance } from "@ai-sdk/bytedance";
import { createXai } from "@ai-sdk/xai";
import { createLlmProvider } from "../../providers/llmProviderFactory";
import { tMain } from "../../../i18n";
import { VideoGenerationError, toVideoGenerationError } from "./errors";
import { mergeProviderOptions, normalizeSeed, resolveProviderOptionScope, toDashscopeVideoApiRoot, toDataUrl } from "./utils";
import type { VideoProviderAdapter, ResolvedVideoModel } from "./types";

function getVideoModelFromClient(client: unknown, modelId: string) {
  const c = client as any;
  if (typeof c.videoModel === "function") return c.videoModel(modelId);
  if (typeof c.video === "function") return c.video(modelId);
  throw new VideoGenerationError({ code: "unsupported", message: tMain("video.providerVideoModelUnsupported") });
}

function createVideoClient(resolved: ResolvedVideoModel) {
  if (resolved.provider.id === "dashscope") {
    return createAlibaba({
      apiKey: resolved.provider.apiKey || undefined,
      baseURL: resolved.provider.baseUrl || undefined,
      videoBaseURL: toDashscopeVideoApiRoot(resolved.provider.baseUrl),
      headers: Object.keys(resolved.provider.customHeaders || {}).length
        ? resolved.provider.customHeaders
        : undefined,
    });
  }

  if (resolved.provider.id === "doubao") {
    return createByteDance({
      apiKey: resolved.provider.apiKey || undefined,
      baseURL: resolved.provider.baseUrl || undefined,
      headers: Object.keys(resolved.provider.customHeaders || {}).length
        ? resolved.provider.customHeaders
        : undefined,
    });
  }

  if (resolved.provider.id === "xai") {
    return createXai({
      apiKey: resolved.provider.apiKey || undefined,
      baseURL: resolved.provider.baseUrl || undefined,
      headers: Object.keys(resolved.provider.customHeaders || {}).length
        ? resolved.provider.customHeaders
        : undefined,
    });
  }

  return createLlmProvider(resolved.provider);
}

function normalizeWarnings(input: any): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const warnings = input
    .map((item) => {
      if (!item) return "";
      if (typeof item === "string") return item;
      if (typeof item?.message === "string") return item.message;
      const feature = typeof item?.feature === "string" ? item.feature : "";
      const details = typeof item?.details === "string" ? item.details : "";
      return [feature, details].filter(Boolean).join(": ");
    })
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0);

  return warnings.length > 0 ? warnings : undefined;
}

function normalizeNumericOptions(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const values = input
    .map((item) => (typeof item === "number" && Number.isFinite(item) ? Math.floor(item) : NaN))
    .filter((item): item is number => Number.isFinite(item) && item > 0);
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function normalizeDuration(
  inputDuration: unknown,
  caps: { enabled?: boolean; options?: number[]; min?: number; max?: number } | undefined
): number | undefined {
  if (caps?.enabled === false) return undefined;
  if (typeof inputDuration !== "number" || !Number.isFinite(inputDuration)) return undefined;

  const duration = Math.floor(inputDuration);
  const options = normalizeNumericOptions(caps?.options);
  if (options.length > 0) {
    if (!options.includes(duration)) {
      throw new VideoGenerationError({
        code: "validation",
        message: tMain("video.durationInvalidOption", { options: options.join(", ") }),
      });
    }
    return duration;
  }

  const min = typeof caps?.min === "number" ? Math.floor(caps.min) : undefined;
  const max = typeof caps?.max === "number" ? Math.floor(caps.max) : undefined;
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

export const aiSdkVideoAdapter: VideoProviderAdapter = {
  id: "ai-sdk-video-default",
  canHandle: () => true,
  async run(ctx) {
    const { input, resolved, abortSignal } = ctx;
    const client = createVideoClient(resolved);
    const videoModel = getVideoModelFromClient(client, resolved.modelId);
    const caps = resolved.model.video;

    const supportsN = caps?.n?.enabled !== false;
    const countCap = supportsN ? Math.max(1, Math.min(caps?.n?.max ?? 1, 4)) : 1;
    const count = supportsN ? Math.max(1, Math.min(Number(input.params?.count || 1), countCap)) : 1;

    const aspectRatio = caps?.aspectRatio?.enabled === false ? undefined : (input.params?.aspectRatio || "").trim() || undefined;
    const resolution = caps?.resolution?.enabled === false ? undefined : (input.params?.resolution || "").trim() || undefined;
    const duration = normalizeDuration(input.params?.duration, caps?.duration);
    const fps = caps?.fps?.enabled === false
      ? undefined
      : (typeof input.params?.fps === "number" && Number.isFinite(input.params.fps) ? Math.max(1, Math.floor(input.params.fps)) : undefined);
    const seed = caps?.seed?.enabled ? normalizeSeed(input.params?.seed) : undefined;

    const referenceImageLimit = caps?.referenceImages?.enabled ? caps.referenceImages.max : undefined;
    const referenceImagesRaw = Array.isArray(input.params?.referenceImages)
      ? input.params.referenceImages
          .map((item) => item?.url)
          .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      : [];
    const referenceImages = Number.isFinite(referenceImageLimit) && (referenceImageLimit as number) > 0
      ? referenceImagesRaw.slice(0, Math.max(1, Number(referenceImageLimit)))
      : referenceImagesRaw;
    const isDashscopeR2v = resolved.providerId === "dashscope" && /-r2v/i.test(resolved.modelId);
    const isByteDanceLiteI2v = resolved.providerId === "doubao" && /seedance-1-0-lite-i2v/i.test(resolved.modelId);

    let mergedProviderOptions = mergeProviderOptions({
      providerId: resolved.providerId,
      provider: resolved.provider,
      model: resolved.model,
      requestOptions: input.params?.providerOptions,
      negativePrompt: input.params?.negativePrompt,
      negativePromptProviderKey: caps?.negativePrompt?.providerKey,
    });
    if (isDashscopeR2v && referenceImages.length > 0) {
      const scope = resolveProviderOptionScope(resolved.providerId);
      const scoped = (mergedProviderOptions?.[scope] && typeof mergedProviderOptions[scope] === "object")
        ? { ...(mergedProviderOptions[scope] as Record<string, unknown>) }
        : {};
      scoped.referenceUrls = referenceImages;
      mergedProviderOptions = { ...(mergedProviderOptions || {}), [scope]: scoped };
    }
    if (isByteDanceLiteI2v && referenceImages.length > 1) {
      const scope = resolveProviderOptionScope(resolved.providerId);
      const scoped = (mergedProviderOptions?.[scope] && typeof mergedProviderOptions[scope] === "object")
        ? { ...(mergedProviderOptions[scope] as Record<string, unknown>) }
        : {};
      scoped.referenceImages = referenceImages;
      mergedProviderOptions = { ...(mergedProviderOptions || {}), [scope]: scoped };
    }

    const shouldUsePromptImage = referenceImages.length > 0
      && !isDashscopeR2v
      && !(isByteDanceLiteI2v && referenceImages.length > 1);

    const request = {
      model: videoModel,
      prompt: shouldUsePromptImage
        ? ({ image: referenceImages[0], text: input.prompt } as const)
        : input.prompt,
      ...(supportsN ? { n: count, maxVideosPerCall: count } : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(resolution ? { resolution } : {}),
      ...(duration !== undefined ? { duration } : {}),
      ...(fps !== undefined ? { fps } : {}),
      ...(seed !== undefined ? { seed } : {}),
      ...(mergedProviderOptions ? { providerOptions: mergedProviderOptions } : {}),
      maxRetries: 0,
      abortSignal,
    } as any;

    const result = await generateVideo(request).catch((error: unknown) => {
      throw toVideoGenerationError(error);
    });

    const files = Array.isArray((result as any)?.videos)
      ? (result as any).videos
      : ((result as any)?.video ? [(result as any).video] : []);

    const assets = files
      .map((file: any) => {
        if (!file) return null;
        const mediaType = typeof file.mediaType === "string" && file.mediaType.trim().length > 0
          ? file.mediaType
          : "video/mp4";
        if (typeof file.base64 === "string" && file.base64.trim().length > 0) {
          return { src: `data:${mediaType};base64,${file.base64}`, mediaType };
        }
        if (file.uint8Array instanceof Uint8Array) {
          return { src: toDataUrl(mediaType, file.uint8Array), mediaType };
        }
        return null;
      })
      .filter((item: { src: string; mediaType?: string } | null): item is { src: string; mediaType?: string } => !!item && !!item.src);

    if (assets.length === 0) {
      throw new VideoGenerationError({ code: "empty_result", message: tMain("video.noUsableVideo") });
    }

    return {
      assets,
      warnings: normalizeWarnings((result as any)?.warnings),
    };
  },
};
