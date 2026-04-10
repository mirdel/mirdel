import type { ProviderPublic } from "@shared";

export type ComposerImageRef = {
  id?: string;
  name?: string;
  url: string;
};

export type RunImageTaskType = "generate" | "edit";

export type RunImageGenerationParams = {
  taskType?: RunImageTaskType;
  count?: number;
  size?: string;
  aspectRatio?: string;
  quality?: string;
  seed?: number;
  negativePrompt?: string;
  promptExtend?: boolean;
  watermark?: boolean;
  editFunction?: string;
  referenceImages?: ComposerImageRef[];
  maskImage?: ComposerImageRef;
  maxRetries?: number;
  providerOptions?: Record<string, unknown>;
};

export type RunImageGenerationInput = {
  workspaceId: string;
  generationId: string;
  selectedModel: string; // providerId::modelId
  prompt: string;
  params?: RunImageGenerationParams;
};

export type ResolvedImageModel = {
  providerId: string;
  modelId: string;
  provider: ProviderPublic;
  model: ProviderPublic["models"][number];
};

export type ImageGenerationAsset = {
  src: string;
  mediaType?: string;
};

export type ImageAdapterResult = {
  assets: ImageGenerationAsset[];
  warnings?: string[];
};

export type ImageAdapterRunContext = {
  input: RunImageGenerationInput;
  resolved: ResolvedImageModel;
  abortSignal: AbortSignal;
};

export type ImageProviderAdapter = {
  id: string;
  canHandle: (resolved: ResolvedImageModel) => boolean;
  run: (ctx: ImageAdapterRunContext) => Promise<ImageAdapterResult>;
};
