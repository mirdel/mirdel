import type { DefaultModelRef, ProviderPublic } from "@shared";
import { tMain } from "../../i18n";
import { createLlmProvider } from "./llmProviderFactory";
import { getProviderApiKey, listProviders } from "./providerData";

type LlmProviderClient = ReturnType<typeof createLlmProvider>;

export type ResolvedProviderInvocation = {
  providerId: string;
  provider: ProviderPublic;
  client: LlmProviderClient;
};

export type ResolvedModelInvocation = {
  providerId: string;
  modelId: string;
  provider: ProviderPublic;
  client: LlmProviderClient;
};

type ModelRefSeparator = "::" | "/";

function splitModelRef(modelRef: string, separator: ModelRefSeparator): { providerId: string; modelId: string } | null {
  const raw = String(modelRef || "").trim();
  if (!raw) return null;
  const idx = raw.indexOf(separator);
  if (idx <= 0 || idx >= raw.length - separator.length) return null;
  const providerId = raw.slice(0, idx).trim();
  const modelId = raw.slice(idx + separator.length).trim();
  if (!providerId || !modelId) return null;
  return { providerId, modelId };
}

export function resolveProviderInvocation(
  providerId: string,
  options?: { requireApiKey?: boolean }
): ResolvedProviderInvocation {
  const providers = listProviders();
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) {
    throw new Error(tMain("provider.notFound", { providerId }));
  }

  if (provider.type === "openai-compatible" && !provider.baseUrl?.trim()) {
    throw new Error(tMain("provider.baseUrlMissing"));
  }

  const requireApiKey = options?.requireApiKey ?? true;
  const apiKey = requireApiKey ? getProviderApiKey(providerId) : null;
  if (requireApiKey && !apiKey) {
    throw new Error(tMain("provider.apiKeyMissing", { providerId }));
  }

  const providerWithAuth = apiKey ? { ...provider, apiKey } : provider;
  const client = createLlmProvider(providerWithAuth);

  return {
    providerId,
    provider: providerWithAuth,
    client,
  };
}

export function resolveModelInvocation(input: {
  providerId: string;
  modelId: string;
  requireApiKey?: boolean;
}): ResolvedModelInvocation;
export function resolveModelInvocation(input: {
  modelRef: string;
  separator?: ModelRefSeparator;
  defaultModel?: DefaultModelRef;
  requireApiKey?: boolean;
  invalidModelErrorKey?: string;
  invalidModelErrorParams?: Record<string, unknown>;
}): ResolvedModelInvocation;
export function resolveModelInvocation(
  input:
    | {
        providerId: string;
        modelId: string;
        requireApiKey?: boolean;
      }
    | {
        modelRef: string;
        separator?: ModelRefSeparator;
        defaultModel?: DefaultModelRef;
        requireApiKey?: boolean;
        invalidModelErrorKey?: string;
        invalidModelErrorParams?: Record<string, unknown>;
      }
): ResolvedModelInvocation {
  let providerId: string;
  let modelId: string;
  let requireApiKey: boolean | undefined;

  if ("providerId" in input) {
    providerId = input.providerId;
    modelId = input.modelId;
    requireApiKey = input.requireApiKey;
  } else {
    requireApiKey = input.requireApiKey;
    const rawModelRef = String(input.modelRef || "").trim();
    if (!rawModelRef || rawModelRef === "__default__") {
      if (!input.defaultModel?.providerId || !input.defaultModel?.modelId) {
        const key = input.invalidModelErrorKey ?? "embedding.invalidModelFormat";
        throw new Error(tMain(key as any, input.invalidModelErrorParams as any));
      }
      providerId = input.defaultModel.providerId;
      modelId = input.defaultModel.modelId;
    } else {
      const parsed = splitModelRef(rawModelRef, input.separator ?? "::");
      if (!parsed) {
        const key = input.invalidModelErrorKey ?? "embedding.invalidModelFormat";
        throw new Error(tMain(key as any, input.invalidModelErrorParams as any));
      }
      providerId = parsed.providerId;
      modelId = parsed.modelId;
    }
  }

  const { provider, client } = resolveProviderInvocation(providerId, {
    requireApiKey: requireApiKey ?? true,
  });

  return {
    providerId,
    modelId,
    provider,
    client,
  };
}
