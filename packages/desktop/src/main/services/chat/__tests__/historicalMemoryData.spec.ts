import { describe, expect, it } from "vitest";
import { createSession } from "../sessionData";
import {
  createHistoricalMemoryVectorIndex,
  deleteHistoricalMemoryByMessageId,
  deleteHistoricalMemoryBySessionId,
  getHistoricalMemoryChunksByIds,
  getHistoricalMemoryIndexStats,
  saveHistoricalMemoryChunks,
  searchHistoricalMemoryKeywords,
  searchHistoricalMemoryVectors,
  serializeMessagePartsForMemoryIndex,
} from "../historicalMemoryData";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("historicalMemoryData", () => {
  useTestDb("historical-memory-data");

  it("serializes text and file placeholders while dropping tool and reasoning parts", () => {
    const text = serializeMessagePartsForMemoryIndex([
      { type: "reasoning", text: "hidden chain" } as any,
      { type: "text", text: "Final answer" } as any,
      { type: "dynamic-tool", toolName: "system::run_command" } as any,
      { type: "file", mediaType: "image/png", filename: "diagram.png", url: "file://diagram.png" } as any,
      { type: "file", mediaType: "application/pdf", filename: "spec.pdf", url: "file://spec.pdf" } as any,
    ]);

    expect(text).toContain("Final answer");
    expect(text).toContain("[图片: diagram.png]");
    expect(text).toContain("[文件: spec.pdf]");
    expect(text).not.toContain("hidden chain");
    expect(text).not.toContain("run_command");
  });

  it("stores chunks and retrieves them through vector and keyword indexes", () => {
    const session = createSession("__default__", "default-scenario", "Memory Design");
    const sourceCreatedAt = Date.now() - 10 * 24 * 60 * 60 * 1000;

    createHistoricalMemoryVectorIndex(2);
    const ids = saveHistoricalMemoryChunks({
      sessionId: session.id,
      sessionTitle: session.title,
      turnId: "turn-1",
      userMessageId: "user-1",
      assistantMessageId: "assistant-1",
      sourceCreatedAt,
      chunks: [
        "User discussed historical conversation memory for Mirdel settings.",
        "Unrelated cooking notes.",
      ],
      embeddings: [
        [1, 0],
        [0, 1],
      ],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });

    expect(ids).toHaveLength(2);
    expect(getHistoricalMemoryIndexStats().chunkCount).toBe(2);
    expect(getHistoricalMemoryChunksByIds([ids[0]])[0]?.createdAt).toBe(sourceCreatedAt);

    const vectorHits = searchHistoricalMemoryVectors([1, 0], "provider::embedding", 2);
    expect(vectorHits[0]?.chunkId).toBe(ids[0]);

    const keywordHits = searchHistoricalMemoryKeywords("historical conversation memory", 2);
    expect(keywordHits.map((hit) => hit.chunkId)).toContain(ids[0]);
  });

  it("can exclude the current session from vector and keyword searches", () => {
    const currentSession = createSession("__default__", "default-scenario", "Current Session");
    const historicalSession = createSession("__default__", "default-scenario", "Historical Session");

    createHistoricalMemoryVectorIndex(2);
    const currentIds = saveHistoricalMemoryChunks({
      sessionId: currentSession.id,
      sessionTitle: currentSession.title,
      turnId: "turn-current",
      userMessageId: "user-current",
      assistantMessageId: "assistant-current",
      chunks: ["Historical memory settings in the active conversation."],
      embeddings: [[1, 0]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });
    const historicalIds = saveHistoricalMemoryChunks({
      sessionId: historicalSession.id,
      sessionTitle: historicalSession.title,
      turnId: "turn-historical",
      userMessageId: "user-historical",
      assistantMessageId: "assistant-historical",
      chunks: ["Historical memory settings from another conversation."],
      embeddings: [[0.95, 0.05]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });

    const vectorHits = searchHistoricalMemoryVectors(
      [1, 0],
      "provider::embedding",
      2,
      { excludeSessionId: currentSession.id }
    );
    expect(vectorHits.map((hit) => hit.chunkId)).toEqual([historicalIds[0]]);
    expect(vectorHits.map((hit) => hit.chunkId)).not.toContain(currentIds[0]);

    const keywordHits = searchHistoricalMemoryKeywords(
      "historical memory settings",
      2,
      { excludeSessionId: currentSession.id }
    );
    expect(keywordHits.map((hit) => hit.chunkId)).toEqual([historicalIds[0]]);
    expect(keywordHits.map((hit) => hit.chunkId)).not.toContain(currentIds[0]);
  });

  it("deletes chunks by message and session", () => {
    const firstSession = createSession("__default__", "default-scenario", "First Session");
    const secondSession = createSession("__default__", "default-scenario", "Second Session");

    createHistoricalMemoryVectorIndex(2);
    saveHistoricalMemoryChunks({
      sessionId: firstSession.id,
      sessionTitle: firstSession.title,
      turnId: "turn-first",
      userMessageId: "user-first",
      assistantMessageId: "assistant-first",
      chunks: ["Historical memory content from the first session."],
      embeddings: [[1, 0]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });
    saveHistoricalMemoryChunks({
      sessionId: secondSession.id,
      sessionTitle: secondSession.title,
      turnId: "turn-second",
      userMessageId: "user-second",
      assistantMessageId: "assistant-second",
      chunks: ["Historical memory content from the second session."],
      embeddings: [[0, 1]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });
    expect(getHistoricalMemoryIndexStats().chunkCount).toBe(2);

    deleteHistoricalMemoryByMessageId("assistant-first");
    expect(getHistoricalMemoryIndexStats().chunkCount).toBe(1);
    expect(searchHistoricalMemoryKeywords("first session", 2)).toHaveLength(0);
    expect(searchHistoricalMemoryKeywords("second session", 2)).toHaveLength(1);

    deleteHistoricalMemoryBySessionId(secondSession.id);
    expect(getHistoricalMemoryIndexStats().chunkCount).toBe(0);
    expect(searchHistoricalMemoryVectors([0, 1], "provider::embedding", 2)).toHaveLength(0);
  });
});
