import { describe, expect, it } from "vitest";
import {
  buildTranslateRouteQuery,
  getTranslatePreviewText,
  resolveTranslateSelection,
  type TranslateHistoryRecord,
} from "../translateViewModel";

describe("translateViewModel", () => {
  const history: TranslateHistoryRecord[] = [
    {
      id: "record-1",
      input: "hello",
      result: JSON.stringify({
        translation: {
          text: "你好",
        },
      }),
      targetLang: "zh",
      createdAt: 1,
    },
    {
      id: "record-2",
      input: "world",
      result: "not-json",
      targetLang: "ja",
      createdAt: 2,
    },
  ];

  it("builds the next route query when selecting or clearing a history record", () => {
    expect(buildTranslateRouteQuery({ tab: "history" }, "record-1")).toEqual({
      tab: "history",
      recordId: "record-1",
    });

    expect(buildTranslateRouteQuery({ tab: "history", recordId: "record-2" }, null)).toEqual({
      tab: "history",
    });
  });

  it("resolves selected translate history records from the route query id", () => {
    expect(resolveTranslateSelection(history, "record-1")).toEqual({
      selectedHistoryId: "record-1",
      selectedRecord: history[0],
    });

    expect(resolveTranslateSelection(history, "missing")).toEqual({
      selectedHistoryId: null,
      selectedRecord: null,
    });
  });

  it("extracts preview text from stored translation results", () => {
    expect(getTranslatePreviewText(history[0])).toBe("你好");
    expect(getTranslatePreviewText(history[1])).toBe("-");
  });
});
