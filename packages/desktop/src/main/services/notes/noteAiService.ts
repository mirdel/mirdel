import { convertToModelMessages, stepCountIs, streamText, tool, validateUIMessages, type ModelMessage } from "ai";
import { z } from "zod";
import { loggerServiceMain, type MessageContentPart, type NoteAiStreamPayload } from "@shared";
import { tMain } from "../../i18n";
import { getDefaultModelByType } from "../settings/settingsData";
import { resolveModelInvocation } from "../providers/modelInvocation";
import { localModelRuntimeService } from "../model-server";
import { LOCAL_PROVIDER_ID } from "../providers/localModelConstants";

const logger = loggerServiceMain.withContext("noteAiService");

export type NoteAiContextMode = "none" | "auto" | "selection" | "selection-nearby" | "full";
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

export type NoteAiToolCallResult = {
  toolCallId: string;
  toolName: string;
  status: "running" | "success" | "error";
  proposal?: NoteAiProposal;
  error?: string;
};

export type NoteAiStreamEvent = NoteAiStreamPayload;
export type NoteAiHistoryMessage = {
  id?: string;
  role: "user" | "assistant";
  parts: MessageContentPart[];
};

const REQUEST_TIMEOUT_MS = 45000;
const MAX_CONTEXT_CHARS = 18000;
const MAX_NEARBY_CHARS = 2600;
const MAX_SUMMARY_HEADINGS = 24;
const MAX_TOOL_STEPS = 20;

function trimTo(input: string, maxChars: number) {
  const text = String(input || "");
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function extractHeadings(contentMd: string) {
  const text = String(contentMd || "");
  const regex = /^(#{1,6})\s+(.+)$/gm;
  const headings: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) != null) {
    const level = Math.max(1, Math.min(6, match[1].length));
    const title = (match[2] || "").trim();
    if (!title) continue;
    headings.push(`${"  ".repeat(level - 1)}- ${title}`);
    if (headings.length >= MAX_SUMMARY_HEADINGS) break;
  }
  return headings;
}

function buildSelectionNearbyContext(contentMd: string, _selectionText: string, nearbyContext?: string) {
  const explicitNearby = String(nearbyContext || "").trim();
  if (explicitNearby) {
    return trimTo(explicitNearby, Math.min(MAX_NEARBY_CHARS, MAX_CONTEXT_CHARS));
  }

  const content = String(contentMd || "");
  if (!content) return "";
  // 不做任何文本匹配定位兜底，避免重复文本场景下命中错误位置。
  return trimTo(content, Math.min(MAX_NEARBY_CHARS, MAX_CONTEXT_CHARS));
}

function buildAutoContext(contentMd: string, selectionText?: string, nearbyContext?: string) {
  const content = String(contentMd || "");
  if (!content) return "";

  const selection = String(selectionText || "").trim();
  if (selection) {
    return buildSelectionNearbyContext(content, selection, nearbyContext);
  }

  if (content.length <= MAX_CONTEXT_CHARS) {
    return content;
  }

  const head = content.slice(0, Math.floor(MAX_CONTEXT_CHARS * 0.6));
  const tail = content.slice(-Math.floor(MAX_CONTEXT_CHARS * 0.25));
  const headings = extractHeadings(content);
  const headingBlock = headings.length > 0
    ? `Document outline:\n${headings.join("\n")}\n\n`
    : "";

  return `${headingBlock}Document beginning:\n${head}\n\n...\n\nDocument ending:\n${tail}`;
}

function buildContext(input: {
  contentMd: string;
  selectionText?: string;
  selectionNearbyContext?: string;
  requestedMode?: NoteAiContextMode;
}) {
  const content = String(input.contentMd || "");
  const selection = String(input.selectionText || "").trim();
  const nearbyContext = String(input.selectionNearbyContext || "");
  const requestedMode = input.requestedMode || "auto";

  let resolvedMode: NoteAiContextMode = requestedMode;
  let contextText = "";

  if (requestedMode === "none") {
    contextText = "";
  } else if (requestedMode === "selection") {
    if (selection) {
      contextText = selection;
    } else {
      resolvedMode = "auto";
      contextText = buildAutoContext(content, selection, nearbyContext);
    }
  } else if (requestedMode === "selection-nearby") {
    if (selection) {
      contextText = buildSelectionNearbyContext(content, selection, nearbyContext);
    } else {
      resolvedMode = "auto";
      contextText = buildAutoContext(content, selection, nearbyContext);
    }
  } else if (requestedMode === "full") {
    contextText = trimTo(content, MAX_CONTEXT_CHARS);
  } else {
    resolvedMode = "auto";
    contextText = buildAutoContext(content, selection, nearbyContext);
  }

  return {
    resolvedMode,
    contextText: trimTo(contextText, MAX_CONTEXT_CHARS),
  };
}

function formatLineNumberContext(content: string) {
  const lines = String(content || "").split("\n");
  return lines.map((line, index) => `${index + 1}| ${line}`).join("\n");
}

function normalizeDocumentPatchEdits(value: unknown): NoteAiDocumentPatchEdit[] {
  const editsSource = Array.isArray(value) ? value : [];
  const edits: NoteAiDocumentPatchEdit[] = [];
  for (const raw of editsSource) {
    const item = raw as Partial<NoteAiDocumentPatchEdit> | undefined;
    if (!item) continue;
    const startLine = Number(item.startLine);
    const startCol = Number(item.startCol);
    const endLine = Number(item.endLine);
    const endCol = Number(item.endCol);
    if (!Number.isInteger(startLine) || startLine < 1) continue;
    if (!Number.isInteger(startCol) || startCol < 1) continue;
    if (!Number.isInteger(endLine) || endLine < 1) continue;
    if (!Number.isInteger(endCol) || endCol < 1) continue;
    if (endLine < startLine || (endLine === startLine && endCol < startCol)) continue;
    edits.push({
      startLine,
      startCol,
      endLine,
      endCol,
      expectedText: String(item.expectedText ?? ""),
      newText: String(item.newText ?? ""),
      reason: item.reason == null ? undefined : String(item.reason),
    });
  }
  return edits;
}

function normalizeProposal(value: unknown): NoteAiProposal | undefined {
  const data = value as {
    mode?: string;
    replacement?: unknown;
    reason?: unknown;
    edits?: unknown[];
  } | undefined;
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
    const edits = normalizeDocumentPatchEdits(data.edits);
    if (edits.length === 0) return undefined;
    return {
      mode: "document_patch",
      edits,
    };
  }

  return undefined;
}

function normalizeToolCallInput(toolName: string, value: unknown): NoteAiProposal | undefined {
  if (toolName === "note_replace_selection") {
    const data = value as { replacement?: unknown; reason?: unknown } | undefined;
    const replacement = String(data?.replacement ?? "");
    if (!replacement.trim()) return undefined;
    return {
      mode: "selection_replace",
      replacement,
      reason: data?.reason == null ? undefined : String(data.reason),
    };
  }

  if (toolName === "note_patch_document") {
    const data = value as { edits?: unknown } | undefined;
    const edits = normalizeDocumentPatchEdits(data?.edits);
    if (edits.length === 0) return undefined;
    return {
      mode: "document_patch",
      edits,
    };
  }

  return undefined;
}

async function getModelClient(modelOverride?: string): Promise<{
  providerId: string;
  modelId: string;
  client: ReturnType<typeof resolveModelInvocation>["client"];
}> {
  let providerId: string;
  let modelId: string;

  if (modelOverride && modelOverride.includes("::")) {
    const [provider, model] = modelOverride.split("::");
    if (!provider || !model) {
      throw new Error(tMain("notes.invalidModelFormat", { model: modelOverride }));
    }
    providerId = provider;
    modelId = model;
  } else {
    const defaultModel = getDefaultModelByType("general") ?? getDefaultModelByType("fast");
    if (!defaultModel?.providerId || !defaultModel?.modelId) {
      throw new Error(tMain("notes.defaultModelMissing"));
    }
    providerId = defaultModel.providerId;
    modelId = defaultModel.modelId;
  }

  if (providerId === LOCAL_PROVIDER_ID) {
    await localModelRuntimeService.ensureModelReady(modelId);
  }
  const { client } = resolveModelInvocation({ providerId, modelId });

  return {
    providerId,
    modelId,
    client,
  };
}

function buildAssistSystemPrompt() {
  // Keep internal tool-routing instructions in English for model stability.
  return [
    "You are a note-editing assistant that can either reply with text, call tools, or do both.",
    "Keep replies concise and direct in no more than three sentences. Do not add filler, greetings, or repeated paraphrases of the user's request.",
    "When the user asks to modify the note body, prefer calling a tool.",
    "If APP_CONTEXT.selected_text_editor_range is not (none), the request includes a quoted selection and you may only call `note_replace_selection`.",
    "If APP_CONTEXT.selected_text_editor_range is (none), the request does not include a quoted selection and you may only call `note_patch_document`.",
    "`note_replace_selection` must only return `replacement` and must not return position fields.",
    "`note_patch_document` must return `edits`; coordinates must be based on APP_CONTEXT.note_context_line_numbered (1-based, end position is exclusive).",
    "You may call `note_patch_document` only when context_note says the current note body is attached. Otherwise, ask the user to attach the full note context first.",
    "Each `note_patch_document` edit must include both `expectedText` (the current source text) and `newText` (the replacement text).",
    "Only output a direct rewrite instead of a proposal when the user explicitly asks for the final rewritten text and does not want a proposal.",
    "Never invent note content. If context is insufficient, state clearly what is missing.",
  ].join("\n");
}

function buildAssistUserPrompt(input: {
  userPrompt: string;
}) {
  return String(input.userPrompt || "").trim();
}

function buildContextNote(mode: NoteAiContextMode) {
  if (mode === "selection-nearby") {
    return "The following content is an excerpt near the selection. It is only for context and may be incomplete.";
  }
  if (mode === "full") {
    return "The following content comes from the current note body and may be truncated.";
  }
  if (mode === "selection") {
    return "The following content is the selected text.";
  }
  if (mode === "auto") {
    return "The following content is automatically prepared context and may be a summary or excerpt.";
  }
  return "No note body context is attached.";
}

function buildAssistContextMessage(input: {
  selectionText?: string;
  selectionAnchor?: NoteAiSelectionAnchor;
  selectionDocRevision?: string;
  contextMode: NoteAiContextMode;
  contextText: string;
}) {
  const selectionAnchor = input.selectionAnchor;
  const selectionAnchorMode = selectionAnchor?.mode || "(none)";
  const selectionAnchorText = selectionAnchor
    ? `${selectionAnchor.from}-${selectionAnchor.to}`
    : "(none)";
  const selectionDocRevision = String(input.selectionDocRevision || "").trim() || "(none)";
  const numberedContext = input.contextText?.trim()
    ? formatLineNumberContext(input.contextText)
    : "(none)";

  return [
    "[APP_CONTEXT]",
    `interaction_hint: ${input.selectionText?.trim() ? "selection-based input" : "regular input"}`,
    `context_note: ${buildContextNote(input.contextMode)}`,
    "range_rule: line/column is 1-based, end position is exclusive.",
    "",
    "selected_text:",
    input.selectionText?.trim() ? input.selectionText : "(none)",
    "",
    "selected_text_anchor_mode:",
    selectionAnchorMode,
    "",
    "selected_text_editor_range:",
    selectionAnchorText,
    "",
    "selected_text_doc_revision:",
    selectionDocRevision,
    "",
    "note_context_line_numbered:",
    numberedContext,
    "[/APP_CONTEXT]",
  ].join("\n");
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function sanitizePartForAiSdk(part: MessageContentPart): any | null {
  if (!part || typeof part !== "object") return null;
  if (part.type === "text" && typeof (part as any).text === "string") {
    return { type: "text", text: (part as any).text };
  }
  if (part.type === "file") {
    const file = part as any;
    if (typeof file.mediaType === "string" && typeof file.url === "string") {
      return { type: "file", mediaType: file.mediaType, url: file.url };
    }
    return null;
  }
  if (part.type === "dynamic-tool") {
    const toolPart = part as any;
    const normalized: any = {
      type: "dynamic-tool",
      toolName: toolPart.toolName,
      toolCallId: toolPart.toolCallId,
      state: toolPart.state,
    };
    if (toolPart.input !== undefined) normalized.input = toolPart.input;
    if (toolPart.output !== undefined) normalized.output = toolPart.output;
    if (typeof toolPart.errorText === "string") normalized.errorText = toolPart.errorText;
    if (toolPart.approval !== undefined) normalized.approval = toolPart.approval;
    return normalized;
  }
  if (typeof (part as any).type === "string" && (part as any).type.startsWith("data-")) {
    const dataPart = part as any;
    return { type: dataPart.type, id: dataPart.id, data: dataPart.data, transient: dataPart.transient };
  }
  return null;
}

async function buildHistoryModelMessages(historyMessages: NoteAiHistoryMessage[] | undefined): Promise<ModelMessage[]> {
  const source = Array.isArray(historyMessages) ? historyMessages : [];
  if (source.length === 0) return [];

  const uiMessages = source
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item, index) => ({
      id: item.id || `note-history-${index}`,
      role: item.role,
      parts: (item.parts || [])
        .map((part) => sanitizePartForAiSdk(part))
        .filter((part): part is NonNullable<typeof part> => part != null),
    }));
  if (uiMessages.length === 0) return [];

  const validated = await validateUIMessages({ messages: uiMessages as any });
  return convertToModelMessages(validated.map(({ id, ...rest }) => rest), {
    convertDataPart: (part) => {
      if (part.type === "data-quote" || part.type === "data-note-context") {
        return { type: "text", text: "" };
      }
      return { type: "text", text: JSON.stringify(part.data) };
    },
  });
}

export async function assistNoteWriting(
  input: {
    noteId?: string;
    historyMessages?: NoteAiHistoryMessage[];
    noteContentMd: string;
    userPrompt: string;
    selectionText?: string;
    selectionNearbyContext?: string;
    selectionAnchor?: NoteAiSelectionAnchor;
    selectionDocRevision?: string;
    contextMode?: NoteAiContextMode;
    model?: string;
  },
  options?: {
    abortSignal?: AbortSignal;
    onEvent?: (event: NoteAiStreamEvent) => void;
  }
) {
  const userPrompt = String(input.userPrompt || "").trim();
  if (!userPrompt) {
    return { ok: false as const, error: tMain("notes.emptyPrompt") };
  }

  const noteContentMd = String(input.noteContentMd || "");
  const selectionText = String(input.selectionText || "").trim();
  const selectionAnchor = input.selectionAnchor;
  const context = buildContext({
    contentMd: noteContentMd,
    selectionText,
    selectionNearbyContext: input.selectionNearbyContext,
    requestedMode: input.contextMode || "auto",
  });

  const { providerId, modelId, client } = await getModelClient(input.model);
  const streamAbortController = new AbortController();
  const onAbort = () => streamAbortController.abort();
  options?.abortSignal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => streamAbortController.abort(), REQUEST_TIMEOUT_MS);

  const emit = (event: NoteAiStreamEvent) => {
    options?.onEvent?.(event);
  };

  const toolCalls = new Map<string, NoteAiToolCallResult>();
  let outputText = "";
  let finishReason = "stop";
  let tokenUsage: { inputTokens: number | null; outputTokens: number | null } | undefined;

  const toolContextText = context.resolvedMode === "none" ? "" : context.contextText;

  try {
    const historyModelMessages = await buildHistoryModelMessages(input.historyMessages);
    const assistSystemPrompt = [
      buildAssistSystemPrompt(),
      "",
      buildAssistContextMessage({
        selectionText,
        selectionAnchor,
        selectionDocRevision: input.selectionDocRevision,
        contextMode: context.resolvedMode,
        contextText: context.contextText,
      }),
    ].join("\n");

    const stream = streamText({
      model: client(modelId),
      system: assistSystemPrompt,
      messages: [
        ...historyModelMessages,
        {
          role: "user",
          content: buildAssistUserPrompt({
            userPrompt,
          }),
        },
      ],
      temperature: 0.25,
      maxOutputTokens: 2048,
      abortSignal: streamAbortController.signal,
      tools: {
        note_replace_selection: tool({
          description: [
            "Rewrite the currently quoted selection.",
            "Only available when selected_text_editor_range is not empty.",
            "Return only replacement. Do not return position fields.",
          ].join("\n"),
          inputSchema: z.object({
            replacement: z.string().min(1),
            reason: z.string().optional(),
          }),
          execute: async (proposal) => {
            if (!selectionText || !selectionAnchor) {
              return {
                ok: false as const,
                error: tMain("notes.selectionMissing"),
                code: "selection_missing",
              };
            }

            return {
              ok: true as const,
              proposal: {
                mode: "selection_replace" as const,
                replacement: String(proposal.replacement || ""),
                reason: proposal.reason == null ? undefined : String(proposal.reason),
              },
            };
          },
        }),
        note_patch_document: tool({
          description: [
            "Create whole-document or multi-location edit proposals.",
            "Only available when selected_text_editor_range is empty and the full note context is attached.",
            "Return structured edits.",
          ].join("\n"),
          inputSchema: z.object({
            edits: z.array(
              z.object({
                startLine: z.number().int().min(1),
                startCol: z.number().int().min(1),
                endLine: z.number().int().min(1),
                endCol: z.number().int().min(1),
                expectedText: z.string(),
                newText: z.string(),
                reason: z.string().optional(),
              }).superRefine((edit, refineCtx) => {
                if (edit.endLine < edit.startLine) {
                  refineCtx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["endLine"],
                    message: "endLine cannot be smaller than startLine",
                  });
                  return;
                }
                if (edit.endLine === edit.startLine && edit.endCol < edit.startCol) {
                  refineCtx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["endCol"],
                    message: "On the same line, endCol cannot be smaller than startCol",
                  });
                }
              })
            ).min(1).max(8).describe("Structured edit list"),
          }),
          execute: async (proposal) => {
            if (selectionText || selectionAnchor) {
              return {
                ok: false as const,
                error: tMain("notes.selectionModeMismatch"),
                code: "selection_mode_mismatch",
              };
            }
            if (!toolContextText.trim()) {
              return {
                ok: false as const,
                error: tMain("notes.contextMissing"),
                code: "context_missing",
              };
            }
            if (context.resolvedMode !== "full") {
              return {
                ok: false as const,
                error: tMain("notes.fullContextRequired"),
                code: "full_context_required",
              };
            }

            return {
              ok: true as const,
              proposal: {
                mode: "document_patch" as const,
                edits: proposal.edits.map((edit) => ({
                  startLine: Number(edit.startLine),
                  startCol: Number(edit.startCol),
                  endLine: Number(edit.endLine),
                  endCol: Number(edit.endCol),
                  expectedText: String(edit.expectedText ?? ""),
                  newText: String(edit.newText ?? ""),
                  reason: edit.reason == null ? undefined : String(edit.reason),
                })),
              },
            };
          },
        }),
      },
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      providerOptions: {
        [providerId]: { think: { type: "disable" as const } },
      },
    });

    for await (const part of stream.fullStream) {
      if (part.type === "text-delta") {
        outputText += part.text;
        emit({ type: "text-delta", delta: part.text });
      } else if (part.type === "tool-call") {
        const proposal = normalizeProposal(part.input) || normalizeToolCallInput(part.toolName, part.input);
        const current: NoteAiToolCallResult = {
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          status: "running",
          proposal,
        };
        toolCalls.set(part.toolCallId, current);
        emit({
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });
      } else if (part.type === "tool-result") {
        const output = part.output as {
          ok?: boolean;
          proposal?: unknown;
          error?: string;
        } | undefined;
        const isOk = !!output?.ok;
        toolCalls.set(part.toolCallId, {
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          status: isOk ? "success" : "error",
          proposal: isOk ? normalizeProposal(output?.proposal) : undefined,
          error: !isOk ? (output?.error || tMain("common.toolExecutionFailed")) : undefined,
        });
        emit({
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: part.output,
        });
      } else if (part.type === "finish") {
        finishReason = String(part.finishReason || "stop");
      }
    }

    tokenUsage = await stream.usage;
    emit({ type: "done", finishReason });

    return {
      ok: true as const,
      model: `${providerId}::${modelId}`,
      contextMode: context.resolvedMode,
      text: outputText.trim(),
      toolCalls: [...toolCalls.values()],
      tokenUsage,
    };
  } catch (error) {
    const message = toErrorMessage(error);
    logger.error("notes ai assist failed", {
      noteId: input.noteId,
      providerId,
      modelId,
      message,
    });
    emit({ type: "error", error: message });
    return { ok: false as const, error: message };
  } finally {
    clearTimeout(timer);
    options?.abortSignal?.removeEventListener("abort", onAbort);
    streamAbortController.abort();
  }
}
