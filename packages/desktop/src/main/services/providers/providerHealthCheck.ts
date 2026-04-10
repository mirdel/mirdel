/**
 * 统一测试各类型 Provider 的连通性
 * 支持 openai-compatible、anthropic、google-generative-ai
 */
import { generateText } from "ai";
import { getProviderApiKey, listProviders } from "./providerData";
import { createLlmProvider } from "./llmProviderFactory";
import { testOpenAICompatibleProvider } from "./openaiCompatibleHealthCheck";
import { tMain } from "../../i18n";

/** 获取可用于 generateText 的 chat 模型（排除 embedding） */
function getFirstChatModel(provider: { models?: Array<{ id: string; modelType?: string }> }) {
  const models = provider?.models ?? [];
  const chatModel = models.find((m) => (m.modelType ?? "generative") === "generative");
  return chatModel;
}

export async function testProvider(providerId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const providers = listProviders();
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) return { ok: false, error: tMain("provider.notFoundGeneric") };

  if (provider.type === "openai-compatible" && !provider.baseUrl?.trim()) {
    return { ok: false, error: tMain("provider.baseUrlMissing") };
  }

  const apiKey = getProviderApiKey(providerId);
  if (!apiKey) return { ok: false, error: tMain("provider.apiKeyMissing", { providerId }) };

  const chatModel = getFirstChatModel(provider);
  if (!chatModel) return { ok: false, error: tMain("provider.noModels") };

  switch (provider.type) {
    case "openai-compatible": {
      return testOpenAICompatibleProvider({
        providerId,
        baseUrl: provider.baseUrl,
      });
    }
    case "anthropic":
    case "google-generative-ai": {
      try {
        const client = createLlmProvider(provider);
        await generateText({
          model: client(chatModel.id),
          prompt: "hi",
          maxOutputTokens: 1,
        });
        return { ok: true };
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        return { ok: false, error: msg };
      }
    }
    default:
      return { ok: false, error: tMain("provider.unsupportedType", { providerType: provider.type }) };
  }
}
