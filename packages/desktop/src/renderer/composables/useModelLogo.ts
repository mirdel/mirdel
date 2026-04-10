import { MODEL_LOGO_CONFIG } from "@/config/model-logo-config";

const patternCache = new Map<string, RegExp>();
const modelLogoCache = new Map<string, string | null>();

function getRegex(pattern: string): RegExp {
  let re = patternCache.get(pattern);
  if (!re) {
    re = new RegExp(pattern, "i");
    patternCache.set(pattern, re);
  }
  return re;
}

/**
 * 根据模型 ID 获取对应的 logo 标识
 * 按配置顺序匹配，命中即返回；未命中返回 undefined
 */
export function getModelLogo(modelId: string): string | undefined {
  const key = modelId?.trim().toLowerCase();
  if (!key) return undefined;

  const cached = modelLogoCache.get(key);
  if (cached !== undefined) {
    return cached ?? undefined;
  }

  for (const { pattern, logo } of MODEL_LOGO_CONFIG) {
    if (getRegex(pattern).test(key)) {
      modelLogoCache.set(key, logo);
      return logo;
    }
  }
  modelLogoCache.set(key, null);
  return undefined;
}
