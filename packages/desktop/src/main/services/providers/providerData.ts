import type {
  ProviderModel,
  ProviderPublic,
  ProviderType,
  ProviderUpsertInput,
  CustomProviderCreateInput,
  Provider as ConfigProvider,
} from "@shared";
import { getDb } from "../db";
import { nanoid } from "nanoid";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt } from "../crypto";
import { loggerServiceMain } from "@shared";
import {
  getAllProviders as getAllConfigProviders,
  getProvider as getConfigProvider,
} from "../models/ConfigManager";
import { tMain } from "../../i18n";
import { getLocalProvider } from "./official";
import {
  getCommonModels,
  getModelFromCatalog,
  getModelOverride,
  resetModelToDefault,
  upsertModelOverride,
} from "./modelListService";
import { resolveProviderHelpLabel, resolveProviderModelConfigText, resolveProviderName } from "./configText";
import {
  LOCAL_PROVIDER_ID,
} from "./localModelConstants";

const logger = loggerServiceMain.withContext("providerData");

type BuiltinOverrideRow = {
  id: string;
  baseUrl: string | null;
  imageBaseUrl: string | null;
  videoBaseUrl: string | null;
  apiKey: string | null;
  customHeaders: string | null;
  providerOptionsDefaults: string | null;
  nativeWebSearchDefaults: string | null;
  enabled: number | null;
  updatedAt: number;
};

type CustomProviderRow = {
  id: string;
  name: string;
  logo: string | null;
  type: string;
  baseUrl: string;
  imageBaseUrl: string | null;
  videoBaseUrl: string | null;
  apiKey: string | null;
  customHeaders: string | null;
  providerOptionsDefaults: string | null;
  nativeWebSearchDefaults: string | null;
  enabled: number;
  models: string | null;
  createdAt: number;
  updatedAt: number;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function mergeHeaders(
  base?: Record<string, string> | null,
  override?: Record<string, string> | null
): Record<string, string> {
  return { ...(base || {}), ...(override || {}) };
}

function parseJsonObject<T extends Record<string, unknown>>(text: string | null): T | undefined {
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    // ignore invalid json
  }
  return undefined;
}

function toProviderModel(m: ProviderModel): ProviderModel {
  return resolveProviderModelConfigText(m);
}

function defaultManagementCapabilities() {
  return {
    canEditBaseUrl: true,
    canEditApiKey: true,
    canRegenerateApiKey: false,
    canToggleEnabled: true,
    modelActionsLocked: false,
    free: false,
  };
}

/**
 * 合并内置 Provider 配置与 override
 * @param configIndex config 中的序号，用于无 override 时稳定排序
 */
function mergeBuiltinProvider(
  config: ConfigProvider,
  override: BuiltinOverrideRow | null | undefined,
  configIndex: number
): ProviderPublic {
  const overrideBaseUrl = override?.baseUrl;
  const overrideImageBaseUrl = override?.imageBaseUrl;
  const overrideVideoBaseUrl = override?.videoBaseUrl;
  const hasBaseOverride = overrideBaseUrl !== null && overrideBaseUrl !== undefined;
  const hasImageBaseOverride = overrideImageBaseUrl !== null && overrideImageBaseUrl !== undefined;
  const hasVideoBaseOverride = overrideVideoBaseUrl !== null && overrideVideoBaseUrl !== undefined;
  const baseUrl =
    hasBaseOverride
      ? overrideBaseUrl
      : config.baseUrl;
  const imageBaseUrl =
    hasImageBaseOverride
      ? overrideImageBaseUrl
      : hasBaseOverride
        ? undefined
        : config.imageBaseUrl;
  const videoBaseUrl =
    hasVideoBaseOverride
      ? overrideVideoBaseUrl
      : hasBaseOverride
        ? undefined
        : config.videoBaseUrl;
  const parsedCustomHeaders = parseJsonObject<Record<string, string>>(override?.customHeaders ?? null) ?? null;
  const parsedProviderOptionsDefaults = parseJsonObject<Record<string, unknown>>(
    override?.providerOptionsDefaults ?? null
  );
  const parsedNativeWebSearchDefaults = parseJsonObject<Record<string, unknown>>(
    override?.nativeWebSearchDefaults ?? null
  );
  const customHeaders = mergeHeaders(config.defaultHeaders, parsedCustomHeaders);
  const enabled =
    override != null && override.enabled !== null ? Boolean(override.enabled) : false;

  const commonModels = getCommonModels(config.id, config.models);
  const models = commonModels.map(toProviderModel);

  return {
    id: config.id,
    name: resolveProviderName({
      name: config.name,
    }),
    logo: config.logo,
    type: config.type as ProviderType,
    baseUrl: baseUrl || "",
    imageBaseUrl: imageBaseUrl || undefined,
    videoBaseUrl: videoBaseUrl || undefined,
    enabled,
    isBuiltin: true,
    models,
    hasApiKey: Boolean(override?.apiKey),
    apiKey: override?.apiKey ? decrypt(override.apiKey) : undefined,
    customHeaders: Object.keys(customHeaders).length ? customHeaders : undefined,
    providerOptionsDefaults: parsedProviderOptionsDefaults,
    nativeWebSearchDefaults: parsedNativeWebSearchDefaults ?? config.nativeWebSearchDefaults,
    management: defaultManagementCapabilities(),
    helpUrl: config.helpUrl,
    helpLabel: resolveProviderHelpLabel({
      helpLabel: config.helpLabel,
      helpUrl: config.helpUrl,
    }),
    createdAt: Date.now(),
    updatedAt: override?.updatedAt ?? -configIndex,
  };
}

/**
 * 从 custom_providers 行转为 ProviderPublic
 * 自定义 provider 无 config 种子，常用列表完全来自 provider_model_actions
 */
function customRowToProvider(row: CustomProviderRow): ProviderPublic {
  const commonModels = getCommonModels(row.id, []);
  const models = commonModels.map(toProviderModel);

  const customHeaders = parseJsonObject<Record<string, string>>(row.customHeaders);
  const providerOptionsDefaults = parseJsonObject<Record<string, unknown>>(row.providerOptionsDefaults);
  const nativeWebSearchDefaults = parseJsonObject<Record<string, unknown>>(row.nativeWebSearchDefaults);

  return {
    id: row.id,
    name: row.name,
    logo: row.logo || undefined,
    type: row.type as ProviderType,
    baseUrl: row.baseUrl,
    imageBaseUrl: row.imageBaseUrl || undefined,
    videoBaseUrl: row.videoBaseUrl || undefined,
    enabled: Boolean(row.enabled),
    isBuiltin: false,
    models,
    hasApiKey: Boolean(row.apiKey),
    apiKey: row.apiKey ? decrypt(row.apiKey) : undefined,
    customHeaders,
    providerOptionsDefaults,
    nativeWebSearchDefaults,
    management: defaultManagementCapabilities(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 获取 Provider 的模型列表（常用列表 + type override）
 */
export function getProviderModels(providerId: string): ProviderModel[] {
  const configProvider = getConfigProvider(providerId);
  if (configProvider) {
    const commonModels = getCommonModels(providerId, configProvider.models);
    return commonModels.map(toProviderModel);
  }
  const row = getDb()
    .prepare(`SELECT * FROM custom_providers WHERE id = ?`)
    .get(providerId) as CustomProviderRow | undefined;
  if (row) {
    const commonModels = getCommonModels(providerId, []);
    return commonModels.map(toProviderModel);
  }
  return [];
}

function resolveProviderModel(providerId: string, modelId: string): ProviderModel | null {
  const configProvider = getConfigProvider(providerId);
  if (configProvider) {
    return getModelFromCatalog(providerId, modelId, configProvider.models);
  }

  const row = getDb()
    .prepare(`SELECT * FROM custom_providers WHERE id = ?`)
    .get(providerId) as CustomProviderRow | undefined;
  if (!row) {
    return null;
  }

  return getModelFromCatalog(providerId, modelId, []);
}

export function listProviders(): ProviderPublic[] {
  try {
    const db = getDb();
    const builtinOverrides = db
      .prepare(`SELECT * FROM builtin_provider_overrides`)
      .all() as BuiltinOverrideRow[];
    const overridesMap = new Map(builtinOverrides.map((o) => [o.id, o]));

    const configProviders = getAllConfigProviders();
    if (configProviders.length === 0) {
      logger.warn("listProviders: config has no providers");
    }
    const builtinResult = configProviders
      .filter((p) => p.id !== "local")
      .map((p, index) => {
        const merged = mergeBuiltinProvider(p, overridesMap.get(p.id), index);
        return {
          ...merged,
          _originalIndex: index,
          _overrideUpdatedAt: overridesMap.get(p.id)?.updatedAt ?? null,
        };
      });

    builtinResult.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      const aHas = a._overrideUpdatedAt !== null;
      const bHas = b._overrideUpdatedAt !== null;
      if (aHas && bHas)
        return (b._overrideUpdatedAt as number) - (a._overrideUpdatedAt as number);
      if (aHas) return -1;
      if (bHas) return 1;
      return a._originalIndex - b._originalIndex;
    });

    const builtinFinal = builtinResult.map(
      ({ _originalIndex, _overrideUpdatedAt, ...rest }) => rest
    );

    const customRows = db
      .prepare(`SELECT * FROM custom_providers ORDER BY createdAt DESC`)
      .all() as CustomProviderRow[];
    const customProviders = customRows.map(customRowToProvider);

    return [getLocalProvider(), ...builtinFinal, ...customProviders];
  } catch (error) {
    logger.error("listProviders failed", { error });
    return [getLocalProvider()];
  }
}

export function upsertProvider(input: ProviderUpsertInput): { id: string } {
  const db = getDb();
  const now = Date.now();
  const id = input.id!;
  const configProvider = getConfigProvider(id);

  if (!configProvider || !configProvider.isBuiltin) {
    throw new Error(tMain("provider.builtinOnlyUpdatable"));
  }

  const existing = db
    .prepare(`SELECT * FROM builtin_provider_overrides WHERE id = ?`)
    .get(id) as BuiltinOverrideRow | undefined;

  const updates: {
    baseUrl?: string | null;
    imageBaseUrl?: string | null;
    videoBaseUrl?: string | null;
    apiKey?: string | null;
    customHeaders?: string | null;
    providerOptionsDefaults?: string | null;
    nativeWebSearchDefaults?: string | null;
    enabled?: number | null;
  } = {};

  if (input.apiKey !== undefined) {
    if (id === LOCAL_PROVIDER_ID) {
      logger.warn("Ignoring direct local provider apiKey update via upsert");
    } else {
      updates.apiKey =
        typeof input.apiKey === "string" && input.apiKey.trim()
          ? encrypt(input.apiKey.trim())
          : null;
    }
  }
  if (input.baseUrl !== undefined) {
    updates.baseUrl = normalizeBaseUrl(input.baseUrl);
  }
  if (input.imageBaseUrl !== undefined) {
    updates.imageBaseUrl = normalizeBaseUrl(input.imageBaseUrl);
  }
  if (input.videoBaseUrl !== undefined) {
    updates.videoBaseUrl = normalizeBaseUrl(input.videoBaseUrl);
  }
  if (input.customHeaders !== undefined) {
    updates.customHeaders =
      input.customHeaders && Object.keys(input.customHeaders).length > 0
        ? JSON.stringify(input.customHeaders)
        : null;
  }
  if (input.providerOptionsDefaults !== undefined) {
    updates.providerOptionsDefaults =
      input.providerOptionsDefaults && Object.keys(input.providerOptionsDefaults).length > 0
        ? JSON.stringify(input.providerOptionsDefaults)
        : null;
  }
  if (input.nativeWebSearchDefaults !== undefined) {
    updates.nativeWebSearchDefaults =
      input.nativeWebSearchDefaults && Object.keys(input.nativeWebSearchDefaults).length > 0
        ? JSON.stringify(input.nativeWebSearchDefaults)
        : null;
  }
  if (input.enabled !== undefined) {
    updates.enabled = input.enabled ? 1 : 0;
  }

  if (Object.keys(updates).length > 0) {
    if (existing) {
      const fields = Object.keys(updates)
        .map((k) => `${k}=?`)
        .join(", ");
      const values = [...Object.values(updates), now, id];
      db.prepare(
        `UPDATE builtin_provider_overrides SET ${fields}, updatedAt=? WHERE id=?`
      ).run(...values);
    } else {
      db.prepare(
        `INSERT INTO builtin_provider_overrides (id, baseUrl, imageBaseUrl, videoBaseUrl, apiKey, customHeaders, providerOptionsDefaults, nativeWebSearchDefaults, enabled, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        updates.baseUrl ?? null,
        updates.imageBaseUrl ?? null,
        updates.videoBaseUrl ?? null,
        updates.apiKey ?? null,
        updates.customHeaders ?? null,
        updates.providerOptionsDefaults ?? null,
        updates.nativeWebSearchDefaults ?? null,
        updates.enabled ?? null,
        now
      );
    }
  }

  return { id };
}

export function createCustomProvider(
  input: CustomProviderCreateInput
): { id: string } {
  const db = getDb();
  const now = Date.now();
  const id = nanoid();

  const apiKey =
    input.apiKey && input.apiKey.trim()
      ? encrypt(input.apiKey.trim())
      : null;
  const customHeaders =
    input.customHeaders && Object.keys(input.customHeaders).length > 0
      ? JSON.stringify(input.customHeaders)
      : null;
  const providerOptionsDefaults =
    input.providerOptionsDefaults && Object.keys(input.providerOptionsDefaults).length > 0
      ? JSON.stringify(input.providerOptionsDefaults)
      : null;
  const nativeWebSearchDefaults =
    input.nativeWebSearchDefaults && Object.keys(input.nativeWebSearchDefaults).length > 0
      ? JSON.stringify(input.nativeWebSearchDefaults)
      : null;

  db.prepare(
    `INSERT INTO custom_providers (id, name, logo, type, baseUrl, imageBaseUrl, videoBaseUrl, apiKey, customHeaders, providerOptionsDefaults, nativeWebSearchDefaults, enabled, models, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name.trim(),
    input.logo?.trim() || null,
    input.type,
    normalizeBaseUrl(input.baseUrl),
    input.imageBaseUrl !== undefined ? normalizeBaseUrl(input.imageBaseUrl) : null,
    input.videoBaseUrl !== undefined ? normalizeBaseUrl(input.videoBaseUrl) : null,
    apiKey,
    customHeaders,
    providerOptionsDefaults,
    nativeWebSearchDefaults,
    input.enabled ? 1 : 0,
    "[]",
    now,
    now
  );

  logger.info("Custom provider created", { id, name: input.name });
  return { id };
}

export function updateCustomProvider(
  id: string,
  input: Partial<
    Pick<
      CustomProviderCreateInput,
      "name" | "logo" | "type" | "baseUrl" | "imageBaseUrl" | "videoBaseUrl" | "apiKey" | "customHeaders" | "enabled"
      | "providerOptionsDefaults" | "nativeWebSearchDefaults"
    >
  >
): void {
  const db = getDb();
  const now = Date.now();
  const existing = db
    .prepare(`SELECT * FROM custom_providers WHERE id = ?`)
    .get(id) as CustomProviderRow | undefined;

  if (!existing) {
    throw new Error(tMain("provider.customNotFound"));
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (input.name !== undefined) {
    updates.push("name=?");
    values.push(input.name.trim());
  }
  if (input.logo !== undefined) {
    updates.push("logo=?");
    values.push(input.logo?.trim() || null);
  }
  if (input.type !== undefined) {
    updates.push("type=?");
    values.push(input.type);
  }
  if (input.baseUrl !== undefined) {
    updates.push("baseUrl=?");
    values.push(normalizeBaseUrl(input.baseUrl));
  }
  if (input.imageBaseUrl !== undefined) {
    updates.push("imageBaseUrl=?");
    values.push(normalizeBaseUrl(input.imageBaseUrl));
  }
  if (input.videoBaseUrl !== undefined) {
    updates.push("videoBaseUrl=?");
    values.push(normalizeBaseUrl(input.videoBaseUrl));
  }
  if (input.apiKey !== undefined) {
    updates.push("apiKey=?");
    values.push(
      input.apiKey && input.apiKey.trim()
        ? encrypt(input.apiKey.trim())
        : null
    );
  }
  if (input.customHeaders !== undefined) {
    updates.push("customHeaders=?");
    values.push(
      input.customHeaders && Object.keys(input.customHeaders).length > 0
        ? JSON.stringify(input.customHeaders)
        : null
    );
  }
  if (input.providerOptionsDefaults !== undefined) {
    updates.push("providerOptionsDefaults=?");
    values.push(
      input.providerOptionsDefaults && Object.keys(input.providerOptionsDefaults).length > 0
        ? JSON.stringify(input.providerOptionsDefaults)
        : null
    );
  }
  if (input.nativeWebSearchDefaults !== undefined) {
    updates.push("nativeWebSearchDefaults=?");
    values.push(
      input.nativeWebSearchDefaults && Object.keys(input.nativeWebSearchDefaults).length > 0
        ? JSON.stringify(input.nativeWebSearchDefaults)
        : null
    );
  }
  if (input.enabled !== undefined) {
    updates.push("enabled=?");
    values.push(input.enabled ? 1 : 0);
  }

  if (updates.length > 0) {
    updates.push("updatedAt=?");
    values.push(now, id);
    db.prepare(
      `UPDATE custom_providers SET ${updates.join(", ")} WHERE id=?`
    ).run(...values);
  }
}

export function deleteCustomProvider(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM custom_providers WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM model_overrides WHERE providerId = ?`).run(id);
  db.prepare(`DELETE FROM provider_model_actions WHERE providerId = ?`).run(id);
  logger.info("Custom provider deleted", { id });
}

export function deleteProvider(id: string) {
  const configProvider = getConfigProvider(id);
  if (configProvider?.isBuiltin) {
    logger.warn("Builtin providers cannot be deleted; disable them instead", { id });
    return;
  }
  deleteCustomProvider(id);
}

export function setProviderEnabled(id: string, enabled: boolean) {
  const db = getDb();
  const now = Date.now();
  const configProvider = getConfigProvider(id);

  if (configProvider?.isBuiltin) {
    const exists = db
      .prepare(`SELECT id FROM builtin_provider_overrides WHERE id = ?`)
      .get(id);
    if (exists) {
      db.prepare(
        `UPDATE builtin_provider_overrides SET enabled=?, updatedAt=? WHERE id=?`
      ).run(enabled ? 1 : 0, now, id);
    } else {
      db.prepare(
        `INSERT INTO builtin_provider_overrides (id, baseUrl, imageBaseUrl, videoBaseUrl, apiKey, customHeaders, providerOptionsDefaults, nativeWebSearchDefaults, enabled, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, null, null, null, null, null, null, null, enabled ? 1 : 0, now);
    }
  } else {
    db.prepare(
      `UPDATE custom_providers SET enabled=?, updatedAt=? WHERE id=?`
    ).run(enabled ? 1 : 0, now, id);
  }
}


export function getProviderApiKey(providerId: string): string | null {
  const db = getDb();
  const configProvider = getConfigProvider(providerId);
  if (configProvider?.isBuiltin) {
    const row = db
      .prepare(`SELECT apiKey FROM builtin_provider_overrides WHERE id = ?`)
      .get(providerId) as { apiKey: string | null } | undefined;
    return row?.apiKey ? decrypt(row.apiKey) : null;
  }
  const row = db
    .prepare(`SELECT apiKey FROM custom_providers WHERE id = ?`)
    .get(providerId) as { apiKey: string | null } | undefined;
  return row?.apiKey ? decrypt(row.apiKey) : null;
}

function generateLocalApiKey(): string {
  return `lsk_${randomBytes(24).toString("base64url")}`;
}

function saveLocalProviderApiKey(apiKey: string): void {
  const db = getDb();
  const now = Date.now();
  const encrypted = encrypt(apiKey.trim());
  const row = db
    .prepare(`SELECT id FROM builtin_provider_overrides WHERE id = ?`)
    .get(LOCAL_PROVIDER_ID) as { id: string } | undefined;

  if (row) {
    db.prepare(`UPDATE builtin_provider_overrides SET apiKey = ?, updatedAt = ? WHERE id = ?`)
      .run(encrypted, now, LOCAL_PROVIDER_ID);
  } else {
    db.prepare(
      `INSERT INTO builtin_provider_overrides (id, baseUrl, imageBaseUrl, videoBaseUrl, apiKey, customHeaders, providerOptionsDefaults, nativeWebSearchDefaults, enabled, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(LOCAL_PROVIDER_ID, null, null, null, encrypted, null, null, null, 1, now);
  }
}

export function ensureLocalProviderApiKey(): string {
  const existing = getProviderApiKey(LOCAL_PROVIDER_ID);
  if (existing) return existing;

  const generated = generateLocalApiKey();
  saveLocalProviderApiKey(generated);
  return generated;
}

export function regenerateLocalProviderApiKey(): string {
  const generated = generateLocalApiKey();
  saveLocalProviderApiKey(generated);
  return generated;
}

export function setLocalProviderApiKey(apiKey: string): void {
  const normalized = apiKey.trim();
  if (!normalized) {
    throw new Error("Local provider apiKey cannot be empty");
  }
  saveLocalProviderApiKey(normalized);
}

/**
 * 获取 Provider 的 baseUrl（含 override）
 */
export function getProviderBaseUrl(providerId: string): string | null {
  const providers = listProviders();
  const p = providers.find((x) => x.id === providerId);
  return p?.baseUrl || null;
}

/**
 * 获取 Provider 的 customHeaders（合并后）
 */
export function getProviderCustomHeaders(
  providerId: string
): Record<string, string> | undefined {
  const providers = listProviders();
  const p = providers.find((x) => x.id === providerId);
  return p?.customHeaders;
}

export function resetProvider(providerId: string) {
  const db = getDb();
  const configProvider = getConfigProvider(providerId);
  if (!configProvider?.isBuiltin) {
    throw new Error(tMain("provider.builtinOnlyResettable"));
  }
  db.prepare(`DELETE FROM builtin_provider_overrides WHERE id = ?`).run(
    providerId
  );
  db.prepare(`DELETE FROM model_overrides WHERE providerId = ?`).run(
    providerId
  );
  db.prepare(`DELETE FROM provider_model_actions WHERE providerId = ?`).run(
    providerId
  );
  logger.info("Provider reset to defaults", { providerId });
}

export function updateModelDetails(
  providerId: string,
  modelId: string,
  updates: Partial<ProviderModel>
) {
  const model = resolveProviderModel(providerId, modelId);
  if (!model) throw new Error(tMain("model.notFound"));

  const normalizedModelType = updates.modelType;
  const thinkingUpdate = (updates as { thinking?: ProviderModel["thinking"] | null }).thinking;

  const detailUpdates = {
    modelType: updates.modelType,
    inputModalities: updates.inputModalities,
    outputModalities: updates.outputModalities,
    imageTasks: updates.imageTasks,
    image: updates.image,
    imageOptionSchema: updates.imageOptionSchema,
    video: updates.video,
    videoOptionSchema: updates.videoOptionSchema,
    providerOptionsDefaults: updates.providerOptionsDefaults,
    thinking: thinkingUpdate,
    nativeWebSearch: updates.nativeWebSearch,
  };

  const hasDetailsUpdates = Object.values(detailUpdates).some((value) => value !== undefined);
  const existingDetails = parseOverrideDetails(
    getModelOverride(providerId, modelId)?.detailsJson ?? null
  );
  const nextDetails = hasDetailsUpdates
    ? (() => {
        const next = { ...existingDetails };
        for (const [key, value] of Object.entries(detailUpdates)) {
          if (value === undefined) continue;
          if (value === null) {
            if (key === "thinking") {
              (next as Record<string, unknown>)[key] = null;
            } else {
              delete (next as Record<string, unknown>)[key];
            }
            continue;
          }
          (next as Record<string, unknown>)[key] = value as unknown;
        }
        return next;
      })()
    : existingDetails;

  upsertModelOverride(providerId, modelId, {
    type: normalizedModelType,
    detailsJson: hasDetailsUpdates ? JSON.stringify(nextDetails) : undefined,
  });
}

function parseOverrideDetails(detailsJson: string | null): Record<string, unknown> {
  if (!detailsJson) return {};
  try {
    const parsed = JSON.parse(detailsJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore invalid json
  }
  return {};
}

export function getModelDetails(providerId: string, modelId: string): ProviderModel | null {
  return resolveProviderModel(providerId, modelId);
}

export function resetModel(providerId: string, modelId: string): ProviderModel {
  return resetModelToDefault(providerId, modelId);
}
