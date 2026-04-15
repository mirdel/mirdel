import { describe, expect, it } from "vitest";
import { createSession } from "../sessionData";
import {
  getHistoricalMemoryIndexStats,
  saveHistoricalMemoryChunks,
} from "../historicalMemoryData";
import {
  rebuildHistoricalMemoryIndex,
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
});
