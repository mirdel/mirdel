/**
 * 常用模型列表服务
 * 合并逻辑：config.models 中默认可见的模型（未被 remove）∪ provider_model_actions（action=add）
 * model_overrides 仅用于 model 配置覆盖
 */

import { getDb } from "../db";
import { getProvider as getConfigProvider } from "../models/ConfigManager";
import {
  inferModelTypeFromId,
  type Model,
  type ProviderModel,
  type ModelModality,
  type ModelType,
} from "@shared";

type ModelActionRow = {
  providerId: string;
  modelId: string;
  action: string;
  type: string | null; // 存储 modelType
  updatedAt: number;
};

type ModelOverrideRow = {
  providerId: string;
  modelId: string;
  type: string | null;
  detailsJson: string | null;
};

type ProviderModelDetails = Omit<ProviderModel, "id">;
type SnapshotBaseMatch = { id: string; model: ProviderModel };

export type AddModelToCommonResult = {
  model: ProviderModel;
  copiedFromBase: boolean;
  baseModelId?: string;
};

type ResolveInitialModelConfigResult = {
  modelType: ModelType;
  details: Partial<ProviderModelDetails>;
  copiedFromBase: boolean;
  baseModelId?: string;
  source: "copy" | "exact" | "snapshot" | "inferred";
};

const SNAPSHOT_SUFFIX_PATTERN =
  /(?:-|_)(?:20\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])|20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])|(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])|(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))$/;

function normalizeModelType(value: string | undefined | null): ModelType {
  if (value === "embedding" || value === "rerank" || value === "generative") return value;
  return "generative";
}

function deriveDefaults(model: ProviderModel): ProviderModel {
  const modelType = normalizeModelType(model.modelType);

  const inputModalities: ModelModality[] =
    model.inputModalities && model.inputModalities.length > 0
      ? model.inputModalities
      : ["text"];

  const outputModalities: ModelModality[] =
    model.outputModalities && model.outputModalities.length > 0
      ? model.outputModalities
      : ["text"];

  return {
    ...model,
    modelType,
    inputModalities,
    outputModalities,
  };
}

function configModelToProviderModel(model: Model): ProviderModel {
  return {
    id: model.id,
    modelType: normalizeModelType(model.modelType),
    inputModalities: model.inputModalities,
    outputModalities: model.outputModalities,
    imageTasks: model.imageTasks,
    image: model.image,
    imageOptionSchema: model.imageOptionSchema,
    video: model.video,
    videoOptionSchema: model.videoOptionSchema,
    providerOptionsDefaults: model.providerOptionsDefaults,
    thinking: model.thinking,
    nativeWebSearch: model.nativeWebSearch,
  };
}

function isShownInModelListByDefault(model: Model): boolean {
  return model.showInModelListByDefault !== false;
}

function parseDetailsJson(detailsJson: string | null): Partial<ProviderModelDetails> {
  if (!detailsJson) return {};
  try {
    const parsed = JSON.parse(detailsJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Partial<ProviderModelDetails>;
    }
  } catch {
    // ignore invalid override payload
  }
  return {};
}

function mergeModelWithOverride(
  model: ProviderModel,
  override: ModelOverrideRow | undefined
): ProviderModel {
  if (!override) return deriveDefaults(model);
  const details = parseDetailsJson(override.detailsJson);
  const merged = {
    ...model,
    ...(override.type ? { modelType: normalizeModelType(override.type) } : {}),
    ...details,
  } as ProviderModel & { thinking?: ProviderModel["thinking"] | null };

  if ((details as Record<string, unknown>).thinking === null) {
    delete merged.thinking;
  }

  return deriveDefaults(merged);
}

function listModelActions(providerId: string): ModelActionRow[] {
  return getDb()
    .prepare(
      `SELECT providerId, modelId, action, type FROM provider_model_actions WHERE providerId = ?`
    )
    .all(providerId) as ModelActionRow[];
}

function listModelOverrides(providerId: string): Map<string, ModelOverrideRow> {
  const typeOverrides = getDb()
    .prepare(
      `SELECT providerId, modelId, type, detailsJson FROM model_overrides WHERE providerId = ?`
    )
    .all(providerId) as ModelOverrideRow[];
  return new Map(typeOverrides.map((o) => [o.modelId, o]));
}

function actionRowToProviderModel(action: ModelActionRow): ProviderModel {
  return {
    id: action.modelId,
    modelType: normalizeModelType(action.type || "generative"),
  };
}

function getConfigModelMap(configModels: Model[]): Map<string, Model> {
  return new Map(configModels.map((model) => [model.id, model]));
}

function getProviderConfigModels(providerId: string): Model[] {
  return getConfigProvider(providerId)?.models ?? [];
}

function deriveSnapshotBaseCandidates(modelId: string): string[] {
  const normalizedId = modelId.trim();
  if (!normalizedId) return [];
  const match = normalizedId.match(SNAPSHOT_SUFFIX_PATTERN);
  if (!match || match.index == null) return [];
  const candidate = normalizedId.slice(0, match.index).trim();
  if (!candidate || candidate === normalizedId) return [];
  return [candidate];
}

function resolveSnapshotBaseMatch(
  providerId: string,
  modelId: string,
  configModels: Model[]
): SnapshotBaseMatch | null {
  const candidates = deriveSnapshotBaseCandidates(modelId);
  for (const candidateId of candidates) {
    const model = getModelFromCatalog(providerId, candidateId, configModels);
    if (model) {
      return { id: candidateId, model };
    }
  }
  return null;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildCopiedDetails(baseModel: ProviderModel): Partial<ProviderModelDetails> {
  const details: Partial<ProviderModelDetails> = {};
  if (baseModel.inputModalities !== undefined) details.inputModalities = cloneValue(baseModel.inputModalities);
  if (baseModel.outputModalities !== undefined) details.outputModalities = cloneValue(baseModel.outputModalities);
  if (baseModel.imageTasks !== undefined) details.imageTasks = cloneValue(baseModel.imageTasks);
  if (baseModel.image !== undefined) details.image = cloneValue(baseModel.image);
  if (baseModel.imageOptionSchema !== undefined) details.imageOptionSchema = cloneValue(baseModel.imageOptionSchema);
  if (baseModel.video !== undefined) details.video = cloneValue(baseModel.video);
  if (baseModel.videoOptionSchema !== undefined) details.videoOptionSchema = cloneValue(baseModel.videoOptionSchema);
  if (baseModel.providerOptionsDefaults !== undefined) {
    details.providerOptionsDefaults = cloneValue(baseModel.providerOptionsDefaults);
  }
  if (baseModel.thinking !== undefined) details.thinking = cloneValue(baseModel.thinking);
  if (baseModel.nativeWebSearch !== undefined) details.nativeWebSearch = cloneValue(baseModel.nativeWebSearch);
  return details;
}

function inferNewModelPayload(
  modelId: string,
  modelTypeHint: ModelType
): Partial<ProviderModel> & { modelType: ModelType } {
  const normalizedId = modelId.trim();
  const lower = normalizedId.toLowerCase();
  const normalizedHint = normalizeModelType(modelTypeHint);
  const modelTypeFromId = inferModelTypeFromId(normalizedId);
  const modelType = normalizedHint === "generative" ? modelTypeFromId : normalizedHint;

  if (modelType !== "generative") {
    return {
      modelType,
      inputModalities: ["text"],
      outputModalities: ["text"],
      nativeWebSearch: true,
    };
  }

  const hasGenericImageToken = /(?:^|[-_/])image(?:[-_/]|$)/.test(lower);
  const hasKnownImageFamily = /(gpt-image|imagen|cogview|glm-image|qwen-image|z-image|wan2|wanx)/.test(lower);
  const hasImageEditHint = /(img2img|i2i|inpaint)/.test(lower);
  const hasImageHint = hasGenericImageToken || hasKnownImageFamily || hasImageEditHint;
  if (!hasImageHint) {
    return {
      modelType,
      inputModalities: ["text"],
      outputModalities: ["text"],
      nativeWebSearch: true,
    };
  }

  const baseImagePayload = {
    modelType,
    outputModalities: ["image"] as ModelModality[],
  };

  if (/inpaint/.test(lower)) {
    return {
      ...baseImagePayload,
      inputModalities: ["text", "image", "mask"],
      imageTasks: ["image_edit", "inpaint"],
      nativeWebSearch: true,
    };
  }

  if (/(img2img|i2i)/.test(lower)) {
    return {
      ...baseImagePayload,
      inputModalities: ["text", "image"],
      imageTasks: ["image_to_image"],
      nativeWebSearch: true,
    };
  }

  if (/(imageedit|image-edit|edit)/.test(lower)) {
    return {
      ...baseImagePayload,
      inputModalities: ["text", "image"],
      imageTasks: ["image_edit"],
      nativeWebSearch: true,
    };
  }

  // Image-like IDs that do not match a more specific edit/i2i pattern default to text-to-image.
  return {
    ...baseImagePayload,
    inputModalities: ["text"],
    imageTasks: ["text_to_image"],
    nativeWebSearch: true,
  };
}

function payloadToOverrideDetails(
  payload: Partial<ProviderModel> & { modelType: ModelType }
): Partial<ProviderModelDetails> {
  const { modelType: _modelType, ...rest } = payload;
  const details: Partial<ProviderModelDetails> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    (details as Record<string, unknown>)[key] = value;
  }
  return details;
}

function getModelAfterAdd(
  providerId: string,
  modelId: string,
  configModels: Model[],
  fallbackType: ModelType,
  fallbackDetails?: Partial<ProviderModelDetails>
): ProviderModel {
  return (
    getModelFromCatalog(providerId, modelId, configModels) ??
    deriveDefaults({
      id: modelId,
      modelType: fallbackType,
      ...(fallbackDetails ?? {}),
    })
  );
}

function getExactConfigModel(
  configModels: Model[],
  modelId: string
): ProviderModel | null {
  const exact = configModels.find((model) => model.id === modelId);
  return exact ? configModelToProviderModel(exact) : null;
}

function resolveInitialModelConfig(
  providerId: string,
  modelId: string,
  modelTypeHint: ModelType = "generative",
  options?: { copyFromModelId?: string }
): ResolveInitialModelConfigResult {
  const normalizedModelId = modelId.trim();
  const configModels = getProviderConfigModels(providerId);
  const copyFromModelId = options?.copyFromModelId?.trim();
  const copySourceModel = copyFromModelId
    ? getModelFromCatalog(providerId, copyFromModelId, configModels)
    : null;
  if (copySourceModel) {
    return {
      modelType: normalizeModelType(copySourceModel.modelType),
      details: buildCopiedDetails(copySourceModel),
      copiedFromBase: false,
      source: "copy",
    };
  }

  const exactConfigModel = getExactConfigModel(configModels, normalizedModelId);
  if (exactConfigModel) {
    return {
      modelType: normalizeModelType(exactConfigModel.modelType),
      details: buildCopiedDetails(exactConfigModel),
      copiedFromBase: false,
      source: "exact",
    };
  }

  const snapshotBase = resolveSnapshotBaseMatch(providerId, normalizedModelId, configModels);
  if (snapshotBase) {
    return {
      modelType: normalizeModelType(snapshotBase.model.modelType),
      details: buildCopiedDetails(snapshotBase.model),
      copiedFromBase: true,
      baseModelId: snapshotBase.id,
      source: "snapshot",
    };
  }

  const inferredPayload = inferNewModelPayload(normalizedModelId, modelTypeHint);
  return {
    modelType: normalizeModelType(inferredPayload.modelType),
    details: payloadToOverrideDetails(inferredPayload),
    copiedFromBase: false,
    source: "inferred",
  };
}

function getAddedActionType(providerId: string, modelId: string): ModelType | null {
  const action = getDb()
    .prepare(
      `SELECT type FROM provider_model_actions WHERE providerId = ? AND modelId = ? AND action = 'add'`
    )
    .get(providerId, modelId) as { type: string | null } | undefined;
  if (!action?.type) return null;
  return normalizeModelType(action.type);
}

/** 获取 provider 的常用模型列表（内置：config + actions；自定义：仅 actions） */
export function getCommonModels(
  providerId: string,
  configModels: Model[]
): ProviderModel[] {
  const actions = listModelActions(providerId);
  const removedIds = new Set(
    actions.filter((a) => a.action === "remove").map((a) => a.modelId)
  );
  const addedMap = new Map(
    actions.filter((a) => a.action === "add").map((a) => [a.modelId, a])
  );
  const overrideMap = listModelOverrides(providerId);
  const configModelMap = getConfigModelMap(configModels);

  const visibleConfigModels = configModels.filter(
    (model) => isShownInModelListByDefault(model) && !removedIds.has(model.id)
  );
  const visibleConfigIds = new Set(visibleConfigModels.map((model) => model.id));

  const result: ProviderModel[] = [
    ...visibleConfigModels.map((model) =>
      mergeModelWithOverride(configModelToProviderModel(model), overrideMap.get(model.id))
    ),
    ...Array.from(addedMap.values())
      .filter((action) => !visibleConfigIds.has(action.modelId))
      .map((action) => {
        const configModel = configModelMap.get(action.modelId);
        const baseModel = configModel
          ? configModelToProviderModel(configModel)
          : actionRowToProviderModel(action);
        return mergeModelWithOverride(baseModel, overrideMap.get(action.modelId));
      }),
  ];
  return result;
}

export function getModelFromCatalog(
  providerId: string,
  modelId: string,
  configModels: Model[]
): ProviderModel | null {
  const configModel = configModels.find((model) => model.id === modelId);
  if (configModel) {
    return mergeModelWithOverride(
      configModelToProviderModel(configModel),
      getModelOverride(providerId, modelId) ?? undefined
    );
  }

  const action = getDb()
    .prepare(
      `SELECT providerId, modelId, action, type FROM provider_model_actions WHERE providerId = ? AND modelId = ?`
    )
    .get(providerId, modelId) as ModelActionRow | undefined;

  if (action?.action === "add") {
    return mergeModelWithOverride(
      actionRowToProviderModel(action),
      getModelOverride(providerId, modelId) ?? undefined
    );
  }

  return null;
}

/** 添加模型到常用列表 */
export function addModelToCommon(
  providerId: string,
  modelId: string,
  modelType: ModelType = "generative",
  options?: { copyFromModelId?: string }
): AddModelToCommonResult {
  const db = getDb();
  const now = Date.now();
  const normalizedModelId = modelId.trim();
  const configModels = getProviderConfigModels(providerId);
  const resolved = resolveInitialModelConfig(
    providerId,
    normalizedModelId,
    modelType,
    options
  );

  db.prepare(
    `INSERT OR REPLACE INTO provider_model_actions (providerId, modelId, action, type, updatedAt)
     VALUES (?, ?, 'add', ?, ?)`
  ).run(providerId, normalizedModelId, resolved.modelType, now);

  if (resolved.source !== "exact") {
    upsertModelOverride(providerId, normalizedModelId, {
      type: resolved.modelType,
      detailsJson: JSON.stringify(resolved.details),
    });
  }

  return {
    model: getModelAfterAdd(
      providerId,
      normalizedModelId,
      configModels,
      resolved.modelType,
      resolved.details
    ),
    copiedFromBase: resolved.copiedFromBase,
    ...(resolved.baseModelId ? { baseModelId: resolved.baseModelId } : {}),
  };
}

export function resetModelToDefault(
  providerId: string,
  modelId: string,
  modelTypeHint: ModelType = "generative"
): ProviderModel {
  const db = getDb();
  const now = Date.now();
  const normalizedModelId = modelId.trim();
  const configModels = getProviderConfigModels(providerId);
  const exactConfigModel = getExactConfigModel(configModels, normalizedModelId);

  if (exactConfigModel) {
    db.prepare(`DELETE FROM model_overrides WHERE id = ?`).run(
      `${providerId}:${normalizedModelId}`
    );
    return getModelAfterAdd(
      providerId,
      normalizedModelId,
      configModels,
      normalizeModelType(exactConfigModel.modelType),
      buildCopiedDetails(exactConfigModel)
    );
  }

  const actionTypeHint = getAddedActionType(providerId, normalizedModelId);
  const resolved = resolveInitialModelConfig(
    providerId,
    normalizedModelId,
    actionTypeHint ?? modelTypeHint
  );
  db.prepare(
    `INSERT OR REPLACE INTO provider_model_actions (providerId, modelId, action, type, updatedAt)
     VALUES (?, ?, 'add', ?, ?)`
  ).run(providerId, normalizedModelId, resolved.modelType, now);
  upsertModelOverride(providerId, normalizedModelId, {
    type: resolved.modelType,
    detailsJson: JSON.stringify(resolved.details),
  });

  return getModelAfterAdd(
    providerId,
    normalizedModelId,
    configModels,
    resolved.modelType,
    resolved.details
  );
}

/** 从常用列表移除模型 */
export function removeModelFromCommon(
  providerId: string,
  modelId: string
): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT OR REPLACE INTO provider_model_actions (providerId, modelId, action, type, updatedAt)
     VALUES (?, ?, 'remove', NULL, ?)`
  ).run(providerId, modelId, now);
}

/** 更新 model 的 modelType（model_overrides.type） */
export function updateModelType(
  providerId: string,
  modelId: string,
  modelType: string
): void {
  upsertModelOverride(providerId, modelId, { type: modelType });
}

export function getModelOverride(
  providerId: string,
  modelId: string
): ModelOverrideRow | null {
  const db = getDb();
  const id = `${providerId}:${modelId}`;
  const row = db
    .prepare(`SELECT providerId, modelId, type, detailsJson FROM model_overrides WHERE id = ?`)
    .get(id) as ModelOverrideRow | undefined;
  return row ?? null;
}

export function upsertModelOverride(
  providerId: string,
  modelId: string,
  updates: { type?: string; detailsJson?: string | null }
): void {
  if (updates.type === undefined && updates.detailsJson === undefined) return;
  const db = getDb();
  const now = Date.now();
  const id = `${providerId}:${modelId}`;
  const existing = db
    .prepare(`SELECT id, type, detailsJson FROM model_overrides WHERE id = ?`)
    .get(id) as { id: string; type: string | null; detailsJson: string | null } | undefined;
  const nextType = updates.type ?? existing?.type ?? "generative";
  const nextDetailsJson =
    updates.detailsJson !== undefined ? updates.detailsJson : existing?.detailsJson ?? null;

  if (existing) {
    db.prepare(`UPDATE model_overrides SET type = ?, detailsJson = ?, updatedAt = ? WHERE id = ?`).run(
      nextType,
      nextDetailsJson,
      now,
      id
    );
  } else {
    db.prepare(
      `INSERT INTO model_overrides (id, providerId, modelId, type, detailsJson, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, providerId, modelId, nextType, nextDetailsJson, now);
  }
}
