import { getEmbeddingModel } from "./llmProviderFactory";
import { resolveModelInvocation } from "./modelInvocation";
import {
  resolveModelReference,
  type ModelReferenceFailurePolicy,
} from "./modelReference";
import { LOCAL_PROVIDER_ID } from "./localModelConstants";
import { localModelRuntimeService } from "../model-server";

export type ResolvedEmbeddingInvocation = {
  providerId: string;
  modelId: string;
  modelKey: string;
  client: ReturnType<typeof resolveModelInvocation>["client"];
  model: ReturnType<typeof getEmbeddingModel>;
  providerOptions: Record<string, { dimensions: number }> | undefined;
};

export async function resolveEmbeddingInvocation(input: {
  modelRef: string | null | undefined;
  dimension: number | null;
  failurePolicy?: ModelReferenceFailurePolicy;
  emptyModelErrorKey?: string;
}): Promise<ResolvedEmbeddingInvocation | null> {
  const resolved = resolveModelReference({
    modelRef: input.modelRef,
    defaultType: "embedding",
    failurePolicy: input.failurePolicy,
    emptyModelErrorKey: input.emptyModelErrorKey,
    defaultModelMissingErrorKey: "embedding.defaultModelMissing",
    invalidModelErrorKey: "embedding.invalidModelFormat",
  });
  if (!resolved) return null;

  if (resolved.providerId === LOCAL_PROVIDER_ID) {
    try {
      await localModelRuntimeService.ensureModelReady(resolved.modelId);
    } catch (error) {
      if (input.failurePolicy === "background") return null;
      throw error;
    }
  }

  const providerOptions = input.dimension !== null
    ? { [resolved.providerId]: { dimensions: input.dimension } }
    : undefined;

  return {
    providerId: resolved.providerId,
    modelId: resolved.modelId,
    modelKey: `${resolved.providerId}::${resolved.modelId}`,
    client: resolved.client,
    model: getEmbeddingModel(resolved.client, resolved.modelId),
    providerOptions,
  };
}
