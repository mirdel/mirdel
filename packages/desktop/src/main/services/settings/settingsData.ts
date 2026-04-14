import {
  DEFAULT_APP_LANGUAGE_PREFERENCE,
  isAppLanguagePreference,
  type AppLanguagePreference,
  type DefaultModelRef
} from "@shared";
import { getDb } from "../db";

const KEY_DEFAULT_MODEL = "defaultModel";
const KEY_DEFAULT_MODEL_GENERAL = "defaultModel:general";
const KEY_DEFAULT_MODEL_FAST = "defaultModel:fast";
const KEY_DEFAULT_MODEL_TRANSLATE = "defaultModel:translate";
const KEY_DEFAULT_MODEL_EMBEDDING = "defaultModel:embedding";
const KEY_DEFAULT_MODEL_IMAGE_GENERATE = "defaultModel:imageGenerate";
const KEY_DEFAULT_MODEL_IMAGE_EDIT = "defaultModel:imageEdit";
const KEY_DEFAULT_MODEL_VIDEO_GENERATE = "defaultModel:videoGenerate";
const KEY_SEND_SHORTCUT = "sendShortcut";
const KEY_MEMORY_SESSION_STATE_ENABLED = "memory:sessionStateEnabled";
const KEY_MEMORY_CROSS_SESSION_ENABLED = "memory:crossSessionEnabled";
const KEY_MEMORY_LONG_TERM_ENABLED = "memory:longTermEnabled";
const KEY_MEMORY_HISTORICAL_ENABLED = "memory:historicalEnabled";
const KEY_MEMORY_HISTORICAL_EMBEDDING_MODEL = "memory:historicalEmbeddingModel";
const KEY_MEMORY_HISTORICAL_EMBEDDING_DIMENSION = "memory:historicalEmbeddingDimension";
const KEY_MEMORY_HISTORICAL_MAX_RECALL = "memory:historicalMaxRecall";
const KEY_MEMORY_HISTORICAL_MIN_SCORE = "memory:historicalMinScore";
const KEY_AI_DEVTOOLS_ENABLED = "ai:devtools:enabled";
const KEY_MODEL_FAVORITES = "modelFavorites";
const KEY_APP_LANGUAGE = "appLanguage";
const KEY_TTS_READ_ALOUD_SETTINGS = "tts:readAloud:settings";
const KEY_SESSION_PREFERENCES = "chat:sessionPreferences";
const KEY_PROXY_SETTINGS = "general:proxySettings";
const KEY_APP_BEHAVIOR_SETTINGS = "general:appBehaviorSettings";
const KEY_ONBOARDING_WELCOME_DISMISSED_AT = "onboarding:welcome-dismissed-at";
const DEFAULT_PROXY_BYPASS_RULES = ["localhost", "127.0.0.1", "::1"];

export function getDefaultModel(): DefaultModelRef {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_DEFAULT_MODEL) as { value: string } | undefined;
  if (!row) return null;
  try {
    const v = JSON.parse(row.value);
    if (!v) return null;
    if (typeof v.providerId !== "string" || typeof v.modelId !== "string") return null;
    return { providerId: v.providerId, modelId: v.modelId };
  } catch {
    return null;
  }
}

export function setDefaultModel(v: DefaultModelRef) {
  const db = getDb();
  const value = JSON.stringify(v);
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_DEFAULT_MODEL, value);
}

// 默认模型类型
export type DefaultModelType = 'general' | 'fast' | 'translate' | 'embedding' | 'imageGenerate' | 'imageEdit' | 'videoGenerate';

// 获取特定类型的默认模型
export function getDefaultModelByType(type: DefaultModelType): DefaultModelRef {
  const db = getDb();
  const keyMap: Record<DefaultModelType, string> = {
    general: KEY_DEFAULT_MODEL_GENERAL,
    fast: KEY_DEFAULT_MODEL_FAST,
    translate: KEY_DEFAULT_MODEL_TRANSLATE,
    embedding: KEY_DEFAULT_MODEL_EMBEDDING,
    imageGenerate: KEY_DEFAULT_MODEL_IMAGE_GENERATE,
    imageEdit: KEY_DEFAULT_MODEL_IMAGE_EDIT,
    videoGenerate: KEY_DEFAULT_MODEL_VIDEO_GENERATE,
  };
  const key = keyMap[type];
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
  
  if (!row) {
    return null;
  }
  
  try {
    const v = JSON.parse(row.value);
    if (!v) return null;
    if (typeof v.providerId !== "string" || typeof v.modelId !== "string") {
      return null;
    }
    return { providerId: v.providerId, modelId: v.modelId };
  } catch {
    return null;
  }
}

// 设置特定类型的默认模型
export function setDefaultModelByType(type: DefaultModelType, v: DefaultModelRef) {
  const db = getDb();
  const keyMap: Record<DefaultModelType, string> = {
    general: KEY_DEFAULT_MODEL_GENERAL,
    fast: KEY_DEFAULT_MODEL_FAST,
    translate: KEY_DEFAULT_MODEL_TRANSLATE,
    embedding: KEY_DEFAULT_MODEL_EMBEDDING,
    imageGenerate: KEY_DEFAULT_MODEL_IMAGE_GENERATE,
    imageEdit: KEY_DEFAULT_MODEL_IMAGE_EDIT,
    videoGenerate: KEY_DEFAULT_MODEL_VIDEO_GENERATE,
  };
  const key = keyMap[type];
  const value = JSON.stringify(v);
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
}

// 获取所有默认模型配置
export function getAllDefaultModels() {
  return {
    general: getDefaultModelByType('general'),
    fast: getDefaultModelByType('fast'),
    translate: getDefaultModelByType('translate'),
    embedding: getDefaultModelByType('embedding'),
    imageGenerate: getDefaultModelByType('imageGenerate'),
    imageEdit: getDefaultModelByType('imageEdit'),
    videoGenerate: getDefaultModelByType('videoGenerate'),
  };
}

// 获取发送快捷键模式：'enter' 或 'cmd-enter'
export function getSendShortcut(): string {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_SEND_SHORTCUT) as { value: string } | undefined;
  return row?.value || 'enter';
}

// 设置发送快捷键模式
export function setSendShortcut(mode: string) {
  const db = getDb();
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_SEND_SHORTCUT, mode);
}

export type ReadAloudTtsSettings = {
  voice: string;
  rate: string;
  pitch: string;
};

const DEFAULT_READ_ALOUD_TTS_SETTINGS: ReadAloudTtsSettings = {
  voice: "zh-CN-XiaoxiaoNeural",
  rate: "+0%",
  pitch: "+0Hz",
};

function normalizeReadAloudVoice(input: unknown): string {
  const value = String(input ?? "").trim();
  return value || DEFAULT_READ_ALOUD_TTS_SETTINGS.voice;
}

function normalizeReadAloudRate(input: unknown): string {
  const value = String(input ?? "").trim();
  return value || DEFAULT_READ_ALOUD_TTS_SETTINGS.rate;
}

function normalizeReadAloudPitch(input: unknown): string {
  const value = String(input ?? "").trim();
  return value || DEFAULT_READ_ALOUD_TTS_SETTINGS.pitch;
}

function normalizeReadAloudTtsSettings(input: unknown): ReadAloudTtsSettings {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    voice: normalizeReadAloudVoice(source.voice),
    rate: normalizeReadAloudRate(source.rate),
    pitch: normalizeReadAloudPitch(source.pitch),
  };
}

export function getReadAloudTtsSettings(): ReadAloudTtsSettings {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_TTS_READ_ALOUD_SETTINGS) as { value: string } | undefined;
  if (!row?.value) return { ...DEFAULT_READ_ALOUD_TTS_SETTINGS };
  try {
    return normalizeReadAloudTtsSettings(JSON.parse(row.value));
  } catch {
    return { ...DEFAULT_READ_ALOUD_TTS_SETTINGS };
  }
}

export function setReadAloudTtsSettings(input: Partial<ReadAloudTtsSettings>) {
  const db = getDb();
  const current = getReadAloudTtsSettings();
  const merged = normalizeReadAloudTtsSettings({
    ...current,
    ...(input || {}),
  });
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(
    KEY_TTS_READ_ALOUD_SETTINGS,
    JSON.stringify(merged)
  );
}

// ===== 记忆系统 =====
export interface MemorySettings {
  sessionStateEnabled: boolean;
  crossSessionEnabled: boolean;
  longTermEnabled: boolean;
  historicalEnabled: boolean;
  historicalEmbeddingModel: string;
  historicalEmbeddingDimension: number | null;
  historicalMaxRecall: number;
  historicalMinScore: number;
}

export function getMemorySettings(): MemorySettings {
  const db = getDb();
  const sessionStateRow = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_MEMORY_SESSION_STATE_ENABLED) as { value: string } | undefined;
  const crossSessionRow = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_MEMORY_CROSS_SESSION_ENABLED) as { value: string } | undefined;
  const longTermRow = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_MEMORY_LONG_TERM_ENABLED) as { value: string } | undefined;
  const historicalRow = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_MEMORY_HISTORICAL_ENABLED) as { value: string } | undefined;
  const historicalEmbeddingModelRow = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_MEMORY_HISTORICAL_EMBEDDING_MODEL) as { value: string } | undefined;
  const historicalEmbeddingDimensionRow = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_MEMORY_HISTORICAL_EMBEDDING_DIMENSION) as { value: string } | undefined;
  const historicalMaxRecallRow = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_MEMORY_HISTORICAL_MAX_RECALL) as { value: string } | undefined;
  const historicalMinScoreRow = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_MEMORY_HISTORICAL_MIN_SCORE) as { value: string } | undefined;
  const parsedDimension = historicalEmbeddingDimensionRow?.value ? Number(historicalEmbeddingDimensionRow.value) : null;
  const parsedMaxRecall = historicalMaxRecallRow?.value ? Number(historicalMaxRecallRow.value) : NaN;
  const parsedMinScore = historicalMinScoreRow?.value ? Number(historicalMinScoreRow.value) : NaN;
  return {
    sessionStateEnabled: sessionStateRow?.value !== "false",
    crossSessionEnabled: crossSessionRow?.value !== "false",
    longTermEnabled: longTermRow?.value !== "false",
    historicalEnabled: historicalRow?.value === "true",
    historicalEmbeddingModel: historicalEmbeddingModelRow?.value && historicalEmbeddingModelRow.value !== "__default__"
      ? historicalEmbeddingModelRow.value
      : "",
    historicalEmbeddingDimension: Number.isFinite(parsedDimension) && parsedDimension !== null && parsedDimension > 0
      ? Math.floor(parsedDimension)
      : null,
    historicalMaxRecall: Number.isFinite(parsedMaxRecall)
      ? Math.max(1, Math.min(10, Math.floor(parsedMaxRecall)))
      : 3,
    historicalMinScore: Number.isFinite(parsedMinScore)
      ? Math.max(0, Math.min(1, parsedMinScore))
      : 0.58,
  };
}

export function setMemorySettings(v: Partial<MemorySettings>) {
  const db = getDb();
  if (v.sessionStateEnabled !== undefined) {
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_MEMORY_SESSION_STATE_ENABLED, v.sessionStateEnabled ? "true" : "false");
  }
  if (v.crossSessionEnabled !== undefined) {
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_MEMORY_CROSS_SESSION_ENABLED, v.crossSessionEnabled ? "true" : "false");
  }
  if (v.longTermEnabled !== undefined) {
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_MEMORY_LONG_TERM_ENABLED, v.longTermEnabled ? "true" : "false");
  }
  if (v.historicalEnabled !== undefined) {
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_MEMORY_HISTORICAL_ENABLED, v.historicalEnabled ? "true" : "false");
  }
  if (v.historicalEmbeddingModel !== undefined) {
    const model = String(v.historicalEmbeddingModel || "").trim();
    if (!model || model === "__default__") {
      db.prepare(`DELETE FROM settings WHERE key = ?`).run(KEY_MEMORY_HISTORICAL_EMBEDDING_MODEL);
    } else {
      db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_MEMORY_HISTORICAL_EMBEDDING_MODEL, model);
    }
  }
  if (v.historicalEmbeddingDimension !== undefined) {
    if (v.historicalEmbeddingDimension === null) {
      db.prepare(`DELETE FROM settings WHERE key = ?`).run(KEY_MEMORY_HISTORICAL_EMBEDDING_DIMENSION);
    } else {
      const parsed = Number(v.historicalEmbeddingDimension);
      if (Number.isFinite(parsed)) {
        const dimension = Math.max(1, Math.floor(parsed));
        db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_MEMORY_HISTORICAL_EMBEDDING_DIMENSION, String(dimension));
      } else {
        db.prepare(`DELETE FROM settings WHERE key = ?`).run(KEY_MEMORY_HISTORICAL_EMBEDDING_DIMENSION);
      }
    }
  }
  if (v.historicalMaxRecall !== undefined) {
    const parsed = Number(v.historicalMaxRecall);
    const maxRecall = Number.isFinite(parsed)
      ? Math.max(1, Math.min(10, Math.floor(parsed)))
      : 3;
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_MEMORY_HISTORICAL_MAX_RECALL, String(maxRecall));
  }
  if (v.historicalMinScore !== undefined) {
    const parsed = Number(v.historicalMinScore);
    const minScore = Number.isFinite(parsed)
      ? Math.max(0, Math.min(1, parsed))
      : 0.58;
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_MEMORY_HISTORICAL_MIN_SCORE, String(minScore));
  }
}

export function getAiDevToolsEnabled(): boolean {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_AI_DEVTOOLS_ENABLED) as { value: string } | undefined;
  return row?.value === "true";
}

export function setAiDevToolsEnabled(enabled: boolean) {
  const db = getDb();
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_AI_DEVTOOLS_ENABLED, enabled ? "true" : "false");
}

export function getModelFavorites(): string[] {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_MODEL_FAVORITES) as { value: string } | undefined;
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed.filter((item) => typeof item === "string" && item.includes("::"));
    return Array.from(new Set(normalized));
  } catch {
    return [];
  }
}

export function getAppLanguagePreference(): AppLanguagePreference {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_APP_LANGUAGE) as { value: string } | undefined;
  return isAppLanguagePreference(row?.value) ? row.value : DEFAULT_APP_LANGUAGE_PREFERENCE;
}

export function setAppLanguagePreference(preference: AppLanguagePreference) {
  const db = getDb();
  const nextPreference = isAppLanguagePreference(preference)
    ? preference
    : DEFAULT_APP_LANGUAGE_PREFERENCE;
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_APP_LANGUAGE, nextPreference);
}

export function setModelFavorite(providerId: string, modelId: string, favorite: boolean) {
  const key = `${providerId}::${modelId}`;
  const next = new Set(getModelFavorites());
  if (favorite) {
    next.add(key);
  } else {
    next.delete(key);
  }
  const db = getDb();
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(
    KEY_MODEL_FAVORITES,
    JSON.stringify(Array.from(next).sort((a, b) => a.localeCompare(b)))
  );
}

export type SessionTitleGenerationMode = "ai" | "extract";

export interface SessionPreferences {
  titleGenerationMode: SessionTitleGenerationMode;
  generateSuggestions: boolean;
  showMindmap: boolean;
  showTokenUsage: boolean;
  showDebugEntry: boolean;
}

const DEFAULT_SESSION_PREFERENCES: SessionPreferences = {
  titleGenerationMode: "ai",
  generateSuggestions: true,
  showMindmap: true,
  showTokenUsage: true,
  showDebugEntry: false,
};

function normalizeSessionPreferences(input: unknown): SessionPreferences {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    titleGenerationMode: source.titleGenerationMode === "extract" ? "extract" : "ai",
    generateSuggestions: source.generateSuggestions !== false,
    showMindmap: source.showMindmap !== false,
    showTokenUsage: source.showTokenUsage !== false,
    showDebugEntry: source.showDebugEntry === true,
  };
}

export function getSessionPreferences(): SessionPreferences {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_SESSION_PREFERENCES) as { value: string } | undefined;
  if (!row?.value) return { ...DEFAULT_SESSION_PREFERENCES };

  try {
    return normalizeSessionPreferences(JSON.parse(row.value));
  } catch {
    return { ...DEFAULT_SESSION_PREFERENCES };
  }
}

export function setSessionPreferences(input: Partial<SessionPreferences>) {
  const db = getDb();
  const current = getSessionPreferences();
  const next = normalizeSessionPreferences({
    ...current,
    ...(input || {}),
  });

  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(
    KEY_SESSION_PREFERENCES,
    JSON.stringify(next)
  );
}

export type ProxyMode = "system" | "custom" | "direct";

export interface ProxySettings {
  mode: ProxyMode;
  server: string;
  bypassRules: string[];
}

const DEFAULT_PROXY_SETTINGS: ProxySettings = {
  mode: "system",
  server: "",
  bypassRules: [...DEFAULT_PROXY_BYPASS_RULES],
};

function isProxyMode(value: unknown): value is ProxyMode {
  return value === "system" || value === "custom" || value === "direct";
}

function normalizeProxyBypassRules(input: unknown): string[] {
  const rawRules = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/\r?\n|,/g)
      : [];

  const next = new Set<string>();
  for (const item of rawRules) {
    const normalized = String(item ?? "").trim();
    if (normalized) next.add(normalized);
  }

  for (const defaultRule of DEFAULT_PROXY_BYPASS_RULES) {
    next.add(defaultRule);
  }

  return Array.from(next);
}

function normalizeProxyServer(input: unknown): string {
  return String(input ?? "").trim();
}

function normalizeProxySettings(input: unknown): ProxySettings {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const mode = isProxyMode(source.mode) ? source.mode : DEFAULT_PROXY_SETTINGS.mode;
  const bypassRules = normalizeProxyBypassRules(source.bypassRules);

  return {
    mode,
    server: normalizeProxyServer(source.server),
    bypassRules,
  };
}

export function getProxySettings(): ProxySettings {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_PROXY_SETTINGS) as { value: string } | undefined;
  if (!row?.value) return { ...DEFAULT_PROXY_SETTINGS, bypassRules: [...DEFAULT_PROXY_SETTINGS.bypassRules] };

  try {
    return normalizeProxySettings(JSON.parse(row.value));
  } catch {
    return { ...DEFAULT_PROXY_SETTINGS, bypassRules: [...DEFAULT_PROXY_SETTINGS.bypassRules] };
  }
}

export function setProxySettings(input: Partial<ProxySettings>) {
  const db = getDb();
  const current = getProxySettings();
  const next = normalizeProxySettings({
    ...current,
    ...(input || {}),
  });

  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(
    KEY_PROXY_SETTINGS,
    JSON.stringify(next)
  );

  return next;
}

export interface AppBehaviorSettings {
  launchAtLogin: boolean;
  minimizeToTrayOnClose: boolean;
}

const DEFAULT_APP_BEHAVIOR_SETTINGS: AppBehaviorSettings = {
  launchAtLogin: false,
  minimizeToTrayOnClose: false,
};

function normalizeAppBehaviorSettings(input: unknown): AppBehaviorSettings {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    launchAtLogin: source.launchAtLogin === true,
    minimizeToTrayOnClose: source.minimizeToTrayOnClose === true,
  };
}

export function getAppBehaviorSettings(): AppBehaviorSettings {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_APP_BEHAVIOR_SETTINGS) as { value: string } | undefined;
  if (!row?.value) return { ...DEFAULT_APP_BEHAVIOR_SETTINGS };

  try {
    return normalizeAppBehaviorSettings(JSON.parse(row.value));
  } catch {
    return { ...DEFAULT_APP_BEHAVIOR_SETTINGS };
  }
}

export function setAppBehaviorSettings(input: Partial<AppBehaviorSettings>) {
  const db = getDb();
  const current = getAppBehaviorSettings();
  const next = normalizeAppBehaviorSettings({
    ...current,
    ...(input || {}),
  });

  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(
    KEY_APP_BEHAVIOR_SETTINGS,
    JSON.stringify(next)
  );

  return next;
}

export function getWelcomeOnboardingDismissedAt(): number | null {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY_ONBOARDING_WELCOME_DISMISSED_AT) as { value: string } | undefined;
  if (!row?.value) return null;

  const value = Number(row.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function dismissWelcomeOnboarding(timestamp: number = Date.now()) {
  const db = getDb();
  const nextValue = String(timestamp);
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(KEY_ONBOARDING_WELCOME_DISMISSED_AT, nextValue);
}
