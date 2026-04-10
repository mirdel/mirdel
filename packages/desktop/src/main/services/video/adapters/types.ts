import type { ProviderPublic } from "@shared";

export type ComposerImageRef = {
  id?: string;
  name?: string;
  url: string;
};

export type RunVideoGenerationParams = {
  count?: number;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  fps?: number;
  seed?: number;
  negativePrompt?: string;
  referenceImages?: ComposerImageRef[];
  maxRetries?: number;
  providerOptions?: Record<string, unknown>;
};

export type RunVideoGenerationInput = {
  workspaceId: string;
  generationId: string;
  selectedModel: string; // providerId::modelId
  prompt: string;
  params?: RunVideoGenerationParams;
};

export type ResolvedVideoModel = {
  providerId: string;
  modelId: string;
  provider: ProviderPublic;
  model: ProviderPublic["models"][number];
};

export type VideoGenerationAsset = {
  src: string;
  mediaType?: string;
};

export type VideoAdapterResult = {
  assets: VideoGenerationAsset[];
  warnings?: string[];
};

export type VideoAdapterRunContext = {
  input: RunVideoGenerationInput;
  resolved: ResolvedVideoModel;
  abortSignal: AbortSignal;
};

export type VideoProviderAdapter = {
  id: string;
  canHandle: (resolved: ResolvedVideoModel) => boolean;
  run: (ctx: VideoAdapterRunContext) => Promise<VideoAdapterResult>;
};
