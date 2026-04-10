export type SearchScope = "all" | "messages" | "sessions" | "translations" | "notes" | "knowledge";
export type MessageTimeRange = "all" | "today" | "3d" | "7d" | "30d";

export type MessageSearchHit = {
  type: "message";
  messageId: string;
  sessionId: string;
  sessionTitle: string;
  sessionUpdatedAt: number;
  role: string;
  snippet: string;
  score: number;
  createdAt: number;
};

export type SessionSearchHit = {
  type: "session";
  sessionId: string;
  title: string;
  titleHighlight: string;
  score: number;
  updatedAt: number;
  matchedMessageCount: number;
  summarySnippet: string;
  topMessageHits: Array<{
    messageId: string;
    snippet: string;
    score: number;
  }>;
};

export type TranslateSearchHit = {
  type: "translation";
  recordId: string;
  targetLang: string;
  createdAt: number;
  inputSnippet: string;
  translationSnippet: string;
  score: number;
};

export type NoteSearchHit = {
  type: "note";
  noteId: string;
  listId: string | null;
  listName: string;
  title: string;
  titleHighlight: string;
  snippet: string;
  updatedAt: number;
  score: number;
};

export type KnowledgeSearchHit = {
  type: "knowledge";
  kbId: string;
  kbName: string;
  itemId: string;
  itemType: string;
  itemName: string;
  itemNameHighlight: string;
  itemSource: string;
  score: number;
  matchedChunkCount: number;
  topChunkHits: Array<{
    chunkId: number;
    snippet: string;
    score: number;
  }>;
};

export type SearchResult = {
  query: string;
  scope: SearchScope;
  buckets: {
    messages: {
      total: number;
      items: MessageSearchHit[];
    };
    sessions: {
      total: number;
      items: SessionSearchHit[];
    };
    translations: {
      total: number;
      items: TranslateSearchHit[];
    };
    notes: {
      total: number;
      items: NoteSearchHit[];
    };
    knowledge: {
      total: number;
      items: KnowledgeSearchHit[];
    };
  };
};

export type SearchSelectionItem =
  | { key: string; type: "message"; item: MessageSearchHit }
  | { key: string; type: "session"; item: SessionSearchHit }
  | { key: string; type: "translation"; item: TranslateSearchHit }
  | { key: string; type: "note"; item: NoteSearchHit }
  | { key: string; type: "knowledge"; item: KnowledgeSearchHit };

export type SearchPreset = {
  scope?: SearchScope;
  onlyCurrentSession?: boolean;
  messageTimeRange?: MessageTimeRange;
} | null | undefined;

export type SearchViewState = {
  activeTab: SearchScope;
  onlyCurrentSession: boolean;
  messageTimeRange: MessageTimeRange;
};

export function createEmptySearchResult(scope: SearchScope = "all"): SearchResult {
  return {
    query: "",
    scope,
    buckets: {
      messages: { total: 0, items: [] },
      sessions: { total: 0, items: [] },
      translations: { total: 0, items: [] },
      notes: { total: 0, items: [] },
      knowledge: { total: 0, items: [] },
    },
  };
}

export function renderSearchSnippet(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\[\[/g, "<mark>")
    .replace(/\]\]/g, "</mark>");
}

export function applySearchPreset(
  state: SearchViewState,
  preset: SearchPreset,
  currentSessionId?: string
): SearchViewState {
  if (!preset) {
    return state;
  }

  const nextState: SearchViewState = {
    activeTab: preset.scope || state.activeTab,
    onlyCurrentSession: state.onlyCurrentSession,
    messageTimeRange: preset.messageTimeRange || state.messageTimeRange,
  };

  if (preset.scope === "messages" || nextState.activeTab === "messages") {
    nextState.onlyCurrentSession = !!preset.onlyCurrentSession && !!currentSessionId;
    return nextState;
  }

  nextState.onlyCurrentSession = false;
  return nextState;
}

export function buildVisibleSearchItems(result: SearchResult): SearchSelectionItem[] {
  const items: SearchSelectionItem[] = [];

  for (const item of result.buckets.messages.items) {
    items.push({ key: `message:${item.messageId}`, type: "message", item });
  }

  for (const item of result.buckets.sessions.items) {
    items.push({ key: `session:${item.sessionId}`, type: "session", item });
  }

  for (const item of result.buckets.translations.items) {
    items.push({ key: `translation:${item.recordId}`, type: "translation", item });
  }

  for (const item of result.buckets.notes.items) {
    items.push({ key: `note:${item.noteId}`, type: "note", item });
  }

  for (const item of result.buckets.knowledge.items) {
    items.push({ key: `knowledge:${item.itemId}`, type: "knowledge", item });
  }

  return items;
}

export function hasSearchResults(result: SearchResult) {
  return buildVisibleSearchItems(result).length > 0;
}

export function normalizeSelectedItemKey(items: SearchSelectionItem[], selectedItemKey: string) {
  if (!items.length) {
    return "";
  }

  return items.some((item) => item.key === selectedItemKey)
    ? selectedItemKey
    : (items[0]?.key || "");
}

export function getNextSelectionKey(
  items: SearchSelectionItem[],
  selectedItemKey: string,
  direction: 1 | -1
) {
  if (!items.length) {
    return "";
  }

  const currentIndex = items.findIndex((item) => item.key === selectedItemKey);
  const nextIndex = currentIndex === -1
    ? 0
    : (currentIndex + direction + items.length) % items.length;

  return items[nextIndex]?.key || "";
}

type SearchNavigationRoute =
  | { name: "chat"; params: { sessionId: string } }
  | { name: "translate"; query: { recordId: string } }
  | { name: "notes-detail"; params: { noteId: string } }
  | { name: "knowledge-detail"; params: { kbId: string }; query: { itemId: string } };

export function buildSearchNavigationTarget(
  item: SearchSelectionItem["item"]
): {
  route: SearchNavigationRoute;
  pendingScrollTarget: { sessionId: string; messageId: string } | null;
} {
  if (item.type === "message") {
    return {
      route: {
        name: "chat",
        params: { sessionId: item.sessionId },
      },
      pendingScrollTarget: {
        sessionId: item.sessionId,
        messageId: item.messageId,
      },
    };
  }

  if (item.type === "session") {
    const firstHit = item.topMessageHits[0];
    return {
      route: {
        name: "chat",
        params: { sessionId: item.sessionId },
      },
      pendingScrollTarget: firstHit
        ? {
            sessionId: item.sessionId,
            messageId: firstHit.messageId,
          }
        : null,
    };
  }

  if (item.type === "translation") {
    return {
      route: {
        name: "translate",
        query: { recordId: item.recordId },
      },
      pendingScrollTarget: null,
    };
  }

  if (item.type === "note") {
    return {
      route: {
        name: "notes-detail",
        params: { noteId: item.noteId },
      },
      pendingScrollTarget: null,
    };
  }

  return {
    route: {
      name: "knowledge-detail",
      params: { kbId: item.kbId },
      query: { itemId: item.itemId },
    },
    pendingScrollTarget: null,
  };
}
