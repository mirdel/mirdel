import { embed, embedMany } from "ai";
import { loggerServiceMain } from "@shared";
import type { Message } from "@shared";
import { getMemorySettings } from "../settings/settingsData";
import {
  resolveEmbeddingInvocation,
  type ResolvedEmbeddingInvocation,
} from "../providers/embeddingInvocation";
import type { ModelReferenceFailurePolicy } from "../providers/modelReference";
import { chunkText, type ChunkConfig } from "../knowledge/chunker";
import { getDb } from "../db";
import { getSession } from "./sessionData";
import { getMessagesByTurnId } from "./messageData";
import { getTurn } from "./turnData";
import {
  getHistoricalMemoryChunksByIds,
  getHistoricalMemoryIndexStats,
  listHistoricalMemoryByTimeRange,
  resetHistoricalMemoryIndex,
  saveHistoricalMemoryChunks,
  searchHistoricalMemoryKeywords,
  searchHistoricalMemoryVectors,
  serializeMessagePartsForMemoryIndex,
  touchHistoricalMemoryChunks,
  type HistoricalMemoryCandidate,
} from "./historicalMemoryData";

const logger = loggerServiceMain.withContext("historicalMemoryService");

const EMBED_BATCH_SIZE = 10;
const RRF_K = 60;
const MAX_CONTEXT_CHARS_PER_HIT = 1200;
const MAX_CONTEXT_TOTAL_CHARS = 3600;
const KEYWORD_ADMISSION_SCORE = 0.5;
const DAY_MS = 24 * 60 * 60 * 1000;

const MEMORY_CHUNK_CONFIG: ChunkConfig = {
  targetMin: 700,
  targetMax: 1500,
  longParagraphThreshold: 2200,
  longParagraphWindow: 1400,
  overlap: 100,
};

type EmbeddingConfig = ResolvedEmbeddingInvocation;

export type HistoricalMemoryRangePreset =
  | "anytime"
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "last_month"
  | "this_month"
  | "custom";

export interface HistoricalMemoryResolvedTimeRange {
  preset: HistoricalMemoryRangePreset;
  startAt?: number;
  endAt?: number;
  label: string;
}

export type HistoricalMemoryHit = HistoricalMemoryCandidate & {
  reason: string[];
};

export interface HistoricalMemoryTestRecallHit {
  chunkId: number;
  sessionId: string;
  sessionTitle: string;
  turnId: string;
  score: number;
  vectorScore?: number;
  keywordScore?: number;
  reason: string[];
  createdAt: number;
  updatedAt: number;
  contentPreview: string;
}

export interface HistoricalMemoryTestRecallResult {
  query: string;
  duration: number;
  stats: ReturnType<typeof getHistoricalMemoryIndexStats> & {
    currentEmbeddingModel: string | null;
  };
  settings: {
    enabled: boolean;
    maxRecall: number;
    minScore: number;
  };
  hits: HistoricalMemoryTestRecallHit[];
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addLocalDays(value: Date, days: number): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
}

function formatLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateBoundary(value: string | undefined, boundary: "start" | "end"): number | undefined {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      throw new Error(`invalid date: ${trimmed}`);
    }
    return boundary === "end" ? addLocalDays(date, 1).getTime() : date.getTime();
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`invalid date: ${trimmed}`);
  }
  return parsed;
}

export function resolveHistoricalMemoryTimeRange(input?: {
  range?: HistoricalMemoryRangePreset;
  startDate?: string;
  endDate?: string;
  now?: number;
}): HistoricalMemoryResolvedTimeRange {
  const preset = input?.range ?? "anytime";
  const now = Number.isFinite(input?.now) ? new Date(input?.now as number) : new Date();

  if (preset === "anytime") {
    return { preset, label: "anytime" };
  }

  if (preset === "custom") {
    const startAt = parseDateBoundary(input?.startDate, "start");
    const endAt = parseDateBoundary(input?.endDate, "end");
    if (startAt == null && endAt == null) {
      throw new Error("custom historical memory range requires startDate or endDate");
    }
    if (startAt != null && endAt != null && startAt >= endAt) {
      throw new Error("historical memory startDate must be earlier than endDate");
    }
    const startLabel = startAt != null ? formatLocalDate(new Date(startAt)) : "beginning";
    const endLabel = endAt != null ? formatLocalDate(new Date(endAt - 1)) : "now";
    return { preset, startAt, endAt, label: `${startLabel} to ${endLabel}` };
  }

  const todayStart = startOfLocalDay(now);
  if (preset === "today") {
    const end = addLocalDays(todayStart, 1);
    return {
      preset,
      startAt: todayStart.getTime(),
      endAt: end.getTime(),
      label: `today (${formatLocalDate(todayStart)})`,
    };
  }

  if (preset === "yesterday") {
    const start = addLocalDays(todayStart, -1);
    return {
      preset,
      startAt: start.getTime(),
      endAt: todayStart.getTime(),
      label: `yesterday (${formatLocalDate(start)})`,
    };
  }

  if (preset === "last_7_days") {
    const startAt = now.getTime() - 7 * DAY_MS;
    return {
      preset,
      startAt,
      endAt: now.getTime(),
      label: `last 7 days (${formatLocalDate(new Date(startAt))} to ${formatLocalDate(now)})`,
    };
  }

  if (preset === "last_30_days") {
    const startAt = now.getTime() - 30 * DAY_MS;
    return {
      preset,
      startAt,
      endAt: now.getTime(),
      label: `last 30 days (${formatLocalDate(new Date(startAt))} to ${formatLocalDate(now)})`,
    };
  }

  if (preset === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      preset,
      startAt: start.getTime(),
      endAt: end.getTime(),
      label: `last month (${formatLocalDate(start)} to ${formatLocalDate(addLocalDays(end, -1))})`,
    };
  }

  if (preset === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      preset,
      startAt: start.getTime(),
      endAt: now.getTime(),
      label: `this month (${formatLocalDate(start)} to ${formatLocalDate(now)})`,
    };
  }

  return { preset: "anytime", label: "anytime" };
}

async function getEmbeddingConfig(
  embeddingModel: string,
  embeddingDimension: number | null,
  failurePolicy: ModelReferenceFailurePolicy
): Promise<EmbeddingConfig | null> {
  return resolveEmbeddingInvocation({
    modelRef: embeddingModel,
    dimension: embeddingDimension,
    failurePolicy,
    emptyModelErrorKey: "historicalMemory.embeddingModelMissing",
  });
}

async function embedTexts(texts: string[], config: EmbeddingConfig): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: config.model,
      values: batch,
      providerOptions: config.providerOptions,
    });
    results.push(...embeddings);
  }

  return results;
}

async function embedQuery(text: string, config: EmbeddingConfig): Promise<number[]> {
  const { embedding } = await embed({
    model: config.model,
    value: text,
    providerOptions: config.providerOptions,
  });
  return embedding;
}

function roleText(messages: Message[], role: "user" | "assistant"): string {
  return messages
    .filter((message) => message.role === role && message.status === "success" && !message.isDeleted)
    .map((message) => serializeMessagePartsForMemoryIndex(message.parts))
    .filter(Boolean)
    .join("\n\n");
}

function buildTurnIndexText(input: {
  sessionTitle: string;
  createdAt: number;
  userText: string;
  assistantText: string;
}): string {
  const date = new Date(input.createdAt).toISOString();
  return [
    `Session: ${input.sessionTitle}`,
    `Time: ${date}`,
    "",
    `User:\n${input.userText}`,
    "",
    `Assistant:\n${input.assistantText}`,
  ].join("\n").trim();
}

function shouldSkipIndexText(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  return compact.length < 20;
}

async function indexTurnInternal(turnId: string, options?: { force?: boolean; suppressSuccessLog?: boolean }): Promise<void> {
  const settings = getMemorySettings();
  if (!settings.historicalEnabled && !options?.force) return;

  const turn = getTurn(turnId);
  if (!turn) return;
  const session = getSession(turn.sessionId);
  if (!session || session.isTemporary) return;

  const messages = getMessagesByTurnId(turnId);
  const userText = roleText(messages, "user");
  const assistantText = roleText(messages, "assistant");
  if (!userText.trim() && !assistantText.trim()) return;

  const indexText = buildTurnIndexText({
    sessionTitle: session.title,
    createdAt: turn.createdAt,
    userText,
    assistantText,
  });
  if (shouldSkipIndexText(indexText)) return;

  const chunks = chunkText(indexText, MEMORY_CHUNK_CONFIG).map((chunk) => chunk.content);
  if (chunks.length === 0) return;

  const embeddingConfig = await getEmbeddingConfig(
    settings.historicalEmbeddingModel,
    settings.historicalEmbeddingDimension,
    options?.force ? "foreground" : "background"
  );
  if (!embeddingConfig) return;
  const embeddings = await embedTexts(chunks, embeddingConfig);
  const dimension = embeddings[0]?.length ?? settings.historicalEmbeddingDimension ?? 0;
  if (dimension <= 0) throw new Error("embedding returned empty vector");

  const stats = getHistoricalMemoryIndexStats();
  if (stats.vectorReady && stats.embeddingModel && stats.embeddingModel !== embeddingConfig.modelKey) {
    logger.warn("historical memory index model mismatch, skip turn until rebuild", {
      turnId,
      indexModel: stats.embeddingModel,
      currentModel: embeddingConfig.modelKey,
    });
    return;
  }
  if (stats.vectorReady && stats.vectorDimension && stats.vectorDimension !== dimension) {
    logger.warn("historical memory index dimension mismatch, skip turn until rebuild", {
      turnId,
      indexDimension: stats.vectorDimension,
      currentDimension: dimension,
    });
    return;
  }

  saveHistoricalMemoryChunks({
    sessionId: session.id,
    sessionTitle: session.title,
    turnId,
    userMessageId: turn.userMessageId ?? null,
    assistantMessageId: turn.assistantMessageId ?? null,
    sourceCreatedAt: turn.createdAt,
    chunks,
    embeddings,
    embeddingModel: embeddingConfig.modelKey,
    embeddingDimension: dimension,
  });

  if (!options?.suppressSuccessLog) {
    logger.info("historical memory turn indexed", {
      turnId,
      sessionId: session.id,
      chunkCount: chunks.length,
      dimension,
    });
  }
}

let indexQueue: Promise<void> | null = null;

export function enqueueHistoricalMemoryIndexTask(params: { turnId: string }): void {
  const runCurrent = async () => {
    try {
      await indexTurnInternal(params.turnId);
    } catch (error) {
      logger.error("historical memory index task failed", {
        turnId: params.turnId,
        error,
      });
    }
  };

  const next = (indexQueue ?? Promise.resolve())
    .catch((error) => {
      logger.error("historical memory previous index task failed, continue queue", { error });
    })
    .then(runCurrent);

  indexQueue = next;
  next.finally(() => {
    if (indexQueue === next) indexQueue = null;
  });
}

function recencyBoost(sourceCreatedAt: number): number {
  const ageDays = Math.max(0, (Date.now() - sourceCreatedAt) / (24 * 60 * 60 * 1000));
  if (ageDays <= 7) return 0.06;
  if (ageDays <= 30) return 0.03;
  return 0;
}

function accessBoost(accessCount: number): number {
  return Math.min(0.04, Math.log1p(Math.max(0, accessCount)) * 0.01);
}

function buildReason(hit: HistoricalMemoryHit): string[] {
  const reason: string[] = [];
  if ((hit.vectorScore ?? 0) >= 0.5) reason.push("semantic");
  if ((hit.keywordScore ?? 0) >= 0.25) reason.push("keyword");
  if (recencyBoost(hit.createdAt) > 0) reason.push("recent");
  if (hit.accessCount > 0) reason.push("used-before");
  return reason.length > 0 ? reason : ["ranked"];
}

function passesHistoricalMemoryAdmission(hit: HistoricalMemoryHit, minScore: number): boolean {
  return (hit.vectorScore ?? 0) >= minScore || (hit.keywordScore ?? 0) >= KEYWORD_ADMISSION_SCORE;
}

async function searchHistoricalMemoryInternal(params: {
  sessionId?: string;
  query: string;
  limit?: number;
  excludeSessionId?: string;
  timeRange?: HistoricalMemoryResolvedTimeRange;
  requireSession?: boolean;
  respectEnabled?: boolean;
  failurePolicy?: ModelReferenceFailurePolicy;
  touchAccessCount?: boolean;
}): Promise<{
  hits: HistoricalMemoryHit[];
  currentEmbeddingModel: string | null;
}> {
  const settings = getMemorySettings();
  if (params.respectEnabled !== false && !settings.historicalEnabled) {
    return { hits: [], currentEmbeddingModel: null };
  }

  const query = params.query.trim();
  if (!query) return { hits: [], currentEmbeddingModel: null };

  if (params.requireSession !== false) {
    const session = params.sessionId ? getSession(params.sessionId) : null;
    if (!session || session.isTemporary) return { hits: [], currentEmbeddingModel: null };
  }

  let queryVector: number[] | null = null;
  let currentEmbeddingModel: string | null = null;
  const vectorRows: Array<{ chunkId: number; distance: number; rank: number }> = [];
  const failurePolicy = params.failurePolicy ?? "background";
  const searchFilter = {
    excludeSessionId: params.excludeSessionId,
    startAt: params.timeRange?.startAt,
    endAt: params.timeRange?.endAt,
  };
  try {
    const embeddingConfig = await getEmbeddingConfig(
      settings.historicalEmbeddingModel,
      settings.historicalEmbeddingDimension,
      failurePolicy
    );
    if (embeddingConfig) {
      currentEmbeddingModel = embeddingConfig.modelKey;
      queryVector = await embedQuery(query, embeddingConfig);
      const stats = getHistoricalMemoryIndexStats();
      if (stats.vectorReady && stats.embeddingModel && stats.embeddingModel !== embeddingConfig.modelKey) {
        logger.warn("historical memory vector search model mismatch, keyword fallback only", {
          indexModel: stats.embeddingModel,
          currentModel: embeddingConfig.modelKey,
        });
      } else {
        vectorRows.push(...searchHistoricalMemoryVectors(
          queryVector,
          embeddingConfig.modelKey,
          Math.max(settings.historicalMaxRecall, params.limit ?? 3),
          searchFilter
        ));
      }
    }
  } catch (error) {
    if (failurePolicy === "foreground") {
      throw error;
    }
    logger.warn("historical memory vector search unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const keywordRows = searchHistoricalMemoryKeywords(
    query,
    Math.max(settings.historicalMaxRecall, params.limit ?? 3),
    searchFilter
  );
  const candidateIds = Array.from(new Set([
    ...vectorRows.map((row) => row.chunkId),
    ...keywordRows.map((row) => row.chunkId),
  ]));
  if (candidateIds.length === 0) return { hits: [], currentEmbeddingModel };

  const vectorById = new Map(vectorRows.map((row) => [row.chunkId, row]));
  const keywordById = new Map(keywordRows.map((row) => [row.chunkId, row]));
  const chunks = getHistoricalMemoryChunksByIds(candidateIds);

  const hits = chunks.map((chunk): HistoricalMemoryHit => {
    const vector = vectorById.get(chunk.id);
    const keyword = keywordById.get(chunk.id);
    const vectorScore = vector ? Math.max(0, 1 - vector.distance) : 0;
    const keywordScore = keyword ? 1 / keyword.rank : 0;
    const rrfScore =
      (vector ? 1 / (RRF_K + vector.rank) : 0) +
      (keyword ? 1 / (RRF_K + keyword.rank) : 0);
    const score = Math.min(1,
      Math.max(vectorScore, keywordScore * 0.75) +
      recencyBoost(chunk.createdAt) +
      accessBoost(chunk.accessCount)
    );
    return {
      ...chunk,
      vectorScore: vector ? vectorScore : undefined,
      keywordScore: keyword ? keywordScore : undefined,
      rrfScore,
      score,
      reason: [],
    };
  });

  const limit = Math.max(1, Math.min(20, params.limit ?? settings.historicalMaxRecall));
  const selected = hits
    .filter((hit) => passesHistoricalMemoryAdmission(hit, settings.historicalMinScore))
    .sort((a, b) => b.score - a.score || b.rrfScore - a.rrfScore || b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((hit) => ({ ...hit, reason: buildReason(hit) }));

  if (params.touchAccessCount !== false) {
    touchHistoricalMemoryChunks(selected.map((hit) => hit.id));
  }
  return { hits: selected, currentEmbeddingModel };
}

export async function searchHistoricalMemory(params: {
  sessionId: string;
  query: string;
  limit?: number;
  excludeSessionId?: string;
  timeRange?: HistoricalMemoryResolvedTimeRange;
}): Promise<HistoricalMemoryHit[]> {
  const result = await searchHistoricalMemoryInternal({
    ...params,
    requireSession: true,
    respectEnabled: true,
    failurePolicy: "background",
    touchAccessCount: true,
  });
  return result.hits;
}

export async function reviewHistoricalMemory(params: {
  sessionId: string;
  timeRange: HistoricalMemoryResolvedTimeRange;
  limit?: number;
  excludeSessionId?: string;
}): Promise<HistoricalMemoryHit[]> {
  const settings = getMemorySettings();
  if (!settings.historicalEnabled) return [];

  const session = getSession(params.sessionId);
  if (!session || session.isTemporary) return [];

  const limit = Math.max(1, Math.min(30, Math.floor(params.limit ?? 20)));
  const chunks = listHistoricalMemoryByTimeRange(limit, {
    excludeSessionId: params.excludeSessionId,
    startAt: params.timeRange.startAt,
    endAt: params.timeRange.endAt,
  });

  const hits = chunks.map((chunk): HistoricalMemoryHit => ({
    ...chunk,
    score: Math.min(1, 0.5 + recencyBoost(chunk.createdAt) + accessBoost(chunk.accessCount)),
    reason: ["time-range"],
  }));

  touchHistoricalMemoryChunks(hits.map((hit) => hit.id));
  return hits;
}

function toTestRecallHit(hit: HistoricalMemoryHit): HistoricalMemoryTestRecallHit {
  return {
    chunkId: hit.id,
    sessionId: hit.sessionId,
    sessionTitle: hit.sessionTitle,
    turnId: hit.turnId,
    score: hit.score,
    vectorScore: hit.vectorScore,
    keywordScore: hit.keywordScore,
    reason: hit.reason,
    createdAt: hit.createdAt,
    updatedAt: hit.updatedAt,
    contentPreview: hit.content.length > 800
      ? `${hit.content.slice(0, 800).trimEnd()}...`
      : hit.content,
  };
}

export async function testHistoricalMemoryRecall(query: string): Promise<HistoricalMemoryTestRecallResult> {
  const startedAt = Date.now();
  const settings = getMemorySettings();
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error("query is required");
  }

  const result = await searchHistoricalMemoryInternal({
    query: trimmedQuery,
    limit: settings.historicalMaxRecall,
    requireSession: false,
    respectEnabled: false,
    failurePolicy: "foreground",
    touchAccessCount: false,
  });
  const stats = getHistoricalMemoryIndexStats();

  return {
    query: trimmedQuery,
    duration: Date.now() - startedAt,
    stats: {
      ...stats,
      currentEmbeddingModel: result.currentEmbeddingModel,
    },
    settings: {
      enabled: settings.historicalEnabled,
      maxRecall: settings.historicalMaxRecall,
      minScore: settings.historicalMinScore,
    },
    hits: result.hits.map(toTestRecallHit),
  };
}

export function formatHistoricalMemoryContext(hits: HistoricalMemoryHit[]): string {
  if (hits.length === 0) return "";

  let totalChars = 0;
  const blocks: string[] = [];
  for (const hit of hits) {
    const content = hit.content.length > MAX_CONTEXT_CHARS_PER_HIT
      ? `${hit.content.slice(0, MAX_CONTEXT_CHARS_PER_HIT).trimEnd()}\n...`
      : hit.content;
    if (totalChars + content.length > MAX_CONTEXT_TOTAL_CHARS) break;
    totalChars += content.length;
    blocks.push([
      `Source: ${hit.sessionTitle || hit.sessionId}`,
      `Time: ${new Date(hit.createdAt).toISOString()}`,
      `Reason: ${hit.reason.join(", ")}`,
      "",
      content,
    ].join("\n"));
  }

  return blocks.join("\n\n---\n\n");
}

export async function rebuildHistoricalMemoryIndex(): Promise<{
  indexedTurns: number;
  indexedChunks: number;
  failedTurns: number;
}> {
  const settings = getMemorySettings();
  await getEmbeddingConfig(
    settings.historicalEmbeddingModel,
    settings.historicalEmbeddingDimension,
    "foreground"
  );

  const db = getDb();
  const rows = db.prepare(`
    SELECT t.id AS turnId
    FROM turns t
    JOIN sessions s ON s.id = t.sessionId
    JOIN messages um ON um.id = t.userMessageId
    JOIN messages am ON am.id = t.assistantMessageId
    WHERE t.status = 'success'
      AND (s.isTemporary IS NULL OR s.isTemporary = 0)
      AND um.status = 'success'
      AND am.status = 'success'
      AND um.isDeleted = 0
      AND am.isDeleted = 0
    ORDER BY t.createdAt ASC
  `).all() as Array<{ turnId: string }>;

  const startedAt = Date.now();
  logger.info("historical memory rebuild started", {
    turnCount: rows.length,
    embeddingModel: settings.historicalEmbeddingModel,
    embeddingDimension: settings.historicalEmbeddingDimension,
  });

  resetHistoricalMemoryIndex();

  let indexedTurns = 0;
  let failedTurns = 0;
  for (const row of rows) {
    try {
      await indexTurnInternal(row.turnId, { force: true, suppressSuccessLog: true });
      indexedTurns += 1;
      if (indexedTurns % 50 === 0) {
        logger.info("historical memory rebuild progress", {
          indexedTurns,
          failedTurns,
          totalTurns: rows.length,
        });
      }
    } catch (error) {
      failedTurns += 1;
      logger.error("historical memory rebuild turn failed", { turnId: row.turnId, error });
    }
  }

  const stats = getHistoricalMemoryIndexStats();
  logger.info("historical memory rebuild completed", {
    indexedTurns,
    indexedChunks: stats.chunkCount,
    failedTurns,
    duration: Date.now() - startedAt,
  });

  return {
    indexedTurns,
    indexedChunks: stats.chunkCount,
    failedTurns,
  };
}

export function getHistoricalMemoryStats() {
  return getHistoricalMemoryIndexStats();
}

export function clearHistoricalMemoryIndex(): void {
  resetHistoricalMemoryIndex();
}
