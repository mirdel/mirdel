import { describe, expect, it } from "vitest";
import { createSession } from "../sessionData";
import {
  getHistoricalMemoryIndexStats,
  saveHistoricalMemoryChunks,
} from "../historicalMemoryData";
import { rebuildHistoricalMemoryIndex } from "../historicalMemoryService";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("historicalMemoryService", () => {
  useTestDb("historical-memory-service");

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
});
