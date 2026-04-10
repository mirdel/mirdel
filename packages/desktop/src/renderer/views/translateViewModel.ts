export type TranslateHistoryRecord = {
  id: string;
  input: string;
  result: string;
  targetLang: string;
  createdAt: number;
};

export function buildTranslateRouteQuery(
  query: Record<string, unknown>,
  recordId: string | null
): Record<string, unknown> {
  const nextQuery = { ...query };

  if (recordId) {
    nextQuery.recordId = recordId;
  } else {
    delete nextQuery.recordId;
  }

  return nextQuery;
}

export function resolveTranslateSelection(
  history: TranslateHistoryRecord[],
  recordId: string | null
): {
  selectedHistoryId: string | null;
  selectedRecord: TranslateHistoryRecord | null;
} {
  if (!recordId) {
    return {
      selectedHistoryId: null,
      selectedRecord: null,
    };
  }

  const record = history.find((item) => item.id === recordId) || null;
  return {
    selectedHistoryId: record?.id || null,
    selectedRecord: record,
  };
}

export function getTranslatePreviewText(record: Pick<TranslateHistoryRecord, "result">): string {
  try {
    const parsed = JSON.parse(record.result);
    return parsed?.translation?.text ?? "-";
  } catch {
    return "-";
  }
}
