import http, { formatHttpError } from "../http";
import { getProviderApiKey, listProviders } from "./providerData";
import { tMain } from "../../i18n";

/**
 * 测试 OpenAI-Compatible Provider 的连通性
 * 通过发送一个最小的 chat/completions 请求来验证配置是否有效
 * 这比测试 /models 端点更可靠，因为不是所有服务都实现了 /models
 */
export async function testOpenAICompatibleProvider(input: { providerId: string; baseUrl: string }) {
  const apiKey = getProviderApiKey(input.providerId);
  if (!apiKey) return { ok: false as const, error: tMain("provider.apiKeyMissing", { providerId: input.providerId }) };

  // 获取供应商的第一个启用的模型用于测试
  const providers = listProviders();
  const provider = providers.find(p => p.id === input.providerId);
  const enabledModel = provider?.models[0];
  
  if (!enabledModel) {
    return { ok: false as const, error: tMain("provider.noModels") };
  }

  try {
    const url = `${input.baseUrl}/chat/completions`;
    const response = await http.post(url, {
      model: enabledModel.id,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1, // 最小 token 数，减少消耗
      stream: false
    }, {
      timeout: 15000, // 15秒超时（比 models 接口稍长，因为需要处理）
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    // 只要请求成功（即使返回错误模型不存在，说明连接和认证是通的）
    // 如果返回 401/403 会在 catch 中捕获
    return { ok: true as const };
  } catch (error: any) {
    // 如果是 404/400/409，说明连接与鉴权成功（模型或参数状态问题不影响连通性判断）
    if (error?.response?.status === 404 || error?.response?.status === 400 || error?.response?.status === 409) {
      return { ok: true as const };
    }
    
    return { 
      ok: false as const, 
      error: formatHttpError(error)
    };
  }
}
