import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserWindow } from "electron";

const {
  clearTranslateHistoryMock,
  createTranslateRecordMock,
  deleteTranslateRecordMock,
  getTranslateRecordMock,
  isSupportedFileMock,
  listTranslateHistoryMock,
  parseFileMock,
  translateMock,
  translateStreamMock,
} = vi.hoisted(() => ({
  clearTranslateHistoryMock: vi.fn(),
  createTranslateRecordMock: vi.fn(),
  deleteTranslateRecordMock: vi.fn(),
  getTranslateRecordMock: vi.fn(),
  isSupportedFileMock: vi.fn(),
  listTranslateHistoryMock: vi.fn(),
  parseFileMock: vi.fn(),
  translateMock: vi.fn(),
  translateStreamMock: vi.fn(),
}));

vi.mock("typed-electron-ipc", () => ({
  ipcRouter: (handlers: Record<string, unknown>) => handlers,
}));

vi.mock("../../services/translate/translateService", () => ({
  translate: translateMock,
  translateStream: translateStreamMock,
}));

vi.mock("../../services/translate/translateData", async () => {
  const actual = await vi.importActual<typeof import("../../services/translate/translateData")>("../../services/translate/translateData");
  return {
    ...actual,
    createTranslateRecord: createTranslateRecordMock,
    listTranslateHistory: listTranslateHistoryMock,
    getTranslateRecord: getTranslateRecordMock,
    deleteTranslateRecord: deleteTranslateRecordMock,
    clearTranslateHistory: clearTranslateHistoryMock,
  };
});

vi.mock("../../services/knowledge/parsers", async () => {
  const actual = await vi.importActual<typeof import("../../services/knowledge/parsers")>("../../services/knowledge/parsers");
  return {
    ...actual,
    parseFile: parseFileMock,
    isSupportedFile: isSupportedFileMock,
  };
});

const { router } = await import("../router");

async function waitUntil(assertion: () => void, options?: { timeoutMs?: number; intervalMs?: number }) {
  const timeoutMs = options?.timeoutMs ?? 1000;
  const intervalMs = options?.intervalMs ?? 10;
  const start = Date.now();

  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - start >= timeoutMs) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

describe("router translate handlers", () => {
  const browserWindowMock = {
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(browserWindowMock as any);

    const result = {
      detected: { type: "text" as const, sourceLang: "en", confidence: 1 },
      translation: { targetLang: "zh", text: "你好" },
    };
    const record = {
      id: "record-1",
      input: "hello",
      result: JSON.stringify(result),
      targetLang: "zh",
      createdAt: 1,
    };

    translateMock.mockResolvedValue(result);
    translateStreamMock.mockResolvedValue(result);
    createTranslateRecordMock.mockReturnValue(record);
    listTranslateHistoryMock.mockReturnValue([record]);
    getTranslateRecordMock.mockReturnValue(record);
    isSupportedFileMock.mockReturnValue(true);
    parseFileMock.mockResolvedValue("Loaded file content");
  });

  it("translates successfully, persists history, and forwards partial stream events", async () => {
    translateStreamMock.mockImplementation(
      async (
        _input: {
          input: string;
          targetLang: string;
          model?: string;
          abortSignal?: AbortSignal;
        },
        options?: {
          onEvent?: (event: Record<string, unknown>) => void;
        }
      ) => {
        options?.onEvent?.({
          type: "partial",
          translationText: "你",
        });

        return {
          detected: { type: "text" as const, sourceLang: "en", confidence: 1 },
          translation: { targetLang: "zh", text: "你好" },
        };
      }
    );

    await expect(
      router["translate:translate"](
        { sender: {} } as any,
        {
          requestId: "translate-1",
          input: "hello",
          targetLang: "zh",
          model: "mock::translate",
        }
      )
    ).resolves.toEqual({
      ok: true,
      result: {
        detected: { type: "text", sourceLang: "en", confidence: 1 },
        translation: { targetLang: "zh", text: "你好" },
      },
      record: expect.objectContaining({
        id: "record-1",
      }),
    });

    expect(translateStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "hello",
        targetLang: "zh",
        model: "mock::translate",
      }),
      expect.objectContaining({
        onEvent: expect.any(Function),
      })
    );
    expect(createTranslateRecordMock).toHaveBeenCalledWith({
      input: "hello",
      result: JSON.stringify({
        detected: { type: "text", sourceLang: "en", confidence: 1 },
        translation: { targetLang: "zh", text: "你好" },
      }),
      targetLang: "zh",
    });
    expect(browserWindowMock.webContents.send).toHaveBeenCalledWith("translate:stream", {
      requestId: "translate-1",
      type: "partial",
      translationText: "你",
    });
  });

  it("stores partial results when an in-flight translation is aborted", async () => {
    createTranslateRecordMock.mockReturnValue({
      id: "record-partial",
      input: "hello",
      result: JSON.stringify({
        detected: { type: "text", sourceLang: "unknown", confidence: 0 },
        translation: { targetLang: "zh", text: "你" },
        meta: { aborted: true, partial: true },
      }),
      targetLang: "zh",
      createdAt: 2,
    });

    translateStreamMock.mockImplementation(
      async (
        input: {
          abortSignal?: AbortSignal;
        },
        options?: {
          onEvent?: (event: Record<string, unknown>) => void;
        }
      ) => {
        options?.onEvent?.({
          type: "partial",
          translationText: "你",
        });

        await new Promise<never>((_resolve, reject) => {
          input.abortSignal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true }
          );
        });
      }
    );

    const translatePromise = router["translate:translate"](
      { sender: {} } as any,
      {
        requestId: "translate-abort",
        input: "hello",
        targetLang: "zh",
      }
    );

    await waitUntil(() => {
      expect(browserWindowMock.webContents.send).toHaveBeenCalledWith("translate:stream", {
        requestId: "translate-abort",
        type: "partial",
        translationText: "你",
      });
    });

    await expect(
      router["translate:abort"]({} as any, {
        requestId: "translate-abort",
      })
    ).resolves.toEqual({ ok: true });

    await expect(translatePromise).resolves.toEqual({
      ok: true,
      result: {
        detected: { type: "text", sourceLang: "unknown", confidence: 0 },
        translation: { targetLang: "zh", text: "你" },
        meta: { aborted: true, partial: true },
      },
      record: expect.objectContaining({
        id: "record-partial",
      }),
      aborted: true,
    });

    expect(createTranslateRecordMock).toHaveBeenCalledWith({
      input: "hello",
      result: JSON.stringify({
        detected: { type: "text", sourceLang: "unknown", confidence: 0 },
        translation: { targetLang: "zh", text: "你" },
        meta: { aborted: true, partial: true },
      }),
      targetLang: "zh",
    });
  });

  it("forwards translate history and file handlers with basic failure handling", async () => {
    await expect(router["translate:listHistory"]({} as any)).resolves.toEqual([
      expect.objectContaining({
        id: "record-1",
      }),
    ]);
    await expect(router["translate:getRecord"]({} as any, { id: "record-1" })).resolves.toEqual(
      expect.objectContaining({
        id: "record-1",
      })
    );

    await expect(
      router["translate:readFile"]({} as any, {
        filePath: "/tmp/source.md",
      })
    ).resolves.toEqual({
      ok: true,
      content: "Loaded file content",
    });

    isSupportedFileMock.mockReturnValue(false);
    await expect(
      router["translate:readFile"]({} as any, {
        filePath: "/tmp/source.exe",
      })
    ).resolves.toEqual({
      ok: false,
      error: expect.any(String),
    });

    await expect(
      router["translate:deleteRecord"]({} as any, {
        id: "record-1",
      })
    ).resolves.toEqual({ ok: true });
    expect(deleteTranslateRecordMock).toHaveBeenCalledWith("record-1");

    await expect(router["translate:clearHistory"]({} as any)).resolves.toEqual({ ok: true });
    expect(clearTranslateHistoryMock).toHaveBeenCalledTimes(1);
  });
});
