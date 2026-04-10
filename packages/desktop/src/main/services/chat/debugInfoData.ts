import { nanoid as nanoId } from "nanoid";
import type { ChatDebugInfo, DebugStep, DebugToolExecution } from "@shared";
import { getDb } from "../db";

type DebugRunRow = {
  id: string;
  sessionId: string;
  turnId: string;
  userMessageId: string | null;
  assistantMessageId: string | null;
  meta: string;
  startTime: number;
  endTime: number | null;
  status: string;
  finishReason: string | null;
  error: string | null;
  createdMessageIds: string | null;
};

type DebugStepRow = {
  runId: string;
  stepIndex: number;
  startTime: number;
  endTime: number;
  inputMessages: string;
  outputContent: string | null;
  finishReason: string | null;
  usage: string | null;
  toolExecutions: string | null;
};

type DebugMetaSnapshot = Omit<ChatDebugInfo["meta"], "runId" | "turnId" | "startTime" | "endTime">;

function safeParseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function createDebugRun(params: {
  sessionId: string;
  turnId: string;
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  startTime: number;
  meta: DebugMetaSnapshot;
}): string {
  const db = getDb();
  const now = Date.now();
  const id = nanoId();
  db.prepare(`
    INSERT INTO chat_debug_runs (
      id, sessionId, turnId, userMessageId, assistantMessageId, meta,
      startTime, endTime, status, finishReason, error, createdMessageIds,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'running', NULL, NULL, NULL, ?, ?)
  `).run(
    id,
    params.sessionId,
    params.turnId,
    params.userMessageId ?? null,
    params.assistantMessageId ?? null,
    JSON.stringify(params.meta),
    params.startTime,
    now,
    now
  );
  return id;
}

export function getLatestDebugRunIdByTurnId(turnId: string): string | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id
    FROM chat_debug_runs
    WHERE turnId = ?
    ORDER BY createdAt DESC
    LIMIT 1
  `).get(turnId) as { id: string } | undefined;
  return row?.id ?? null;
}

export function appendDebugRunSteps(params: {
  runId: string;
  steps: DebugStep[];
  toolExecutions: DebugToolExecution[];
}) {
  if (params.steps.length === 0) return;
  const db = getDb();
  const now = Date.now();

  const maxRow = db.prepare(`
    SELECT COALESCE(MAX(stepIndex), -1) AS maxStepIndex
    FROM chat_debug_steps
    WHERE runId = ?
  `).get(params.runId) as { maxStepIndex: number };
  const baseStepIndex = (maxRow?.maxStepIndex ?? -1) + 1;

  const insertStmt = db.prepare(`
    INSERT INTO chat_debug_steps (
      id, runId, stepIndex, startTime, endTime,
      inputMessages, outputContent, finishReason, usage, toolExecutions,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const step of params.steps) {
      const normalizedStepIndex = baseStepIndex + step.index;
      const localToolExecutions = params.toolExecutions.filter((toolExec) => toolExec.afterStepIndex === step.index);
      insertStmt.run(
        nanoId(),
        params.runId,
        normalizedStepIndex,
        step.startTime,
        step.endTime,
        JSON.stringify(step.inputMessages ?? []),
        step.outputContent != null ? JSON.stringify(step.outputContent) : null,
        step.finishReason ?? null,
        step.usage ? JSON.stringify(step.usage) : null,
        localToolExecutions.length > 0 ? JSON.stringify(localToolExecutions) : null,
        now,
        now
      );
    }
  });

  tx();
}

export function finalizeDebugRun(params: {
  runId: string;
  status: "success" | "aborted" | "error";
  endTime: number;
  finishReason?: string;
  error?: string;
  createdMessageIds: string[];
}) {
  const db = getDb();
  db.prepare(`
    UPDATE chat_debug_runs
    SET endTime = ?, status = ?, finishReason = ?, error = ?, createdMessageIds = ?, updatedAt = ?
    WHERE id = ?
  `).run(
    params.endTime,
    params.status,
    params.finishReason ?? null,
    params.error ?? null,
    JSON.stringify(params.createdMessageIds ?? []),
    Date.now(),
    params.runId
  );
}

export function getLatestDebugInfoByTurnId(turnId: string): ChatDebugInfo | null {
  const db = getDb();
  const run = db.prepare(`
    SELECT *
    FROM chat_debug_runs
    WHERE turnId = ?
    ORDER BY createdAt DESC
    LIMIT 1
  `).get(turnId) as DebugRunRow | undefined;
  if (!run) return null;

  const stepRows = db.prepare(`
    SELECT *
    FROM chat_debug_steps
    WHERE runId = ?
    ORDER BY stepIndex ASC
  `).all(run.id) as DebugStepRow[];

  const metaSnapshot = safeParseJson<DebugMetaSnapshot>(run.meta, {
    sessionId: run.sessionId,
    userMessageId: run.userMessageId,
    assistantMessageId: run.assistantMessageId,
    model: "",
    provider: { id: "", name: "", baseUrl: "" },
    params: {},
  });

  const steps: DebugStep[] = stepRows.map((row, index) => ({
    index,
    startTime: row.startTime,
    endTime: row.endTime,
    inputMessages: safeParseJson(row.inputMessages, []),
    outputContent: safeParseJson(row.outputContent, null),
    finishReason: row.finishReason ?? undefined,
    usage: safeParseJson(row.usage, undefined),
  }));

  const toolExecutions: DebugToolExecution[] = [];
  stepRows.forEach((row, index) => {
    const tools = safeParseJson<DebugToolExecution[]>(row.toolExecutions, []);
    tools.forEach((tool) => {
      toolExecutions.push({
        ...tool,
        afterStepIndex: index,
      });
    });
  });

  const totalInputTokens = steps.reduce((sum, step) => sum + (step.usage?.inputTokens || 0), 0);
  const totalOutputTokens = steps.reduce((sum, step) => sum + (step.usage?.outputTokens || 0), 0);
  const hasTokenStats = totalInputTokens > 0 || totalOutputTokens > 0;
  const toolCallsSuccessCount = toolExecutions.filter((t) => !t.isError).length;
  const toolCallsFailedCount = toolExecutions.filter((t) => t.isError).length;
  const toolCallsTotalDuration = toolExecutions.reduce((sum, t) => sum + (t.endTime - t.startTime), 0);
  const createdMessageIds = safeParseJson<string[]>(run.createdMessageIds, []);
  const endTime = run.endTime ?? run.startTime;

  return {
    version: 2,
    meta: {
      runId: run.id,
      turnId: run.turnId,
      startTime: run.startTime,
      endTime,
      ...metaSnapshot,
      sessionId: metaSnapshot.sessionId || run.sessionId,
      userMessageId: metaSnapshot.userMessageId ?? run.userMessageId,
      assistantMessageId: metaSnapshot.assistantMessageId ?? run.assistantMessageId,
    },
    steps,
    toolExecutions,
    result: {
      success: run.status === "success",
      error: run.error ?? undefined,
      finishReason: run.finishReason ?? undefined,
      createdMessageIds,
    },
    stats: {
      totalDuration: Math.max(0, endTime - run.startTime),
      stepsCount: steps.length,
      totalInputTokens: hasTokenStats ? totalInputTokens : null,
      totalOutputTokens: hasTokenStats ? totalOutputTokens : null,
      toolCallsCount: toolExecutions.length,
      toolCallsSuccessCount,
      toolCallsFailedCount,
      toolCallsTotalDuration,
    },
  };
}
