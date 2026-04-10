import type { ChatSearchInput, ChatSearchResult } from "../../chat/chatSearchService";
import { searchChat } from "../../chat/chatSearchService";

export type { MessageSearchHit, SessionSearchHit } from "../../chat/chatSearchService";

export function searchChatAdapter(input: ChatSearchInput): ChatSearchResult {
  return searchChat(input);
}
