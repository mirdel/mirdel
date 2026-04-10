import { defineStore } from "pinia";
import { ref } from "vue";
import type { NotesAiStreamEvent } from "@shared";
import { i18n } from "@/i18n";

export type NoteAiAction = "polish" | "expand" | "shorten" | "custom";
export type NoteAiContextMode = "none" | "selection-nearby" | "full";
export type NoteAiSelectionAnchor = {
  mode: "visual" | "source";
  from: number;
  to: number;
  expectedText: string;
};

export type NoteAiSelectionReplaceProposal = {
  mode: "selection_replace";
  replacement: string;
  reason?: string;
};

export type NoteAiDocumentPatchEdit = {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  expectedText: string;
  newText: string;
  reason?: string;
};

export type NoteAiDocumentPatchProposal = {
  mode: "document_patch";
  edits: NoteAiDocumentPatchEdit[];
};

export type NoteAiProposal =
  | NoteAiSelectionReplaceProposal
  | NoteAiDocumentPatchProposal;

export type NoteAiToolCall = {
  toolCallId: string;
  toolName: string;
  status: "running" | "success" | "error";
  proposal?: NoteAiProposal;
  error?: string;
  applied?: boolean;
  rejected?: boolean;
};

export type NoteAiHistoryPart =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "tool"; toolCallId: string };

export type NoteAiHistoryItem = {
  id: string;
  sessionId: string;
  requestId: string;
  noteId: string;
  selectionText?: string;
  selectionNearbyContext?: string;
  selectionAnchor?: NoteAiSelectionAnchor;
  selectionDocRevision?: string;
  contextMode: NoteAiContextMode;
  prompt: string;
  status: "loading" | "success" | "error";
  parts: NoteAiHistoryPart[];
  toolCalls: NoteAiToolCall[];
  error?: string;
  model?: string;
  createdAt: number;
};

type NoteAiRequestLookup = {
  noteId: string;
  itemId: string;
};

type NoteAiSendInput = {
  noteId: string;
  sessionId?: string;
  noteContentMd: string;
  userPrompt: string;
  selectionText?: string;
  selectionNearbyContext?: string;
  selectionAnchor?: NoteAiSelectionAnchor;
  selectionDocRevision?: string;
  contextMode: NoteAiContextMode;
  model?: string;
  retryItemId?: string;
};

type PersistedNoteAiMessage = {
  id: string;
  sessionId: string;
  requestId: string;
  role: "user" | "assistant";
  parts: Array<Record<string, any>>;
  status: "pending" | "streaming" | "success" | "aborted" | "error";
  error?: string | null;
  metaJson?: Record<string, any> | null;
  createdAt: number;
  updatedAt: number;
};

type PersistedNoteAiSession = {
  id: string;
  noteId: string;
  selectedModel: string;
  contextMode?: string;
  lastMessageAt?: number;
  createdAt: number;
  updatedAt: number;
};

function createHistoryId() {
  return `note-ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `note-ai-req-${crypto.randomUUID()}`;
  }
  return `note-ai-req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createPartId() {
  return `note-ai-part-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function textFromParts(parts: Array<Record<string, any>> | undefined) {
  const source = Array.isArray(parts) ? parts : [];
  return source
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("");
}

function normalizeContextMode(value: unknown): NoteAiContextMode {
  if (value === "none" || value === "selection-nearby" || value === "full") {
    return value;
  }
  return "full";
}

function normalizePersistedToolCall(part: Record<string, any>): NoteAiToolCall | null {
  if (part?.type !== "dynamic-tool") return null;
  const toolCallId = String(part.toolCallId || "");
  if (!toolCallId) return null;
  const toolName = String(part.toolName || "note_patch_document");
  const state = String(part.state || "");
  let status: NoteAiToolCall["status"] = "running";
  if (state === "output-available") status = "success";
  if (state === "output-error") status = "error";

  const output = part.output as { proposal?: unknown; error?: unknown } | undefined;
  const proposal = normalizeProposal(output?.proposal ?? part.input);
  const error = part.errorText != null
    ? String(part.errorText)
    : (output?.error != null ? String(output.error) : undefined);

  return {
    toolCallId,
    toolName,
    status,
    proposal,
    error,
    applied: !!part.applied,
    rejected: !!part.rejected,
  };
}

function buildHistoryFromPersisted(noteId: string, messages: PersistedNoteAiMessage[]): NoteAiHistoryItem[] {
  const ordered = [...messages].sort((a, b) => a.createdAt - b.createdAt);
  const grouped = new Map<string, {
    requestId: string;
    createdAt: number;
    user?: PersistedNoteAiMessage;
    assistant?: PersistedNoteAiMessage;
  }>();

  for (const message of ordered) {
    const requestId = String(message.requestId || message.id || "");
    if (!requestId) continue;
    const group = grouped.get(requestId) || {
      requestId,
      createdAt: message.createdAt,
      user: undefined,
      assistant: undefined,
    };
    if (message.createdAt < group.createdAt) {
      group.createdAt = message.createdAt;
    }
    if (message.role === "user") {
      group.user = message;
    } else if (message.role === "assistant") {
      group.assistant = message;
    }
    grouped.set(requestId, group);
  }

  const items: NoteAiHistoryItem[] = [];
  for (const group of grouped.values()) {
    const user = group.user;
    const assistant = group.assistant;
    const userMeta = (user?.metaJson || {}) as Record<string, any>;
    const selectionText = String(userMeta.selectionText || "").trim();
    const assistantParts = Array.isArray(assistant?.parts) ? assistant!.parts : [];

    const parts: NoteAiHistoryPart[] = [];
    const toolCalls: NoteAiToolCall[] = [];
    for (const part of assistantParts) {
      if (part?.type === "text") {
        parts.push({
          id: createPartId(),
          type: "text",
          text: String(part.text || ""),
        });
        continue;
      }
      if (part?.type === "dynamic-tool") {
        const normalized = normalizePersistedToolCall(part);
        if (!normalized) continue;
        toolCalls.push(normalized);
        parts.push({
          id: createPartId(),
          type: "tool",
          toolCallId: normalized.toolCallId,
        });
      }
    }

    let status: NoteAiHistoryItem["status"] = "success";
    let error: string | undefined;
    if (!assistant || assistant.status === "pending" || assistant.status === "streaming") {
      status = "loading";
    } else if (assistant.status === "error") {
      status = "error";
      error = String(assistant.error || i18n.global.t("notes.aiStore.requestFailed"));
    } else if (assistant.status === "aborted") {
      status = "error";
      error = i18n.global.t("notes.aiStore.cancelled");
    }

    items.push({
      id: assistant?.id || `note-ai-${group.requestId}`,
      sessionId: String(assistant?.sessionId || user?.sessionId || ""),
      requestId: group.requestId,
      noteId,
      selectionText: selectionText || undefined,
      selectionNearbyContext: userMeta.selectionNearbyContext ? String(userMeta.selectionNearbyContext) : undefined,
      selectionAnchor: normalizeSelectionAnchor(userMeta.selectionAnchor),
      selectionDocRevision: userMeta.selectionDocRevision ? String(userMeta.selectionDocRevision) : undefined,
      contextMode: normalizeContextMode(userMeta.contextMode),
      prompt: user ? String(textFromParts(user.parts).trim()) : "",
      status,
      parts,
      toolCalls,
      error,
      model: assistant?.metaJson?.model ? String(assistant.metaJson.model) : undefined,
      createdAt: user?.createdAt ?? assistant?.createdAt ?? group.createdAt,
    });
  }

  return items.sort((a, b) => a.createdAt - b.createdAt);
}

function normalizeSelectionAnchor(value: unknown): NoteAiSelectionAnchor | undefined {
  const data = value as Partial<NoteAiSelectionAnchor> | null | undefined;
  if (!data) return undefined;
  const mode = data.mode === "source" ? "source" : "visual";
  const from = Number(data.from);
  const to = Number(data.to);
  const expectedText = String(data.expectedText || "");
  if (!Number.isInteger(from)) return undefined;
  if (mode === "visual" && from <= 0) return undefined;
  if (mode === "source" && from < 0) return undefined;
  if (!Number.isInteger(to) || to <= from) return undefined;
  if (!expectedText) return undefined;
  return {
    mode,
    from,
    to,
    expectedText,
  };
}

function normalizeDocumentPatchEdit(value: unknown): NoteAiDocumentPatchEdit | null {
  const data = value as Partial<NoteAiDocumentPatchEdit> | null | undefined;
  if (!data) return null;
  const startLine = Number(data.startLine);
  const startCol = Number(data.startCol);
  const endLine = Number(data.endLine);
  const endCol = Number(data.endCol);
  if (!Number.isInteger(startLine) || startLine < 1) return null;
  if (!Number.isInteger(startCol) || startCol < 1) return null;
  if (!Number.isInteger(endLine) || endLine < 1) return null;
  if (!Number.isInteger(endCol) || endCol < 1) return null;
  if (endLine < startLine) return null;
  if (endLine === startLine && endCol < startCol) return null;
  return {
    startLine,
    startCol,
    endLine,
    endCol,
    expectedText: String(data.expectedText ?? ""),
    newText: String(data.newText ?? ""),
    reason: data.reason == null ? undefined : String(data.reason),
  };
}

function normalizeProposal(value: unknown): NoteAiProposal | undefined {
  const data = value as { mode?: string; replacement?: unknown; reason?: unknown; edits?: unknown[] } | null | undefined;
  if (!data || typeof data.mode !== "string") return undefined;

  if (data.mode === "selection_replace") {
    const replacement = String(data.replacement ?? "");
    if (!replacement.trim()) return undefined;
    return {
      mode: "selection_replace",
      replacement,
      reason: data.reason == null ? undefined : String(data.reason),
    };
  }

  if (data.mode === "document_patch") {
    const source = Array.isArray(data.edits) ? data.edits : [];
    const edits = source
      .map((edit) => normalizeDocumentPatchEdit(edit))
      .filter((edit): edit is NoteAiDocumentPatchEdit => !!edit);
    if (edits.length === 0) return undefined;
    return {
      mode: "document_patch",
      edits,
    };
  }

  return undefined;
}

export const useNoteAiStore = defineStore("noteAi", () => {
  const historyByNote = ref<Record<string, NoteAiHistoryItem[]>>({});
  const sessionByNote = ref<Record<string, PersistedNoteAiSession | undefined>>({});
  const sessionsByNote = ref<Record<string, PersistedNoteAiSession[]>>({});
  const activeSessionIdByNote = ref<Record<string, string | undefined>>({});
  const requestLookupById = ref<Record<string, NoteAiRequestLookup>>({});
  const sendingByNote = ref<Record<string, boolean>>({});
  const activeRequestByNote = ref<Record<string, string | undefined>>({});

  function getHistory(noteId: string) {
    return historyByNote.value[noteId] || [];
  }

  function getSessions(noteId: string) {
    return sessionsByNote.value[noteId] || [];
  }

  function getActiveSessionId(noteId: string) {
    return activeSessionIdByNote.value[noteId];
  }

  function isNoteSending(noteId: string) {
    return !!sendingByNote.value[noteId];
  }

  function getSessionModel(noteId: string) {
    const activeSessionId = activeSessionIdByNote.value[noteId];
    const session = (sessionsByNote.value[noteId] || []).find((item) => item.id === activeSessionId)
      || sessionByNote.value[noteId];
    return session?.selectedModel || "";
  }

  function getSessionContextMode(noteId: string) {
    const activeSessionId = activeSessionIdByNote.value[noteId];
    const session = (sessionsByNote.value[noteId] || []).find((item) => item.id === activeSessionId)
      || sessionByNote.value[noteId];
    return session?.contextMode || "full";
  }

  function replaceHistory(noteId: string, items: NoteAiHistoryItem[]) {
    const prev = historyByNote.value[noteId] || [];
    for (const item of prev) {
      delete requestLookupById.value[item.requestId];
    }
    historyByNote.value[noteId] = items;
    for (const item of items) {
      requestLookupById.value[item.requestId] = {
        noteId,
        itemId: item.id,
      };
    }
  }

  async function loadHistory(noteId: string, sessionId?: string) {
    const normalizedNoteId = String(noteId || "").trim();
    if (!normalizedNoteId) {
      return [] as NoteAiHistoryItem[];
    }
    const normalizedSessionId = String(sessionId || "").trim();
    const result = await window.ipc("notes:aiHistory", {
      noteId: normalizedNoteId,
      sessionId: normalizedSessionId || undefined,
    });
    const session = result?.session as PersistedNoteAiSession | null | undefined;
    const sessions = Array.isArray(result?.sessions) ? (result.sessions as PersistedNoteAiSession[]) : [];
    sessionsByNote.value[normalizedNoteId] = sessions;
    if (session?.id) {
      sessionByNote.value[normalizedNoteId] = session;
      activeSessionIdByNote.value[normalizedNoteId] = session.id;
    } else {
      delete sessionByNote.value[normalizedNoteId];
      delete activeSessionIdByNote.value[normalizedNoteId];
    }
    const source = Array.isArray(result?.messages) ? (result.messages as PersistedNoteAiMessage[]) : [];
    const items = buildHistoryFromPersisted(normalizedNoteId, source);
    replaceHistory(normalizedNoteId, items);
    return items;
  }

  async function createNewSession(noteId: string, model?: string, contextMode?: string) {
    const normalizedNoteId = String(noteId || "").trim();
    if (!normalizedNoteId) {
      return { ok: false as const, error: i18n.global.t("notes.aiStore.noteIdMissing") };
    }
    const result = await window.ipc("notes:aiCreateSession", {
      noteId: normalizedNoteId,
      model: String(model || "").trim() || undefined,
      contextMode: String(contextMode || "").trim() || undefined,
    });
    if (!result?.ok || !result?.session) {
      return { ok: false as const, error: result?.error || i18n.global.t("notes.aiStore.createSessionFailed") };
    }
    const created = result.session as PersistedNoteAiSession;
    await loadHistory(normalizedNoteId, created.id);
    delete sendingByNote.value[normalizedNoteId];
    delete activeRequestByNote.value[normalizedNoteId];
    return { ok: true as const, session: created };
  }

  async function switchSession(noteId: string, sessionId: string) {
    const normalizedNoteId = String(noteId || "").trim();
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedNoteId || !normalizedSessionId) {
      return { ok: false as const, error: i18n.global.t("notes.aiStore.sessionInfoMissing") };
    }
    await loadHistory(normalizedNoteId, normalizedSessionId);
    return { ok: true as const };
  }

  function appendHistoryItem(noteId: string, item: NoteAiHistoryItem) {
    historyByNote.value[noteId] = [...getHistory(noteId), item];
    requestLookupById.value[item.requestId] = {
      noteId,
      itemId: item.id,
    };
  }

  function findHistoryItemByRequestId(requestId: string): NoteAiHistoryItem | null {
    const lookup = requestLookupById.value[requestId];
    if (!lookup) return null;

    const list = historyByNote.value[lookup.noteId] || [];
    const found = list.find((item) => item.id === lookup.itemId) || list.find((item) => item.requestId === requestId) || null;
    if (!found) {
      delete requestLookupById.value[requestId];
      return null;
    }
    return found;
  }

  function findHistoryItemById(itemId: string): NoteAiHistoryItem | null {
    if (!itemId) return null;
    for (const list of Object.values(historyByNote.value)) {
      const found = list.find((item) => item.id === itemId);
      if (found) return found;
    }
    return null;
  }

  function ensureToolCall(item: NoteAiHistoryItem, toolCallId: string, toolName: string) {
    let toolCall = item.toolCalls.find((call) => call.toolCallId === toolCallId);
    if (!toolCall) {
      toolCall = {
        toolCallId,
        toolName,
        status: "running",
      };
      item.toolCalls.push(toolCall);
    }
    return toolCall;
  }

  function ensureToolPart(item: NoteAiHistoryItem, toolCallId: string) {
    const existing = item.parts.find((part) => part.type === "tool" && part.toolCallId === toolCallId);
    if (existing) return existing;
    const part: NoteAiHistoryPart = {
      id: createPartId(),
      type: "tool",
      toolCallId,
    };
    item.parts.push(part);
    return part;
  }

  function appendTextDelta(item: NoteAiHistoryItem, delta: string) {
    if (!delta) return;
    const lastPart = item.parts[item.parts.length - 1];
    if (lastPart && lastPart.type === "text") {
      lastPart.text += delta;
      return;
    }
    item.parts.push({
      id: createPartId(),
      type: "text",
      text: delta,
    });
  }

  function patchToolCallsFromResponse(item: NoteAiHistoryItem, toolCalls: unknown[]) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return;
    if (item.toolCalls.length > 0) return;

    const normalized = toolCalls.map((call: any) => ({
      toolCallId: String(call.toolCallId || ""),
      toolName: String(call.toolName || "note_patch_document"),
      status: call.status === "success" || call.status === "error" ? call.status : "running",
      proposal: normalizeProposal(call.proposal),
      error: call.error == null ? undefined : String(call.error),
      applied: false,
      rejected: false,
    }));
    item.toolCalls = normalized;
    for (const call of normalized) {
      if (!call.toolCallId) continue;
      ensureToolPart(item, call.toolCallId);
    }
  }

  function handleStreamEvent(event: NotesAiStreamEvent) {
    const requestId = String(event.requestId || "");
    if (!requestId) return;

    const item = findHistoryItemByRequestId(requestId);
    if (!item) return;

    if (event.type === "text-delta") {
      appendTextDelta(item, String(event.delta || ""));
      return;
    }

    if (event.type === "tool-call") {
      const toolCallId = String(event.toolCallId || "");
      if (!toolCallId) return;
      const toolName = String(event.toolName || "note_patch_document");
      const toolCall = ensureToolCall(item, toolCallId, toolName);
      toolCall.status = "running";
      const proposal = normalizeProposal(event.input);
      if (proposal) {
        toolCall.proposal = proposal;
      }
      ensureToolPart(item, toolCallId);
      return;
    }

    if (event.type === "tool-result") {
      const toolCallId = String(event.toolCallId || "");
      if (!toolCallId) return;
      const toolName = String(event.toolName || "note_patch_document");
      const toolCall = ensureToolCall(item, toolCallId, toolName);
      ensureToolPart(item, toolCallId);

      const output = event.output as {
        ok?: boolean;
        proposal?: unknown;
        error?: string;
      } | undefined;

      if (output?.ok) {
        toolCall.status = "success";
        toolCall.proposal = normalizeProposal(output.proposal);
        toolCall.error = undefined;
      } else {
        toolCall.status = "error";
        toolCall.error = String(output?.error || i18n.global.t("notes.aiStore.toolExecutionFailed"));
        toolCall.proposal = undefined;
      }
      return;
    }

    if (event.type === "error") {
      item.status = "error";
      item.error = String(event.error || i18n.global.t("notes.aiStore.requestFailed"));
      return;
    }

    if (event.type === "done") {
      if (item.status === "loading") {
        item.status = "success";
      }
    }
  }

  function cleanupRequest(noteId: string, requestId: string) {
    if (activeRequestByNote.value[noteId] === requestId) {
      delete activeRequestByNote.value[noteId];
    }
    delete requestLookupById.value[requestId];
    delete sendingByNote.value[noteId];
  }

  async function sendAssist(input: NoteAiSendInput) {
    const noteId = String(input.noteId || "");
    const userPrompt = String(input.userPrompt || "").trim();
    if (!noteId) {
      return { ok: false as const, error: i18n.global.t("notes.aiStore.noteIdMissing") };
    }
    if (!userPrompt) {
      return { ok: false as const, error: i18n.global.t("notes.aiStore.enterContent") };
    }
    if (isNoteSending(noteId)) {
      return { ok: false as const, error: i18n.global.t("notes.aiStore.requestInProgress") };
    }

    const requestId = createRequestId();
    let item: NoteAiHistoryItem | null = null;
    const retryItemId = String(input.retryItemId || "").trim();

    if (retryItemId) {
      const existing = findHistoryItemById(retryItemId);
      if (!existing || existing.noteId !== noteId) {
        return { ok: false as const, error: i18n.global.t("notes.aiStore.retryTargetInvalid") };
      }
      if (existing.status === "loading") {
        return { ok: false as const, error: i18n.global.t("notes.aiStore.itemLoading") };
      }

      delete requestLookupById.value[existing.requestId];
      existing.requestId = requestId;
      existing.selectionText = input.selectionText;
      existing.selectionNearbyContext = input.selectionNearbyContext;
      existing.selectionAnchor = normalizeSelectionAnchor(input.selectionAnchor);
      existing.selectionDocRevision = input.selectionDocRevision ? String(input.selectionDocRevision) : undefined;
      existing.contextMode = input.contextMode;
      existing.prompt = userPrompt;
      existing.status = "loading";
      existing.parts = [];
      existing.toolCalls = [];
      existing.error = undefined;
      existing.model = undefined;
      item = existing;
      requestLookupById.value[requestId] = {
        noteId,
        itemId: existing.id,
      };
    } else {
      item = {
        id: createHistoryId(),
        sessionId: String(input.sessionId || ""),
        requestId,
        noteId,
        selectionText: input.selectionText,
        selectionNearbyContext: input.selectionNearbyContext,
        selectionAnchor: normalizeSelectionAnchor(input.selectionAnchor),
        selectionDocRevision: input.selectionDocRevision ? String(input.selectionDocRevision) : undefined,
        contextMode: input.contextMode,
        prompt: userPrompt,
        status: "loading",
        parts: [],
        toolCalls: [],
        createdAt: Date.now(),
      };
      appendHistoryItem(noteId, item);
    }

    sendingByNote.value[noteId] = true;
    activeRequestByNote.value[noteId] = requestId;

    const dispose = window.notesAi.onStream((event) => {
      if (event.requestId !== requestId) return;
      handleStreamEvent(event);
    });

    try {
      const result = await window.ipc("notes:aiAssist", {
        requestId,
        noteId,
        sessionId: String(input.sessionId || "").trim() || undefined,
        noteContentMd: input.noteContentMd,
        userPrompt,
        selectionText: input.selectionText,
        selectionNearbyContext: input.selectionNearbyContext,
        selectionAnchor: normalizeSelectionAnchor(input.selectionAnchor),
        selectionDocRevision: input.selectionDocRevision ? String(input.selectionDocRevision) : undefined,
        contextMode: input.contextMode,
        model: input.model,
        retryItemId: retryItemId || undefined,
      });

      if (!result || !("ok" in result) || !result.ok) {
        const fallback = i18n.global.t("notes.aiStore.aiRequestFailed");
        const message = result && "error" in result ? result.error : fallback;
        throw new Error(message || fallback);
      }

      if (typeof result.text === "string" && result.text.trim()) {
        const hasTextPart = item.parts.some((part) => part.type === "text");
        if (!hasTextPart) {
          appendTextDelta(item, result.text.trim());
        }
      }
      patchToolCallsFromResponse(item, Array.isArray(result.toolCalls) ? result.toolCalls : []);
      if (!item.sessionId && typeof (result as any).sessionId === "string") {
        item.sessionId = String((result as any).sessionId || "");
      }
      item.model = result.model;
      if (item.status === "loading") {
        item.status = "success";
      }
      return { ok: true as const, requestId, item };
    } catch (error) {
      item.status = "error";
      item.error = toErrorMessage(error);
      return { ok: false as const, requestId, error: item.error };
    } finally {
      dispose();
      cleanupRequest(noteId, requestId);
      try {
        await loadHistory(noteId, item.sessionId);
      } catch {
        // ignore history refresh failures
      }
    }
  }

  async function setToolCallApplied(itemId: string, toolCallId: string, applied = true) {
    const item = findHistoryItemById(itemId);
    if (!item) return false;
    const toolCall = item.toolCalls.find((call) => call.toolCallId === toolCallId);
    if (!toolCall) return false;
    try {
      const result = await window.ipc("notes:aiSetToolCallDecision", {
        noteId: item.noteId,
        sessionId: item.sessionId || activeSessionIdByNote.value[item.noteId],
        requestId: item.requestId,
        toolCallId,
        decision: "applied",
        value: applied,
      });
      if (!result?.ok) return false;
    } catch {
      return false;
    }
    toolCall.applied = applied;
    if (applied) {
      toolCall.rejected = false;
    }
    return true;
  }

  async function setToolCallRejected(itemId: string, toolCallId: string, rejected = true) {
    const item = findHistoryItemById(itemId);
    if (!item) return false;
    const toolCall = item.toolCalls.find((call) => call.toolCallId === toolCallId);
    if (!toolCall) return false;
    try {
      const result = await window.ipc("notes:aiSetToolCallDecision", {
        noteId: item.noteId,
        sessionId: item.sessionId || activeSessionIdByNote.value[item.noteId],
        requestId: item.requestId,
        toolCallId,
        decision: "rejected",
        value: rejected,
      });
      if (!result?.ok) return false;
    } catch {
      return false;
    }
    toolCall.rejected = rejected;
    if (rejected) {
      toolCall.applied = false;
    }
    return true;
  }

  function markRequestAborted(requestId: string) {
    const item = findHistoryItemByRequestId(requestId);
    if (!item) return;
    if (item.status === "loading") {
      item.status = "error";
      item.error = i18n.global.t("notes.aiStore.cancelled");
    }
  }

  async function abortByNote(noteId: string) {
    const requestId = activeRequestByNote.value[noteId];
    if (!requestId) return;
    try {
      await window.ipc("notes:aiAbort", { requestId });
    } finally {
      markRequestAborted(requestId);
      cleanupRequest(noteId, requestId);
      try {
        await loadHistory(noteId);
      } catch {
        // ignore history refresh failures
      }
    }
  }

  return {
    getHistory,
    getSessions,
    getActiveSessionId,
    getSessionModel,
    getSessionContextMode,
    loadHistory,
    createNewSession,
    switchSession,
    isNoteSending,
    sendAssist,
    setToolCallApplied,
    setToolCallRejected,
    abortByNote,
  };
});
