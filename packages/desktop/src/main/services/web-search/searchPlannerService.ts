import { generateText, type ModelMessage } from "ai";
import { loggerServiceMain } from "@shared";
import { tMain } from "../../i18n";
import { getDefaultModelByType } from "../settings/settingsData";
import { resolveModelInvocation } from "../providers/modelInvocation";

const logger = loggerServiceMain.withContext("searchPlanner");

const SEARCH_PLANNER_TIMEOUT_MS = 10000;
const SEARCH_PLAN_MAX_QUERIES = 6;

const SEARCH_PLANNER_SYSTEM_PROMPT = `You generate web search queries for a search subsystem.

Input: one self-contained research request from the main model.
Output: strict JSON only in this exact shape:
{"queries": string[]}

Rules:
- Return 1 to ${SEARCH_PLAN_MAX_QUERIES} search queries.
- Every query must be a complete, directly executable web search query.
- Keep queries concise and high-signal.
- Cover complementary angles when multiple queries are needed, for example:
  - exact entity/version naming
  - official or source-oriented phrasing
  - recent updates / latest information phrasing
- Do not output explanations, markdown, comments, or extra keys.
- Do not include duplicate or near-duplicate queries.
- If one query is sufficient, return exactly one query.
- Use the user's request language when natural, but keep canonical product/model names in their commonly used form.
- Avoid boolean operator tricks or provider-specific syntax unless clearly necessary.`;

export type SearchPlan = {
  queries: string[];
  plannerModel: string;
};

type SearchPlannerResult =
  | { ok: true; data: SearchPlan }
  | { ok: false; error: string };

function normalizeQueries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  return Array.from(new Set(normalized)).slice(0, SEARCH_PLAN_MAX_QUERIES);
}

export async function generateSearchPlan(params: {
  request: string;
  timeoutMs?: number;
  modelRefs?: string[];
  useDefaultFallbacks?: boolean;
}): Promise<SearchPlannerResult> {
  const request = (params.request ?? "").trim();
  if (!request) {
    return { ok: false, error: tMain("search.plan.failed") };
  }

  const candidates = resolvePlannerModelCandidates(params);
  if (candidates.length === 0) {
    return { ok: false, error: tMain("search.plan.fastModelNotConfigured") };
  }

  let lastError = tMain("search.plan.failed");
  for (const candidate of candidates) {
    const result = await generateSearchPlanWithModel({
      request,
      timeoutMs: params.timeoutMs,
      providerId: candidate.providerId,
      modelId: candidate.modelId,
    });
    if (result.ok) return result;
    if (result.ok === false) {
      lastError = result.error;
    }
  }

  return { ok: false, error: lastError };
}

function resolvePlannerModelCandidates(params: {
  modelRefs?: string[];
  useDefaultFallbacks?: boolean;
}): Array<{ providerId: string; modelId: string }> {
  const candidates: Array<{ providerId: string; modelId: string }> = [];
  const seen = new Set<string>();
  const add = (providerId?: string | null, modelId?: string | null) => {
    if (!providerId || !modelId) return;
    const key = `${providerId}::${modelId}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ providerId, modelId });
  };

  if (params.useDefaultFallbacks !== false) {
    const fast = getDefaultModelByType("fast");
    add(fast?.providerId, fast?.modelId);
    const general = getDefaultModelByType("general");
    add(general?.providerId, general?.modelId);
  }

  for (const ref of params.modelRefs ?? []) {
    const [providerId, modelId] = String(ref || "").split("::");
    add(providerId, modelId);
  }

  return candidates;
}

async function generateSearchPlanWithModel(params: {
  request: string;
  providerId: string;
  modelId: string;
  timeoutMs?: number;
}): Promise<SearchPlannerResult> {
  let client: ReturnType<typeof resolveModelInvocation>["client"];
  try {
    client = resolveModelInvocation({
      providerId: params.providerId,
      modelId: params.modelId,
    }).client;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }

  const messages: ModelMessage[] = [
    { role: "system", content: SEARCH_PLANNER_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Research request:
<<<
${params.request}
>>>`,
    },
  ];

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), params.timeoutMs ?? SEARCH_PLANNER_TIMEOUT_MS);

  try {
    const { text } = await generateText({
      model: client(params.modelId),
      messages,
      temperature: 0.1,
      maxOutputTokens: 256,
      abortSignal: abort.signal,
      providerOptions: {
        [params.providerId]: { think: { type: "disable" as const } },
      },
    });

    const cleaned = (text ?? "").trim().replace(/^```json?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as { queries?: unknown };
    const queries = normalizeQueries(parsed?.queries);

    if (queries.length === 0) {
      logger.warn("searchPlanner: empty queries from model", {
        providerId: params.providerId,
        modelId: params.modelId,
        raw: text,
      });
      return { ok: false, error: tMain("search.plan.failed") };
    }

    return {
      ok: true,
      data: {
        queries,
        plannerModel: `${params.providerId}::${params.modelId}`,
      },
    };
  } catch (error) {
    logger.warn("searchPlanner: generation failed", {
      providerId: params.providerId,
      modelId: params.modelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: tMain("search.plan.failed") };
  } finally {
    clearTimeout(timer);
  }
}
