import { describe, expect, it } from "vitest";
import { getDb } from "../../db";
import { createAssistantMessage, createUserMessage } from "../messageData";
import { createBranch, createSession } from "../sessionData";
import { getSessionOverview } from "../sessionOverviewService";
import { useTestDb } from "../../../../../test/helpers/testDb";

function setMessageTimestamp(messageId: string, timestamp: number) {
  getDb().prepare("UPDATE messages SET createdAt = ?, updatedAt = ? WHERE id = ?").run(timestamp, timestamp, messageId);
}

describe("sessionOverviewService", () => {
  useTestDb("session-overview-service");

  it("aggregates main-session messages and only shows branch-exclusive messages", () => {
    const mainSession = createSession("__default__", "default-scenario", "Main Session");

    const mainUser1 = createUserMessage({
      sessionId: mainSession.id,
      turnId: "turn-1",
      parts: [{ type: "text", text: "Main question 1" }],
    });
    const mainAssistant1a = createAssistantMessage({
      sessionId: mainSession.id,
      turnId: "turn-1",
      parts: [{ type: "text", text: "Draft answer" }],
      status: "success",
    });
    const mainAssistant1b = createAssistantMessage({
      sessionId: mainSession.id,
      turnId: "turn-1",
      parts: [{ type: "text", text: "Final answer 1" }],
      status: "success",
    });
    const mainUser2 = createUserMessage({
      sessionId: mainSession.id,
      turnId: "turn-2",
      parts: [{ type: "text", text: "Main question 2" }],
    });
    const mainAssistant2 = createAssistantMessage({
      sessionId: mainSession.id,
      turnId: "turn-2",
      parts: [{ type: "text", text: "Final answer 2" }],
      status: "success",
    });

    setMessageTimestamp(mainUser1.id, 1_000);
    setMessageTimestamp(mainAssistant1a.id, 2_000);
    setMessageTimestamp(mainAssistant1b.id, 3_000);
    setMessageTimestamp(mainUser2.id, 4_000);
    setMessageTimestamp(mainAssistant2.id, 5_000);

    const branchSession = createBranch({
      parentSessionId: mainSession.id,
      forkFromMessageId: mainAssistant2.id,
    });

    const branchUser1 = createUserMessage({
      sessionId: branchSession.id,
      turnId: "turn-3",
      parts: [{ type: "text", text: "Branch question 1" }],
    });
    const branchAssistant1a = createAssistantMessage({
      sessionId: branchSession.id,
      turnId: "turn-3",
      parts: [{ type: "text", text: "Branch draft answer" }],
      status: "success",
    });
    const branchAssistant1b = createAssistantMessage({
      sessionId: branchSession.id,
      turnId: "turn-3",
      parts: [{ type: "text", text: "Branch final answer 1" }],
      status: "success",
    });
    const branchUser2 = createUserMessage({
      sessionId: branchSession.id,
      turnId: "turn-4",
      parts: [{ type: "text", text: "Branch question 2" }],
    });
    const branchAssistant2 = createAssistantMessage({
      sessionId: branchSession.id,
      turnId: "turn-4",
      parts: [{ type: "text", text: "Branch final answer 2" }],
      status: "success",
    });

    setMessageTimestamp(branchUser1.id, 6_000);
    setMessageTimestamp(branchAssistant1a.id, 7_000);
    setMessageTimestamp(branchAssistant1b.id, 8_000);
    setMessageTimestamp(branchUser2.id, 9_000);
    setMessageTimestamp(branchAssistant2.id, 10_000);

    const overview = getSessionOverview(mainSession.id);

    expect(overview.sessions).toHaveLength(2);
    expect(overview.forkPoints).toEqual([
      {
        parentSessionId: mainSession.id,
        parentMessageId: mainAssistant2.id,
        childSessionId: branchSession.id,
        childFirstMessageId: branchUser1.id,
      },
    ]);

    expect(overview.sessions[0]).toMatchObject({
      sessionId: mainSession.id,
      title: "Main Session",
      isMain: true,
      parentSessionId: null,
      forkFromMessageId: null,
      forkPointMessageId: null,
    });
    expect(overview.sessions[0]?.messages.map((message) => message.id)).toEqual([
      mainUser1.id,
      mainAssistant1b.id,
      mainUser2.id,
      mainAssistant2.id,
    ]);

    expect(overview.sessions[1]).toMatchObject({
      sessionId: branchSession.id,
      title: branchSession.title,
      isMain: false,
      parentSessionId: mainSession.id,
      forkFromMessageId: mainAssistant2.id,
      forkPointMessageId: branchSession.forkPointMessageId,
    });
    expect(overview.sessions[1]?.messages.map((message) => message.id)).toEqual([
      branchUser1.id,
      branchAssistant1b.id,
      branchUser2.id,
      branchAssistant2.id,
    ]);
  });

  it("throws when the root session does not exist", () => {
    expect(() => getSessionOverview("missing-session")).toThrow();
  });
});
