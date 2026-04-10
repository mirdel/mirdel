import { loggerServiceMain } from "@shared";
import { getDb } from "../db";
import { ensureChatSearchReady, getChatSearchTableNames } from "./chatSearchIndex";

const logger = loggerServiceMain.withContext("chatSearchService");

type RawMessageHitRow = {
  messageId: string;
  sessionId: string;
  role: string;
  createdAt: number;
  sessionUpdatedAt: number;
  sessionTitle: string;
  snippet: string | null;
  rawScore: number;
};

type RawDirectSessionHitRow = {
  sessionId: string;
  title: string;
  updatedAt: number;
  highlightedTitle: string | null;
  summarySnippet: string | null;
  rawScore: number;
};

export type ChatSearchInput = {
  query: string;
  scope?: "all" | "messages" | "sessions";
  sessionId?: string;
  messageTimeRange?: "all" | "today" | "3d" | "7d" | "30d";
  limit?: number;
  offset?: number;
};

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

export type ChatSearchResult = {
  query: string;
  scope: "all" | "messages" | "sessions";
  buckets: {
    messages: {
      total: number;
      items: MessageSearchHit[];
    };
    sessions: {
      total: number;
      items: SessionSearchHit[];
    };
  };
};

function normalizeQuery(query: string) {
  return String(query || "").replace(/\s+/g, " ").trim();
}

function cleanSnippet(value: string | null | undefined) {
  return String(value || "").trim();
}

function getScope(scope: ChatSearchInput["scope"]) {
  return scope === "messages" || scope === "sessions" ? scope : "all";
}

function getMessageCreatedAfter(timeRange: ChatSearchInput["messageTimeRange"]) {
  if (!timeRange || timeRange === "all") {
    return undefined;
  }

  if (timeRange === "today") {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return startOfDay.getTime();
  }

  const now = Date.now();
  const durationMap = {
    "3d": 3 * 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  } as const;

  return now - durationMap[timeRange];
}

function searchMessageHits(params: {
  matchQuery: string;
  sessionId?: string;
  createdAfter?: number;
  limit: number;
  offset: number;
}) {
  const db = getDb();
  const { messageFts } = getChatSearchTableNames();
  const whereClauses = [
    `${messageFts} MATCH simple_query(?)`,
    `(s.isTemporary IS NULL OR s.isTemporary = 0)`,
    `m.isDeleted = 0`,
    `(m.status = 'success' OR m.status = 'aborted')`,
  ];
  const values: Array<string | number> = [params.matchQuery];

  if (params.sessionId) {
    whereClauses.push(`m.sessionId = ?`);
    values.push(params.sessionId);
  }

  if (typeof params.createdAfter === "number") {
    whereClauses.push(`m.createdAt >= ?`);
    values.push(params.createdAfter);
  }

  values.push(params.limit, params.offset);

  const sql = `
    SELECT
      ${messageFts}.messageId AS messageId,
      ${messageFts}.sessionId AS sessionId,
      ${messageFts}.role AS role,
      m.createdAt AS createdAt,
      s.updatedAt AS sessionUpdatedAt,
      s.title AS sessionTitle,
      simple_snippet(${messageFts}, 3, '[[', ']]', '...', 18) AS snippet,
      bm25(${messageFts}, 0.0, 0.0, 0.0, 0.0, 8.0) AS rawScore
    FROM ${messageFts}
    JOIN messages m ON m.id = ${messageFts}.messageId
    JOIN sessions s ON s.id = m.sessionId
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY rawScore ASC, m.createdAt DESC
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(sql).all(...values) as RawMessageHitRow[];

  return rows.map((row) => ({
    type: "message" as const,
    messageId: row.messageId,
    sessionId: row.sessionId,
    sessionTitle: row.sessionTitle,
    sessionUpdatedAt: row.sessionUpdatedAt,
    role: row.role,
    snippet: cleanSnippet(row.snippet),
    score: row.rawScore,
    createdAt: row.createdAt,
  }));
}

function searchDirectSessionHits(params: {
  matchQuery: string;
  sessionId?: string;
  limit: number;
}) {
  const db = getDb();
  const { sessionFts } = getChatSearchTableNames();
  const whereClauses = [
    `${sessionFts} MATCH simple_query(?)`,
    `(s.isTemporary IS NULL OR s.isTemporary = 0)`,
  ];
  const values: Array<string | number> = [params.matchQuery];

  if (params.sessionId) {
    whereClauses.push(`s.id = ?`);
    values.push(params.sessionId);
  }

  values.push(params.limit);

  const sql = `
    SELECT
      s.id AS sessionId,
      s.title AS title,
      s.updatedAt AS updatedAt,
      simple_highlight(${sessionFts}, 2, '[[', ']]') AS highlightedTitle,
      simple_snippet(${sessionFts}, 3, '[[', ']]', '...', 18) AS summarySnippet,
      bm25(${sessionFts}, 0.0, 0.0, 0.0, 12.0, 2.5) AS rawScore
    FROM ${sessionFts}
    JOIN sessions s ON s.id = ${sessionFts}.sessionId
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY rawScore ASC, s.updatedAt DESC
    LIMIT ?
  `;

  return db.prepare(sql).all(...values) as RawDirectSessionHitRow[];
}

export function searchChat(input: ChatSearchInput): ChatSearchResult {
  ensureChatSearchReady();

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
      },
    };
  }

  try {
    const shouldReturnMessages = scope === "all" || scope === "messages";
    const shouldReturnSessions = scope === "all" || scope === "sessions";

    const matchQuery = query;
    const messageCreatedAfter = getMessageCreatedAfter(input.messageTimeRange);

    const messageItems = shouldReturnMessages
      ? searchMessageHits({
          matchQuery,
          sessionId: input.sessionId,
          createdAfter: messageCreatedAfter,
          limit,
          offset,
        })
      : [];

    const aggregatedSessions = new Map<string, SessionSearchHit>();

    if (shouldReturnSessions) {
      const sessionAggregationSource = searchMessageHits({
        matchQuery,
        sessionId: input.sessionId,
        createdAfter: messageCreatedAfter,
        limit: Math.max(limit * 4, 40),
        offset: 0,
      });

      for (const hit of sessionAggregationSource) {
        const existing = aggregatedSessions.get(hit.sessionId);
        if (!existing) {
          aggregatedSessions.set(hit.sessionId, {
            type: "session",
            sessionId: hit.sessionId,
            title: hit.sessionTitle,
            titleHighlight: hit.sessionTitle,
            score: hit.score,
            updatedAt: hit.sessionUpdatedAt,
            matchedMessageCount: 1,
            summarySnippet: "",
            topMessageHits: [
              {
                messageId: hit.messageId,
                snippet: hit.snippet,
                score: hit.score,
              },
            ],
          });
          continue;
        }

        existing.matchedMessageCount += 1;
        if (hit.score < existing.score) {
          existing.score = hit.score;
        }
        if (existing.topMessageHits.length < 3) {
          existing.topMessageHits.push({
            messageId: hit.messageId,
            snippet: hit.snippet,
            score: hit.score,
          });
        }
      }
    }

    if (shouldReturnSessions) {
      const directSessionHits = searchDirectSessionHits({
        matchQuery,
        sessionId: input.sessionId,
        limit: Math.max(limit * 2, 20),
      });

      for (const row of directSessionHits) {
        const existing = aggregatedSessions.get(row.sessionId);
        if (!existing) {
          aggregatedSessions.set(row.sessionId, {
            type: "session",
            sessionId: row.sessionId,
            title: row.title,
            titleHighlight: cleanSnippet(row.highlightedTitle) || row.title,
            score: row.rawScore,
            updatedAt: row.updatedAt,
            matchedMessageCount: 0,
            summarySnippet: cleanSnippet(row.summarySnippet),
            topMessageHits: [],
          });
          continue;
        }

        existing.title = row.title;
        existing.titleHighlight = cleanSnippet(row.highlightedTitle) || existing.titleHighlight || row.title;
        existing.updatedAt = Math.max(existing.updatedAt, row.updatedAt);
        existing.summarySnippet = existing.summarySnippet || cleanSnippet(row.summarySnippet);
        existing.score = Math.min(existing.score, row.rawScore - 0.01);
      }
    }

    const totalSessions = aggregatedSessions.size;
    const sessionItems = shouldReturnSessions
      ? Array.from(aggregatedSessions.values())
          .sort((a, b) => {
            if (a.score !== b.score) return a.score - b.score;
            return b.updatedAt - a.updatedAt;
          })
          .slice(offset, offset + limit)
      : [];

    return {
      query,
      scope,
      buckets: {
        messages: {
          total: messageItems.length,
          items: messageItems,
        },
        sessions: {
          total: totalSessions,
          items: sessionItems,
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("chat search failed", { query, scope, message });
    throw error;
  }
}
