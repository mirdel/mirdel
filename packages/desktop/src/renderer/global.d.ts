import type { Router } from "../main/ipc/router";
import type { createIpcClient } from "typed-electron-ipc";
import type { ServerStatusSnapshot } from "../main/services/model-server";
import type { UIDataTypes, UIMessageChunk } from "ai";
import type { NotesAiStreamEvent, TranslateStreamEvent } from "@shared";
import type { AppletToastInput, UINode } from "@mirdel/applet-core";

type ChatStreamMetadata = {
  createdMessageIds?: string[];
  tokenUsage?: { inputTokens: number | null; outputTokens: number | null };
};

type ChatStreamEvent = {
  sessionId: string;
  messageId: string;
  turnId?: string;
  createdMessageIds?: string[];
  tokenUsage?: { inputTokens: number | null; outputTokens: number | null };
  chunk: UIMessageChunk<ChatStreamMetadata, UIDataTypes>;
};

type TemporarySessionsDeletedEvent = {
  sessionIds: string[];
};

type TtsStreamEvent =
  | {
      requestId: string;
      type: "chunk";
      audioBase64: string;
      mimeType?: string;
    }
  | {
      requestId: string;
      type: "done";
      aborted?: boolean;
    }
  | {
      requestId: string;
      type: "error";
      error: string;
    };

type LogLevel = "error" | "warn" | "info" | "debug";
type UpdateState = Awaited<ReturnType<Router["updates:getState"]>>;

type RendererStateChangedEvent = {
  key: string;
  value?: unknown;
  removed?: boolean;
  updatedAt?: number;
};

type ImageInput = {
  src?: string;
  filePath?: string;
  name?: string;
};

type WebAppBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type WebAppState = {
  appletId: string;
  url: string;
  title?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  loadError: string | null;
};

type AppletStateSchemaPayload = {
  appletId?: string;
  state: Record<string, unknown>;
  schema: UINode;
  assetRunId?: string | null;
  streamingPaths?: string[];
};

declare global {
  interface Window {
    log: {
      send: (level: LogLevel, message: string, extra?: unknown) => void;
    };
    /**
     * typed-electron-ipc 调用入口
     * 使用方式：window.ipc("providers:list") → 自动类型推导参数和返回值
     * 可直接跳转到 router.ts 的实现
     */
    ipc: ReturnType<typeof createIpcClient<Router>>;
    rendererState: {
      onChanged: (handler: (event: RendererStateChangedEvent) => void) => () => void;
    };
    chat: {
      onStream: (handler: (evt: ChatStreamEvent) => void) => () => void;
      onTemporarySessionsDeleted: (handler: (evt: TemporarySessionsDeletedEvent) => void) => () => void;
    };
    notesAi: {
      onStream: (handler: (evt: NotesAiStreamEvent) => void) => () => void;
    };
    translate: {
      onStream: (handler: (evt: TranslateStreamEvent) => void) => () => void;
    };
    tts: {
      onStream: (handler: (evt: TtsStreamEvent) => void) => () => void;
    };
    updates: {
      onState: (handler: (state: UpdateState) => void) => () => void;
    };
    modelServer: {
      onStatusChanged: (handler: (status: ServerStatusSnapshot) => void) => () => void;
    };
    imagePreview: {
      open: (info: ImageInput) => void;
      onUpdate: (handler: (info: ImageInput) => void) => () => void;
    };
    imageAsset: {
      download: (info: ImageInput) => Promise<{ ok: boolean; error?: string }>;
      copy: (info: ImageInput) => Promise<{ ok: boolean; error?: string }>;
      readFile: (input: { filePath: string }) => Promise<{ ok: boolean; base64?: string; mediaType?: string; error?: string }>;
    };
    webPreview: {
      open: (url: string) => void;
      onState: (
        handler: (state: {
          url: string;
          canGoBack: boolean;
          canGoForward: boolean;
          isLoading: boolean;
          loadError: string | null;
        }) => void
      ) => () => void;
      goBack: () => void;
      goForward: () => void;
      reload: () => void;
      stop: () => void;
      loadURL: (url: string) => void;
      openInBrowser: (url: string) => Promise<{ ok: boolean; error?: string }>;
    };
    appWebView: {
      show: (input: { appletId: string; url: string; bounds: WebAppBounds }) => Promise<{ ok: boolean; error?: string }>;
      setBounds: (input: { appletId: string; bounds: WebAppBounds }) => void;
      hide: (appletId: string) => void;
      close: (appletId: string) => void;
      goBack: (appletId: string) => void;
      goForward: (appletId: string) => void;
      reload: (appletId: string) => void;
      stop: (appletId: string) => void;
      openInBrowser: (input: { appletId: string; url?: string }) => Promise<{ ok: boolean; error?: string }>;
      onState: (handler: (state: WebAppState) => void) => () => void;
    };
    devtoolsPreview: {
      open: (url: string) => void;
    };
    applet: {
      getInitialStateSchema: (appletId: string) => Promise<AppletStateSchemaPayload>;
      onStateSchema: (handler: (payload: AppletStateSchemaPayload) => void) => () => void;
      onError: (handler: (payload: string | { appletId?: string; message?: string }) => void) => () => void;
      onToast: (handler: (payload: AppletToastInput | { appletId?: string; input?: AppletToastInput }) => void) => () => void;
      dispatch: (appletId: string, action: unknown) => Promise<{ ok: boolean }>;
    };
  }
}

export {};
