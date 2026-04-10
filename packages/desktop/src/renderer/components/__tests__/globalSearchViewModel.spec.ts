import { describe, expect, it } from "vitest";
import {
  applySearchPreset,
  buildSearchNavigationTarget,
  buildVisibleSearchItems,
  createEmptySearchResult,
  getNextSelectionKey,
  hasSearchResults,
  normalizeSelectedItemKey,
  renderSearchSnippet,
  type SearchResult,
} from "../globalSearchViewModel";

function createResult(): SearchResult {
  return {
    query: "vector",
    scope: "all",
    buckets: {
      messages: {
        total: 1,
        items: [{
          type: "message",
          messageId: "msg-1",
          sessionId: "session-1",
          sessionTitle: "Vector Search",
          sessionUpdatedAt: 10,
          role: "assistant",
          snippet: "[[vector]] result",
          score: 1,
          createdAt: 1,
        }],
      },
      sessions: {
        total: 1,
        items: [{
          type: "session",
          sessionId: "session-2",
          title: "Planner",
          titleHighlight: "[[Planner]]",
          score: 2,
          updatedAt: 20,
          matchedMessageCount: 1,
          summarySnippet: "Search planner summary",
          topMessageHits: [{
            messageId: "msg-2",
            snippet: "planner snippet",
            score: 1,
          }],
        }],
      },
      translations: {
        total: 1,
        items: [{
          type: "translation",
          recordId: "record-1",
          targetLang: "zh-CN",
          createdAt: 30,
          inputSnippet: "vector",
          translationSnippet: "向量",
          score: 1,
        }],
      },
      notes: {
        total: 1,
        items: [{
          type: "note",
          noteId: "note-1",
          listId: "list-1",
          listName: "Ideas",
          title: "Vector note",
          titleHighlight: "[[Vector]] note",
          snippet: "Embeddings and recall",
          updatedAt: 40,
          score: 1,
        }],
      },
      knowledge: {
        total: 1,
        items: [{
          type: "knowledge",
          kbId: "kb-1",
          kbName: "Docs",
          itemId: "item-1",
          itemType: "doc",
          itemName: "Vector doc",
          itemNameHighlight: "[[Vector]] doc",
          itemSource: "kb/vector.md",
          score: 1,
          matchedChunkCount: 2,
          topChunkHits: [{
            chunkId: 1,
            snippet: "chunk",
            score: 1,
          }],
        }],
      },
    },
  };
}

describe("globalSearchViewModel", () => {
  it("applies presets for message scope and clears current-session filtering for other tabs", () => {
    expect(applySearchPreset(
      {
        activeTab: "all",
        onlyCurrentSession: false,
        messageTimeRange: "all",
      },
      {
        scope: "messages",
        onlyCurrentSession: true,
        messageTimeRange: "3d",
      },
      "session-1"
    )).toEqual({
      activeTab: "messages",
      onlyCurrentSession: true,
      messageTimeRange: "3d",
    });

    expect(applySearchPreset(
      {
        activeTab: "messages",
        onlyCurrentSession: true,
        messageTimeRange: "7d",
      },
      {
        scope: "notes",
      },
      "session-1"
    )).toEqual({
      activeTab: "notes",
      onlyCurrentSession: false,
      messageTimeRange: "7d",
    });

    expect(applySearchPreset(
      {
        activeTab: "all",
        onlyCurrentSession: false,
        messageTimeRange: "all",
      },
      {
        scope: "messages",
        onlyCurrentSession: true,
      }
    ).onlyCurrentSession).toBe(false);
  });

  it("builds visible items in section order and normalizes keyboard selection", () => {
    const result = createResult();
    const items = buildVisibleSearchItems(result);

    expect(items.map((item) => item.key)).toEqual([
      "message:msg-1",
      "session:session-2",
      "translation:record-1",
      "note:note-1",
      "knowledge:item-1",
    ]);
    expect(hasSearchResults(result)).toBe(true);
    expect(normalizeSelectedItemKey(items, "missing")).toBe("message:msg-1");
    expect(getNextSelectionKey(items, "message:msg-1", 1)).toBe("session:session-2");
    expect(getNextSelectionKey(items, "message:msg-1", -1)).toBe("knowledge:item-1");
  });

  it("renders highlighted snippets safely", () => {
    expect(renderSearchSnippet("<script>[[vector]]</script> & more")).toBe(
      "&lt;script&gt;<mark>vector</mark>&lt;/script&gt; &amp; more"
    );
  });

  it("builds navigation targets for each result type", () => {
    const result = createResult();

    expect(buildSearchNavigationTarget(result.buckets.messages.items[0])).toEqual({
      route: {
        name: "chat",
        params: { sessionId: "session-1" },
      },
      pendingScrollTarget: {
        sessionId: "session-1",
        messageId: "msg-1",
      },
    });

    expect(buildSearchNavigationTarget(result.buckets.sessions.items[0])).toEqual({
      route: {
        name: "chat",
        params: { sessionId: "session-2" },
      },
      pendingScrollTarget: {
        sessionId: "session-2",
        messageId: "msg-2",
      },
    });

    expect(buildSearchNavigationTarget(result.buckets.translations.items[0])).toEqual({
      route: {
        name: "translate",
        query: { recordId: "record-1" },
      },
      pendingScrollTarget: null,
    });

    expect(buildSearchNavigationTarget(result.buckets.notes.items[0])).toEqual({
      route: {
        name: "notes-detail",
        params: { noteId: "note-1" },
      },
      pendingScrollTarget: null,
    });

    expect(buildSearchNavigationTarget(result.buckets.knowledge.items[0])).toEqual({
      route: {
        name: "knowledge-detail",
        params: { kbId: "kb-1" },
        query: { itemId: "item-1" },
      },
      pendingScrollTarget: null,
    });
  });

  it("creates an empty result shape for resets", () => {
    expect(createEmptySearchResult("notes")).toEqual({
      query: "",
      scope: "notes",
      buckets: {
        messages: { total: 0, items: [] },
        sessions: { total: 0, items: [] },
        translations: { total: 0, items: [] },
        notes: { total: 0, items: [] },
        knowledge: { total: 0, items: [] },
      },
    });
  });
});
