import { ensureChatSearchReady, rebuildChatSearchIndex } from "../chat/chatSearchIndex";
import type { ChatSearchResult, MessageSearchHit, SessionSearchHit } from "../chat/chatSearchService";
import { rebuildAppSearchIndex, ensureAppSearchReady } from "./searchIndex";
import { searchChatAdapter } from "./adapters/chatSearchAdapter";
import { searchKnowledgeAdapter, type KnowledgeSearchHit } from "./adapters/knowledgeSearchAdapter";
import { searchNoteAdapter, type NoteSearchHit } from "./adapters/noteSearchAdapter";
import { searchTranslateAdapter, type TranslateSearchHit } from "./adapters/translateSearchAdapter";

export type GlobalSearchScope = "all" | "messages" | "sessions" | "translations" | "notes" | "knowledge";

export type GlobalSearchInput = {
  query: string;
  scope?: GlobalSearchScope;
  sessionId?: string;
  messageTimeRange?: "all" | "today" | "3d" | "7d" | "30d";
  limit?: number;
  offset?: number;
};

export type GlobalSearchResult = {
  query: string;
  scope: GlobalSearchScope;
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

function normalizeQuery(query: string) {
  return String(query || "").replace(/\s+/g, " ").trim();
}

function getScope(scope: GlobalSearchInput["scope"]): GlobalSearchScope {
  return scope === "messages" ||
    scope === "sessions" ||
    scope === "translations" ||
    scope === "notes" ||
    scope === "knowledge"
    ? scope
    : "all";
}

export function ensureGlobalSearchReady() {
  ensureChatSearchReady();
  ensureAppSearchReady();
}

export function rebuildGlobalSearchIndex() {
  rebuildChatSearchIndex();
  rebuildAppSearchIndex();
}

export function searchAll(input: GlobalSearchInput): GlobalSearchResult {
  ensureGlobalSearchReady();

  const query = normalizeQuery(input.query);
  const scope = getScope(input.scope);
  const limit = Math.max(1, Math.min(50, Math.trunc(input.limit || 20)));
  const offset = Math.max(0, Math.trunc(input.offset || 0));

  if (!query) {
    return {
      query,
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

  const shouldReturnChat = scope === "all" || scope === "messages" || scope === "sessions";
  const shouldReturnTranslations = scope === "all" || scope === "translations";
  const shouldReturnNotes = scope === "all" || scope === "notes";
  const shouldReturnKnowledge = scope === "all" || scope === "knowledge";

  const chatResult: ChatSearchResult = shouldReturnChat
    ? searchChatAdapter({
        query,
        scope: scope === "messages" || scope === "sessions" ? scope : "all",
        sessionId: input.sessionId,
        messageTimeRange: input.messageTimeRange,
        limit,
        offset,
      })
    : {
        query,
        scope: "all",
        buckets: {
          messages: { total: 0, items: [] },
          sessions: { total: 0, items: [] },
        },
      };

  const translationResult = shouldReturnTranslations
    ? searchTranslateAdapter({ query, limit, offset })
    : { total: 0, items: [] as TranslateSearchHit[] };

  const noteResult = shouldReturnNotes
    ? searchNoteAdapter({ query, limit, offset })
    : { total: 0, items: [] as NoteSearchHit[] };

  const knowledgeResult = shouldReturnKnowledge
    ? searchKnowledgeAdapter({ query, limit, offset })
    : { total: 0, items: [] as KnowledgeSearchHit[] };

  return {
    query,
    scope,
    buckets: {
      messages: chatResult.buckets.messages,
      sessions: chatResult.buckets.sessions,
      translations: translationResult,
      notes: noteResult,
      knowledge: knowledgeResult,
    },
  };
}
