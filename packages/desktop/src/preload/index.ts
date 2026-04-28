import { contextBridge, ipcRenderer } from "electron";
import { createIpcClient } from "typed-electron-ipc";
import type { Router } from "../main/ipc/router";
import type { ServerStatusSnapshot } from "../main/services/model-server";
import type { UIDataTypes, UIMessageChunk } from "ai";
import type { NotesAiStreamEvent, TranslateStreamEvent } from "@shared";

type ImageInput = {
  src?: string;
  filePath?: string;
  name?: string;
};

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

/**
 * typed-electron-ipc client，自动推导类型
 */
const ipcInvoke = createIpcClient<Router>();

/**
 * preload 暴露最小 API：
 * - renderer 不接触 API Key
 * - renderer 不直接访问 Node/Electron 高危能力
 */
contextBridge.exposeInMainWorld("log", {
  send: (level: LogLevel, message: string, extra?: unknown) =>
    ipcRenderer.send("ax:log", { level, message, extra })
});

// 使用 typed-electron-ipc，自动推导参数和返回值类型
contextBridge.exposeInMainWorld("ipc", ipcInvoke);

contextBridge.exposeInMainWorld("rendererState", {
  onChanged: (handler: (event: RendererStateChangedEvent) => void) => {
    const listener = (_: unknown, event: RendererStateChangedEvent) => handler(event);
    ipcRenderer.on("renderer-state:changed", listener);
    return () => ipcRenderer.removeListener("renderer-state:changed", listener);
  },
});

// chat 流式通道：仅用于订阅流式事件（send/abort 统一走 window.ipc("chat:*")）
contextBridge.exposeInMainWorld("chat", {
  onStream: (handler: (evt: ChatStreamEvent) => void) => {
    const listener = (_: unknown, evt: ChatStreamEvent) => handler(evt);
    ipcRenderer.on("chat:stream", listener);
    return () => ipcRenderer.removeListener("chat:stream", listener);
  },
  onTemporarySessionsDeleted: (handler: (evt: TemporarySessionsDeletedEvent) => void) => {
    const listener = (_: unknown, evt: TemporarySessionsDeletedEvent) => handler(evt);
    ipcRenderer.on("chat:temporarySessionsDeleted", listener);
    return () => ipcRenderer.removeListener("chat:temporarySessionsDeleted", listener);
  },
});

contextBridge.exposeInMainWorld("notesAi", {
  onStream: (handler: (evt: NotesAiStreamEvent) => void) => {
    const listener = (_: unknown, evt: NotesAiStreamEvent) => handler(evt);
    ipcRenderer.on("notes:aiStream", listener);
    return () => ipcRenderer.removeListener("notes:aiStream", listener);
  },
});

contextBridge.exposeInMainWorld("translate", {
  onStream: (handler: (evt: TranslateStreamEvent) => void) => {
    const listener = (_: unknown, evt: TranslateStreamEvent) => handler(evt);
    ipcRenderer.on("translate:stream", listener);
    return () => ipcRenderer.removeListener("translate:stream", listener);
  },
});

contextBridge.exposeInMainWorld("tts", {
  onStream: (handler: (evt: TtsStreamEvent) => void) => {
    const listener = (_: unknown, evt: TtsStreamEvent) => handler(evt);
    ipcRenderer.on("tts:stream", listener);
    return () => ipcRenderer.removeListener("tts:stream", listener);
  },
});

contextBridge.exposeInMainWorld("updates", {
  onState: (handler: (state: UpdateState) => void) => {
    const listener = (_: unknown, state: UpdateState) => handler(state);
    ipcRenderer.on("updates:state", listener);
    return () => ipcRenderer.removeListener("updates:state", listener);
  },
});

contextBridge.exposeInMainWorld("modelServer", {
  onStatusChanged: (handler: (status: ServerStatusSnapshot) => void) => {
    const listener = (_: unknown, status: ServerStatusSnapshot) => handler(status);
    ipcRenderer.on("model-server:statusChanged", listener);
    return () => ipcRenderer.removeListener("model-server:statusChanged", listener);
  },
});

// 图片预览窗口相关
contextBridge.exposeInMainWorld("imagePreview", {
  open: (info: ImageInput) => {
    ipcRenderer.send("image-preview:open", info);
  },
  onUpdate: (handler: (info: ImageInput) => void) => {
    const listener = (_: unknown, info: ImageInput) => handler(info);
    ipcRenderer.on("image-preview:update", listener);
    return () => ipcRenderer.removeListener("image-preview:update", listener);
  }
});

// 图片资产下载（与预览窗口解耦）
contextBridge.exposeInMainWorld("imageAsset", {
  download: (info: ImageInput) => {
    return ipcRenderer.invoke("image-asset:download", info);
  },
  copy: (info: ImageInput) => {
    return ipcRenderer.invoke("image-asset:copy", info);
  },
  readFile: (input: { filePath: string }) => {
    return ipcRenderer.invoke("image-asset:read-file", input);
  }
});

// 网页预览窗口相关
type WebPreviewState = {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  loadError: string | null;
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

contextBridge.exposeInMainWorld("webPreview", {
  open: (url: string) => {
    ipcRenderer.send("web-preview:open", url);
  },
  onState: (handler: (state: WebPreviewState) => void) => {
    const listener = (_: unknown, state: WebPreviewState) => handler(state);
    ipcRenderer.on("web-preview:state", listener);
    return () => ipcRenderer.removeListener("web-preview:state", listener);
  },
  goBack: () => ipcRenderer.send("web-preview:goBack"),
  goForward: () => ipcRenderer.send("web-preview:goForward"),
  reload: () => ipcRenderer.send("web-preview:reload"),
  stop: () => ipcRenderer.send("web-preview:stop"),
  loadURL: (url: string) => ipcRenderer.send("web-preview:loadURL", url),
  openInBrowser: (url: string) => {
    return ipcRenderer.invoke("web-preview:open-in-browser", url);
  }
});

contextBridge.exposeInMainWorld("appWebView", {
  show: (input: { appletId: string; url: string; bounds: WebAppBounds }) => {
    return ipcRenderer.invoke("web-app:show", input);
  },
  setBounds: (input: { appletId: string; bounds: WebAppBounds }) => {
    ipcRenderer.send("web-app:set-bounds", input);
  },
  hide: (appletId: string) => {
    ipcRenderer.send("web-app:hide", { appletId });
  },
  close: (appletId: string) => {
    ipcRenderer.send("web-app:close", { appletId });
  },
  goBack: (appletId: string) => {
    ipcRenderer.send("web-app:goBack", { appletId });
  },
  goForward: (appletId: string) => {
    ipcRenderer.send("web-app:goForward", { appletId });
  },
  reload: (appletId: string) => {
    ipcRenderer.send("web-app:reload", { appletId });
  },
  stop: (appletId: string) => {
    ipcRenderer.send("web-app:stop", { appletId });
  },
  openInBrowser: (input: { appletId: string; url?: string }) => {
    return ipcRenderer.invoke("web-app:open-in-browser", input);
  },
  onState: (handler: (state: WebAppState) => void) => {
    const listener = (_: unknown, state: WebAppState) => handler(state);
    ipcRenderer.on("web-app:state", listener);
    return () => ipcRenderer.removeListener("web-app:state", listener);
  }
});

// AI DevTools 独立预览窗口
contextBridge.exposeInMainWorld("devtoolsPreview", {
  open: (url: string) => {
    ipcRenderer.send("devtools-preview:open", url);
  }
});

// 轻应用运行窗口相关（拉模式：appletId 从 URL hash 取，首帧由 getInitialStateSchema 拉取，后续更新用 onStateSchema 推送）
contextBridge.exposeInMainWorld("applet", {
  getInitialStateSchema: (appletId: string) => ipcInvoke("applet:getInitialStateSchema", { appletId }),
  onStateSchema: (
    handler: (payload: { appletId?: string; state: unknown; schema: unknown; assetRunId?: string | null; streamingPaths?: string[] }) => void
  ) => {
    const listener = (
      _: unknown,
      payload: { appletId?: string; state: unknown; schema: unknown; assetRunId?: string | null; streamingPaths?: string[] }
    ) =>
      handler(payload);
    ipcRenderer.on("applet:state-schema", listener);
    return () => ipcRenderer.removeListener("applet:state-schema", listener);
  },
  onError: (handler: (payload: string | { appletId?: string; message?: string }) => void) => {
    const listener = (_: unknown, payload: string | { appletId?: string; message?: string }) => handler(payload);
    ipcRenderer.on("applet:error", listener);
    return () => ipcRenderer.removeListener("applet:error", listener);
  },
  onToast: (
    handler: (
      payload:
        | {
            title?: string;
            description?: string;
            icon?: string;
            color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
            duration?: number;
            close?: boolean;
            progress?: boolean;
          }
        | {
            appletId?: string;
            input?: {
              title?: string;
              description?: string;
              icon?: string;
              color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
              duration?: number;
              close?: boolean;
              progress?: boolean;
            };
          }
    ) => void
  ) => {
    const listener = (
      _: unknown,
      payload:
        | {
            title?: string;
            description?: string;
            icon?: string;
            color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
            duration?: number;
            close?: boolean;
            progress?: boolean;
          }
        | {
            appletId?: string;
            input?: {
              title?: string;
              description?: string;
              icon?: string;
              color?: "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";
              duration?: number;
              close?: boolean;
              progress?: boolean;
            };
          }
    ) => handler(payload);
    ipcRenderer.on("applet:toast", listener);
    return () => ipcRenderer.removeListener("applet:toast", listener);
  },
  dispatch: (appletId: string, action: unknown) => {
    return ipcInvoke("applet:dispatch", { appletId, action });
  }
});
