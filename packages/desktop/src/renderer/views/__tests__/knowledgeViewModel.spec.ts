import { describe, expect, it } from "vitest";
import {
  buildKnowledgeDetailRoute,
  getKnowledgeTextItemName,
  isKnowledgeUrlValid,
  resolveKnowledgeRouteItemFocus,
} from "../knowledgeViewModel";

describe("knowledgeViewModel", () => {
  it("derives text item names from the first heading line and falls back when empty", () => {
    expect(getKnowledgeTextItemName("# Launch Checklist\nSecond line", "Untitled")).toBe("Launch Checklist");
    expect(getKnowledgeTextItemName("\n\n", "Untitled")).toBe("Untitled");
  });

  it("validates web urls for knowledge url items", () => {
    expect(isKnowledgeUrlValid("https://example.com/docs")).toBe(true);
    expect(isKnowledgeUrlValid("http://example.com/docs")).toBe(true);
    expect(isKnowledgeUrlValid("ftp://example.com/docs")).toBe(false);
    expect(isKnowledgeUrlValid("not-a-url")).toBe(false);
  });

  it("builds detail routes and clears transient item focus query", () => {
    expect(buildKnowledgeDetailRoute("kb-1", {
      itemId: "item-1",
      tab: "file",
    })).toEqual({
      name: "knowledge-detail",
      params: { kbId: "kb-1" },
      query: { tab: "file" },
    });
  });

  it("resolves route item focus only when the item exists in the current knowledge base", () => {
    const items = [
      { id: "item-1", type: "text" as const },
      { id: "item-2", type: "url" as const },
    ];

    expect(resolveKnowledgeRouteItemFocus("item-2", items)).toEqual({
      itemId: "item-2",
      itemType: "url",
    });
    expect(resolveKnowledgeRouteItemFocus("missing", items)).toBeNull();
    expect(resolveKnowledgeRouteItemFocus(undefined, items)).toBeNull();
  });
});
