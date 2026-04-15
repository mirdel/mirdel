import type { DefaultModelRef } from "@shared";
import { tMain } from "../../i18n";
import { getDefaultModelByType, type DefaultModelType } from "../settings/settingsData";
import { resolveModelInvocation, type ResolvedModelInvocation } from "./modelInvocation";

export type ModelReferenceFailurePolicy = "foreground" | "background";

type ModelRefSeparator = "::" | "/";

export type ResolveModelReferenceOptions = {
  modelRef: string | null | undefined;
  separator?: ModelRefSeparator;
  defaultType?: DefaultModelType;
  defaultModel?: DefaultModelRef;
  requireApiKey?: boolean;
  failurePolicy?: ModelReferenceFailurePolicy;
  emptyModelErrorKey?: string;
  defaultModelMissingErrorKey?: string;
  invalidModelErrorKey?: string;
  invalidModelErrorParams?: Record<string, unknown>;
};

function makeError(key: string, params?: Record<string, unknown>): Error {
  return new Error(tMain(key as any, params as any));
}

function resolveDefaultModel(options: ResolveModelReferenceOptions): DefaultModelRef {
  if (options.defaultModel?.providerId && options.defaultModel?.modelId) {
    return options.defaultModel;
  }

  if (!options.defaultType) return null;
  const defaultModel = getDefaultModelByType(options.defaultType);
  if (!defaultModel?.providerId || !defaultModel?.modelId) return null;
  return defaultModel;
}

export function resolveModelReference(
  options: ResolveModelReferenceOptions
): ResolvedModelInvocation | null {
  try {
    const rawModelRef = String(options.modelRef || "").trim();
    if (!rawModelRef) {
      throw makeError(options.emptyModelErrorKey ?? options.invalidModelErrorKey ?? "embedding.invalidModelFormat");
    }

    const defaultModel = rawModelRef === "__default__"
      ? resolveDefaultModel(options)
      : undefined;
    if (rawModelRef === "__default__" && !defaultModel) {
      throw makeError(options.defaultModelMissingErrorKey ?? options.invalidModelErrorKey ?? "embedding.invalidModelFormat");
    }

    return resolveModelInvocation({
      modelRef: rawModelRef,
      separator: options.separator ?? "::",
      defaultModel,
      requireApiKey: options.requireApiKey,
      invalidModelErrorKey: options.invalidModelErrorKey,
      invalidModelErrorParams: options.invalidModelErrorParams,
    });
  } catch (error) {
    if (options.failurePolicy === "background") return null;
    throw error;
  }
}
