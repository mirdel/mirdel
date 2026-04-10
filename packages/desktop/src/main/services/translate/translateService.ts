/**
 * 翻译服务：调用 LLM 进行翻译，返回结构化 JSON
 */
import { generateText, streamObject } from "ai";
import { z } from "zod";
import { getDefaultModelByType } from "../settings/settingsData";
import { resolveModelInvocation } from "../providers/modelInvocation";
import { loggerServiceMain, type TranslateStreamPayload } from "@shared";
import { tMain } from "../../i18n";
import { localModelRuntimeService } from "../model-server";
import { LOCAL_PROVIDER_ID } from "../providers/localModelConstants";

const logger = loggerServiceMain.withContext("translate");

const TRANSLATE_SYSTEM_PROMPT = `You are a professional multilingual translation and lexical analysis engine.

Your task is to analyze the user input and return a SINGLE JSON object
that strictly follows the required schema.

Core rules (VERY IMPORTANT):

1. Always produce a translation result, regardless of input length or language.
2. Determine whether the input is a "term" or "text":
   - "term": a word, short phrase, idiom, fixed expression, or proper name
     that can be reasonably explained without additional context.
   - "text": a full sentence, multiple sentences, or paragraph(s)
     that require contextual understanding.
3. Only when the detected type is "term", provide a structured termCard.
4. When the detected source language and the target language are the SAME:
   - For "term": provide a clear explanation, paraphrase, or definition in the same language.
   - For "text": provide a natural rewrite or normalization that preserves the original meaning.
   - Do NOT simply repeat the original text.
5. When the source and target languages are DIFFERENT, ALL termCard content must be in the TARGET language:
   - senses: definitions or explanations in the target language (e.g. target 中文 → senses in Chinese).
   - synonyms, antonyms, commonPhrases: in the target language.
   - examples: "source" can be original or target; "translation" if present should match the other side; prefer showing usage in the target language when helpful.
   - idiom.source, idiom.story, notes: in the target language.
   - partsOfSpeech: can stay in English (e.g. "noun") or use target language.
6. Never invent facts, meanings, origins, or examples.
   If you are uncertain about any optional field, leave it empty or null.
7. Keep all lists concise. Do not exceed reasonable limits.
8. Output JSON ONLY. Do not include explanations, comments, or extra text.

---

Detected fields must include:
- detected.type: "term" or "text"
- detected.sourceLang: ISO language code (e.g. "en", "zh", "ja")
- detected.confidence: a float between 0 and 1

Translation must include:
- translation.targetLang
- translation.text

termCard must ONLY appear when detected.type === "term".
All termCard subfields are OPTIONAL unless otherwise specified.

---

JSON Schema (must follow exactly):

{
  "detected": {
    "type": "term | text",
    "sourceLang": "string",
    "confidence": number
  },
  "translation": {
    "targetLang": "string",
    "text": "string"
  },
  "termCard": {
    "headword": "string",
    "pronunciations": [
      { "label": "string", "ipa": "string" }
    ],
    "partsOfSpeech": ["string"],
    "senses": ["string"],
    "commonPhrases": ["string"],
    "synonyms": ["string"],
    "antonyms": ["string"],
    "examples": [
      { "source": "string", "translation": "string" }
    ],
    "notes": ["string"],
    "idiom": {
      "isIdiom": boolean,
      "source": "string",
      "story": "string"
    }
  }
}

Additional constraints:
- senses: max 5 items
- examples: max 3 items
- synonyms / antonyms / commonPhrases: max 6 items each
- If a field is not applicable, omit it or set it to null.`;

async function getModelClient(modelOverride?: string): Promise<{
  providerId: string;
  modelId: string;
  client: ReturnType<typeof resolveModelInvocation>["client"];
}> {
  let providerId: string;
  let modelId: string;
  if (modelOverride && modelOverride.includes("::")) {
    const [p, m] = modelOverride.split("::");
    if (!p || !m) throw new Error(tMain("translate.invalidModelFormat", { model: modelOverride }));
    providerId = p;
    modelId = m;
  } else {
    const def = getDefaultModelByType("translate") ?? getDefaultModelByType("general");
    if (!def?.providerId || !def?.modelId) {
      throw new Error(tMain("translate.defaultModelRequired"));
    }
    providerId = def.providerId;
    modelId = def.modelId;
  }
  if (providerId === LOCAL_PROVIDER_ID) {
    await localModelRuntimeService.ensureModelReady(modelId);
  }
  const { client } = resolveModelInvocation({ providerId, modelId });
  return { providerId, modelId, client };
}

export type TranslateResult = {
  detected: { type: "term" | "text"; sourceLang: string; confidence: number };
  translation: { targetLang: string; text: string };
  termCard?: {
    headword?: string;
    pronunciations?: Array<{ label?: string; ipa?: string }>;
    partsOfSpeech?: string[];
    senses?: string[];
    commonPhrases?: string[];
    synonyms?: string[];
    antonyms?: string[];
    examples?: Array<{ source?: string; translation?: string }>;
    notes?: string[];
    idiom?: { isIdiom?: boolean; source?: string; story?: string };
  };
};

const translateResultSchema = z.object({
  detected: z.object({
    type: z.enum(["term", "text"]).catch("text"),
    sourceLang: z.string().min(1).catch("unknown"),
    confidence: z.number().catch(1),
  }),
  translation: z.object({
    targetLang: z.string().min(1),
    text: z.string(),
  }),
  termCard: z.object({
    headword: z.string().optional(),
    pronunciations: z.array(z.object({
      label: z.string().optional(),
      ipa: z.string().optional(),
    })).optional(),
    partsOfSpeech: z.array(z.string()).optional(),
    senses: z.array(z.string()).optional(),
    commonPhrases: z.array(z.string()).optional(),
    synonyms: z.array(z.string()).optional(),
    antonyms: z.array(z.string()).optional(),
    examples: z.array(z.object({
      source: z.string().optional(),
      translation: z.string().optional(),
    })).optional(),
    notes: z.array(z.string()).optional(),
    idiom: z.object({
      isIdiom: z.boolean().optional(),
      source: z.string().optional(),
      story: z.string().optional(),
    }).optional(),
  }).optional(),
}).passthrough();

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildUserPrompt(input: string, targetLang: string): string {
  return `Target language (ISO code): ${targetLang}

User input:
${input}`;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTranslateResult(value: unknown, fallbackTargetLang: string): TranslateResult {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const detectedRaw = source.detected && typeof source.detected === "object"
    ? source.detected as Record<string, unknown>
    : {};
  const translationRaw = source.translation && typeof source.translation === "object"
    ? source.translation as Record<string, unknown>
    : {};
  const termCardRaw = source.termCard && typeof source.termCard === "object"
    ? source.termCard as Record<string, unknown>
    : null;

  const detectedType = String(detectedRaw.type || "").trim() === "term" ? "term" : "text";
  const sourceLang = String(detectedRaw.sourceLang || "").trim() || "unknown";
  const confidenceValue = Number(detectedRaw.confidence);
  const confidence = Number.isFinite(confidenceValue) ? confidenceValue : 1;

  const translationText = String(translationRaw.text || "").trim();
  const translationTargetLang = String(translationRaw.targetLang || "").trim() || fallbackTargetLang;

  let termCard: TranslateResult["termCard"] | undefined;
  if (detectedType === "term" && termCardRaw) {
    const pronunciations = Array.isArray(termCardRaw.pronunciations)
      ? termCardRaw.pronunciations
          .map((item) => {
            const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
            const label = String(entry.label || "").trim();
            const ipa = String(entry.ipa || "").trim();
            if (!label && !ipa) return null;
            return {
              ...(label ? { label } : {}),
              ...(ipa ? { ipa } : {}),
            };
          })
          .filter((item): item is { label?: string; ipa?: string } => !!item)
      : undefined;

    const examples = Array.isArray(termCardRaw.examples)
      ? termCardRaw.examples
          .map((item) => {
            const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
            const source = String(entry.source || "").trim();
            const translation = String(entry.translation || "").trim();
            if (!source && !translation) return null;
            return {
              ...(source ? { source } : {}),
              ...(translation ? { translation } : {}),
            };
          })
          .filter((item): item is { source?: string; translation?: string } => !!item)
      : undefined;

    const idiomRaw = termCardRaw.idiom && typeof termCardRaw.idiom === "object"
      ? termCardRaw.idiom as Record<string, unknown>
      : null;
    const idiom = idiomRaw
      ? {
          ...(typeof idiomRaw.isIdiom === "boolean" ? { isIdiom: idiomRaw.isIdiom } : {}),
          ...(String(idiomRaw.source || "").trim() ? { source: String(idiomRaw.source || "").trim() } : {}),
          ...(String(idiomRaw.story || "").trim() ? { story: String(idiomRaw.story || "").trim() } : {}),
        }
      : undefined;

    const next: TranslateResult["termCard"] = {
      ...(String(termCardRaw.headword || "").trim() ? { headword: String(termCardRaw.headword || "").trim() } : {}),
      ...(pronunciations && pronunciations.length > 0 ? { pronunciations } : {}),
      ...(normalizeStringArray(termCardRaw.partsOfSpeech) ? { partsOfSpeech: normalizeStringArray(termCardRaw.partsOfSpeech) } : {}),
      ...(normalizeStringArray(termCardRaw.senses) ? { senses: normalizeStringArray(termCardRaw.senses) } : {}),
      ...(normalizeStringArray(termCardRaw.commonPhrases) ? { commonPhrases: normalizeStringArray(termCardRaw.commonPhrases) } : {}),
      ...(normalizeStringArray(termCardRaw.synonyms) ? { synonyms: normalizeStringArray(termCardRaw.synonyms) } : {}),
      ...(normalizeStringArray(termCardRaw.antonyms) ? { antonyms: normalizeStringArray(termCardRaw.antonyms) } : {}),
      ...(examples && examples.length > 0 ? { examples } : {}),
      ...(normalizeStringArray(termCardRaw.notes) ? { notes: normalizeStringArray(termCardRaw.notes) } : {}),
      ...(idiom && Object.keys(idiom).length > 0 ? { idiom } : {}),
    };

    if (Object.keys(next).length > 0) {
      termCard = next;
    }
  }

  return {
    detected: {
      type: detectedType,
      sourceLang,
      confidence,
    },
    translation: {
      targetLang: translationTargetLang,
      text: translationText,
    },
    ...(termCard ? { termCard } : {}),
  };
}

function parseTranslateTextResponse(text: string, targetLang: string): TranslateResult {
  let raw = text.trim();
  const codeBlockMatch = raw.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    raw = codeBlockMatch[1].trim();
  }
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    raw = jsonMatch[0];
  }
  const parsed = JSON.parse(raw);
  return normalizeTranslateResult(parsed, targetLang);
}

type TranslateStreamOptions = {
  onEvent?: (event: TranslateStreamPayload) => void;
};

export async function translate(params: {
  input: string;
  targetLang: string;
  model?: string;
  abortSignal?: AbortSignal;
}): Promise<TranslateResult> {
  const { input, targetLang, model, abortSignal } = params;
  const userPrompt = buildUserPrompt(input, targetLang);
  const { modelId, client } = await getModelClient(model);

  const { text } = await generateText({
    model: client(modelId),
    messages: [{ role: "user", content: userPrompt }],
    system: TRANSLATE_SYSTEM_PROMPT,
    temperature: 0.3,
    maxOutputTokens: 4096,
    abortSignal,
  });

  try {
    return parseTranslateTextResponse(text, targetLang);
  } catch (error) {
    logger.error("translate parse failed", { text: text.slice(0, 200), error });
    throw new Error(tMain("translate.parseFailed"));
  }
}

export async function translateStream(
  params: {
    input: string;
    targetLang: string;
    model?: string;
    abortSignal?: AbortSignal;
  },
  options?: TranslateStreamOptions
): Promise<TranslateResult> {
  const { input, targetLang, model, abortSignal } = params;
  const emit = (event: TranslateStreamPayload) => {
    options?.onEvent?.(event);
  };
  const userPrompt = buildUserPrompt(input, targetLang);
  const { providerId, modelId, client } = await getModelClient(model);

  let latestText = "";
  let finishReason: string | undefined;
  let doneEmitted = false;
  const emitDone = (payload?: { finishReason?: string; aborted?: boolean }) => {
    if (doneEmitted) return;
    doneEmitted = true;
    emit({ type: "done", finishReason: payload?.finishReason, aborted: payload?.aborted });
  };

  try {
    const stream = streamObject({
      model: client(modelId),
      messages: [{ role: "user", content: userPrompt }],
      system: TRANSLATE_SYSTEM_PROMPT,
      schema: translateResultSchema,
      temperature: 0.3,
      maxOutputTokens: 4096,
      abortSignal,
      providerOptions: {
        [providerId]: { think: { type: "disable" as const } },
      },
    });

    for await (const part of stream.fullStream) {
      if (part.type === "object") {
        const nextText = String((part.object as any)?.translation?.text || "").trim();
        if (nextText && nextText !== latestText) {
          latestText = nextText;
          emit({ type: "partial", translationText: nextText });
        }
      } else if (part.type === "finish") {
        finishReason = String(part.finishReason || "stop");
      } else if (part.type === "error") {
        emit({ type: "error", error: toErrorMessage(part.error) });
      }
    }

    const resultObject = await stream.object;
    const result = normalizeTranslateResult(resultObject, targetLang);
    if (result.translation.text && result.translation.text !== latestText) {
      emit({ type: "partial", translationText: result.translation.text });
    }
    emitDone({ finishReason });
    return result;
  } catch (error) {
    const message = toErrorMessage(error);
    if (abortSignal?.aborted || message === tMain("common.cancelled")) {
      emitDone({ finishReason, aborted: true });
      throw new Error(tMain("common.cancelled"));
    }

    logger.error("translate stream failed, fallback to non-stream", {
      providerId,
      modelId,
      message,
    });
    emit({ type: "error", error: message });

    try {
      const fallbackResult = await translate({
        input,
        targetLang,
        model,
        abortSignal,
      });
      if (fallbackResult.translation.text) {
        emit({ type: "partial", translationText: fallbackResult.translation.text });
      }
      emitDone({ finishReason: "stop" });
      return fallbackResult;
    } catch (fallbackError) {
      const fallbackMessage = toErrorMessage(fallbackError);
      emit({ type: "error", error: fallbackMessage });
      emitDone({ finishReason: "error" });
      throw fallbackError;
    }
  }
}
