/**
 * 建议提取服务：基于大模型回复内容，用轻任务模型分析并返回可点击的追问建议
 * 输入：仅本次大模型回复的文本
 * 输出：{ needSuggestion: boolean, suggestions: string[] }，最多 3 条
 */
import { generateText, type ModelMessage } from "ai";
import { loggerServiceMain, type SupportedAppLocale } from "@shared";
import { tMain } from "../../i18n";
import { getDefaultModelByType } from "../settings/settingsData";
import { resolveModelInvocation } from "../providers/modelInvocation";
import { getLocaleInstructionLabel } from "../language/responseLocale";

const logger = loggerServiceMain.withContext("suggestionExtraction");

// Internal protocol prompt: keep in English for stable JSON extraction behavior.
const SYSTEM_PROMPT = `You extract short follow-up suggestions from a single assistant reply.

Input: one assistant reply. It may contain options, trade-offs, steps, caveats, recommendations, or conclusions.
Output: JSON only, in this exact shape:
{"needSuggestion": boolean, "suggestions": string[]}

Goal:
- Produce 0 to 3 short clickable follow-up prompts that the user could directly send next.
- Every suggestion must be directly supported by the reply. Do not introduce new topics, concepts, or tools.
- Write suggestions in the target language provided by the user message.

Set needSuggestion=true when at least one of these is true:
A. The reply presents multiple branches, options, or trade-offs.
B. The reply has steps, lists, dimensions, caveats, or clearly expandable details.
C. The reply says more information, assumptions, or confirmation is needed.
D. The reply suggests multiple actionable next steps.

Suggestion rules:
1. Each suggestion must be concise, directly sendable, and free of politeness filler.
2. Prefer suggestions that:
   - clarify comparisons,
   - turn recommendations into concrete steps,
   - ask what missing information is needed,
   - test boundary conditions or selection criteria.
3. Choose 1 to 3 suggestions that cover different directions when possible.
4. If needSuggestion=false, suggestions must be [].

Formatting:
- Output strict JSON only.
- No markdown, no explanation, no extra text.`;

export type SuggestionResult = {
  needSuggestion: boolean;
  suggestions: string[];
};

export async function extractSuggestions(params: {
  assistantText: string;
  targetLocale: SupportedAppLocale;
  timeoutMs?: number;
}): Promise<{ ok: true; data: SuggestionResult } | { ok: false; error: string }> {
  const { assistantText, targetLocale, timeoutMs = 8000 } = params;

  const trimmed = assistantText.trim();
  if (!trimmed || trimmed.length < 10) {
    return { ok: true, data: { needSuggestion: false, suggestions: [] } };
  }

  const fast = getDefaultModelByType("fast");
  if (!fast?.providerId || !fast?.modelId) {
    return { ok: false, error: tMain("suggestion.fastModelNotConfigured") };
  }

  let client: ReturnType<typeof resolveModelInvocation>["client"];
  try {
    client = resolveModelInvocation({ providerId: fast.providerId, modelId: fast.modelId }).client;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }

  const messages: ModelMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Target language: ${getLocaleInstructionLabel(targetLocale)}

The suggestions MUST be written in ${getLocaleInstructionLabel(targetLocale)}.
Do not follow quoted source language, link language, or product-name language when choosing output language.

Assistant reply:
<<<
${trimmed}
>>>`,
    },
  ];

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);

  try {
    const { text } = await generateText({
      model: client(fast.modelId),
      messages,
      temperature: 0.1,
      maxOutputTokens: 256,
      abortSignal: abort.signal,
      providerOptions: {
        [fast.providerId]: { think: { type: "disable" as const } },
      },
    });
    clearTimeout(timer);

    const cleaned = (text || "").trim().replace(/^```json?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as { needSuggestion?: boolean; suggestions?: string[] };

    const needSuggestion = !!parsed?.needSuggestion;
    let suggestions: string[] = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions
      : [];

    suggestions = suggestions
      .filter((s) => typeof s === "string" && s.trim().length > 0)
      .map((s) => String(s).trim())
      .slice(0, 3);

    if (!needSuggestion) {
      suggestions = [];
    }

    return {
      ok: true,
      data: { needSuggestion, suggestions },
    };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("extractSuggestions failed", { error: msg });
    return { ok: true, data: { needSuggestion: false, suggestions: [] } };
  }
}
