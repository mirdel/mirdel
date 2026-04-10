<template>
  <div class="flex flex-col gap-4 py-3">
    <!-- 主翻译结果 -->
    <template v-if="result.translation.text !== sourceText">
      <div v-if="result.termCard" class="rounded-xl border border-default bg-linear-to-b from-elevated to-default p-5">
        <div class="text-base leading-relaxed text-default whitespace-pre-wrap break-words">{{ result.translation.text }}</div>
      </div>
      <div v-else class="text-base leading-relaxed text-default whitespace-pre-wrap break-words">{{ result.translation.text }}</div>
    </template>

    <!-- term 附加信息：分块卡片 -->
    <template v-if="result.termCard">
      <!-- 发音 + 词性：同一行或紧凑块 -->
      <div
        v-if="(result.termCard.pronunciations?.length || result.termCard.partsOfSpeech?.length)"
        class="rounded-xl border border-default bg-default p-4"
      >
        <div class="flex flex-wrap items-baseline gap-x-6 gap-y-3">
          <div v-if="result.termCard.pronunciations?.length" class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-dimmed">{{ t("translate.result.pronunciations") }}</span>
            <span
              v-for="(p, i) in result.termCard.pronunciations"
              :key="i"
              class="text-sm text-default font-mono"
            >
              {{ p.label }} <span class="text-default">{{ p.ipa ? `[${p.ipa}]` : "" }}</span>
            </span>
          </div>
          <div v-if="result.termCard.partsOfSpeech?.length" class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-dimmed">{{ t("translate.result.partsOfSpeech") }}</span>
            <span
              v-for="(pos, i) in result.termCard.partsOfSpeech"
              :key="i"
              class="text-sm text-default"
            >
              {{ pos }}
            </span>
          </div>
        </div>
      </div>

      <!-- 释义 -->
      <div v-if="result.termCard.senses?.length" class="rounded-xl border border-default bg-default p-4">
        <div class="text-xs font-semibold uppercase tracking-wider text-dimmed mb-2">{{ t("translate.result.senses") }}</div>
        <ul class="space-y-1.5">
          <li
            v-for="(s, i) in result.termCard.senses"
            :key="i"
            class="text-sm leading-relaxed text-default pl-4 relative before:content-[''] before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-accented"
          >
            {{ s }}
          </li>
        </ul>
      </div>

      <!-- 同义词 / 反义词 / 常用搭配：标签式 -->
      <div
        v-if="result.termCard.synonyms?.length || result.termCard.antonyms?.length || result.termCard.commonPhrases?.length"
        class="rounded-xl border border-default bg-default p-4 space-y-3"
      >
        <div v-if="result.termCard.synonyms?.length" class="space-y-1.5">
          <div class="text-xs font-semibold uppercase tracking-wider text-dimmed">{{ t("translate.result.synonyms") }}</div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="(s, i) in result.termCard.synonyms"
              :key="i"
              class="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs"
            >
              {{ s }}
            </span>
          </div>
        </div>
        <div v-if="result.termCard.antonyms?.length" class="space-y-1.5">
          <div class="text-xs font-semibold uppercase tracking-wider text-dimmed">{{ t("translate.result.antonyms") }}</div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="(a, i) in result.termCard.antonyms"
              :key="i"
              class="inline-flex items-center px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 text-xs"
            >
              {{ a }}
            </span>
          </div>
        </div>
        <div v-if="result.termCard.commonPhrases?.length" class="space-y-1.5">
          <div class="text-xs font-semibold uppercase tracking-wider text-dimmed">{{ t("translate.result.commonPhrases") }}</div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="(p, i) in result.termCard.commonPhrases"
              :key="i"
              class="inline-flex items-center px-2.5 py-1 rounded-lg bg-muted text-default text-xs"
            >
              {{ p }}
            </span>
          </div>
        </div>
      </div>

      <!-- 例句 -->
      <div v-if="result.termCard.examples?.length" class="rounded-xl border border-default bg-default p-4">
        <div class="text-xs font-semibold uppercase tracking-wider text-dimmed mb-3">{{ t("translate.result.examples") }}</div>
        <div class="space-y-3">
          <div
            v-for="(ex, i) in result.termCard.examples"
            :key="i"
            class="pl-4 border-l-2 border-default bg-elevated/30 rounded-r-lg py-2 pr-3"
          >
            <div class="text-sm text-default">{{ ex.source }}</div>
            <div v-if="ex.translation" class="text-sm text-default mt-1">{{ ex.translation }}</div>
          </div>
        </div>
      </div>

      <!-- 来源（典故） -->
      <div v-if="result.termCard.idiom?.isIdiom && result.termCard.idiom.source" class="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
        <div class="text-xs font-semibold uppercase tracking-wider text-amber-700/80 mb-2">{{ t("translate.result.source") }}</div>
        <div class="text-sm text-default">{{ result.termCard.idiom.source }}</div>
        <div v-if="result.termCard.idiom.story" class="text-sm text-default mt-2 leading-relaxed">
          {{ result.termCard.idiom.story }}
        </div>
      </div>

      <!-- 备注 -->
      <div v-if="result.termCard.notes?.length" class="rounded-xl border border-default bg-muted p-4">
        <div class="text-xs font-semibold uppercase tracking-wider text-dimmed mb-2">{{ t("translate.result.notes") }}</div>
        <ul class="space-y-1.5">
          <li
            v-for="(n, i) in result.termCard.notes"
            :key="i"
            class="text-sm text-default leading-relaxed pl-4 relative before:content-[''] before:absolute before:left-0 before:top-1.5 before:w-1 before:h-1 before:rounded-full before:bg-muted"
          >
            {{ n }}
          </li>
        </ul>
      </div>

    </template>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();

defineProps<{
  sourceText?: string;
  result: {
    translation: { text: string };
    termCard?: {
      headword?: string;
      pronunciations?: Array<{ label?: string; ipa?: string }>;
      partsOfSpeech?: string[];
      senses?: string[];
      synonyms?: string[];
      antonyms?: string[];
      commonPhrases?: string[];
      examples?: Array<{ source?: string; translation?: string }>;
      idiom?: { isIdiom?: boolean; source?: string; story?: string };
      notes?: string[];
    };
  };
}>();
</script>
