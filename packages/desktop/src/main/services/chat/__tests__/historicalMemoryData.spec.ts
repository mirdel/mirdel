import { describe, expect, it } from "vitest";
import { createSession } from "../sessionData";
import {
  createHistoricalMemoryVectorIndex,
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

    createHistoricalMemoryVectorIndex(2);
    const ids = saveHistoricalMemoryChunks({
      sessionId: session.id,
      sessionTitle: session.title,
      turnId: "turn-1",
      userMessageId: "user-1",
      assistantMessageId: "assistant-1",
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

    const vectorHits = searchHistoricalMemoryVectors([1, 0], "provider::embedding", 2);
    expect(vectorHits[0]?.chunkId).toBe(ids[0]);

    const keywordHits = searchHistoricalMemoryKeywords("historical conversation memory", 2);
    expect(keywordHits.map((hit) => hit.chunkId)).toContain(ids[0]);
  });
});
