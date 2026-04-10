import { describe, expect, it } from "vitest";
import { searchAll } from "../../search/searchService";
import {
  clearTranslateHistory,
  createTranslateRecord,
  deleteTranslateRecord,
  getTranslateRecord,
  listTranslateHistory,
} from "../translateData";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("translateData", () => {
  useTestDb("translate-data");

  it("creates, lists, gets, and deletes translation history records with search sync", () => {
    const older = createTranslateRecord({
      input: "hello",
      result: JSON.stringify({
        translation: { text: "你好" },
      }),
      targetLang: "zh",
    });
    const newer = createTranslateRecord({
      input: "world",
      result: JSON.stringify({
        translation: { text: "世界" },
      }),
      targetLang: "zh",
    });

    expect(listTranslateHistory().map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(listTranslateHistory({ limit: 1 }).map((item) => item.id)).toEqual([newer.id]);
    expect(getTranslateRecord(older.id)).toEqual(older);
    expect(searchAll({ query: "世界", scope: "translations" }).buckets.translations.total).toBe(1);

    deleteTranslateRecord(newer.id);

    expect(getTranslateRecord(newer.id)).toBeNull();
    expect(searchAll({ query: "世界", scope: "translations" }).buckets.translations.total).toBe(0);
    expect(listTranslateHistory().map((item) => item.id)).toEqual([older.id]);
  });

  it("clears all translation history and removes the corresponding search docs", () => {
    createTranslateRecord({
      input: "vector retrieval",
      result: JSON.stringify({
        translation: { text: "向量检索" },
      }),
      targetLang: "zh",
    });
    createTranslateRecord({
      input: "ranking",
      result: JSON.stringify({
        translation: { text: "排序" },
      }),
      targetLang: "zh",
    });

    expect(listTranslateHistory()).toHaveLength(2);
    expect(searchAll({ query: "向量", scope: "translations" }).buckets.translations.total).toBe(1);

    clearTranslateHistory();

    expect(listTranslateHistory()).toEqual([]);
    expect(searchAll({ query: "向量", scope: "translations" }).buckets.translations.total).toBe(0);
  });
});
