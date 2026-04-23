import * as os from "node:os";
import { getDb } from "../db";
import { nanoid as nanoId } from "nanoid";
import { tMain } from "../../i18n";

const DEFAULT_SCENARIO_ID = "default-scenario";

export type Scenario = {
  id: string;
  name: string;
  description?: string;
  mode: 'chat' | 'agent';
  selectedModel: string;  // '__default__' 或 'providerId::modelId'
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  seed?: number;
  contextCount: number;
  maxOutputTokens?: number;
  systemPrompt?: string;
  mcpServerIds: string[];  // MCP 服务器 ID 列表
  mcpPolicy: 'auto' | 'manual' | 'off';  // MCP 默认策略
  skillPolicy: 'auto' | 'off';  // 技能默认策略
  maxToolSteps: number;  // 工具调用的最大步数，默认 20
  workingDirs: string[];  // 工作目录列表，用于 filesystem MCP 服务器
  kbIds: string[];  // 场景预选知识库 ID 列表
  kbRecallTopK: number;  // 知识库召回条数，默认 5，范围 1-50
  kbRecallMinScore: number;  // 知识库召回相似度下限，默认 0.75，范围 0-1，低于此值的结果不注入
  createdAt: number;
  updatedAt: number;
};

type ScenarioRow = {
  id: string;
  name: string;
  description: string | null;
  mode: string | null;
  selectedModel: string;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  presencePenalty: number | null;
  frequencyPenalty: number | null;
  stopSequences: string | null;
  seed: number | null;
  contextCount: number;
  maxOutputTokens: number | null;
  systemPrompt: string | null;
  mcpServerIds: string | null;
  mcpPolicy: string | null;
  skillPolicy: string | null;
  maxToolSteps: number;
  workingDirs: string | null;
  kbIds: string | null;
  kbRecallTopK: number | null;
  kbRecallMinScore: number | null;
  createdAt: number;
  updatedAt: number;
};

function normalizeOptionalTopK(value: number | null): number | undefined {
  if (value === null || !Number.isFinite(value)) return undefined;
  const normalized = Math.floor(value);
  return normalized < 1 ? 1 : normalized;
}

function rowToScenario(row: ScenarioRow): Scenario {
  let stopSequences: string[] | undefined;
  if (row.stopSequences) {
    try {
      const parsed = JSON.parse(row.stopSequences);
      if (Array.isArray(parsed)) {
        stopSequences = parsed
          .map((item) => String(item).trim())
          .filter((item) => item.length > 0);
      }
    } catch {
      stopSequences = undefined;
    }
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    mode: row.mode === 'agent' ? 'agent' : 'chat',
    selectedModel: row.selectedModel,
    temperature: row.temperature ?? undefined,
    topP: row.topP ?? undefined,
    topK: normalizeOptionalTopK(row.topK),
    presencePenalty: row.presencePenalty ?? undefined,
    frequencyPenalty: row.frequencyPenalty ?? undefined,
    stopSequences,
    seed: row.seed ?? undefined,
    contextCount: row.contextCount,
    maxOutputTokens: row.maxOutputTokens ?? undefined,
    systemPrompt: row.systemPrompt ?? undefined,
    mcpServerIds: row.mcpServerIds ? JSON.parse(row.mcpServerIds) : [],
    mcpPolicy: row.mcpPolicy === 'off' || row.mcpPolicy === 'manual' ? row.mcpPolicy : 'auto',
    skillPolicy: row.skillPolicy === 'off' ? 'off' : 'auto',
    maxToolSteps: row.maxToolSteps ?? 20, // 默认值 20
    workingDirs: row.workingDirs ? JSON.parse(row.workingDirs) : [],
    kbIds: row.kbIds ? JSON.parse(row.kbIds) : [],
    kbRecallTopK: row.kbRecallTopK ?? 5,
    kbRecallMinScore: row.kbRecallMinScore ?? 0.75,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

/**
 * 获取所有场景，按 updatedAt 降序排序
 */
export function listScenarios(): Scenario[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM scenarios ORDER BY updatedAt DESC`)
    .all() as ScenarioRow[];
  return rows.map(rowToScenario);
}

/**
 * 创建新场景
 */
export function createScenario(input: {
  name: string;
  description?: string;
  workingDirs?: string[];
}): Scenario {
  const db = getDb();
  const now = Date.now();
  const id = nanoId();

  db.prepare(
    `INSERT INTO scenarios (
      id, name, description, mode, selectedModel,
      temperature, topP, topK, presencePenalty, frequencyPenalty, stopSequences, seed, contextCount, maxOutputTokens,
      systemPrompt, mcpServerIds, mcpPolicy, skillPolicy, maxToolSteps, workingDirs, kbIds, kbRecallTopK, kbRecallMinScore, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.description ?? null,
    'chat',
    '__default__',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    10,
    null,
    null,
    '[]',
    'auto',
    'auto',
    20,
    JSON.stringify(input.workingDirs ?? [os.homedir()]),
    '[]',
    5,
    0.75,
    now,
    now
  );

  return getScenario(id)!;
}

function generateDuplicateScenarioName(sourceName: string): string {
  const db = getDb();
  const suffix = tMain("scenario.copySuffix");
  const baseName = `${sourceName} ${suffix}`;
  const existingNames = new Set(
    (db.prepare(`SELECT name FROM scenarios`).all() as Array<{ name: string }>)
      .map((row) => row.name)
  );

  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let index = 2;
  while (existingNames.has(`${baseName} ${index}`)) {
    index += 1;
  }
  return `${baseName} ${index}`;
}

/**
 * 复制场景，完整继承场景配置，只重置 id/name/createdAt/updatedAt。
 */
export function duplicateScenario(id: string): Scenario {
  const db = getDb();
  const source = getScenario(id);
  if (!source) {
    throw new Error(tMain("scenario.notFoundWithId", { scenarioId: id }));
  }

  const now = Date.now();
  const newId = nanoId();
  const name = generateDuplicateScenarioName(source.name);

  db.prepare(
    `INSERT INTO scenarios (
      id, name, description, mode, selectedModel,
      temperature, topP, topK, presencePenalty, frequencyPenalty, stopSequences, seed, contextCount, maxOutputTokens,
      systemPrompt, mcpServerIds, mcpPolicy, skillPolicy, maxToolSteps, workingDirs, kbIds, kbRecallTopK, kbRecallMinScore, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId,
    name,
    source.description ?? null,
    source.mode === 'agent' ? 'agent' : 'chat',
    source.selectedModel,
    source.temperature ?? null,
    source.topP ?? null,
    source.topK ?? null,
    source.presencePenalty ?? null,
    source.frequencyPenalty ?? null,
    source.stopSequences && source.stopSequences.length > 0 ? JSON.stringify(source.stopSequences) : null,
    source.seed ?? null,
    source.contextCount,
    source.maxOutputTokens ?? null,
    source.systemPrompt ?? null,
    JSON.stringify(source.mcpServerIds ?? []),
    source.mcpPolicy ?? 'auto',
    source.skillPolicy ?? 'auto',
    source.maxToolSteps ?? 20,
    JSON.stringify(source.workingDirs ?? []),
    JSON.stringify(source.kbIds ?? []),
    source.kbRecallTopK ?? 5,
    source.kbRecallMinScore ?? 0.75,
    now,
    now
  );

  return getScenario(newId)!;
}

/**
 * 获取单个场景
 */
export function getScenario(id: string): Scenario | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM scenarios WHERE id = ?`)
    .get(id) as ScenarioRow | undefined;
  return row ? rowToScenario(row) : null;
}

/**
 * 更新场景
 */
export function updateScenario(
  id: string,
  input: Partial<{
    name: string;
    description: string;
    mode: 'chat' | 'agent';
    selectedModel: string;
    temperature: number | null;
    topP: number | null;
    topK: number | null;
    presencePenalty: number | null;
    frequencyPenalty: number | null;
    stopSequences: string[] | null;
    seed: number | null;
    contextCount: number;
    maxOutputTokens: number | null;
    systemPrompt: string;
    mcpServerIds: string[];
    mcpPolicy: 'auto' | 'manual' | 'off';
    skillPolicy: 'auto' | 'off';
    maxToolSteps: number;
    workingDirs: string[];
    kbIds: string[];
    kbRecallTopK: number;
    kbRecallMinScore: number;
  }>
): Scenario {
  const db = getDb();
  const now = Date.now();

  const fields: string[] = [];
  const values: any[] = [];

  if (input.name !== undefined) {
    fields.push("name = ?");
    values.push(input.name);
  }
  if (input.description !== undefined) {
    fields.push("description = ?");
    values.push(input.description || null);
  }
  if (input.selectedModel !== undefined) {
    fields.push("selectedModel = ?");
    values.push(input.selectedModel);
  }
  if (input.mode !== undefined) {
    fields.push("mode = ?");
    values.push(input.mode === 'agent' ? 'agent' : 'chat');
  }
  if (input.temperature !== undefined) {
    fields.push("temperature = ?");
    values.push(input.temperature ?? null);
  }
  if (input.topP !== undefined) {
    fields.push("topP = ?");
    values.push(input.topP ?? null);
  }
  if (input.topK !== undefined) {
    fields.push("topK = ?");
    values.push(input.topK == null ? null : Math.max(1, Math.floor(input.topK)));
  }
  if (input.presencePenalty !== undefined) {
    fields.push("presencePenalty = ?");
    values.push(input.presencePenalty ?? null);
  }
  if (input.frequencyPenalty !== undefined) {
    fields.push("frequencyPenalty = ?");
    values.push(input.frequencyPenalty ?? null);
  }
  if (input.stopSequences !== undefined) {
    fields.push("stopSequences = ?");
    values.push(Array.isArray(input.stopSequences) && input.stopSequences.length > 0 ? JSON.stringify(input.stopSequences) : null);
  }
  if (input.seed !== undefined) {
    fields.push("seed = ?");
    values.push(input.seed ?? null);
  }
  if (input.contextCount !== undefined) {
    fields.push("contextCount = ?");
    values.push(input.contextCount);
  }
  if (input.maxOutputTokens !== undefined) {
    fields.push("maxOutputTokens = ?");
    values.push(input.maxOutputTokens == null ? null : Math.max(1, Math.floor(input.maxOutputTokens)));
  }
  if (input.systemPrompt !== undefined) {
    fields.push("systemPrompt = ?");
    values.push(input.systemPrompt || null);
  }
  if (input.mcpServerIds !== undefined) {
    fields.push("mcpServerIds = ?");
    values.push(JSON.stringify(input.mcpServerIds));
  }
  if (input.mcpPolicy !== undefined) {
    fields.push("mcpPolicy = ?");
    values.push(input.mcpPolicy);
  }
  if (input.skillPolicy !== undefined) {
    fields.push("skillPolicy = ?");
    values.push(input.skillPolicy);
  }
  if (input.maxToolSteps !== undefined) {
    fields.push("maxToolSteps = ?");
    values.push(input.maxToolSteps);
  }
  if (input.workingDirs !== undefined) {
    fields.push("workingDirs = ?");
    values.push(JSON.stringify(input.workingDirs));
  }
  if (input.kbIds !== undefined) {
    fields.push("kbIds = ?");
    values.push(JSON.stringify(input.kbIds));
  }
  if (input.kbRecallTopK !== undefined) {
    fields.push("kbRecallTopK = ?");
    values.push(input.kbRecallTopK);
  }
  if (input.kbRecallMinScore !== undefined) {
    fields.push("kbRecallMinScore = ?");
    values.push(input.kbRecallMinScore);
  }

  fields.push("updatedAt = ?");
  values.push(now);
  values.push(id);

  db.prepare(
    `UPDATE scenarios SET ${fields.join(", ")} WHERE id = ?`
  ).run(...values);

  return getScenario(id)!;
}

/**
 * 删除场景
 */
export function deleteScenario(id: string): void {
  const db = getDb();

  if (id === DEFAULT_SCENARIO_ID) {
    throw new Error("Default scenario cannot be deleted");
  }

  db.transaction(() => {
    const target = db
      .prepare(`SELECT id FROM scenarios WHERE id = ?`)
      .get(id) as { id: string } | undefined;
    if (!target) return;

    const defaultScenario = db
      .prepare(`SELECT id FROM scenarios WHERE id = ?`)
      .get(DEFAULT_SCENARIO_ID) as { id: string } | undefined;
    if (!defaultScenario) {
      throw new Error("Default scenario is missing");
    }
    const fallbackScenario = getScenario(DEFAULT_SCENARIO_ID);
    if (!fallbackScenario) {
      throw new Error("Default scenario is missing");
    }

    // 迁移场景引用到默认场景，不改 updatedAt，避免影响列表排序。
    db.prepare(`UPDATE projects SET scenarioId = ? WHERE scenarioId = ?`).run(
      DEFAULT_SCENARIO_ID,
      id
    );
    db.prepare(`
      UPDATE sessions
      SET scenarioId = ?,
          selectedModel = ?,
          mcpServerIds = ?,
          mcpPolicy = ?,
          mode = ?,
          toolApprovalMode = ?,
          skillPolicy = ?,
          kbIds = ?,
          contextCount = ?
      WHERE scenarioId = ?
    `).run(
      DEFAULT_SCENARIO_ID,
      '__scenario__',
      JSON.stringify(fallbackScenario.mcpServerIds ?? []),
      fallbackScenario.mcpPolicy ?? 'auto',
      fallbackScenario.mode ?? 'chat',
      'default',
      fallbackScenario.skillPolicy ?? 'auto',
      JSON.stringify(fallbackScenario.kbIds ?? []),
      fallbackScenario.contextCount ?? 10,
      id
    );

    db.prepare(`DELETE FROM scenarios WHERE id = ?`).run(id);
  })();
}
