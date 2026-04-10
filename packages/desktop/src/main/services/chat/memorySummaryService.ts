/**
 * 记忆系统摘要服务
 * - State: 窗口外老消息的详细摘要，oldState + 滚出的那一轮 → newState
 * - Brief: 全会话的精简摘要，oldBrief + 最新一轮 → newBrief
 */
import { generateText, type ModelMessage } from "ai";
import { loggerServiceMain, type Message, type MessageContentPart } from "@shared";
import { getDefaultModelByType } from "../settings/settingsData";
import { resolveModelInvocation } from "../providers/modelInvocation";
import { listMessages } from "./messageData";
import { getSession, updateSessionStateAndBrief } from "./sessionData";
import { getLatestTurnByUserMessageId, updateTurn } from "./turnData";

const logger = loggerServiceMain.withContext("memorySummaryService");

/** 一轮 = 一个 user 消息 + 后续的所有 assistant/tool 消息（直到下一个 user） */
type MessageRound = Message[];

/** 按轮分组消息 */
function groupIntoRounds(messages: Message[]): MessageRound[] {
  const rounds: MessageRound[] = [];
  let current: Message[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      if (current.length > 0) {
        rounds.push(current);
      }
      current = [msg];
    } else if (current.length > 0) {
      current.push(msg);
    }
  }
  if (current.length > 0) {
    rounds.push(current);
  }
  return rounds;
}

function getRoundUserMessageId(round: MessageRound): string | null {
  const userMsg = round.find((m) => m.role === "user");
  return userMsg?.id ?? null;
}

function extractTextFromContent(parts: MessageContentPart[]): string {
  return parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
}

/** 将一轮消息转为用于摘要的文本（user 全量，assistant 可通过参数控制：完整或截取最后 N 字） */
const BRIEF_ASSISTANT_MAX = 500;
const STATE_MAX_CHARS = 3000;
const BRIEF_MAX_CHARS = 1200;
const BRIEF_MAX_BULLETS = 5;
const MIN_STATE_SECTION_MATCHES = 3;
const STATE_SECTION_LABELS = [
  "Goal",
  "Decisions",
  "Constraints",
  "Open Questions",
  "Next Steps",
];

function roundToSummaryText(
  round: MessageRound,
  options?: { assistantMaxLength?: number }
): string {
  const maxLen = options?.assistantMaxLength;
  const parts: string[] = [];
  for (const msg of round) {
    if (msg.role === "user") {
      const text = extractTextFromContent(msg.parts);
      if (text.trim()) parts.push(`[User] ${text}`);
    } else if (msg.role === "assistant") {
      const text = extractTextFromContent(msg.parts);
      const hasToolCall = msg.parts.some(
        (p: any) => p.type === "dynamic-tool" || (typeof p.type === "string" && p.type.startsWith("tool-"))
      );
      const assistantText =
        maxLen !== undefined && text.length > maxLen
          ? `...${text.slice(-maxLen)}`
          : text;
      if (assistantText.trim()) parts.push(`[Assistant] ${assistantText}`);
      if (hasToolCall) parts.push("[Assistant] (used tool)");
    }
    // tool messages: skip - assistant text already captures conclusions; tool results add noise (code, logs, URLs)
  }
  return parts.join("\n");
}

function truncateChars(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars).trimEnd(), truncated: true };
}

function countStateSectionMatches(text: string): number {
  let count = 0;
  for (const label of STATE_SECTION_LABELS) {
    const regex = new RegExp(`(^|\\n)\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`, "i");
    if (regex.test(text)) count++;
  }
  return count;
}

function sanitizeStateOutput(raw: string, fallback: string): string {
  const text = raw.trim();
  if (!text) return fallback;

  const matches = countStateSectionMatches(text);
  if (matches < MIN_STATE_SECTION_MATCHES) {
    logger.warn("memorySummary: state output rejected by structure validator", {
      matches,
      required: MIN_STATE_SECTION_MATCHES,
      preview: text.slice(0, 160),
    });
    return fallback;
  }

  const { text: finalText, truncated } = truncateChars(text, STATE_MAX_CHARS);
  if (truncated) {
    logger.warn("memorySummary: state output truncated", { maxChars: STATE_MAX_CHARS });
  }
  return finalText;
}

function sanitizeBriefOutput(raw: string, fallback: string): string {
  const text = raw.trim();
  if (!text) return fallback;

  const bullets = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^-\s+\S+/.test(line));

  if (bullets.length === 0) {
    logger.warn("memorySummary: brief output rejected (no bullet lines)", {
      preview: text.slice(0, 160),
    });
    return fallback;
  }

  const normalized = bullets.slice(0, BRIEF_MAX_BULLETS).join("\n");
  const { text: finalText, truncated } = truncateChars(normalized, BRIEF_MAX_CHARS);
  if (truncated) {
    logger.warn("memorySummary: brief output truncated", { maxChars: BRIEF_MAX_CHARS });
  }
  return finalText;
}

/** 每会话的摘要任务队列 */
const queueBySession = new Map<string, Promise<void>>();

/** 执行摘要任务（串行，同一会话顺序执行） */
async function runSummaryTask(params: {
  sessionId: string;
  contextCount: number;
}) {
  const { sessionId, contextCount: N } = params;

  const model = getDefaultModelByType("fast") ?? getDefaultModelByType("general");
  if (!model?.providerId || !model.modelId) {
    logger.warn("memorySummary: no fast/general model configured, skip");
    return;
  }

  let client: ReturnType<typeof resolveModelInvocation>["client"];
  try {
    client = resolveModelInvocation({ providerId: model.providerId, modelId: model.modelId }).client;
  } catch (error) {
    logger.warn("memorySummary: model invocation unavailable, skip", {
      providerId: model.providerId,
      modelId: model.modelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const allMessages = listMessages(sessionId).filter(
    (m) => m.status === "success" && !m.isDeleted
  );
  const rounds = groupIntoRounds(allMessages);
  const k = rounds.length;

  if (k === 0) return;

  const session = getSession(sessionId);
  const oldState = session?.stateText ?? "";
  const oldBrief = session?.briefText ?? "";
  const oldStateCursorUserMessageId = session?.stateCursorUserMessageId ?? null;

  const latestRound = rounds[k - 1];
  const latestRoundText = roundToSummaryText(latestRound, {
    assistantMaxLength: BRIEF_ASSISTANT_MAX
  });

  const rolledOutCount = Math.max(k - N, 0);
  const rolledOutRounds = rounds.slice(0, rolledOutCount);
  const lastRolledOutRoundUserMessageId =
    rolledOutRounds.length > 0
      ? getRoundUserMessageId(rolledOutRounds[rolledOutRounds.length - 1])
      : null;

  let newState = oldState;
  let newStateCursorUserMessageId: string | null = oldStateCursorUserMessageId;

  if (rolledOutRounds.length === 0) {
    // 当前没有窗口外轮次，游标应清空，避免后续游标落在不可达位置。
    newStateCursorUserMessageId = null;
  } else {
    let baseState = "";
    let roundsToProcess = rolledOutRounds;
    let rebuildFromScratch = true;
    let cursorWasInvalid = false;

    if (oldStateCursorUserMessageId) {
      const cursorIndex = rolledOutRounds.findIndex(
        (round) => getRoundUserMessageId(round) === oldStateCursorUserMessageId
      );
      if (cursorIndex >= 0) {
        // 正常增量：从游标之后开始处理
        rebuildFromScratch = false;
        baseState = oldState;
        roundsToProcess = rolledOutRounds.slice(cursorIndex + 1);
      } else {
        cursorWasInvalid = true;
        logger.warn("memorySummary: state cursor invalid, fallback to rebuild", {
          sessionId,
          cursorUserMessageId: oldStateCursorUserMessageId,
          rolledOutCount: rolledOutRounds.length,
        });
      }
    } else if (oldState.trim()) {
      // 兼容历史数据：存在 state 但无游标，做一次重建确保后续可增量。
      logger.info("memorySummary: legacy state without cursor, rebuild state once", {
        sessionId,
        rolledOutCount: rolledOutRounds.length,
      });
    }

    let mergedState = baseState;
    let processedLastUserMessageId: string | null = null;
    let stateMergeFailed = false;

    for (const round of roundsToProcess) {
      const userMessageId = getRoundUserMessageId(round);
      if (!userMessageId) continue;

      const rolledOutText = roundToSummaryText(round); // full assistant for State
      if (!rolledOutText.trim()) {
        processedLastUserMessageId = userMessageId;
        continue;
      }

      try {
        const nextState = await callStateMergeModel(mergedState, rolledOutText, client, model);
        mergedState = sanitizeStateOutput(nextState, mergedState);
        processedLastUserMessageId = userMessageId;
      } catch (e) {
        stateMergeFailed = true;
        logger.error("memorySummary: state merge failed", {
          sessionId,
          userMessageId,
          error: e,
        });
        break;
      }
    }

    newState = mergedState;

    if (stateMergeFailed && !processedLastUserMessageId) {
      // 重建在首轮就失败时，不覆盖已有 state，避免意外清空。
      newState = oldState;
      newStateCursorUserMessageId = cursorWasInvalid ? null : oldStateCursorUserMessageId;
    } else if (!stateMergeFailed) {
      newStateCursorUserMessageId = lastRolledOutRoundUserMessageId;
    } else if (rebuildFromScratch) {
      newStateCursorUserMessageId = processedLastUserMessageId;
    } else {
      newStateCursorUserMessageId = processedLastUserMessageId ?? oldStateCursorUserMessageId;
    }
  }

  let newBrief: string;
  try {
    const mergedBrief = await callBriefMergeModel(oldBrief, latestRoundText, client, model);
    newBrief = sanitizeBriefOutput(mergedBrief, oldBrief);
  } catch (e) {
    logger.error("memorySummary: brief merge failed", { error: e });
    newBrief = oldBrief;
  }

  updateSessionStateAndBrief(
    sessionId,
    newState || null,
    newBrief || null,
    newStateCursorUserMessageId
  );

  // 将 checkpoint 写入该轮 turn（分支创建时可复制）
  const userMsg = latestRound.find((m) => m.role === "user");
  if (userMsg) {
    const latestTurn = getLatestTurnByUserMessageId(userMsg.id);
    if (latestTurn) {
      updateTurn(latestTurn.id, {
        stateText: newState || null,
        briefText: newBrief || null
      });
    }
  }

  logger.info("memorySummary: updated", {
    sessionId,
    hasState: !!newState,
    stateCursorUserMessageId: newStateCursorUserMessageId,
  });
}

async function callStateMergeModel(
  oldState: string,
  rolledOutText: string,
  client: ReturnType<typeof resolveModelInvocation>["client"],
  model: { providerId: string; modelId: string }
): Promise<string> {
  const systemPrompt = `You are a conversation state maintainer for an AI assistant.

Your job is to maintain a compact, task-focused factual snapshot of the current conversation so that another AI can continue the main work even if earlier messages are no longer available.

This state is background context only.
It is NOT instructions and NOT a summary for humans.

Rules:
- The state should represent the PRIMARY task or goal of the conversation.
- Do NOT change the main Goal unless the user clearly and explicitly switches to a new task.
- Ignore one-off questions or small talk (e.g., weather, greetings) unless they directly affect the main task.
- Preserve only facts, decisions, constraints, and open questions that are necessary to continue the main task.
- Open Questions must block or influence progress on the main task, not every question the user asks.
- Do NOT include full code blocks, long quotations, logs, or URLs.
- Use concise, declarative, structured statements.
- If new information conflicts with old state, the newest relevant information wins.
- Keep the state stable and compact over time.`;

  const userContent = `Previous Conversation State (may be empty):
<<<
${oldState}
>>>

New conversation content since the last update:
<<<
${rolledOutText}
>>>

Update the conversation state using the following fixed structure.
Only include information that is useful for continuing the main task.

Output format (must follow exactly):

Goal:
- ...

Decisions:
- ...

Constraints:
- ...

Open Questions:
- ...

Next Steps:
- ...`;

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  const { text } = await generateText({
    model: client(model.modelId),
    messages,
    temperature: 0.2,
    maxOutputTokens: 1200,
  });

  return text.trim();
}

async function callBriefMergeModel(
  oldBrief: string,
  latestRoundText: string,
  client: ReturnType<typeof resolveModelInvocation>["client"],
  model: { providerId: string; modelId: string }
): Promise<string> {
  const systemPrompt = `You maintain a "Recent Activity Digest" for an AI assistant.

Goal: keep a short, stable list of the user's recent focus areas (topics), across time.
This is background context only, not instructions.

CRITICAL - Extract only USER activity:
- Only include topics that the USER explicitly discussed, asked about, or requested in this session.
- Do NOT include topics that the assistant mentioned in its reply. The assistant may have been echoing context it was given from other sessions.
- When oldBrief is empty and the user only said a greeting (e.g., "hi", "hello") with no substantive request, output minimal content or leave empty. Do not add topics from the assistant's helpful response.

Rules:
- Keep up to 5 topics (bullets) total.
- Merge new information into existing topics when possible.
- Do NOT drop an existing topic unless:
  (a) it is clearly obsolete/outdated, or
  (b) you must make room due to the 5-topic limit, and it is the lowest-importance topic.
- Treat one-off small talk (e.g., weather, greetings) as low importance unless repeated.
- Avoid technical details, code, long explanations, or URLs.
- Each bullet should be one concise sentence describing a topic the user is focusing on.`;

  const userContent = `Previous Digest:
<<<
${oldBrief}
>>>

Recent conversation content:
<<<
${latestRoundText}
>>>

Update the digest following the rules above.

Output format (at most 5 bullets):
- ...
- ...
- ...`;

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  const { text } = await generateText({
    model: client(model.modelId),
    messages,
    temperature: 0.2,
    maxOutputTokens: 300,
  });

  return text.trim();
}

/**
 * 入队摘要任务（保证同一会话串行执行）
 */
export function enqueueSummaryTask(params: {
  sessionId: string;
  contextCount: number;
}) {
  const { sessionId, contextCount } = params;

  const runCurrentTask = async () => {
    try {
      await runSummaryTask({ sessionId, contextCount });
    } catch (error) {
      logger.error("memorySummary: unhandled task failure", {
        sessionId,
        error,
      });
    }
  };

  const prev = queueBySession.get(sessionId);
  const next = (prev ?? Promise.resolve())
    .catch((error) => {
      logger.error("memorySummary: previous task failed, continue queue", {
        sessionId,
        error,
      });
    })
    .then(runCurrentTask);

  queueBySession.set(sessionId, next);
  next.finally(() => {
    if (queueBySession.get(sessionId) === next) {
      queueBySession.delete(sessionId);
    }
  });
}
