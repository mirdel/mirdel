import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserWindow } from "electron";

const {
  assistNoteWritingMock,
  createNoteAiMessageMock,
  createNoteAiSessionMock,
  findNoteAiMessageByRequestAndRoleMock,
  getNoteAiMessageMock,
  getNoteAiSessionByIdMock,
  getOrCreateNoteAiSessionMock,
  listNoteAiMessagesMock,
  listNoteAiSessionsByNoteIdMock,
  updateNoteAiMessageMock,
  updateNoteAiSessionContextModeMock,
  updateNoteAiSessionModelMock,
} = vi.hoisted(() => ({
  assistNoteWritingMock: vi.fn(),
  createNoteAiMessageMock: vi.fn(),
  createNoteAiSessionMock: vi.fn(),
  findNoteAiMessageByRequestAndRoleMock: vi.fn(),
  getNoteAiMessageMock: vi.fn(),
  getNoteAiSessionByIdMock: vi.fn(),
  getOrCreateNoteAiSessionMock: vi.fn(),
  listNoteAiMessagesMock: vi.fn(),
  listNoteAiSessionsByNoteIdMock: vi.fn(),
  updateNoteAiMessageMock: vi.fn(),
  updateNoteAiSessionContextModeMock: vi.fn(),
  updateNoteAiSessionModelMock: vi.fn(),
}));

vi.mock("typed-electron-ipc", () => ({
  ipcRouter: (handlers: Record<string, unknown>) => handlers,
}));

vi.mock("../../services/notes/noteAiService", () => ({
  assistNoteWriting: assistNoteWritingMock,
}));

vi.mock("../../services/notes/noteAiData", async () => {
  const actual = await vi.importActual<typeof import("../../services/notes/noteAiData")>("../../services/notes/noteAiData");
  return {
    ...actual,
    createNoteAiSession: createNoteAiSessionMock,
    createNoteAiMessage: createNoteAiMessageMock,
    findNoteAiMessageByRequestAndRole: findNoteAiMessageByRequestAndRoleMock,
    getNoteAiMessage: getNoteAiMessageMock,
    getNoteAiSessionById: getNoteAiSessionByIdMock,
    getOrCreateNoteAiSession: getOrCreateNoteAiSessionMock,
    listNoteAiSessionsByNoteId: listNoteAiSessionsByNoteIdMock,
    listNoteAiMessages: listNoteAiMessagesMock,
    updateNoteAiSessionModel: updateNoteAiSessionModelMock,
    updateNoteAiSessionContextMode: updateNoteAiSessionContextModeMock,
    updateNoteAiMessage: updateNoteAiMessageMock,
  };
});

const { router } = await import("../router");

describe("router note ai handlers", () => {
  const browserWindowMock = {
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn(),
    },
  };
  const session = {
    id: "note-session-1",
    noteId: "note-1",
    selectedModel: "mock::general",
    contextMode: "full",
    createdAt: 1,
    updatedAt: 1,
  };
  const userMessage = {
    id: "note-user-1",
    sessionId: "note-session-1",
    requestId: "req-1",
    role: "user",
    parts: [{ type: "text", text: "Polish this paragraph" }],
    status: "success",
    createdAt: 1,
    updatedAt: 1,
  };
  const assistantMessage = {
    id: "note-assistant-1",
    sessionId: "note-session-1",
    requestId: "req-1",
    role: "assistant",
    parts: [],
    status: "pending",
    createdAt: 2,
    updatedAt: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(browserWindowMock as any);

    getOrCreateNoteAiSessionMock.mockReturnValue(session);
    getNoteAiSessionByIdMock.mockReturnValue(session);
    createNoteAiSessionMock.mockReturnValue(session);
    createNoteAiMessageMock
      .mockReturnValueOnce(userMessage)
      .mockReturnValueOnce(assistantMessage);
    listNoteAiMessagesMock.mockReturnValue([]);
    listNoteAiSessionsByNoteIdMock.mockReturnValue([session]);
    getNoteAiMessageMock.mockReturnValue({
      ...assistantMessage,
      parts: [
        {
          type: "dynamic-tool",
          toolCallId: "tool-1",
          toolName: "note_patch_document",
          state: "output-available",
          output: {
            ok: true,
            proposal: {
              mode: "selection_replace",
              replacement: "Polished draft.",
            },
          },
        },
      ],
    });
    findNoteAiMessageByRequestAndRoleMock.mockReturnValue({
      ...assistantMessage,
      parts: [
        {
          type: "dynamic-tool",
          toolCallId: "tool-1",
          toolName: "note_patch_document",
          state: "output-available",
          output: {
            ok: true,
            proposal: {
              mode: "selection_replace",
              replacement: "Polished draft.",
            },
          },
        },
      ],
    });
    updateNoteAiMessageMock.mockImplementation((id: string, updates: Record<string, unknown>) => ({
      id,
      ...assistantMessage,
      ...updates,
    }));
    assistNoteWritingMock.mockResolvedValue({
      ok: true,
      model: "mock::general",
      text: "Polished draft.",
      toolCalls: [
        {
          toolCallId: "tool-1",
          toolName: "note_patch_document",
          status: "success",
          proposal: {
            mode: "selection_replace",
            replacement: "Polished draft.",
          },
        },
      ],
      tokenUsage: {
        inputTokens: 10,
        outputTokens: 12,
      },
    });
  });

  it("creates note ai messages, streams events, and persists the successful result", async () => {
    assistNoteWritingMock.mockImplementation(
      async (
        _input: Record<string, unknown>,
        options?: { onEvent?: (event: Record<string, unknown>) => void }
      ) => {
        options?.onEvent?.({
          type: "text-delta",
          delta: "Polished ",
        });
        options?.onEvent?.({
          type: "tool-call",
          toolCallId: "tool-1",
          toolName: "note_patch_document",
          input: {
            mode: "selection_replace",
            replacement: "Polished draft.",
          },
        });

        return {
          ok: true,
          model: "mock::general",
          text: "Polished draft.",
          toolCalls: [
            {
              toolCallId: "tool-1",
              toolName: "note_patch_document",
              status: "success",
              proposal: {
                mode: "selection_replace",
                replacement: "Polished draft.",
              },
            },
          ],
          tokenUsage: {
            inputTokens: 10,
            outputTokens: 12,
          },
        };
      }
    );

    await expect(
      router["notes:aiAssist"](
        { sender: {} } as any,
        {
          requestId: "req-1",
          noteId: "note-1",
          noteContentMd: "Original draft",
          userPrompt: "Polish this paragraph",
          contextMode: "full",
        }
      )
    ).resolves.toEqual({
      ok: true,
      model: "mock::general",
      text: "Polished draft.",
      toolCalls: [
        {
          toolCallId: "tool-1",
          toolName: "note_patch_document",
          status: "success",
          proposal: {
            mode: "selection_replace",
            replacement: "Polished draft.",
          },
        },
      ],
      tokenUsage: {
        inputTokens: 10,
        outputTokens: 12,
      },
      sessionId: "note-session-1",
    });

    expect(createNoteAiMessageMock).toHaveBeenCalledTimes(2);
    expect(assistNoteWritingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        noteContentMd: "Original draft",
        userPrompt: "Polish this paragraph",
        historyMessages: [],
      }),
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
        onEvent: expect.any(Function),
      })
    );
    expect(browserWindowMock.webContents.send).toHaveBeenCalledWith("notes:aiStream", {
      requestId: "req-1",
      type: "text-delta",
      delta: "Polished ",
    });
    expect(updateNoteAiSessionModelMock).toHaveBeenCalledWith("note-session-1", "mock::general");
    expect(updateNoteAiSessionContextModeMock).toHaveBeenCalledWith("note-session-1", "full");
  });

  it("returns history and session mutations for note ai", async () => {
    listNoteAiMessagesMock.mockReturnValue([userMessage, assistantMessage]);

    await expect(
      router["notes:aiHistory"]({} as any, {
        noteId: "note-1",
      })
    ).resolves.toEqual({
      session,
      sessions: [session],
      messages: [userMessage, assistantMessage],
    });

    await expect(
      router["notes:aiCreateSession"]({} as any, {
        noteId: "note-1",
        model: "mock::general",
        contextMode: "selection-nearby",
      })
    ).resolves.toEqual({
      ok: true,
      session,
    });
    expect(createNoteAiSessionMock).toHaveBeenCalledWith("note-1", "mock::general", "selection-nearby");

    await expect(
      router["notes:aiUpdateSessionContextMode"]({} as any, {
        sessionId: "note-session-1",
        contextMode: "full",
      })
    ).resolves.toEqual({ ok: true });
    expect(updateNoteAiSessionContextModeMock).toHaveBeenCalledWith("note-session-1", "full");

    await expect(
      router["notes:aiUpdateSessionModel"]({} as any, {
        sessionId: "note-session-1",
        model: "mock::fast",
      })
    ).resolves.toEqual({ ok: true });
    expect(updateNoteAiSessionModelMock).toHaveBeenCalledWith("note-session-1", "mock::fast");
  });

  it("updates tool call decision flags and rejects mismatched sessions", async () => {
    await expect(
      router["notes:aiSetToolCallDecision"]({} as any, {
        noteId: "note-1",
        sessionId: "note-session-1",
        requestId: "req-1",
        toolCallId: "tool-1",
        decision: "applied",
        value: true,
      })
    ).resolves.toEqual({ ok: true });
    expect(updateNoteAiMessageMock).toHaveBeenCalledWith(
      "note-assistant-1",
      expect.objectContaining({
        parts: [
          expect.objectContaining({
            toolCallId: "tool-1",
            applied: true,
            rejected: false,
          }),
        ],
      })
    );

    getNoteAiSessionByIdMock.mockReturnValue(null);
    await expect(
      router["notes:aiSetToolCallDecision"]({} as any, {
        noteId: "note-1",
        sessionId: "missing-session",
        requestId: "req-1",
        toolCallId: "tool-1",
        decision: "rejected",
        value: true,
      })
    ).resolves.toEqual({
      ok: false,
      error: expect.any(String),
    });

    await expect(
      router["notes:aiAbort"]({} as any, {
        requestId: "req-1",
      })
    ).resolves.toEqual({ ok: true });
  });
});
