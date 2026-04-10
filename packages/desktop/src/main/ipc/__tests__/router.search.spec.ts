import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  rebuildGlobalSearchIndexMock,
  searchAllMock,
} = vi.hoisted(() => ({
  rebuildGlobalSearchIndexMock: vi.fn(),
  searchAllMock: vi.fn(),
}));

vi.mock("typed-electron-ipc", () => ({
  ipcRouter: (handlers: Record<string, unknown>) => handlers,
}));

vi.mock("../../services/search/searchService", async () => {
  const actual = await vi.importActual<typeof import("../../services/search/searchService")>("../../services/search/searchService");
  return {
    ...actual,
    searchAll: searchAllMock,
    rebuildGlobalSearchIndex: rebuildGlobalSearchIndexMock,
  };
});

const { router } = await import("../router");

describe("router global search handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchAllMock.mockReturnValue({
      query: "vector",
      scope: "notes",
      buckets: {
        messages: { total: 0, items: [] },
        sessions: { total: 0, items: [] },
        translations: { total: 0, items: [] },
        notes: {
          total: 1,
          items: [{
            type: "note",
            noteId: "note-1",
            listId: "list-1",
            listName: "Ideas",
            title: "Vector note",
            titleHighlight: "[[Vector]] note",
            snippet: "Embeddings and reranking",
            updatedAt: 1,
            score: 1,
          }],
        },
        knowledge: { total: 0, items: [] },
      },
    });
  });

  it("forwards search requests and rebuild commands", async () => {
    await expect(
      router["search:search"]({} as any, {
        query: "vector",
        scope: "notes",
        sessionId: "session-1",
        messageTimeRange: "7d",
        limit: 12,
        offset: 0,
      })
    ).resolves.toEqual({
      query: "vector",
      scope: "notes",
      buckets: {
        messages: { total: 0, items: [] },
        sessions: { total: 0, items: [] },
        translations: { total: 0, items: [] },
        notes: {
          total: 1,
          items: [
            expect.objectContaining({ noteId: "note-1" }),
          ],
        },
        knowledge: { total: 0, items: [] },
      },
    });

    expect(searchAllMock).toHaveBeenCalledWith({
      query: "vector",
      scope: "notes",
      sessionId: "session-1",
      messageTimeRange: "7d",
      limit: 12,
      offset: 0,
    });

    await expect(router["search:rebuildIndex"]({} as any)).resolves.toEqual({ ok: true });
    expect(rebuildGlobalSearchIndexMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces basic search failures", async () => {
    searchAllMock.mockImplementation(() => {
      throw new Error("search unavailable");
    });

    await expect(
      router["search:search"]({} as any, {
        query: "vector",
        scope: "all",
      })
    ).rejects.toThrow("search unavailable");
  });
});
