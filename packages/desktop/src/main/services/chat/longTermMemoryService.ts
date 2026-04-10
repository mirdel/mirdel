/**
 * 长期记忆（用户画像）提取服务
 * 每轮对话结束后，从 user 消息中提取用户画像并更新
 */
import { generateText, type ModelMessage } from "ai";
import { loggerServiceMain, type MessageContentPart } from "@shared";
import { getDefaultModelByType } from "../settings/settingsData";
import { resolveModelInvocation } from "../providers/modelInvocation";
import { getMessage } from "./messageData";
import {
  listLongTermMemory,
  applyPatchOps,
  type PatchOp,
  MAX_ITEMS,
  MAX_VALUE_LEN
} from "./longTermMemoryData";

const logger = loggerServiceMain.withContext("longTermMemoryService");

const MIN_CONFIDENCE = 0.78;
const RULE_BASED_CONFIDENCE = 0.82;
const MAX_AUTO_ADDS_PER_TURN = 2;

type ExtractedOp = PatchOp & {
  confidence?: number;
  evidenceText?: string;
};

const ALLOWED_AUTO_KEYS = new Set([
  "occupation",
  "background",
  "location",
  "residence",
  "timezone",
  "language_preference",
  "communication_tone",
  "response_style_preference",
  "format_preference",
  "tool_preference",
  "framework_preference",
  "coding_style_preference",
  "color_preference",
  "diet_preference",
  "exercise_habit",
  "health_constraint",
  "allergy",
  "hard_constraint",
  "goal",
  "current_focus",
  "current_project",
  "content_style_preference",
  "title_style_preference",
]);

const ALLOWED_AUTO_KEY_PREFIXES = [
  "preference_",
  "constraint_",
  "habit_",
  "profile_",
  "work_",
];

function extractTextFromContent(parts: MessageContentPart[]): string {
  return parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseConfidence(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
  }
  return undefined;
}

function parseEvidenceText(raw: Record<string, unknown>): string {
  const candidates = [
    raw.evidenceText,
    raw.evidence,
    raw.quote,
    raw.evidence_text,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function hasSelfRelatedSignal(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const explicitSelf = /\b(i|i'm|im|my|mine|me|myself)\b|我|本人|自己|俺|咱/.test(t.toLowerCase());
  const preferenceSignals = /喜欢|偏好|讨厌|不喜欢|想要|希望|习惯|经常|爱|钟爱|prefer|like|love|hate|dislike|want|need|usually|tend/i.test(t);
  const constraintSignals = /过敏|不能|不吃|禁忌|忌口|allergic|cannot|can't|must not|avoid/i.test(t.toLowerCase());
  return explicitSelf || preferenceSignals || constraintSignals;
}

function evidenceAppearsInUserText(evidenceText: string, userText: string): boolean {
  if (!evidenceText.trim()) return false;
  const evidenceNorm = normalizeText(evidenceText);
  const userNorm = normalizeText(userText);
  if (!evidenceNorm || evidenceNorm.length < 2) return false;
  return userNorm.includes(evidenceNorm);
}

function isAllowedAutoKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return false;
  if (ALLOWED_AUTO_KEYS.has(normalized)) return true;
  return ALLOWED_AUTO_KEY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function inferConfidence(op: ExtractedOp, userText: string): number {
  const explicit = op.confidence;
  if (explicit !== undefined) return explicit;

  const evidence = (op.evidenceText || "").trim();
  if (!evidence) return 0;
  if (!evidenceAppearsInUserText(evidence, userText)) return 0;
  if (hasSelfRelatedSignal(evidence)) return RULE_BASED_CONFIDENCE;
  return 0;
}

function parseOpsFromResponse(text: string): ExtractedOp[] {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { ops?: unknown[] };
    if (!Array.isArray(parsed.ops)) return [];

    const ops: ExtractedOp[] = [];
    for (const rawOp of parsed.ops) {
      if (!rawOp || typeof rawOp !== "object") continue;
      const raw = rawOp as Record<string, unknown>;
      const opType = typeof raw.op === "string" ? raw.op : "";
      const confidence = parseConfidence(raw.confidence);
      const evidenceText = parseEvidenceText(raw);

      if (opType === "add" && raw.item && typeof raw.item === "object") {
        const itemRaw = raw.item as Record<string, unknown>;
        if (typeof itemRaw.key !== "string" || typeof itemRaw.value !== "string") continue;
        ops.push({
          op: "add",
          item: {
            category: typeof itemRaw.category === "string" ? itemRaw.category : "other",
            key: itemRaw.key,
            value: itemRaw.value,
          },
          confidence,
          evidenceText,
        });
        continue;
      }

      if (opType === "update" && typeof raw.key === "string" && typeof raw.value === "string") {
        ops.push({
          op: "update",
          key: raw.key,
          value: raw.value,
          confidence,
          evidenceText,
        });
        continue;
      }

      if (opType === "remove" && typeof raw.key === "string") {
        ops.push({
          op: "remove",
          key: raw.key,
          confidence,
          evidenceText,
        });
        continue;
      }

      if (
        opType === "merge" &&
        typeof raw.intoKey === "string" &&
        Array.isArray(raw.fromKeys) &&
        typeof raw.value === "string"
      ) {
        const fromKeys = raw.fromKeys.filter((k): k is string => typeof k === "string");
        if (fromKeys.length === 0) continue;
        ops.push({
          op: "merge",
          intoKey: raw.intoKey,
          fromKeys,
          value: raw.value,
          confidence,
          evidenceText,
        });
      }
    }

    return ops;
  } catch {
    return [];
  }
}

function sanitizeOps(input: {
  ops: ExtractedOp[];
  userText: string;
  existingKeys: Set<string>;
}): PatchOp[] {
  const { ops, userText, existingKeys } = input;
  const accepted: PatchOp[] = [];
  let addCount = 0;

  for (const op of ops) {
    const confidence = inferConfidence(op, userText);
    const evidenceText = (op.evidenceText || "").trim();
    const evidenceMatched = evidenceAppearsInUserText(evidenceText, userText);
    const signalText = evidenceText || userText;
    const hasSelfSignal = hasSelfRelatedSignal(signalText);

    if (confidence < MIN_CONFIDENCE) {
      continue;
    }
    if (!evidenceMatched) {
      continue;
    }
    if (!hasSelfSignal) {
      continue;
    }

    if (op.op === "add" && op.item) {
      const key = op.item.key.trim().toLowerCase();
      if (!isAllowedAutoKey(key)) continue;
      const value = op.item.value.trim();
      if (!value) continue;

      if (existingKeys.has(key)) {
        accepted.push({
          op: "update",
          key,
          value,
        });
        continue;
      }

      if (addCount >= MAX_AUTO_ADDS_PER_TURN) {
        continue;
      }

      accepted.push({
        op: "add",
        item: {
          category: (op.item.category || "other").trim() || "other",
          key,
          value,
        },
      });
      existingKeys.add(key);
      addCount++;
      continue;
    }

    if (op.op === "update") {
      const key = op.key.trim().toLowerCase();
      if (!existingKeys.has(key)) continue;
      if (!isAllowedAutoKey(key)) continue;
      const value = op.value.trim();
      if (!value) continue;
      accepted.push({
        op: "update",
        key,
        value,
      });
      continue;
    }

    // 为保证稳定性，自动提取阶段暂不执行 remove / merge
    // 这两类操作容易在单条消息上下文中误删长期记忆。
  }

  return accepted;
}

async function runExtractionTask(params: { userMessageId: string }) {
  const { userMessageId } = params;
  logger.info("longTermMemory: task start", { userMessageId });

  const msg = getMessage(userMessageId);
  if (!msg || msg.role !== "user") {
    logger.info("longTermMemory: skip, msg not found or not user", { userMessageId });
    return;
  }

  const userText = extractTextFromContent(msg.parts);
  if (!userText.trim()) {
    logger.info("longTermMemory: skip, empty user text", { userMessageId });
    return;
  }

  const model = getDefaultModelByType("fast") ?? getDefaultModelByType("general");
  if (!model?.providerId || !model.modelId) {
    logger.warn("longTermMemory: no fast/general model configured, skip");
    return;
  }

  let client: ReturnType<typeof resolveModelInvocation>["client"];
  try {
    client = resolveModelInvocation({ providerId: model.providerId, modelId: model.modelId }).client;
  } catch (error) {
    logger.warn("longTermMemory: model invocation unavailable, skip", {
      providerId: model.providerId,
      modelId: model.modelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const currentList = listLongTermMemory();
  const profileJson = JSON.stringify(
    currentList.map(({ category, key, value }) => ({ category, key, value })),
    null,
    2
  );

  const systemPrompt = `You are a user profile memory editor for an AI assistant.

You will be given:
1) The current profile memory list (authoritative baseline)
2) New user messages from the current turn

Your job:
Propose minimal edits (patch operations) to keep the profile accurate and useful.

What to add: Facts that describe the user (identity, preferences, habits, constraints).
value format: MUST be a complete sentence in third person with subject "the user" (or equivalent in user's language).
Examples: "The user is a software engineer", "The user prefers Python", "The user is allergic to peanuts", "The user lives in Beijing"
Do NOT use fragments like "software engineer", "Python", "peanuts"

Separation & Merge Rules (CRITICAL):
- Each item = ONE semantic slot. Different facts MUST be separate items, never merged into one.
- Use distinct keys for different slots: occupation, current_project, language_preference, residence, allergy, habit_*, etc.
- NEVER merge identity (occupation) with current activity (current_project): e.g. "The user is a full-stack engineer" + "developing ai client" → two items, NOT "The user is a full-stack engineer, developing ai client".
- Ephemeral info (current project, recent learning): use current_project, current_learning as separate keys, so they can be updated/removed when stale.
- Merge only when SAME semantic slot AND complementary: e.g. "The user is a full-stack engineer" + "mainly does frontend" → merge to "The user is a full-stack engineer, mainly does frontend". Different slots → use add, not merge.

What NOT to add:
- Greetings, small talk, thanks (hello, hi, thanks, ok)
- Questions the user asked
- Content that does not describe the user themselves
- Identity questions such as "你是谁" / "who are you"
- If a message mixes multiple intents (e.g., question + self statement), only use the self-descriptive span as evidence.

When to return empty ops:
- User message only contains greetings or small talk
- User message is an identity question (e.g. "你是谁", "who are you")
- No profile-relevant fact in the message

Rules:
- Only update memory based on what the USER explicitly stated about themselves.
- Do NOT infer or invent.
- Do NOT add if an equivalent fact already exists.
- When user contradicts an existing fact, use update or remove.
- Prefer minimal changes (do not rewrite unrelated items).
- Suggest merges only when same semantic slot and complementary (see Separation & Merge Rules).
- Do not exceed limits (max ${MAX_ITEMS} items, max ${MAX_VALUE_LEN} chars per value). If needed, propose removals.
- value: complete sentence about the user, third person, subject "the user" (or equivalent in user's language), in user's language.
- key: semantic slot identifier (occupation, current_project, language_preference, residence, allergy, habit_*, etc.).
- For each op, you MUST provide:
  - confidence: number in [0, 1]
  - evidenceText: exact substring quoted from the user message (must be copied verbatim from input)

Return STRICT JSON only. No markdown, no explanation, no extra text.`;

  const userPrompt = `Current profile memory list (JSON):
<<<
${profileJson}
>>>

New user messages from the current turn:
<<<
${userText}
>>>

Return patch operations in this exact format:

{
  "ops": [
    { "op": "add", "item": { "category": "...", "key": "...", "value": "..." }, "confidence": 0.91, "evidenceText": "..." },
    { "op": "update", "key": "...", "value": "...", "confidence": 0.86, "evidenceText": "..." },
    { "op": "remove", "key": "...", "confidence": 0.90, "evidenceText": "..." },
    { "op": "merge", "intoKey": "...", "fromKeys": ["...", "..."], "value": "...", "confidence": 0.88, "evidenceText": "..." }
  ]
}

Constraints:
- When no profile-relevant content, return { "ops": [] }
- op list should be as short as possible
- value must be <= ${MAX_VALUE_LEN} chars

Examples of must-return-empty:
- user: "你好"
- user: "你是谁"
- user: "who are you"
`;

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  try {
    const { text } = await generateText({
      model: client(model.modelId),
      messages,
      temperature: 0.2,
      maxOutputTokens: 800
    });

    const extractedOps = parseOpsFromResponse(text);
    if (extractedOps.length === 0) {
      logger.info("longTermMemory: no ops from model, skip", { userMessageId, userTextPreview: userText.slice(0, 50) });
      return;
    }

    const existingKeys = new Set(currentList.map((item) => item.key.toLowerCase()));
    const ops = sanitizeOps({
      ops: extractedOps,
      userText,
      existingKeys,
    });
    if (ops.length === 0) {
      logger.info("longTermMemory: all extracted ops filtered out by quality gate", {
        userMessageId,
        extractedOpsCount: extractedOps.length,
        userTextPreview: userText.slice(0, 80),
      });
      return;
    }

    applyPatchOps(ops, { sessionId: msg.sessionId, messageId: userMessageId });
    logger.info("longTermMemory: updated", {
      userMessageId,
      sessionId: msg.sessionId,
      extractedOpsCount: extractedOps.length,
      acceptedOpsCount: ops.length,
    });
  } catch (e) {
    logger.error("longTermMemory: extraction failed", { error: e });
    // 静默跳过
  }
}

let extractionPromise: Promise<void> | null = null;

export function enqueueLongTermMemoryTask(params: { userMessageId: string }) {
  const { userMessageId } = params;

  const runCurrentTask = async () => {
    try {
      await runExtractionTask({ userMessageId });
    } catch (error) {
      logger.error("longTermMemory: unhandled task failure", {
        userMessageId,
        error,
      });
    }
  };

  const prev = extractionPromise;
  const next = (prev ?? Promise.resolve())
    .catch((error) => {
      logger.error("longTermMemory: previous task failed, continue queue", {
        userMessageId,
        error,
      });
    })
    .then(runCurrentTask);

  extractionPromise = next;
  next.finally(() => {
    if (extractionPromise === next) {
      extractionPromise = null;
    }
  });
}
