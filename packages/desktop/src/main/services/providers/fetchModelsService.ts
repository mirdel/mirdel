/**
 * 从各 Provider 的 /models 接口拉取模型列表
 * 支持：openai-compatible、anthropic、google-generative-ai
 */

import http, { formatHttpError } from "../http";
import { getProviderApiKey, listProviders } from "./providerData";
import { inferModelTypeFromId, loggerServiceMain } from "@shared";
import { tMain } from "../../i18n";

const logger = loggerServiceMain.withContext("fetchModels");

export type FetchedModel = {
  id: string;
  modelType: "generative" | "embedding" | "rerank";
  inputModalities?: Array<"text" | "image" | "audio" | "video" | "file" | "mask">;
  outputModalities?: Array<"text" | "image" | "audio" | "video" | "file" | "mask">;
};

/** OpenAI 兼容：GET {baseUrl}/models，apiKey 可选（部分服务如自托管允许无认证拉取） */
async function fetchOpenAICompatible(
  baseUrl: string,
  apiKey: string | null
): Promise<FetchedModel[]> {
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await http.get(url, {
    headers: Object.keys(headers).length ? headers : undefined,
    timeout: 15000,
  });
  const data = res.data as {
    data?: Array<{
      id?: string;
      modelType?: "generative" | "embedding" | "rerank";
      inputModalities?: Array<"text" | "image" | "audio" | "video" | "file" | "mask">;
      outputModalities?: Array<"text" | "image" | "audio" | "video" | "file" | "mask">;
    }>;
  };
  const list = data?.data ?? [];
  return list
    .map((m) => {
      const id = String(m.id || "").trim();
      if (!id) return null;
      return {
        id,
        modelType: m.modelType ?? inferModelTypeFromId(id),
        inputModalities: Array.isArray(m.inputModalities) ? m.inputModalities : undefined,
        outputModalities: Array.isArray(m.outputModalities) ? m.outputModalities : undefined,
      } as FetchedModel;
    })
    .filter((item): item is FetchedModel => Boolean(item));
}

/** Anthropic：GET https://api.anthropic.com/v1/models，支持分页 */
async function fetchAnthropic(apiKey: string): Promise<FetchedModel[]> {
  const all: FetchedModel[] = [];
  let afterId: string | undefined;
  do {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (afterId) params.set("after_id", afterId);
    const url = `https://api.anthropic.com/v1/models?${params}`;
    const res = await http.get(url, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      timeout: 15000,
    });
    const data = res.data as { data?: Array<{ id: string }> };
    const list = data?.data ?? [];
    for (const m of list) {
      all.push({ id: m.id, modelType: inferModelTypeFromId(m.id) });
    }
    afterId = list.length >= 100 ? list[list.length - 1]?.id : undefined;
  } while (afterId);
  return all;
}

/** Google Gemini：GET https://generativelanguage.googleapis.com/v1beta/models?key=... */
async function fetchGoogle(apiKey: string): Promise<FetchedModel[]> {
  const all: FetchedModel[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams();
    params.set("key", apiKey);
    params.set("pageSize", "100");
    if (pageToken) params.set("pageToken", pageToken);
    const url = `https://generativelanguage.googleapis.com/v1beta/models?${params}`;
    const res = await http.get(url, { timeout: 15000 });
    const data = res.data as {
      models?: Array<{ name?: string }>;
      nextPageToken?: string;
    };
    const list = data?.models ?? [];
    for (const m of list) {
      const id = m.name?.replace("models/", "") ?? "";
      if (id) {
        all.push({ id, modelType: inferModelTypeFromId(id) });
      }
    }
    pageToken = data?.nextPageToken;
  } while (pageToken);
  return all;
}

export async function fetchProviderModels(
  providerId: string
): Promise<{ ok: true; models: FetchedModel[] } | { ok: false; error: string }> {
  const providers = listProviders();
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) return { ok: false, error: tMain("provider.notFoundGeneric") };

  const apiKey = getProviderApiKey(providerId);
  const baseUrl = provider.baseUrl ?? "";

  try {
    let models: FetchedModel[];
    switch (provider.type) {
      case "openai-compatible": {
        if (!baseUrl.trim()) return { ok: false, error: tMain("provider.baseUrlMissing") };
        models = await fetchOpenAICompatible(baseUrl, apiKey);
        break;
      }
      case "anthropic":
        if (!apiKey) return { ok: false, error: tMain("provider.apiKeyMissing", { providerId }) };
        models = await fetchAnthropic(apiKey);
        break;
      case "google-generative-ai":
        if (!apiKey) return { ok: false, error: tMain("provider.apiKeyMissing", { providerId }) };
        models = await fetchGoogle(apiKey);
        break;
      default:
        return { ok: false, error: tMain("provider.unsupportedType", { providerType: provider.type }) };
    }
    logger.info("fetched models", { providerId, count: models.length });
    return { ok: true, models };
  } catch (err: any) {
    const msg = formatHttpError(err);
    logger.error("fetch models failed", { providerId, error: msg });
    return { ok: false, error: msg };
  }
}
