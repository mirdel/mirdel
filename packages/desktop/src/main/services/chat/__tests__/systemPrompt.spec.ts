import { beforeEach, describe, expect, it, vi } from "vitest";
import { addLongTermMemory } from "../longTermMemoryData";
import { resolveSystemPromptEnvelope } from "../systemPrompt";
import { createSession, updateSessionStateAndBrief } from "../sessionData";
import { useTestDb } from "../../../../../test/helpers/testDb";

const { getMemorySettingsMock } = vi.hoisted(() => ({
  getMemorySettingsMock: vi.fn(),
}));

vi.mock("../../settings/settingsData", async () => {
  const actual = await vi.importActual<typeof import("../../settings/settingsData")>("../../settings/settingsData");
  return {
    ...actual,
    getMemorySettings: getMemorySettingsMock,
  };
});

vi.mock("../../system/envInfo", () => ({
  getSystemContext: vi.fn(() => "## System Context\nWorkspace: /tmp/project"),
}));

vi.mock("../../language/responseLocale", () => ({
  getLocaleInstructionLabel: vi.fn(() => "English"),
}));

function createTemporarySession(title: string) {
  return createSession(
    "__default__",
    "default-scenario",
    title,
    null,
    [],
    "manual",
    "chat",
    "auto",
    "builtin",
    "auto",
    [],
    true,
    "session"
  );
}

describe("systemPrompt", () => {
  useTestDb("system-prompt");

  beforeEach(() => {
    getMemorySettingsMock.mockReturnValue({
      sessionStateEnabled: true,
      crossSessionEnabled: true,
      longTermEnabled: true,
    });
  });

  it("injects session state, long-term memory, and recent digest as non-instructional context", async () => {
    const currentSession = createSession("__default__", "default-scenario", "Current Work");
    updateSessionStateAndBrief(
      currentSession.id,
      "Goal: Finish the plan [S1](cite:1)\nConstraints: Keep it lean [S2]",
      "ignored for current session"
    );

    const recentSession = createSession("__default__", "default-scenario", "Previous Work");
    updateSessionStateAndBrief(
      recentSession.id,
      null,
      "- Wrapped up the rollout [S3]\n- Need follow-up docs"
    );

    addLongTermMemory({
      key: "user.preference.editor",
      value: "Prefers concise replies [S4](cite:4)",
      sessionId: currentSession.id,
    });

    const resolved = await resolveSystemPromptEnvelope({
      sessionId: currentSession.id,
      mode: "chat",
      citationRequired: true,
      responseLocale: "en",
    });

    expect(resolved.systemMessages).toHaveLength(1);
    expect(String(resolved.systemMessages[0]?.content)).toContain("## System Context");
    expect(String(resolved.systemMessages[0]?.content)).toContain("### Response Language");
    expect(String(resolved.systemMessages[0]?.content)).toContain("### Citation Rules");

    expect(resolved.contextDataMessages).toHaveLength(1);
    const bundle = String(resolved.contextDataMessages[0]?.content);
    expect(bundle).toContain('<context_block type="conversation_state">');
    expect(bundle).toContain('<context_block type="user_profile">');
    expect(bundle).toContain('<context_block type="recent_activity_digest">');
    expect(bundle).toContain("Finish the plan");
    expect(bundle).toContain("Prefers concise replies");
    expect(bundle).toContain("[Previous Work]");
    expect(bundle).not.toContain("[S1]");
    expect(bundle).not.toContain("[S2]");
    expect(bundle).not.toContain("(cite:1)");
    expect(bundle).not.toContain("(cite:4)");
  });

  it("skips conversation state and digest for temporary sessions and omits context when memory is disabled", async () => {
    const temporarySession = createTemporarySession("Temp Work");
    updateSessionStateAndBrief(
      temporarySession.id,
      "Goal: This should stay local",
      "Brief that should not become digest"
    );
    addLongTermMemory({
      key: "user.preference.temp",
      value: "Still visible profile memory",
      sessionId: temporarySession.id,
    });

    const tempResolved = await resolveSystemPromptEnvelope({
      sessionId: temporarySession.id,
      mode: "chat",
      citationRequired: false,
    });

    const tempBundle = String(tempResolved.contextDataMessages[0]?.content);
    expect(tempBundle).toContain('<context_block type="user_profile">');
    expect(tempBundle).not.toContain("conversation_state");
    expect(tempBundle).not.toContain("recent_activity_digest");

    getMemorySettingsMock.mockReturnValue({
      sessionStateEnabled: false,
      crossSessionEnabled: false,
      longTermEnabled: false,
    });

    const disabledResolved = await resolveSystemPromptEnvelope({
      sessionId: temporarySession.id,
      mode: "chat",
      citationRequired: false,
    });

    expect(disabledResolved.contextDataMessages).toEqual([]);
  });
});
