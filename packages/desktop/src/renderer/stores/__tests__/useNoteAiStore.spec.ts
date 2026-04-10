import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNoteAiStore } from "../useNoteAiStore";

type StreamHandler = (event: any) => void;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function installNoteAiWindowMocks(
  handler: (channel: string, payload?: any) => Promise<any> | any
) {
  const streamHandlers = new Set<StreamHandler>();
  const ipcMock = vi.fn((channel: string, payload?: any) => handler(channel, payload));

  Object.defineProperty(window, "ipc", {
    configurable: true,
    writable: true,
    value: ipcMock,
  });
  Object.defineProperty(window, "notesAi", {
    configurable: true,
    writable: true,
    value: {
      onStream: vi.fn((listener: StreamHandler) => {
        streamHandlers.add(listener);
        return () => streamHandlers.delete(listener);
      }),
    },
  });

  return {
    ipcMock,
    emitStream(event: any) {
      for (const listener of streamHandlers) {
        listener(event);
      }
    },
  };
}

describe("useNoteAiStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
  });

  it("loads persisted note ai history and normalizes tool proposals", async () => {
    const { ipcMock } = installNoteAiWindowMocks(async (channel) => {
      if (channel === "notes:aiHistory") {
        return {
          session: {
            id: "session-1",
            noteId: "note-1",
            selectedModel: "mock::general",
            contextMode: "full",
            createdAt: 1,
            updatedAt: 2,
          },
          sessions: [
            {
              id: "session-1",
              noteId: "note-1",
              selectedModel: "mock::general",
              contextMode: "full",
              createdAt: 1,
              updatedAt: 2,
            },
          ],
          messages: [
            {
              id: "user-1",
              sessionId: "session-1",
              requestId: "req-1",
              role: "user",
              parts: [{ type: "text", text: "Polish this paragraph" }],
              status: "success",
              metaJson: {
                contextMode: "selection-nearby",
                selectionText: "Original sentence",
              },
              createdAt: 1,
              updatedAt: 1,
            },
            {
              id: "assistant-1",
              sessionId: "session-1",
              requestId: "req-1",
              role: "assistant",
              parts: [
                { type: "text", text: "Polished draft." },
                {
                  type: "dynamic-tool",
                  toolCallId: "tool-1",
                  toolName: "note_patch_document",
                  state: "output-available",
                  output: {
                    proposal: {
                      mode: "selection_replace",
                      replacement: "Polished draft.",
                    },
                  },
                },
              ],
              status: "success",
              metaJson: {
                model: "mock::general",
              },
              createdAt: 2,
              updatedAt: 2,
            },
          ],
        };
      }
      return null;
    });

    const store = useNoteAiStore();
    const history = await store.loadHistory("note-1");

    expect(ipcMock).toHaveBeenCalledWith("notes:aiHistory", {
      noteId: "note-1",
      sessionId: undefined,
    });
    expect(store.getActiveSessionId("note-1")).toBe("session-1");
    expect(store.getSessionModel("note-1")).toBe("mock::general");
    expect(store.getSessionContextMode("note-1")).toBe("full");
    expect(history[0]).toMatchObject({
      requestId: "req-1",
      prompt: "Polish this paragraph",
      selectionText: "Original sentence",
      contextMode: "selection-nearby",
      status: "success",
      model: "mock::general",
    });
    expect(history[0]?.toolCalls[0]).toMatchObject({
      toolCallId: "tool-1",
      status: "success",
      proposal: {
        mode: "selection_replace",
        replacement: "Polished draft.",
      },
    });
  });

  it("sends a note ai request, handles stream updates, and refreshes history", async () => {
    const { emitStream, ipcMock } = installNoteAiWindowMocks(async (channel, payload) => {
      if (channel === "notes:aiAssist") {
        emitStream({
          requestId: payload.requestId,
          type: "text-delta",
          delta: "Polished ",
        });
        emitStream({
          requestId: payload.requestId,
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
          sessionId: "session-1",
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
        };
      }
      if (channel === "notes:aiHistory") {
        return {
          session: {
            id: "session-1",
            noteId: "note-1",
            selectedModel: "mock::general",
            contextMode: "full",
            createdAt: 1,
            updatedAt: 2,
          },
          sessions: [
            {
              id: "session-1",
              noteId: "note-1",
              selectedModel: "mock::general",
              contextMode: "full",
              createdAt: 1,
              updatedAt: 2,
            },
          ],
          messages: [
            {
              id: "user-1",
              sessionId: "session-1",
              requestId: "req-1",
              role: "user",
              parts: [{ type: "text", text: "Polish this paragraph" }],
              status: "success",
              metaJson: {
                contextMode: "full",
              },
              createdAt: 1,
              updatedAt: 1,
            },
            {
              id: "assistant-1",
              sessionId: "session-1",
              requestId: "req-1",
              role: "assistant",
              parts: [{ type: "text", text: "Polished draft." }],
              status: "success",
              metaJson: {
                model: "mock::general",
              },
              createdAt: 2,
              updatedAt: 2,
            },
          ],
        };
      }
      return null;
    });

    const store = useNoteAiStore();
    const result = await store.sendAssist({
      noteId: "note-1",
      noteContentMd: "Original draft",
      userPrompt: "Polish this paragraph",
      contextMode: "full",
    });

    expect(result).toMatchObject({
      ok: true,
      item: expect.objectContaining({
        sessionId: "session-1",
      }),
    });
    expect(store.isNoteSending("note-1")).toBe(false);
    expect(store.getHistory("note-1")[0]).toMatchObject({
      requestId: "req-1",
      status: "success",
      prompt: "Polish this paragraph",
    });
    expect(ipcMock).toHaveBeenCalledWith(
      "notes:aiAssist",
      expect.objectContaining({
        noteId: "note-1",
        noteContentMd: "Original draft",
        userPrompt: "Polish this paragraph",
      })
    );
  });

  it("marks tool decisions and aborts an in-flight note ai request", async () => {
    const deferred = createDeferred<{
      ok: true;
      sessionId: string;
      model: string;
      text: string;
      toolCalls: any[];
    }>();

    const { ipcMock } = installNoteAiWindowMocks(async (channel, payload) => {
      if (channel === "notes:aiAssist") {
        return deferred.promise;
      }
      if (channel === "notes:aiHistory") {
        return {
          session: {
            id: "session-1",
            noteId: "note-1",
            selectedModel: "mock::general",
            contextMode: "full",
            createdAt: 1,
            updatedAt: 2,
          },
          sessions: [
            {
              id: "session-1",
              noteId: "note-1",
              selectedModel: "mock::general",
              contextMode: "full",
              createdAt: 1,
              updatedAt: 2,
            },
          ],
          messages: payload?.sessionId
            ? [
                {
                  id: "user-1",
                  sessionId: "session-1",
                  requestId: "req-tool",
                  role: "user",
                  parts: [{ type: "text", text: "Apply patch" }],
                  status: "success",
                  metaJson: { contextMode: "full" },
                  createdAt: 1,
                  updatedAt: 1,
                },
                {
                  id: "assistant-1",
                  sessionId: "session-1",
                  requestId: "req-tool",
                  role: "assistant",
                  parts: [
                    {
                      type: "dynamic-tool",
                      toolCallId: "tool-1",
                      toolName: "note_patch_document",
                      state: "output-available",
                      output: {
                        proposal: {
                          mode: "selection_replace",
                          replacement: "Applied patch",
                        },
                      },
                    },
                  ],
                  status: "success",
                  metaJson: { model: "mock::general" },
                  createdAt: 2,
                  updatedAt: 2,
                },
              ]
            : [],
        };
      }
      if (channel === "notes:aiSetToolCallDecision") {
        return { ok: true };
      }
      if (channel === "notes:aiAbort") {
        deferred.resolve({
          ok: true,
          sessionId: "session-1",
          model: "mock::general",
          text: "",
          toolCalls: [],
        });
        return { ok: true };
      }
      return null;
    });

    const store = useNoteAiStore();
    await store.loadHistory("note-1", "session-1");

    expect(await store.setToolCallApplied("assistant-1", "tool-1", true)).toBe(true);
    expect(await store.setToolCallRejected("assistant-1", "tool-1", true)).toBe(true);

    const sendingPromise = store.sendAssist({
      noteId: "note-1",
      sessionId: "session-1",
      noteContentMd: "Draft",
      userPrompt: "Apply patch",
      contextMode: "full",
    });

    expect(store.isNoteSending("note-1")).toBe(true);
    await store.abortByNote("note-1");
    await sendingPromise;

    expect(ipcMock).toHaveBeenCalledWith(
      "notes:aiSetToolCallDecision",
      expect.objectContaining({
        noteId: "note-1",
        toolCallId: "tool-1",
      })
    );
    expect(ipcMock).toHaveBeenCalledWith("notes:aiAbort", {
      requestId: expect.any(String),
    });
    expect(store.isNoteSending("note-1")).toBe(false);
  });
});
