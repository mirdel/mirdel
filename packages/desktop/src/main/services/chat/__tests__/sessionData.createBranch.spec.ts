import { describe, expect, it } from "vitest";
import { createAssistantMessage, createUserMessage, listMessages } from "../messageData";
import { createBranch, createSession } from "../sessionData";
import { createTurn, listTurnsBySession, updateTurn } from "../turnData";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("sessionData.createBranch", () => {
  useTestDb("session-branch");

  it("copies messages, remaps quoted source ids, and preserves turn structure", () => {
    const parentSession = createSession("__default__", "default-scenario", "Parent Session");

    const user1 = createUserMessage({
      sessionId: parentSession.id,
      turnId: "turn-1",
      parts: [{ type: "text", text: "Question 1" }],
    });
    const assistant1 = createAssistantMessage({
      sessionId: parentSession.id,
      turnId: "turn-1",
      parts: [{ type: "text", text: "Answer 1" }],
      status: "success",
    });
    createTurn({
      id: "turn-1",
      sessionId: parentSession.id,
      userMessageId: user1.id,
      assistantMessageId: assistant1.id,
      triggerType: "submit",
      status: "success",
      selectedModel: "mock::general",
    });

    const user2 = createUserMessage({
      sessionId: parentSession.id,
      turnId: "turn-2",
      parts: [
        {
          type: "data-quote",
          id: "quote-1",
          data: {
            sourceMessageId: assistant1.id,
          },
        } as any,
        { type: "text", text: "Question 2" },
      ],
    });
    const assistant2 = createAssistantMessage({
      sessionId: parentSession.id,
      turnId: "turn-2",
      parts: [{ type: "text", text: "Answer 2" }],
      status: "success",
    });
    createTurn({
      id: "turn-2",
      sessionId: parentSession.id,
      userMessageId: user2.id,
      assistantMessageId: assistant2.id,
      triggerType: "submit",
      status: "success",
      selectedModel: "mock::general",
    });
    updateTurn("turn-2", {
      stateText: "state snapshot",
      briefText: "brief snapshot",
    });

    const branch = createBranch({
      parentSessionId: parentSession.id,
      forkFromMessageId: assistant2.id,
    });

    expect(branch.parentSessionId).toBe(parentSession.id);
    expect(branch.rootSessionId).toBe(parentSession.id);
    expect(branch.stateText).toBe("state snapshot");
    expect(branch.briefText).toBe("brief snapshot");

    const branchMessages = listMessages(branch.id);
    expect(branchMessages).toHaveLength(4);

    const copiedAssistant1 = branchMessages.find((message) => message.copiedFromMessageId === assistant1.id);
    const copiedUser2 = branchMessages.find((message) => message.copiedFromMessageId === user2.id);
    const copiedAssistant2 = branchMessages.find((message) => message.copiedFromMessageId === assistant2.id);

    expect(copiedAssistant1).toBeTruthy();
    expect(copiedUser2).toBeTruthy();
    expect(copiedAssistant2).toBeTruthy();
    expect(branch.forkPointMessageId).toBe(copiedAssistant2?.id);

    const quotePart = copiedUser2?.parts.find((part: any) => part?.type === "data-quote") as any;
    expect(quotePart?.data?.sourceMessageId).toBe(copiedAssistant1?.id);

    const branchTurns = listTurnsBySession(branch.id);
    expect(branchTurns).toHaveLength(2);
    expect(branchTurns[0]?.userMessageId).toBe(branchMessages.find((message) => message.copiedFromMessageId === user1.id)?.id);
    expect(branchTurns[0]?.assistantMessageId).toBe(copiedAssistant1?.id);
    expect(branchTurns[1]?.userMessageId).toBe(copiedUser2?.id);
    expect(branchTurns[1]?.assistantMessageId).toBe(copiedAssistant2?.id);
  });
});
