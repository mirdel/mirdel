/**
 * 根据 Provider 配置创建对应的 AI SDK Provider 实例
 * 支持 openai-compatible、anthropic、google-generative-ai
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { wrapLanguageModel } from "ai";
import { createRequire } from "node:module";
import { type ProviderPublic } from "@shared";
import { tMain } from "../../i18n";
import { getAiDevToolsEnabled } from "../settings/settingsData";
import { proxyAwareFetch } from "../network/proxyRuntime";

export const NATIVE_WEB_SEARCH_TOOLS_BODY_KEY = "__nativeWebSearchTools";

export type LlmProvider =
  | ReturnType<typeof createOpenAICompatible>
  | ReturnType<typeof createAnthropic>
  | ReturnType<typeof createGoogleGenerativeAI>;

function transformOpenAICompatibleRequestBody(args: Record<string, any>): Record<string, any> {
  const nextArgs: Record<string, any> = { ...args };
  const rawNativeTools = args[NATIVE_WEB_SEARCH_TOOLS_BODY_KEY];
  if (Array.isArray(rawNativeTools)) {
    const nativeTools = rawNativeTools.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item)
    );
    delete nextArgs[NATIVE_WEB_SEARCH_TOOLS_BODY_KEY];
    if (nativeTools.length > 0) {
      const existingTools = Array.isArray(nextArgs.tools) ? nextArgs.tools : [];
      nextArgs.tools = [...nativeTools, ...existingTools];
    }
  }

  return nextArgs;
}

/**
 * 根据 Provider 配置创建 LLM Provider 实例
 * 用于 streamText、generateText、embed 等调用
 */
export function createLlmProvider(provider: ProviderPublic): LlmProvider {
  const { type, baseUrl, id } = provider;
  const apiKey = provider.apiKey || undefined;
  const headers = provider.customHeaders || {};
  let baseProvider: LlmProvider;

  switch (type) {
    case "openai-compatible": {
      baseProvider = createOpenAICompatible({
        name: id,
        apiKey,
        baseURL: baseUrl,
        headers: Object.keys(headers).length ? headers : undefined,
        fetch: proxyAwareFetch as any,
        includeUsage: true,
        transformRequestBody: transformOpenAICompatibleRequestBody,
      } as any);
      break;
    }
    case "anthropic": {
      baseProvider = createAnthropic({
        apiKey,
        baseURL: baseUrl || undefined,
        headers: Object.keys(headers).length ? headers : undefined,
        fetch: proxyAwareFetch as any,
      } as any);
      break;
    }
    case "google-generative-ai": {
      baseProvider = createGoogleGenerativeAI({
        apiKey,
        baseURL: baseUrl || undefined,
        headers: Object.keys(headers).length ? headers : undefined,
        fetch: proxyAwareFetch as any,
      } as any);
      break;
    }
    default: {
      throw new Error(tMain("provider.unsupportedType", { providerType: type }));
    }
  }

  return withDevToolsIfEnabled(baseProvider);
}

function resolveDevToolsMiddleware(): any {
  const require = createRequire(import.meta.url);
  let middlewareAny: any;
  try {
    const mod = require("@ai-sdk/devtools");
    middlewareAny = mod?.devToolsMiddleware;
  } catch {
    return null;
  }
  if (!middlewareAny) return null;
  if (typeof middlewareAny === "function") {
    try {
      return middlewareAny();
    } catch {
      return middlewareAny;
    }
  }
  return middlewareAny;
}

function withDevToolsIfEnabled<T extends LlmProvider>(provider: T): T {
  if (!getAiDevToolsEnabled()) return provider;
  const middleware = resolveDevToolsMiddleware();
  if (!middleware) return provider;
  const wrappedBase = ((modelId: string) =>
    wrapLanguageModel({
      model: (provider as any)(modelId),
      middleware,
    })) as any;
  // 保留 provider 上的 imageModel / embeddingModel 等能力
  Object.assign(wrappedBase, provider);
  return wrappedBase as T;
}

/**
 * 获取 Embedding 模型（兼容不同 provider 的接口）
 * openai-compatible: textEmbeddingModel, google: embedding, 部分: embeddingModel
 */
export function getEmbeddingModel(provider: LlmProvider, modelId: string): any {
  const p = provider as any;
  if (typeof p.textEmbeddingModel === "function") {
    return p.textEmbeddingModel(modelId);
  }
  if (typeof p.embeddingModel === "function") {
    return p.embeddingModel(modelId);
  }
  if (typeof p.embedding === "function") {
    return p.embedding(modelId);
  }
  throw new Error(tMain("embedding.providerUnsupported"));
}
