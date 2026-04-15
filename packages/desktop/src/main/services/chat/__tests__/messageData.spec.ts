import { describe, expect, it } from "vitest";
import {
  createAssistantMessage,
  createUserMessage,
  deleteMessagesByTurnId,
  getContextMessages,
  getMessage,
  getMessagesByTurnId,
  getParentUserMessage,
  getToolResultByCallId,
  updateMessage,
} from "../messageData";
import { createSession } from "../sessionData";
import { createTurn } from "../turnData";
import {
  createHistoricalMemoryVectorIndex,
  getHistoricalMemoryIndexStats,
  saveHistoricalMemoryChunks,
} from "../historicalMemoryData";
import type { CitationSource } from "@shared";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("messageData", () => {
  useTestDb("message-data");

  it("round-trips message fields and soft deletes a turn group", () => {
    const session = createSession("__default__", "default-scenario", "Message Data Test");
    const contextSources: CitationSource[] = [
      {
        index: 1,
        id: "S1",
        kind: "knowledge",
        source: "KB",
        title: "Chunk 1",
        content: "Knowledge chunk",
      },
    ];

    const userMessage = createUserMessage({
      sessionId: session.id,
      turnId: "turn-1",
      parts: [{ type: "text", text: "hello" }],
      contextSources,
    });
    const assistantMessage = createAssistantMessage({
      sessionId: session.id,
      turnId: "turn-1",
      parts: [{ type: "text", text: "hi" }],
      status: "pending",
    });

    createTurn({
      id: "turn-1",
      sessionId: session.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      triggerType: "submit",
      status: "success",
      selectedModel: "mock::general",
    });

    updateMessage(assistantMessage.id, {
      status: "success",
      tokenUsage: { inputTokens: 12, outputTokens: 34 },
    });

    const loadedAssistant = getMessage(assistantMessage.id);
    expect(loadedAssistant?.status).toBe("success");
    expect(loadedAssistant?.tokenUsage).toEqual({ inputTokens: 12, outputTokens: 34 });

    const loadedUser = getMessage(userMessage.id);
    expect(loadedUser?.contextSources).toEqual(contextSources);
    expect(getParentUserMessage(assistantMessage.id)?.id).toBe(userMessage.id);

    createHistoricalMemoryVectorIndex(2);
    saveHistoricalMemoryChunks({
      sessionId: session.id,
      sessionTitle: session.title,
      turnId: "turn-1",
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      chunks: ["Historical memory for the turn group."],
      embeddings: [[1, 0]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });
    expect(getHistoricalMemoryIndexStats().chunkCount).toBe(1);

    deleteMessagesByTurnId("turn-1");

    const deletedMessages = getMessagesByTurnId("turn-1");
    expect(deletedMessages).toHaveLength(2);
    expect(deletedMessages.every((message) => message.isDeleted)).toBe(true);
    expect(deletedMessages.every((message) => message.parts.length === 0)).toBe(true);
    expect(getHistoricalMemoryIndexStats().chunkCount).toBe(0);
  });

  it("clears historical memory when an indexed message is edited", () => {
    const session = createSession("__default__", "default-scenario", "Message Edit Memory");
    const userMessage = createUserMessage({
      sessionId: session.id,
      turnId: "turn-edit",
      parts: [{ type: "text", text: "Original question" }],
    });
    const assistantMessage = createAssistantMessage({
      sessionId: session.id,
      turnId: "turn-edit",
      parts: [{ type: "text", text: "Original answer" }],
      status: "success",
    });
    createTurn({
      id: "turn-edit",
      sessionId: session.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      triggerType: "submit",
      status: "success",
      selectedModel: "mock::general",
    });

    createHistoricalMemoryVectorIndex(2);
    saveHistoricalMemoryChunks({
      sessionId: session.id,
      sessionTitle: session.title,
      turnId: "turn-edit",
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      chunks: ["Historical memory before edit."],
      embeddings: [[1, 0]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });
    expect(getHistoricalMemoryIndexStats().chunkCount).toBe(1);

    updateMessage(assistantMessage.id, {
      parts: [{ type: "text", text: "Edited answer" }],
    });

    expect(getHistoricalMemoryIndexStats().chunkCount).toBe(0);
  });

  it("clears historical memory for both old and new turns when a message turn changes", () => {
    const session = createSession("__default__", "default-scenario", "Message Turn Move Memory");
    const assistantMessage = createAssistantMessage({
      sessionId: session.id,
      turnId: "turn-old",
      parts: [{ type: "text", text: "Answer before moving turns" }],
      status: "success",
    });

    createHistoricalMemoryVectorIndex(2);
    saveHistoricalMemoryChunks({
      sessionId: session.id,
      sessionTitle: session.title,
      turnId: "turn-old",
      userMessageId: "user-old",
      assistantMessageId: assistantMessage.id,
      chunks: ["Historical memory for the old turn."],
      embeddings: [[1, 0]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });
    saveHistoricalMemoryChunks({
      sessionId: session.id,
      sessionTitle: session.title,
      turnId: "turn-new",
      userMessageId: "user-new",
      assistantMessageId: "assistant-new",
      chunks: ["Historical memory for the new turn."],
      embeddings: [[0, 1]],
      embeddingModel: "provider::embedding",
      embeddingDimension: 2,
    });
    expect(getHistoricalMemoryIndexStats().chunkCount).toBe(2);

    updateMessage(assistantMessage.id, { turnId: "turn-new" });

    expect(getHistoricalMemoryIndexStats().chunkCount).toBe(0);
  });

  it("returns the nearest previous user message even when it was soft deleted", () => {
    const session = createSession("__default__", "default-scenario", "Message Parent User");

    const user1 = createUserMessage({
      sessionId: session.id,
      turnId: "turn-1",
      parts: [{ type: "text", text: "First question" }],
    });
    const assistant1 = createAssistantMessage({
      sessionId: session.id,
      turnId: "turn-1",
      parts: [{ type: "text", text: "First answer" }],
      status: "success",
    });
    const user2 = createUserMessage({
      sessionId: session.id,
      turnId: "turn-2",
      parts: [{ type: "text", text: "Second question" }],
    });
    const assistant2 = createAssistantMessage({
      sessionId: session.id,
      turnId: "turn-2",
      parts: [{ type: "text", text: "Second answer" }],
      status: "success",
    });

    updateMessage(user2.id, {
      isDeleted: true,
      deletedAt: Date.now(),
    });

    expect(getParentUserMessage(assistant1.id)?.id).toBe(user1.id);
    expect(getParentUserMessage(assistant2.id)?.id).toBe(user2.id);
  });

  it("filters context messages to completed non-deleted messages and keeps the latest order", () => {
    const session = createSession("__default__", "default-scenario", "Message Context");

    const user1 = createUserMessage({
      sessionId: session.id,
      turnId: "turn-1",
      parts: [{ type: "text", text: "Question 1" }],
    });
    const assistant1 = createAssistantMessage({
      sessionId: session.id,
      turnId: "turn-1",
      parts: [{ type: "text", text: "Answer 1" }],
      status: "success",
    });
    const user2 = createUserMessage({
      sessionId: session.id,
      turnId: "turn-2",
      parts: [{ type: "text", text: "Question 2" }],
    });
    const assistant2 = createAssistantMessage({
      sessionId: session.id,
      turnId: "turn-2",
      parts: [{ type: "text", text: "Answer 2" }],
      status: "aborted",
    });
    const assistantPending = createAssistantMessage({
      sessionId: session.id,
      turnId: "turn-3",
      parts: [{ type: "text", text: "Still streaming" }],
      status: "pending",
    });

    updateMessage(user1.id, { isDeleted: true, deletedAt: Date.now() });

    const contextMessages = getContextMessages(session.id, 3);

    expect(contextMessages.map((message) => message.id)).toEqual([
      assistant1.id,
      user2.id,
      assistant2.id,
    ]);
    expect(contextMessages.some((message) => message.id === user1.id)).toBe(false);
    expect(contextMessages.some((message) => message.id === assistantPending.id)).toBe(false);
  });

  it("returns stored tool output only when the tool finished with an output", () => {
    const session = createSession("__default__", "default-scenario", "Message Tool Output");

    createAssistantMessage({
      sessionId: session.id,
      turnId: "turn-tool-1",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "system::run_command",
          toolCallId: "tool-ok",
          state: "output-available",
          output: { stdout: "/workspace" },
          callProviderMetadata: { source: "mock" },
        } as any,
      ],
      status: "success",
    });
    createAssistantMessage({
      sessionId: session.id,
      turnId: "turn-tool-2",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "system::run_command",
          toolCallId: "tool-denied",
          state: "output-denied",
          output: { stdout: "" },
        } as any,
      ],
      status: "success",
    });

    expect(getToolResultByCallId(session.id, "tool-ok")).toEqual({
      output: { stdout: "/workspace" },
      toolName: "system::run_command",
      _meta: { source: "mock" },
    });
    expect(getToolResultByCallId(session.id, "tool-denied")).toEqual({
      output: {
        isError: true,
        error: "Tool execution was denied",
      },
      toolName: "system::run_command",
      _meta: undefined,
    });
    expect(getToolResultByCallId(session.id, "tool-missing")).toBeNull();
  });
});
