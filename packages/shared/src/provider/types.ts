export type ProviderType = "openai-compatible" | "anthropic" | "google-generative-ai";
export type ConfigText =
  | string
  | {
      default: string;
      zhCn?: string;
    };

export type ModelModality = "text" | "image" | "audio" | "video" | "file" | "mask";
export type ModelType = "generative" | "embedding" | "rerank";
export type ImageTaskType = "text_to_image" | "image_to_image" | "image_edit" | "inpaint";

export type ImageCapabilityToggle = {
  enabled: boolean;
  providerKey?: string;
  default?: boolean;
};

export type ImageCapabilityOptions<T> = {
  enabled: boolean;
  options?: T[];
  default?: T;
  providerKey?: string;
};

export type ImageCapabilityRange = {
  enabled: boolean;
  min?: number;
  max?: number;
  default?: number;
};

export type ImageTaskCapabilities = {
  sizeMode?: "size" | "aspectRatio" | "both";
  aspectRatio?: ImageCapabilityOptions<string>;
  size?: ImageCapabilityOptions<string>;
  quality?: ImageCapabilityOptions<string>;
  allowCustomSize?: boolean;
  customSizeHint?: ConfigText;
  n?: ImageCapabilityRange;
  seed?: ImageCapabilityRange;
  negativePrompt?: ImageCapabilityToggle;
  promptExtend?: ImageCapabilityToggle;
  watermark?: ImageCapabilityToggle;
  referenceImages?: ImageCapabilityRange;
  mask?: ImageCapabilityToggle;
};

export type ImageCapabilities = {
  common?: Record<string, unknown>;
  generate?: ImageTaskCapabilities;
  edit?: ImageTaskCapabilities;
} & Partial<ImageTaskCapabilities>;

export type VideoCapabilityOptions<T> = {
  enabled: boolean;
  options?: T[];
  default?: T;
  providerKey?: string;
};

export type VideoCapabilityToggle = {
  enabled: boolean;
  default?: boolean;
  providerKey?: string;
};

export type VideoCapabilityRange = {
  enabled: boolean;
  options?: number[];
  min?: number;
  max?: number;
  default?: number;
};

export type VideoCapabilities = {
  aspectRatio?: VideoCapabilityOptions<string>;
  resolution?: VideoCapabilityOptions<string>;
  duration?: VideoCapabilityRange;
  fps?: VideoCapabilityRange;
  n?: VideoCapabilityRange;
  seed?: VideoCapabilityRange;
  negativePrompt?: VideoCapabilityToggle;
  referenceImages?: VideoCapabilityRange;
  allowCustomResolution?: boolean;
  customResolutionHint?: ConfigText;
};

export function resolveImageTaskCapabilities(
  image: ImageCapabilities | undefined,
  task: "generate" | "edit"
): ImageTaskCapabilities | undefined {
  if (!image) return undefined;
  const scoped = task === "edit" ? image.edit : image.generate;
  if (scoped || image.common) {
    return {
      ...((image.common as ImageTaskCapabilities | undefined) || {}),
      ...(scoped || {}),
    };
  }
  return undefined;
}

export type ProviderOptionFieldSchema = {
  key: string;
  label?: string;
  type: "boolean" | "number" | "string" | "select" | "json";
  required?: boolean;
  default?: unknown;
  description?: string;
  options?: Array<{ label: string; value: string | number | boolean }>;
  ui?: {
    component?: "switch" | "input" | "select" | "textarea";
  };
};

export type ThinkingModeOption = "on" | "off" | "standard" | "deep" | "ultra";
export type ThinkingMode = "auto" | ThinkingModeOption;

export type ThinkingConfig = Partial<Record<ThinkingModeOption, Record<string, unknown>>>;

const THINKING_MODE_OPTIONS: ThinkingModeOption[] = ["on", "off", "standard", "deep", "ultra"];

export function normalizeThinkingConfig(config: ThinkingConfig | undefined): ThinkingConfig | undefined {
  if (config === undefined) return undefined;
  if (!isPlainObject(config)) return undefined;

  const keys = Object.keys(config);
  if (keys.length === 0) return {};

  const normalized: ThinkingConfig = {};

  for (const key of THINKING_MODE_OPTIONS) {
    const value = (config as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (!isPlainObject(value)) continue;
    normalized[key] = cloneNativeWebSearchValue(value);
  }

  // If config includes only unknown keys, treat as invalid unsupported config.
  if (Object.keys(normalized).length === 0) return undefined;

  // "on" and depth presets are mutually exclusive.
  if (normalized.on && (normalized.standard || normalized.deep || normalized.ultra)) {
    delete normalized.on;
  }

  return normalized;
}

export function resolveThinkingMode(
  config: ThinkingConfig | undefined,
  selected: ThinkingMode
): { supported: boolean; effectiveMode: ThinkingMode; patch?: Record<string, unknown>; availableModes: ThinkingMode[] } {
  const normalized = normalizeThinkingConfig(config);
  if (normalized === undefined) {
    return { supported: false, effectiveMode: "auto", availableModes: ["auto"] };
  }

  const hasDepthPresets = !!(normalized.standard || normalized.deep || normalized.ultra);
  const availableModes: ThinkingMode[] = ["auto"];
  if (normalized.off) {
    availableModes.push("off");
  }
  if (hasDepthPresets) {
    if (normalized.standard) availableModes.push("standard");
    if (normalized.deep) availableModes.push("deep");
    if (normalized.ultra) availableModes.push("ultra");
  } else if (normalized.on) {
    availableModes.push("on");
  }

  // thinking: {} => supported but not configurable
  if (Object.keys(normalized).length === 0) {
    return { supported: true, effectiveMode: "auto", availableModes };
  }

  if (selected === "auto") {
    return { supported: true, effectiveMode: "auto", availableModes };
  }

  const patch = normalized[selected as ThinkingModeOption];
  if (patch && isPlainObject(patch)) {
    return { supported: true, effectiveMode: selected, patch, availableModes };
  }

  // Unavailable modes always fall back to auto.
  return { supported: true, effectiveMode: "auto", availableModes };
}

export type NativeWebSearchSdkNativeStrategy = "anthropic_web_search" | "google_search";

export type NativeWebSearchSdkNativeConfig = {
  strategy: NativeWebSearchSdkNativeStrategy;
  args?: Record<string, unknown>;
};

export type NativeWebSearchConfig = {
  providerOptions?: Record<string, unknown>;
  tools?: Array<Record<string, unknown>>;
  sdkNative?: NativeWebSearchSdkNativeConfig;
};

export type NativeWebSearchModelConfig = boolean | NativeWebSearchConfig;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneNativeWebSearchValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneNativeWebSearchValue(item)) as T;
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneNativeWebSearchValue(item)])
    ) as T;
  }
  return value;
}

function isNativeWebSearchSdkNativeStrategy(
  value: unknown
): value is NativeWebSearchSdkNativeStrategy {
  return value === "anthropic_web_search" || value === "google_search";
}

function normalizeNativeWebSearchSdkNative(
  value: unknown
): NativeWebSearchSdkNativeConfig | null {
  if (!isPlainObject(value)) return null;

  const strategy = value.strategy;
  if (!isNativeWebSearchSdkNativeStrategy(strategy)) return null;

  const normalized: NativeWebSearchSdkNativeConfig = { strategy };
  if (value.args !== undefined) {
    if (!isPlainObject(value.args)) return null;
    normalized.args = cloneNativeWebSearchValue(value.args);
  }
  return normalized;
}

function normalizeNativeWebSearchConfig(
  config: NativeWebSearchConfig | undefined
): NativeWebSearchConfig | null {
  if (!config) return null;

  const normalized: NativeWebSearchConfig = {};

  if (isPlainObject(config.providerOptions) && Object.keys(config.providerOptions).length > 0) {
    normalized.providerOptions = cloneNativeWebSearchValue(config.providerOptions);
  }

  if (Array.isArray(config.tools) && config.tools.length > 0) {
    normalized.tools = cloneNativeWebSearchValue(config.tools);
  }

  const sdkNative = normalizeNativeWebSearchSdkNative(config.sdkNative);
  if (sdkNative) {
    normalized.sdkNative = sdkNative;
  }

  return normalized.providerOptions || normalized.tools || normalized.sdkNative ? normalized : null;
}

export function hasNativeWebSearchConfig(
  config: NativeWebSearchConfig | null | undefined
): config is NativeWebSearchConfig {
  return !!normalizeNativeWebSearchConfig(config);
}

export function resolveNativeWebSearchConfig(
  providerDefaults: NativeWebSearchConfig | undefined,
  modelConfig: NativeWebSearchModelConfig | undefined
): NativeWebSearchConfig | null {
  if (modelConfig === false) {
    return null;
  }

  const normalizedDefaults = normalizeNativeWebSearchConfig(providerDefaults);
  if (modelConfig === undefined || modelConfig === true) {
    return normalizedDefaults;
  }

  const normalizedModelConfig = normalizeNativeWebSearchConfig(modelConfig);
  if (!normalizedModelConfig) {
    return normalizedDefaults;
  }
  return normalizedModelConfig;
}

export function inferModelTypeFromId(id: string): ModelType {
  const lower = id.trim().toLowerCase();
  if (lower.includes("embedding") || lower.includes("embed")) return "embedding";
  if (lower.includes("rerank") || lower.includes("reranker") || lower.includes("bge-reranker")) {
    return "rerank";
  }
  return "generative";
}

export type ProviderModel = {
  id: string;
  modelType: ModelType;
  inputModalities?: ModelModality[];
  outputModalities?: ModelModality[];
  imageTasks?: ImageTaskType[];
  image?: ImageCapabilities;
  imageOptionSchema?: ProviderOptionFieldSchema[];
  video?: VideoCapabilities;
  videoOptionSchema?: ProviderOptionFieldSchema[];
  providerOptionsDefaults?: Record<string, unknown>;
  thinking?: ThinkingConfig;
  nativeWebSearch?: NativeWebSearchModelConfig;
};

export type ProviderManagementCapabilities = {
  canEditBaseUrl?: boolean;
  canEditApiKey?: boolean;
  canRegenerateApiKey?: boolean;
  canToggleEnabled?: boolean;
  modelActionsLocked?: boolean;
  free?: boolean;
};

/**
 * Provider 在 UI 可见的字段
 */
export type ProviderPublic = {
  id: string;
  name: string;
  logo?: string;
  type: ProviderType;
  baseUrl: string;
  imageBaseUrl?: string;
  videoBaseUrl?: string;
  enabled: boolean;
  isBuiltin: boolean;
  models: ProviderModel[];
  hasApiKey: boolean;
  apiKey?: string;
  customHeaders?: Record<string, string>;
  providerOptionsDefaults?: Record<string, unknown>;
  nativeWebSearchDefaults?: NativeWebSearchConfig;
  management?: ProviderManagementCapabilities;
  helpUrl?: string;
  helpLabel?: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * renderer → main：新增/更新 Provider
 */
export type ProviderUpsertInput = {
  id?: string;
  name?: string;
  type?: ProviderType;
  baseUrl?: string;
  imageBaseUrl?: string;
  videoBaseUrl?: string;
  enabled?: boolean;
  models?: ProviderModel[];
  apiKey?: string;
  customHeaders?: Record<string, string> | null;
  providerOptionsDefaults?: Record<string, unknown> | null;
  nativeWebSearchDefaults?: NativeWebSearchConfig | null;
};

/**
 * 自定义供应商创建输入
 */
export type CustomProviderCreateInput = {
  name: string;
  logo?: string;
  type: ProviderType;
  baseUrl: string;
  imageBaseUrl?: string;
  videoBaseUrl?: string;
  apiKey?: string;
  customHeaders?: Record<string, string> | null;
  providerOptionsDefaults?: Record<string, unknown> | null;
  nativeWebSearchDefaults?: NativeWebSearchConfig | null;
  enabled?: boolean;
};

export type DefaultModelRef = {
  providerId: string;
  modelId: string;
} | null;
