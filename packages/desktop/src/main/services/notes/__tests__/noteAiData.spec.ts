import { describe, expect, it } from "vitest";
import { createNote } from "../noteData";
import {
  createNoteAiMessage,
  createNoteAiSession,
  findNoteAiMessageByRequestAndRole,
  getNoteAiMessage,
  getOrCreateNoteAiSession,
  listNoteAiMessages,
  listNoteAiSessionsByNoteId,
  updateNoteAiMessage,
} from "../noteAiData";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("noteAiData", () => {
  useTestDb("note-ai-data");

  it("creates note ai sessions and reuses the latest session with updated model and context mode", async () => {
    const note = await createNote({
      title: "Draft",
      contentMd: "Initial note content",
    });

    const created = createNoteAiSession(note.id, "mock::fast", "selection-nearby");
    expect(created).toMatchObject({
      noteId: note.id,
      selectedModel: "mock::fast",
      contextMode: "selection-nearby",
    });

    const reused = getOrCreateNoteAiSession(note.id, "mock::general", "full");
    expect(reused.id).toBe(created.id);
    expect(reused).toMatchObject({
      noteId: note.id,
      selectedModel: "mock::general",
      contextMode: "full",
    });

    expect(listNoteAiSessionsByNoteId(note.id).map((item) => item.id)).toEqual([created.id]);
  });

  it("creates, lists, finds, and updates note ai messages while keeping request associations", async () => {
    const note = await createNote({
      title: "Draft",
      contentMd: "Initial note content",
    });
    const session = createNoteAiSession(note.id, "mock::general", "full");

    const userMessage = createNoteAiMessage({
      sessionId: session.id,
      requestId: "req-1",
      role: "user",
      parts: [{ type: "text", text: "Polish this paragraph" }],
      metaJson: {
        contextMode: "full",
      },
    });
    const assistantMessage = createNoteAiMessage({
      sessionId: session.id,
      requestId: "req-1",
      role: "assistant",
      status: "pending",
      parts: [],
    });

    expect(listNoteAiMessages(session.id).map((item) => item.id)).toEqual([userMessage.id, assistantMessage.id]);
    expect(findNoteAiMessageByRequestAndRole(session.id, "req-1", "assistant")?.id).toBe(assistantMessage.id);

    const updated = updateNoteAiMessage(assistantMessage.id, {
      requestId: "req-2",
      parts: [
        { type: "text", text: "Polished draft." },
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
      status: "success",
      tokenUsage: {
        inputTokens: 10,
        outputTokens: 12,
      },
      metaJson: {
        model: "mock::general",
      },
    });

    expect(updated).toMatchObject({
      id: assistantMessage.id,
      requestId: "req-2",
      status: "success",
      tokenUsage: {
        inputTokens: 10,
        outputTokens: 12,
      },
      metaJson: {
        model: "mock::general",
      },
    });
    expect(getNoteAiMessage(assistantMessage.id)?.parts).toHaveLength(2);
    expect(findNoteAiMessageByRequestAndRole(session.id, "req-2", "assistant")?.id).toBe(assistantMessage.id);
  });
});
