import { describe, expect, it } from "vitest";
import { kbVectorTableExists } from "../../db";
import { searchAll } from "../../search/searchService";
import { processKbItem, searchKnowledgeBase } from "../KnowledgeService";
import {
  createKbItem,
  createKnowledgeBase,
  deleteKbItem,
  deleteKnowledgeBase,
  getKbChunksByItem,
  getKbItem,
  getKnowledgeBase,
  listKbItems,
  listKnowledgeBases,
} from "../knowledgeData";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("knowledgeData", () => {
  useTestDb("knowledge-data");

  it("deletes a processed item and clears its chunks, vectors, and search documents", async () => {
    const kb = createKnowledgeBase({
      name: "Release KB",
      embeddingDimension: 2,
    });
    const item = createKbItem({
      kbId: kb.id,
      type: "text",
      name: "launch guide",
      content: "Launch checklist and smoke test runbook",
    });

    await processKbItem(item.id, {
      embedFn: async (texts) => texts.map(() => [1, 0]),
    });

    expect(getKbChunksByItem(item.id).length).toBeGreaterThan(0);
    expect(searchKnowledgeBase(kb.id, [1, 0], 3).length).toBeGreaterThan(0);
    expect(searchAll({ query: "launch checklist", scope: "knowledge" }).buckets.knowledge.total).toBe(1);

    deleteKbItem(item.id);

    expect(getKbItem(item.id)).toBeUndefined();
    expect(getKbChunksByItem(item.id)).toEqual([]);
    expect(searchKnowledgeBase(kb.id, [1, 0], 3)).toEqual([]);
    expect(searchAll({ query: "launch checklist", scope: "knowledge" }).buckets.knowledge.total).toBe(0);
    expect(listKbItems(kb.id)).toEqual([]);
  });

  it("deletes a knowledge base and drops its vector table together with indexed content", async () => {
    const kb = createKnowledgeBase({
      name: "Ops KB",
      embeddingDimension: 2,
    });
    const item = createKbItem({
      kbId: kb.id,
      type: "text",
      name: "ops runbook",
      content: "Rollback plan and incident checklist",
    });

    await processKbItem(item.id, {
      embedFn: async (texts) => texts.map(() => [0, 1]),
    });

    expect(kbVectorTableExists(kb.id)).toBe(true);
    expect(listKnowledgeBases().map((entry) => entry.id)).toContain(kb.id);

    deleteKnowledgeBase(kb.id);

    expect(getKnowledgeBase(kb.id)).toBeUndefined();
    expect(kbVectorTableExists(kb.id)).toBe(false);
    expect(listKnowledgeBases().map((entry) => entry.id)).not.toContain(kb.id);
    expect(listKbItems(kb.id)).toEqual([]);
    expect(searchAll({ query: "incident checklist", scope: "knowledge" }).buckets.knowledge.total).toBe(0);
  });
});
