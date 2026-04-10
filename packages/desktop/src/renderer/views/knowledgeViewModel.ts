import type { KbItem, KbItemType } from "@/composables/useKnowledge";

export function getKnowledgeTextItemName(content: string, fallbackTitle: string): string {
  const firstLine = content.split("\n")[0]?.replace(/^#+\s*/, "").trim() || "";
  return firstLine.slice(0, 80) || fallbackTitle;
}

export function isKnowledgeUrlValid(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function buildKnowledgeDetailRoute(kbId: string, query: Record<string, unknown> = {}) {
  const nextQuery = { ...query };
  delete nextQuery.itemId;

  return {
    name: "knowledge-detail" as const,
    params: { kbId },
    query: nextQuery,
  };
}

export function resolveKnowledgeRouteItemFocus(
  routeItemId: unknown,
  items: Array<Pick<KbItem, "id" | "type">>
): {
  itemId: string;
  itemType: KbItemType;
} | null {
  if (typeof routeItemId !== "string") {
    return null;
  }

  const matchedItem = items.find((item) => item.id === routeItemId);
  if (!matchedItem) {
    return null;
  }

  return {
    itemId: matchedItem.id,
    itemType: matchedItem.type,
  };
}
