import { generateImage } from "ai";
import { createXai } from "@ai-sdk/xai";
import { resolveImageTaskCapabilities } from "@shared";
import { createLlmProvider } from "../../providers/llmProviderFactory";
import { tMain } from "../../../i18n";
import { ImageGenerationError, toImageGenerationError } from "./errors";
import { mergeProviderOptions, normalizeImageResults, normalizeSeed } from "./utils";
import type { ImageProviderAdapter, ResolvedImageModel } from "./types";

const IMAGE_COUNT_SOFT_MAX = 20;

function getImageModelFromClient(client: unknown, modelId: string) {
  const c = client as any;
  if (typeof c.imageModel === "function") return c.imageModel(modelId);
  if (typeof c.image === "function") return c.image(modelId);
  throw new ImageGenerationError({ code: "unsupported", message: tMain("image.providerImageModelUnsupported") });
}

function createImageClient(resolved: ResolvedImageModel) {
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

export const aiSdkImageAdapter: ImageProviderAdapter = {
  id: "ai-sdk-default",
  canHandle: () => true,
  async run(ctx) {
    const { input, resolved, abortSignal } = ctx;
    const client = createImageClient(resolved);
    const imageModel = getImageModelFromClient(client, resolved.modelId);
    const taskType = input.params?.taskType === "edit" ? "edit" : "generate";
    const taskCaps = resolveImageTaskCapabilities(resolved.model.image, taskType);

    const supportsN = taskCaps?.n?.enabled !== false;
    const countCap = supportsN ? Math.max(1, Math.min(taskCaps?.n?.max ?? IMAGE_COUNT_SOFT_MAX, IMAGE_COUNT_SOFT_MAX)) : 1;
    const count = supportsN ? Math.max(1, Math.min(Number(input.params?.count || 1), countCap)) : 1;
    const quality = taskCaps?.quality?.enabled ? (input.params?.quality || "").trim() || undefined : undefined;
    const supportsSeed = taskCaps?.seed?.enabled === true;
    const seed = supportsSeed ? normalizeSeed(input.params?.seed) : undefined;
    const referenceImageCap = taskCaps?.referenceImages;
    const referenceImageLimit = referenceImageCap?.enabled ? referenceImageCap.max : undefined;
    const rawReferenceImages = Array.isArray(input.params?.referenceImages)
      ? input.params.referenceImages
          .map((item) => item?.url)
          .filter((url): url is string => typeof url === "string" && url.length > 0)
      : [];
    const referenceImages = Number.isFinite(referenceImageLimit) && (referenceImageLimit as number) > 0
      ? rawReferenceImages.slice(0, Math.max(1, Number(referenceImageLimit)))
      : rawReferenceImages;
    const maskImage = typeof input.params?.maskImage?.url === "string" && input.params.maskImage.url.length > 0
      ? input.params.maskImage.url
      : undefined;

    if (taskType === "edit" && referenceImages.length === 0) {
      throw new ImageGenerationError({ code: "validation", message: tMain("image.editInputRequired") });
    }

    const prompt = referenceImages.length > 0 || maskImage
      ? {
          text: input.prompt,
          ...(referenceImages.length > 0 ? { images: referenceImages } : {}),
          ...(maskImage ? { mask: maskImage } : {}),
        }
      : input.prompt;

    const baseProviderOptions = mergeProviderOptions({
      providerId: resolved.providerId,
      provider: resolved.provider,
      model: resolved.model,
      requestOptions: input.params?.providerOptions,
      quality,
      qualityProviderKey: taskCaps?.quality?.providerKey,
      negativePrompt: input.params?.negativePrompt,
      negativePromptProviderKey: taskCaps?.negativePrompt?.providerKey,
      promptExtend: input.params?.promptExtend,
      promptExtendProviderKey: taskCaps?.promptExtend?.providerKey,
      watermark: input.params?.watermark,
      watermarkProviderKey: taskCaps?.watermark?.providerKey,
    });

    const sizeMode = taskCaps?.sizeMode || "both";
    const pickedSize = sizeMode === "aspectRatio" ? undefined : input.params?.size;
    const pickedAspectRatio = sizeMode === "size" ? undefined : input.params?.aspectRatio;
    const isOpenAICompatible = resolved.provider.type === "openai-compatible" && resolved.provider.id !== "xai";
    const openAICompatibleExtras: Record<string, unknown> = {};
    if (isOpenAICompatible) {
      if (typeof pickedAspectRatio === "string" && pickedAspectRatio.trim().length > 0) {
        openAICompatibleExtras.aspect_ratio = pickedAspectRatio.trim();
      }
      if (seed !== undefined) {
        openAICompatibleExtras.seed = seed;
      }
    }
    const providerOptions = (() => {
      if (!isOpenAICompatible || Object.keys(openAICompatibleExtras).length === 0) return baseProviderOptions;
      const scopedBase = (baseProviderOptions?.[resolved.providerId] as Record<string, unknown> | undefined) || {};
      return {
        ...(baseProviderOptions || {}),
        [resolved.providerId]: {
          ...scopedBase,
          ...openAICompatibleExtras,
        },
      };
    })();
    const requestAspectRatio = isOpenAICompatible ? undefined : pickedAspectRatio;
    const requestSeed = isOpenAICompatible ? undefined : seed;

    const request = {
      model: imageModel,
      prompt: prompt as any,
      ...(supportsN ? { n: count, maxImagesPerCall: count } : {}),
      ...(pickedSize ? { size: pickedSize } : {}),
      ...(requestAspectRatio ? { aspectRatio: requestAspectRatio } : {}),
      ...(requestSeed !== undefined ? { seed: requestSeed } : {}),
      ...(providerOptions ? { providerOptions } : {}),
      maxRetries: 0,
      abortSignal,
    } as any;

    const result = await generateImage(request).catch((error: unknown) => {
      throw toImageGenerationError(error);
    });

    const assets = normalizeImageResults(result);
    if (assets.length === 0) {
      throw new ImageGenerationError({ code: "empty_result", message: tMain("image.noUsableImage") });
    }

    return {
      assets,
      warnings: Array.isArray((result as any)?.warnings) ? (result as any).warnings : undefined,
    };
  },
};
