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

const MEMORY_CHUNK_CONFIG: ChunkConfig = {
  targetMin: 700,
  targetMax: 1500,
  longParagraphThreshold: 2200,
  longParagraphWindow: 1400,
  overlap: 100,
};

type EmbeddingConfig = ResolvedEmbeddingInvocation;

export type HistoricalMemoryHit = HistoricalMemoryCandidate & {
  reason: string[];
};

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

async function indexTurnInternal(turnId: string, options?: { force?: boolean }): Promise<void> {
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
    chunks,
    embeddings,
    embeddingModel: embeddingConfig.modelKey,
    embeddingDimension: dimension,
  });

  logger.info("historical memory turn indexed", {
    turnId,
    sessionId: session.id,
    chunkCount: chunks.length,
    dimension,
  });
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

function hasHistoricalIntent(query: string): boolean {
  return /上次|之前|以前|刚才|历史|记得|我们讨论|聊过|提到过|previous|before|earlier|last time|remember|discussed/i.test(query);
}

function recencyBoost(updatedAt: number): number {
  const ageDays = Math.max(0, (Date.now() - updatedAt) / (24 * 60 * 60 * 1000));
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
  if (recencyBoost(hit.updatedAt) > 0) reason.push("recent");
  if (hit.accessCount > 0) reason.push("used-before");
  return reason.length > 0 ? reason : ["ranked"];
}

export async function searchHistoricalMemory(params: {
  sessionId: string;
  query: string;
  limit?: number;
}): Promise<HistoricalMemoryHit[]> {
  const settings = getMemorySettings();
  if (!settings.historicalEnabled) return [];

  const query = params.query.trim();
  if (!query) return [];

  const session = getSession(params.sessionId);
  if (!session || session.isTemporary) return [];

  let queryVector: number[] | null = null;
  const vectorRows: Array<{ chunkId: number; distance: number; rank: number }> = [];
  try {
    const embeddingConfig = await getEmbeddingConfig(
      settings.historicalEmbeddingModel,
      settings.historicalEmbeddingDimension,
      "background"
    );
    if (embeddingConfig) {
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
          Math.max(settings.historicalMaxRecall, params.limit ?? 3)
        ));
      }
    }
  } catch (error) {
    logger.warn("historical memory vector search unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const keywordRows = searchHistoricalMemoryKeywords(query, Math.max(settings.historicalMaxRecall, params.limit ?? 3));
  const candidateIds = Array.from(new Set([
    ...vectorRows.map((row) => row.chunkId),
    ...keywordRows.map((row) => row.chunkId),
  ]));
  if (candidateIds.length === 0) return [];

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
    const score =
      vectorScore * 0.65 +
      keywordScore * 0.25 +
      recencyBoost(chunk.updatedAt) +
      accessBoost(chunk.accessCount);
    return {
      ...chunk,
      vectorScore: vector ? vectorScore : undefined,
      keywordScore: keyword ? keywordScore : undefined,
      rrfScore,
      score,
      reason: [],
    };
  });

  const threshold = hasHistoricalIntent(query)
    ? Math.max(0, settings.historicalMinScore - 0.08)
    : settings.historicalMinScore;
  const limit = Math.max(1, Math.min(10, params.limit ?? settings.historicalMaxRecall));
  const selected = hits
    .filter((hit) => hit.score >= threshold || (hit.keywordScore ?? 0) >= 0.5)
    .sort((a, b) => b.score - a.score || b.rrfScore - a.rrfScore || b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((hit) => ({ ...hit, reason: buildReason(hit) }));

  touchHistoricalMemoryChunks(selected.map((hit) => hit.id));
  return selected;
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

  resetHistoricalMemoryIndex();

  let indexedTurns = 0;
  let failedTurns = 0;
  for (const row of rows) {
    try {
      await indexTurnInternal(row.turnId, { force: true });
      indexedTurns += 1;
    } catch (error) {
      failedTurns += 1;
      logger.error("historical memory rebuild turn failed", { turnId: row.turnId, error });
    }
  }

  const stats = getHistoricalMemoryIndexStats();
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
