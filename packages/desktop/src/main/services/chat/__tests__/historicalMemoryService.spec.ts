import { describe, expect, it } from "vitest";
import { createSession } from "../sessionData";
import {
  getHistoricalMemoryIndexStats,
  saveHistoricalMemoryChunks,
} from "../historicalMemoryData";
import {
  rebuildHistoricalMemoryIndex,
  resolveHistoricalMemoryTimeRange,
  reviewHistoricalMemory,
  searchHistoricalMemory,
} from "../historicalMemoryService";
import { getMemorySettings, setMemorySettings } from "../../settings/settingsData";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("historicalMemoryService", () => {
  useTestDb("historical-memory-service");

  it("keeps default model references as configuration values", () => {
    expect(getMemorySettings().historicalEmbeddingModel).toBe("__default__");

    setMemorySettings({ historicalEmbeddingModel: "" });
    expect(getMemorySettings().historicalEmbeddingModel).toBe("");

    setMemorySettings({ historicalEmbeddingModel: "__default__" });
    expect(getMemorySettings().historicalEmbeddingModel).toBe("__default__");
  });

  it("fails rebuild before clearing the existing index when no embedding model is configured", async () => {
    const session = createSession("__default__", "default-scenario", "Existing Historical Index");

    saveHistoricalMemoryChunks({
      sessionId: session.id,
      sessionTitle: session.title,
      turnId: "turn-1",
      userMessageId: "user-1",
      assistantMessageId: "assistant-1",
      chunks: ["Existing indexed memory should remain available."],
      embeddings: [[1, 0]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });

    await expect(rebuildHistoricalMemoryIndex()).rejects.toThrow(/历史|historical|嵌入|embedding/i);
    expect(getHistoricalMemoryIndexStats().chunkCount).toBe(1);
  });

  it("uses keyword fallback silently when background embedding resolution fails", async () => {
    const session = createSession("__default__", "default-scenario", "Background Fallback");
    setMemorySettings({
      historicalEnabled: true,
      historicalEmbeddingModel: "__default__",
      historicalMinScore: 0.58,
    });

    saveHistoricalMemoryChunks({
      sessionId: session.id,
      sessionTitle: session.title,
      turnId: "turn-2",
      userMessageId: "user-2",
      assistantMessageId: "assistant-2",
      chunks: ["We discussed the historical memory implementation and model failure policy."],
      embeddings: [[1, 0]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });

    const hits = await searchHistoricalMemory({
      sessionId: session.id,
      query: "historical memory policy",
      limit: 3,
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].content).toContain("historical memory");
  });

  it("limits semantic search to the requested time range", async () => {
    const currentSession = createSession("__default__", "default-scenario", "Current Session");
    const marchSession = createSession("__default__", "default-scenario", "March Work");
    const aprilSession = createSession("__default__", "default-scenario", "April Work");
    setMemorySettings({
      historicalEnabled: true,
      historicalEmbeddingModel: "__default__",
      historicalMinScore: 0.58,
    });

    saveHistoricalMemoryChunks({
      sessionId: marchSession.id,
      sessionTitle: marchSession.title,
      turnId: "turn-march-ai",
      userMessageId: "user-march-ai",
      assistantMessageId: "assistant-march-ai",
      sourceCreatedAt: new Date(2026, 2, 12, 10).getTime(),
      chunks: ["We discussed an AI project planning workflow and implementation risks."],
      embeddings: [[1, 0]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });
    saveHistoricalMemoryChunks({
      sessionId: aprilSession.id,
      sessionTitle: aprilSession.title,
      turnId: "turn-april-ai",
      userMessageId: "user-april-ai",
      assistantMessageId: "assistant-april-ai",
      sourceCreatedAt: new Date(2026, 3, 10, 10).getTime(),
      chunks: ["We discussed an AI project deployment checklist."],
      embeddings: [[1, 0]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });

    const hits = await searchHistoricalMemory({
      sessionId: currentSession.id,
      query: "AI project",
      limit: 10,
      excludeSessionId: currentSession.id,
      timeRange: resolveHistoricalMemoryTimeRange({
        range: "custom",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      }),
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].sessionId).toBe(marchSession.id);
    expect(hits[0].content).toContain("AI project planning");
  });

  it("reviews historical memory by time range without resolving an embedding model", async () => {
    const currentSession = createSession("__default__", "default-scenario", "Current Session");
    const marchSession = createSession("__default__", "default-scenario", "March Review");
    const aprilSession = createSession("__default__", "default-scenario", "April Review");
    setMemorySettings({
      historicalEnabled: true,
      historicalEmbeddingModel: "__default__",
    });

    saveHistoricalMemoryChunks({
      sessionId: marchSession.id,
      sessionTitle: marchSession.title,
      turnId: "turn-march-review",
      userMessageId: "user-march-review",
      assistantMessageId: "assistant-march-review",
      sourceCreatedAt: new Date(2026, 2, 20, 10).getTime(),
      chunks: ["March discussion about memory review and project retrospectives."],
      embeddings: [[1, 0]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });
    saveHistoricalMemoryChunks({
      sessionId: aprilSession.id,
      sessionTitle: aprilSession.title,
      turnId: "turn-april-review",
      userMessageId: "user-april-review",
      assistantMessageId: "assistant-april-review",
      sourceCreatedAt: new Date(2026, 3, 3, 10).getTime(),
      chunks: ["April discussion should not be returned for a March review."],
      embeddings: [[1, 0]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });

    const hits = await reviewHistoricalMemory({
      sessionId: currentSession.id,
      excludeSessionId: currentSession.id,
      timeRange: resolveHistoricalMemoryTimeRange({
        range: "custom",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      }),
      limit: 10,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].sessionId).toBe(marchSession.id);
    expect(hits[0].reason).toEqual(["time-range"]);
  });
});
