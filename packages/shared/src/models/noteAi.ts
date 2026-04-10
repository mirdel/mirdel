export type NoteAiStreamPayload =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input?: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output?: unknown }
  | { type: 'error'; error: string }
  | { type: 'done'; finishReason?: string }

export type NotesAiStreamEvent = NoteAiStreamPayload & {
  requestId: string
}
