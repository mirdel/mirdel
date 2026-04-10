import { describe, expect, it } from "vitest";
import { createSession } from "../sessionData";
import {
  addLongTermMemory,
  applyPatchOps,
  getLongTermMemoryByKey,
  listLongTermMemory,
  MAX_ITEMS,
} from "../longTermMemoryData";
import { useTestDb } from "../../../../../test/helpers/testDb";

describe("longTermMemoryData", () => {
  useTestDb("long-term-memory-data");

  it("lists memory items with session titles and applies merge semantics safely", () => {
    const session = createSession("__default__", "default-scenario", "Memory Owner");

    addLongTermMemory({
      category: "goal",
      key: "primary_goal",
      value: "Ship the first beta.",
      sessionId: session.id,
    });
    addLongTermMemory({
      category: "focus",
      key: "current_focus",
      value: "Finalize onboarding flows.",
      sessionId: session.id,
    });
    addLongTermMemory({
      category: "misc",
      key: "orphan_source",
      value: "Keep this item around.",
      sessionId: session.id,
    });

    applyPatchOps(
      [
        {
          op: "merge",
          intoKey: "primary_goal",
          fromKeys: ["primary_goal", "current_focus"],
          value: "Ship the first beta with onboarding finalized.",
        },
        {
          op: "merge",
          intoKey: "missing_target",
          fromKeys: ["orphan_source"],
          value: "This merge should be ignored.",
        },
      ],
      { sessionId: session.id }
    );

    const merged = getLongTermMemoryByKey("primary_goal");
    expect(merged?.value).toBe("Ship the first beta with onboarding finalized.");
    expect(merged?.sessionTitle).toBe("Memory Owner");
    expect(getLongTermMemoryByKey("current_focus")).toBeNull();
    expect(getLongTermMemoryByKey("orphan_source")?.value).toBe("Keep this item around.");

    expect(listLongTermMemory().map((item) => item.key)).toEqual(
      expect.arrayContaining(["primary_goal", "orphan_source"])
    );
  });

  it("skips capped adds but still applies later updates and removes in the same patch batch", () => {
    for (let index = 0; index < MAX_ITEMS; index += 1) {
      addLongTermMemory({
        category: "seed",
        key: `seed_${index}`,
        value: `Value ${index}`,
      });
    }

    applyPatchOps([
      {
        op: "add",
        item: {
          category: "extra",
          key: "overflow_item",
          value: "Should not be inserted while capped.",
        },
      },
      {
        op: "update",
        key: "seed_1",
        value: "Updated after the capped add.",
      },
      {
        op: "remove",
        key: "seed_2",
      },
    ]);

    expect(getLongTermMemoryByKey("overflow_item")).toBeNull();
    expect(getLongTermMemoryByKey("seed_1")?.value).toBe("Updated after the capped add.");
    expect(getLongTermMemoryByKey("seed_2")).toBeNull();
    expect(listLongTermMemory()).toHaveLength(MAX_ITEMS - 1);
  });
});
