import type { SupportedAppLocale } from "@shared";
import { getMainAppLocale } from "../../i18n";

const HAN_CHAR_REGEX = /[\u3400-\u9fff]/g;
const ENGLISH_WORD_REGEX = /[A-Za-z]+(?:'[A-Za-z]+)*/g;

const TRADITIONAL_HINT_REGEX = /[體繁臺灣網頁軟體專業學習設計檔案應用程式預設處理這裡後續]/;
const SIMPLIFIED_HINT_REGEX = /[体繁台湾网页软件专业学习设计档案应用程序默认处理这里后续]/;

const EXPLICIT_LOCALE_PATTERNS: Array<{ locale: SupportedAppLocale; patterns: RegExp[] }> = [
  {
    locale: "zh-TW",
    patterns: [
      /\b(?:reply|respond|write|answer|summari[sz]e)\s+in\s+traditional\s+chinese\b/i,
      /\btraditional\s+chinese\b/i,
      /繁體中文|繁体中文|用繁體|用繁体|請用繁體|请用繁体|繁體回答|繁体回答/,
    ],
  },
  {
    locale: "zh-CN",
    patterns: [
      /\b(?:reply|respond|write|answer|summari[sz]e)\s+in\s+(?:simplified\s+)?chinese\b/i,
      /\bsimplified\s+chinese\b/i,
      /简体中文|簡體中文|用中文|请用中文|請用中文|用简体|用簡體|中文回答/,
    ],
  },
  {
    locale: "en",
    patterns: [
      /\b(?:reply|respond|write|answer|summari[sz]e)\s+in\s+english\b/i,
      /\bin\s+english\b/i,
      /用英文|用英语|請用英文|请用英文|英文回答|英语回答/,
    ],
  },
];

function detectExplicitLocale(text: string): SupportedAppLocale | null {
  const normalized = String(text || "").trim();
  if (!normalized) return null;

  for (const candidate of EXPLICIT_LOCALE_PATTERNS) {
    if (candidate.patterns.some((pattern) => pattern.test(normalized))) {
      return candidate.locale;
    }
  }

  return null;
}

function detectChineseVariant(text: string, fallback: SupportedAppLocale): SupportedAppLocale {
  if (TRADITIONAL_HINT_REGEX.test(text)) return "zh-TW";
  if (SIMPLIFIED_HINT_REGEX.test(text)) return "zh-CN";
  return fallback === "zh-TW" ? "zh-TW" : "zh-CN";
}

function detectDominantLocale(text: string, fallback: SupportedAppLocale): SupportedAppLocale | null {
  const normalized = String(text || "").trim();
  if (!normalized) return null;

  const hanCount = normalized.match(HAN_CHAR_REGEX)?.length ?? 0;
  const englishWordCount = normalized.match(ENGLISH_WORD_REGEX)?.length ?? 0;

  if (hanCount === 0 && englishWordCount === 0) {
    return null;
  }

  if (hanCount === 0) return "en";
  if (englishWordCount === 0) return detectChineseVariant(normalized, fallback);

  if (hanCount >= englishWordCount * 2) {
    return detectChineseVariant(normalized, fallback);
  }

  if (englishWordCount >= hanCount * 2 && hanCount < 8) {
    return "en";
  }

  return detectChineseVariant(normalized, fallback);
}

export function getDefaultResponseLocale(): SupportedAppLocale {
  return getMainAppLocale();
}

export function resolveTargetResponseLocale(params?: {
  currentUserText?: string | null;
  historicalUserTexts?: string[];
  fallbackLocale?: SupportedAppLocale;
}): SupportedAppLocale {
  const fallback = params?.fallbackLocale ?? getDefaultResponseLocale();
  const currentUserText = String(params?.currentUserText || "").trim();
  const historicalUserTexts = Array.isArray(params?.historicalUserTexts)
    ? params.historicalUserTexts.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  const textsToCheck = [currentUserText, ...historicalUserTexts.slice().reverse()];

  for (const text of textsToCheck) {
    const explicit = detectExplicitLocale(text);
    if (explicit) return explicit;
  }

  for (const text of textsToCheck) {
    const detected = detectDominantLocale(text, fallback);
    if (detected) return detected;
  }

  return fallback;
}

export function getLocaleInstructionLabel(locale: SupportedAppLocale): string {
  switch (locale) {
    case "zh-CN":
      return "Simplified Chinese";
    case "zh-TW":
      return "Traditional Chinese";
    case "en":
    default:
      return "English";
  }
}

export function getLocaleAcceptLanguage(locale: SupportedAppLocale): string {
  switch (locale) {
    case "zh-CN":
      return "zh-CN,zh;q=0.9,en;q=0.7";
    case "zh-TW":
      return "zh-TW,zh-Hant;q=0.9,zh;q=0.8,en;q=0.7";
    case "en":
    default:
      return "en-US,en;q=0.9,zh-CN;q=0.6";
  }
}

export function getLocaleNavigatorLanguages(locale: SupportedAppLocale): string[] {
  switch (locale) {
    case "zh-CN":
      return ["zh-CN", "zh", "en-US", "en"];
    case "zh-TW":
      return ["zh-TW", "zh-Hant", "zh", "en-US", "en"];
    case "en":
    default:
      return ["en-US", "en", "zh-CN", "zh"];
  }
}
