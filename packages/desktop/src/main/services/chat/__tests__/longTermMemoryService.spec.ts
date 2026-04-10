import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { createSession } from "../sessionData";
import { createUserMessage } from "../messageData";
import { addLongTermMemory, getLongTermMemoryByKey, listLongTermMemory } from "../longTermMemoryData";
import { enqueueLongTermMemoryTask } from "../longTermMemoryService";
import { useTestDb } from "../../../../../test/helpers/testDb";

const {
  getDefaultModelByTypeMock,
  resolveModelInvocationMock,
} = vi.hoisted(() => ({
  getDefaultModelByTypeMock: vi.fn(),
  resolveModelInvocationMock: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("../../settings/settingsData", async () => {
  const actual = await vi.importActual<typeof import("../../settings/settingsData")>("../../settings/settingsData");
  return {
    ...actual,
    getDefaultModelByType: getDefaultModelByTypeMock,
  };
});

vi.mock("../../providers/modelInvocation", () => ({
  resolveModelInvocation: resolveModelInvocationMock,
}));

async function waitForAssert(assertion: () => void, timeoutMs: number = 2000) {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

describe("longTermMemoryService", () => {
  useTestDb("long-term-memory-service");

  beforeEach(() => {
    getDefaultModelByTypeMock.mockImplementation((type: string) =>
      type === "fast" ? { providerId: "mock", modelId: "fast-model" } : null
    );
    resolveModelInvocationMock.mockReturnValue({
      client: vi.fn((modelId: string) => ({ modelId })),
    });
    vi.mocked(generateText).mockReset();
  });

  it("extracts high-confidence profile ops and stores them against the current turn", async () => {
    const session = createSession("__default__", "default-scenario", "Memory Session");
    const userMessage = createUserMessage({
      id: "user-memory-1",
      sessionId: session.id,
      parts: [{ type: "text", text: "I prefer concise replies and I live in Shanghai." }],
      turnId: "turn-memory-1",
    });

    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({
        ops: [
          {
            op: "add",
            item: {
              category: "preference",
              key: "response_style_preference",
              value: "The user prefers concise replies.",
            },
            confidence: 0.91,
            evidenceText: "I prefer concise replies",
          },
          {
            op: "add",
            item: {
              category: "profile",
              key: "residence",
              value: "The user lives in Shanghai.",
            },
            confidence: 0.88,
            evidenceText: "I live in Shanghai",
          },
        ],
      }),
    } as any);

    enqueueLongTermMemoryTask({
      userMessageId: userMessage.id,
    });

    await waitForAssert(() => {
      expect(getLongTermMemoryByKey("response_style_preference")?.value).toBe(
        "The user prefers concise replies."
      );
      expect(getLongTermMemoryByKey("residence")?.value).toBe("The user lives in Shanghai.");
    });

    expect(getLongTermMemoryByKey("response_style_preference")?.messageId).toBe(userMessage.id);
    expect(getLongTermMemoryByKey("residence")?.sessionId).toBe(session.id);
  });

  it("filters low-quality or disallowed ops and caps automatic adds per turn", async () => {
    const session = createSession("__default__", "default-scenario", "Memory Filters");
    addLongTermMemory({
      key: "occupation",
      value: "The user is a designer.",
      sessionId: session.id,
    });
    const userMessage = createUserMessage({
      id: "user-memory-2",
      sessionId: session.id,
      parts: [
        {
          type: "text",
          text: "I am a frontend engineer, I prefer dark mode, I use Vue, and I prefer CLI tools.",
        },
      ],
      turnId: "turn-memory-2",
    });

    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({
        ops: [
          {
            op: "add",
            item: {
              category: "work",
              key: "occupation",
              value: "The user is a frontend engineer.",
            },
            confidence: 0.93,
            evidenceText: "I am a frontend engineer",
          },
          {
            op: "add",
            item: {
              category: "style",
              key: "color_preference",
              value: "The user prefers dark mode.",
            },
            confidence: 0.86,
            evidenceText: "I prefer dark mode",
          },
          {
            op: "add",
            item: {
              category: "framework",
              key: "framework_preference",
              value: "The user uses Vue.",
            },
            confidence: 0.84,
            evidenceText: "I use Vue",
          },
          {
            op: "add",
            item: {
              category: "misc",
              key: "secret_token",
              value: "The user has a secret token.",
            },
            confidence: 0.95,
            evidenceText: "I prefer CLI tools",
          },
          {
            op: "add",
            item: {
              category: "tool",
              key: "tool_preference",
              value: "The user prefers CLI tools.",
            },
            confidence: 0.9,
            evidenceText: "I prefer CLI tools",
          },
          {
            op: "remove",
            key: "occupation",
            confidence: 0.99,
            evidenceText: "I am a frontend engineer",
          },
        ],
      }),
    } as any);

    enqueueLongTermMemoryTask({
      userMessageId: userMessage.id,
    });

    await waitForAssert(() => {
      expect(getLongTermMemoryByKey("occupation")?.value).toBe("The user is a frontend engineer.");
      expect(getLongTermMemoryByKey("color_preference")?.value).toBe("The user prefers dark mode.");
      expect(getLongTermMemoryByKey("framework_preference")?.value).toBe("The user uses Vue.");
    });

    expect(getLongTermMemoryByKey("secret_token")).toBeNull();
    expect(getLongTermMemoryByKey("tool_preference")).toBeNull();
    expect(listLongTermMemory().map((item) => item.key)).toEqual(
      expect.arrayContaining(["occupation", "color_preference", "framework_preference"])
    );
  });

  it("skips extraction when no model is available or the response produces no accepted ops", async () => {
    const session = createSession("__default__", "default-scenario", "Memory Skip");
    const userMessage = createUserMessage({
      id: "user-memory-3",
      sessionId: session.id,
      parts: [{ type: "text", text: "Hello there." }],
      turnId: "turn-memory-3",
    });

    getDefaultModelByTypeMock.mockReturnValue(null);
    enqueueLongTermMemoryTask({
      userMessageId: userMessage.id,
    });

    await waitForAssert(() => {
      expect(listLongTermMemory()).toEqual([]);
    });

    getDefaultModelByTypeMock.mockImplementation((type: string) =>
      type === "fast" ? { providerId: "mock", modelId: "fast-model" } : null
    );
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({
        ops: [
          {
            op: "add",
            item: {
              category: "preference",
              key: "response_style_preference",
              value: "The user prefers short replies.",
            },
            confidence: 0.6,
            evidenceText: "short replies",
          },
        ],
      }),
    } as any);

    enqueueLongTermMemoryTask({
      userMessageId: userMessage.id,
    });

    await waitForAssert(() => {
      expect(getLongTermMemoryByKey("response_style_preference")).toBeNull();
    });
  });

  it("applies safe updates to existing keys while ignoring remove, merge, and missing-key updates", async () => {
    const session = createSession("__default__", "default-scenario", "Memory Updates");
    addLongTermMemory({
      category: "work",
      key: "occupation",
      value: "The user is a designer.",
      sessionId: session.id,
    });
    addLongTermMemory({
      category: "goal",
      key: "current_focus",
      value: "The user is preparing a portfolio refresh.",
      sessionId: session.id,
    });

    const userMessage = createUserMessage({
      id: "user-memory-4",
      sessionId: session.id,
      parts: [{ type: "text", text: "I am a frontend engineer and I am still preparing a portfolio refresh." }],
      turnId: "turn-memory-4",
    });

    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({
        ops: [
          {
            op: "update",
            key: "occupation",
            value: "The user is a frontend engineer.",
            confidence: 0.93,
            evidenceText: "I am a frontend engineer",
          },
          {
            op: "remove",
            key: "current_focus",
            confidence: 0.95,
            evidenceText: "I am still preparing a portfolio refresh",
          },
          {
            op: "merge",
            intoKey: "occupation",
            fromKeys: ["occupation", "current_focus"],
            value: "The user is a frontend engineer preparing a portfolio refresh.",
            confidence: 0.9,
            evidenceText: "I am a frontend engineer and I am still preparing a portfolio refresh",
          },
          {
            op: "update",
            key: "missing_key",
            value: "The user likes pair programming.",
            confidence: 0.89,
            evidenceText: "I am a frontend engineer",
          },
        ],
      }),
    } as any);

    enqueueLongTermMemoryTask({
      userMessageId: userMessage.id,
    });

    await waitForAssert(() => {
      expect(getLongTermMemoryByKey("occupation")?.value).toBe("The user is a frontend engineer.");
    });

    expect(getLongTermMemoryByKey("current_focus")?.value).toBe(
      "The user is preparing a portfolio refresh."
    );
    expect(getLongTermMemoryByKey("missing_key")).toBeNull();
  });

  it("infers confidence from accepted evidence aliases and rejects evidence that does not match the user text", async () => {
    const session = createSession("__default__", "default-scenario", "Memory Evidence");
    const userMessage = createUserMessage({
      id: "user-memory-5",
      sessionId: session.id,
      parts: [{ type: "text", text: "I use Vue and I avoid peanuts." }],
      turnId: "turn-memory-5",
    });

    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({
        ops: [
          {
            op: "add",
            item: {
              category: "framework",
              key: "framework_preference",
              value: "The user uses Vue.",
            },
            evidence_text: "I use Vue",
          },
          {
            op: "add",
            item: {
              category: "health",
              key: "allergy",
              value: "The user avoids peanuts.",
            },
            quote: "I avoid peanuts",
          },
          {
            op: "add",
            item: {
              category: "preference",
              key: "response_style_preference",
              value: "The user prefers concise replies.",
            },
            evidenceText: "I prefer concise replies",
          },
        ],
      }),
    } as any);

    enqueueLongTermMemoryTask({
      userMessageId: userMessage.id,
    });

    await waitForAssert(() => {
      expect(getLongTermMemoryByKey("framework_preference")?.value).toBe("The user uses Vue.");
      expect(getLongTermMemoryByKey("allergy")?.value).toBe("The user avoids peanuts.");
    });

    expect(getLongTermMemoryByKey("response_style_preference")).toBeNull();
  });
});
