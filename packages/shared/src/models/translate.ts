export type TranslateStreamPayload =
  | { type: "partial"; translationText: string }
  | { type: "error"; error: string }
  | { type: "done"; finishReason?: string; aborted?: boolean };

export type TranslateStreamEvent = TranslateStreamPayload & {
  requestId: string;
};
