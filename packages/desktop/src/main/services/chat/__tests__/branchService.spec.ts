import { describe, expect, it } from "vitest";
import { getDb } from "../../db";
import { getBranchesInfo } from "../branchService";
import { createAssistantMessage, createUserMessage } from "../messageData";
import { createBranch, createSession } from "../sessionData";
import { useTestDb } from "../../../../../test/helpers/testDb";

function setMessageTimestamp(messageId: string, timestamp: number) {
  getDb().prepare("UPDATE messages SET createdAt = ?, updatedAt = ? WHERE id = ?").run(timestamp, timestamp, messageId);
}

describe("branchService", () => {
  useTestDb("branch-service");

  it("returns branch info for the main session and each branch", () => {
    const parentSession = createSession("__default__", "default-scenario", "Parent Session");

    const parentUser1 = createUserMessage({
      sessionId: parentSession.id,
      turnId: "turn-1",
      parts: [{ type: "text", text: "Question 1" }],
    });
    const parentAssistant1 = createAssistantMessage({
      sessionId: parentSession.id,
      turnId: "turn-1",
      parts: [{ type: "text", text: "Answer 1" }],
      status: "success",
    });
    const parentUser2 = createUserMessage({
      sessionId: parentSession.id,
      turnId: "turn-2",
      parts: [{ type: "text", text: "Question 2" }],
    });
    const parentAssistant2 = createAssistantMessage({
      sessionId: parentSession.id,
      turnId: "turn-2",
      parts: [{ type: "text", text: "Answer 2" }],
      status: "success",
    });

    setMessageTimestamp(parentUser1.id, 1_000);
    setMessageTimestamp(parentAssistant1.id, 2_000);
    setMessageTimestamp(parentUser2.id, 3_000);
    setMessageTimestamp(parentAssistant2.id, 4_000);

    const branchSession = createBranch({
      parentSessionId: parentSession.id,
      forkFromMessageId: parentAssistant2.id,
    });

    const branchUser = createUserMessage({
      sessionId: branchSession.id,
      turnId: "turn-3",
      parts: [{ type: "text", text: "Branch question" }],
    });
    const branchAssistant = createAssistantMessage({
      sessionId: branchSession.id,
      turnId: "turn-3",
      parts: [{ type: "text", text: "Branch answer" }],
      status: "success",
    });

    setMessageTimestamp(branchUser.id, 5_000);
    setMessageTimestamp(branchAssistant.id, 6_000);

    const result = getBranchesInfo(parentSession.id);

    expect(result).toHaveLength(2);

    expect(result[0]).toMatchObject({
      session: expect.objectContaining({ id: parentSession.id }),
      messageCount: 4,
      forkPointMessage: null,
      firstNewMessage: null,
    });

    expect(result[1]).toMatchObject({
      session: expect.objectContaining({ id: branchSession.id }),
      messageCount: 6,
      parentSessionTitle: "Parent Session",
    });
    expect(result[1]?.forkPointMessage?.id).toBe(branchSession.forkPointMessageId);
    expect(result[1]?.forkPointMessage?.copiedFromMessageId).toBe(parentAssistant2.id);
    expect(result[1]?.firstNewMessage?.id).toBe(branchUser.id);
    expect(result[1]?.firstNewMessage?.parts).toEqual([{ type: "text", text: "Branch question" }]);
  });

  it("returns an empty list when the root session does not exist", () => {
    expect(getBranchesInfo("missing-session")).toEqual([]);
  });
});
