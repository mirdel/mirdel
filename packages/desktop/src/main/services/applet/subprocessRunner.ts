/**
 * 轻应用子进程入口：由主进程 fork，通过 env APPLET_RUN_FILE 传入用户代码文件路径（.mjs）。
 * 与主进程通过 process.send / process.on('message') 通信。
 */
import { pathToFileURL } from "node:url";
import * as fs from "node:fs/promises";
import type {
  AppletScript,
  Action,
  UINode,
  RunStatus,
  AppletSearchResult,
  AppletLlmParams,
  AppletToastInput,
  AppletModelOption,
  AppletModelListOptions,
  AppletModelPurpose,
  AppletStorageValue,
  AppletSelectFileOptions,
  AppletSelectFileResult,
  AppletSelectDirectoryOptions,
  AppletSelectDirectoryResult,
  AppletSaveFileOptions,
  AppletSaveFileResult,
  AppletShellResult,
} from "@mirdel/applet-core";
import { createEngine, createUIApi, defineApplet, setStateByPath } from "@mirdel/applet-core";

const APPLET_RUN_FILE = process.env.APPLET_RUN_FILE as string | undefined;
const APPLET_CORE_RUNTIME_GLOBAL_KEY = "__MIRDEL_APPLET_CORE__";
const globalRuntimeBridge = globalThis as typeof globalThis & Record<string, unknown>;
globalRuntimeBridge[APPLET_CORE_RUNTIME_GLOBAL_KEY] = {
  defineApplet,
  createUIApi,
  createEngine,
  setStateByPath,
};

type MessageToParent =
  | { type: "ready"; state: Record<string, unknown>; schema: UINode; streamingPaths?: string[] }
  | { type: "state-schema"; state: Record<string, unknown>; schema: UINode; streamingPaths?: string[] }
  | { type: "error"; message: string }
  | { type: "llm:generateText"; id: string; params: AppletLlmParams }
  | { type: "llm:streamText"; id: string; key?: string; params: AppletLlmParams; statePath: string }
  | { type: "llm:abort"; key: string }
  | { type: "search:query"; id: string; query: string; limit?: number; providerId?: string }
  | { type: "clipboard:write"; id: string; text: string }
  | { type: "clipboard:read"; id: string }
  | { type: "storage:get"; id: string; key: string }
  | { type: "storage:set"; id: string; key: string; value: AppletStorageValue }
  | { type: "storage:remove"; id: string; key: string }
  | { type: "storage:clear"; id: string }
  | { type: "storage:getAll"; id: string }
  | { type: "dialog:selectFile"; id: string; options?: AppletSelectFileOptions }
  | { type: "dialog:selectDirectory"; id: string; options?: AppletSelectDirectoryOptions }
  | { type: "dialog:saveFile"; id: string; options?: AppletSaveFileOptions }
  | { type: "shell:openExternal"; id: string; url: string }
  | { type: "shell:showItemInFolder"; id: string; path: string }
  | { type: "shell:openPath"; id: string; path: string }
  | { type: "toast:show"; input: AppletToastInput };

type MessageFromParent =
  | { type: "init"; models?: AppletModelOption[] }
  | { type: "reload" }
  | { type: "action"; action: Action }
  | { type: "llm:result"; id: string; text?: string; error?: string }
  | { type: "llm:delta"; id: string; delta: string }
  | { type: "search:result"; id: string; result?: AppletSearchResult; error?: string }
  | { type: "clipboard:result"; id: string; success?: boolean; text?: string; error?: string }
  | { type: "storage:result"; id: string; value?: AppletStorageValue; values?: Record<string, AppletStorageValue>; error?: string }
  | { type: "dialog:result"; id: string; result?: AppletSelectFileResult | AppletSelectDirectoryResult | AppletSaveFileResult; error?: string }
  | { type: "shell:result"; id: string; result?: AppletShellResult; error?: string };

const runStatusByKey = new Map<string, RunStatus>();
const streamPathByKey = new Map<string, string>();
const pendingLlmById = new Map<
  string,
  { resolve: (t: string) => void; reject: (e: Error) => void; path?: string; onDelta?: (c: string) => void; accumulated?: string }
>();
const pendingSearchById = new Map<string, { resolve: (r: AppletSearchResult) => void; reject: (e: Error) => void }>();
const pendingClipboardById = new Map<
  string,
  { resolve: (v: { success?: boolean; text?: string }) => void; reject: (e: Error) => void }
>();
const pendingStorageById = new Map<string, { resolve: (value: unknown) => void; reject: (e: Error) => void }>();
const pendingDialogById = new Map<string, { resolve: (value: unknown) => void; reject: (e: Error) => void }>();
const pendingShellById = new Map<string, { resolve: (value: AppletShellResult) => void; reject: (e: Error) => void }>();

let engine: ReturnType<typeof createEngine> | null = null;
let script: AppletScript | null = null;
let host: Parameters<typeof createEngine>[1] | null = null;
let runtimeModels: AppletModelOption[] = [];

function isAppletScript(value: unknown): value is AppletScript {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.init === "function" && typeof row.onAction === "function" && typeof row.render === "function";
}

function send(msg: MessageToParent) {
  process.send?.(msg);
}

function createAndSendReady() {
  if (!script || !host) return;
  engine = createEngine(script, host);
  const state = engine.getState();
  const schema = engine.getSchema();
  send({
    type: "ready",
    state,
    schema,
    streamingPaths: Array.from(streamPathByKey.values()).filter((path) => !!String(path).trim()),
  });
}

function emitStateSchema() {
  if (!engine) return;
  send({
    type: "state-schema",
    state: engine.getState(),
    schema: engine.getSchema(),
    streamingPaths: Array.from(streamPathByKey.values()).filter((path) => !!String(path).trim()),
  });
}

function normalizeToastInput(input: AppletToastInput): AppletToastInput {
  return {
    title: typeof input?.title === "string" ? input.title : undefined,
    description: typeof input?.description === "string" ? input.description : undefined,
    icon: typeof input?.icon === "string" ? input.icon : undefined,
    color: input?.color,
    duration: Number.isFinite(input?.duration) ? Math.max(0, Number(input.duration)) : undefined,
    close: typeof input?.close === "boolean" ? input.close : undefined,
    progress: typeof input?.progress === "boolean" ? input.progress : undefined,
  };
}

function normalizeModelType(value: unknown): "generative" | "embedding" | "rerank" | undefined {
  if (value === "generative" || value === "embedding" || value === "rerank") return value;
  return undefined;
}

function normalizeModelPurpose(value: unknown): AppletModelPurpose {
  if (value === "embedding" || value === "rerank" || value === "image" || value === "video" || value === "chat") {
    return value;
  }
  return "chat";
}

function normalizeModelModalities(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value
    .map((item) => String(item).trim())
    .filter((item) => !!item);
  return list.length > 0 ? list : undefined;
}

function normalizeModelOption(value: unknown): AppletModelOption | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const providerId = typeof row.providerId === "string" ? row.providerId.trim() : "";
  const modelId = typeof row.modelId === "string" ? row.modelId.trim() : "";
  if (!providerId || !modelId) return null;
  const encodedModel = `${providerId}::${modelId}`;
  const modelValue = typeof row.value === "string" && row.value.includes("::")
    ? row.value.trim()
    : encodedModel;
  const providerName = typeof row.providerName === "string" ? row.providerName.trim() : "";
  const modelType = normalizeModelType(row.modelType);
  return {
    value: modelValue,
    label: typeof row.label === "string" && row.label.trim() ? row.label.trim() : `${providerName || providerId} / ${modelId}`,
    description: typeof row.description === "string" ? row.description : undefined,
    icon: typeof row.icon === "string" ? row.icon : undefined,
    disabled: !!row.disabled,
    providerId,
    providerName: providerName || undefined,
    modelId,
    modelType,
    inputModalities: normalizeModelModalities(row.inputModalities),
    outputModalities: normalizeModelModalities(row.outputModalities),
  };
}

function normalizeModelOptions(value: unknown): AppletModelOption[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeModelOption).filter((item): item is AppletModelOption => item != null);
}

function modelOutputModalities(model: AppletModelOption): string[] {
  if (Array.isArray(model.outputModalities) && model.outputModalities.length > 0) {
    return model.outputModalities.map((item) => item.toLowerCase());
  }
  if ((model.modelType ?? "generative") === "generative") return ["text"];
  return [];
}

function modelMatchesPurpose(model: AppletModelOption, purpose: AppletModelPurpose): boolean {
  const modelType = model.modelType ?? "generative";
  const outputModalities = modelOutputModalities(model);
  if (purpose === "embedding") return modelType === "embedding";
  if (purpose === "rerank") return modelType === "rerank";
  if (purpose === "image") return modelType === "generative" && outputModalities.includes("image");
  if (purpose === "video") return modelType === "generative" && outputModalities.includes("video");
  return modelType === "generative" && outputModalities.includes("text");
}

function filterRuntimeModels(options?: AppletModelListOptions): AppletModelOption[] {
  const purpose = normalizeModelPurpose(options?.purpose);
  const providerId = typeof options?.providerId === "string" ? options.providerId.trim() : "";
  return runtimeModels.filter((item) => {
    if (providerId && item.providerId !== providerId) return false;
    return modelMatchesPurpose(item, purpose);
  });
}

async function loadAndRun() {
  if (!APPLET_RUN_FILE) {
    send({ type: "error", message: "Missing APPLET_RUN_FILE environment variable" });
    process.exit(1);
  }

  let s: AppletScript;
  try {
    const mod = await import(pathToFileURL(APPLET_RUN_FILE).href);
    if (!isAppletScript(mod.default)) {
      throw new Error(
        "applet module must export default defineApplet({ init, onAction, render })",
      );
    }
    s = mod.default;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    send({ type: "error", message: `Failed to load applet: ${message}` });
    process.exit(1);
  }
  script = s;

  const h = {
    runs: {
      cancel(key: string) {
        send({ type: "llm:abort", key });
        runStatusByKey.set(key, "idle");
        streamPathByKey.delete(key);
        emitStateSchema();
      },
      status(key: string): RunStatus {
        return runStatusByKey.get(key) ?? "idle";
      },
    },
    llm: {
      async generateText(params: AppletLlmParams): Promise<string> {
        const id = `gen-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        send({ type: "llm:generateText", id, params });
        return new Promise((resolve, reject) => {
          pendingLlmById.set(id, { resolve, reject });
        });
      },
      async streamText(params: AppletLlmParams & { key?: string; statePath: string; onDelta?: (chunk: string) => void }): Promise<void> {
        const id = `st-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const key = params.key ?? id;
        runStatusByKey.set(key, "running");
        const { statePath, onDelta, ...rest } = params;
        streamPathByKey.set(key, String(statePath || ""));
        send({ type: "llm:streamText", id, key, params: rest, statePath });
        return new Promise((resolve, reject) => {
          pendingLlmById.set(id, {
            resolve(t: string) {
              if (engine && statePath) {
                engine.setStateByPath(statePath, t);
              }
              streamPathByKey.delete(key);
              emitStateSchema();
              runStatusByKey.set(key, "done");
              resolve();
            },
            reject(e: Error) {
              streamPathByKey.delete(key);
              emitStateSchema();
              runStatusByKey.set(key, "error");
              reject(e);
            },
            path: statePath,
            onDelta,
            accumulated: "",
          });
        });
      },
      abort(key: string) {
        send({ type: "llm:abort", key });
        runStatusByKey.set(key, "idle");
        streamPathByKey.delete(key);
        emitStateSchema();
      },
      status(key: string): RunStatus {
        return runStatusByKey.get(key) ?? "idle";
      },
    },
    models: {
      async list(options?: AppletModelListOptions): Promise<AppletModelOption[]> {
        return filterRuntimeModels(options);
      },
      listSync(options?: AppletModelListOptions): AppletModelOption[] {
        return filterRuntimeModels(options);
      },
    },
    onStateSchema(state: Record<string, unknown>, schema: UINode) {
      send({ type: "state-schema", state, schema });
    },
    search: async (query: string, options?: { limit?: number; providerId?: string }): Promise<AppletSearchResult> => {
      const id = `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      send({ type: "search:query", id, query, limit: options?.limit, providerId: options?.providerId });
      return new Promise((resolve, reject) => {
        pendingSearchById.set(id, { resolve, reject });
      });
    },
    clipboard: {
      write: async (text: string): Promise<boolean> => {
        const id = `cbw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        send({ type: "clipboard:write", id, text });
        return new Promise((resolve, reject) => {
          pendingClipboardById.set(id, {
            resolve: (v) => resolve(v.success ?? false),
            reject,
          });
        });
      },
      read: async (): Promise<string> => {
        const id = `cbr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        send({ type: "clipboard:read", id });
        return new Promise((resolve, reject) => {
          pendingClipboardById.set(id, {
            resolve: (v) => resolve(v.text ?? ""),
            reject,
          });
        });
      },
    },
    fs: fs as Record<string, unknown>,
    storage: {
      get: async (key: string): Promise<AppletStorageValue | undefined> => {
        const id = `stg-get-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        send({ type: "storage:get", id, key: String(key || "") });
        return new Promise((resolve, reject) => {
          pendingStorageById.set(id, { resolve, reject });
        }) as Promise<AppletStorageValue | undefined>;
      },
      set: async (key: string, value: AppletStorageValue): Promise<void> => {
        const id = `stg-set-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        send({ type: "storage:set", id, key: String(key || ""), value });
        return new Promise((resolve, reject) => {
          pendingStorageById.set(id, { resolve, reject });
        }).then(() => undefined);
      },
      remove: async (key: string): Promise<void> => {
        const id = `stg-remove-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        send({ type: "storage:remove", id, key: String(key || "") });
        return new Promise((resolve, reject) => {
          pendingStorageById.set(id, { resolve, reject });
        }).then(() => undefined);
      },
      clear: async (): Promise<void> => {
        const id = `stg-clear-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        send({ type: "storage:clear", id });
        return new Promise((resolve, reject) => {
          pendingStorageById.set(id, { resolve, reject });
        }).then(() => undefined);
      },
      getAll: async (): Promise<Record<string, AppletStorageValue>> => {
        const id = `stg-all-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        send({ type: "storage:getAll", id });
        return new Promise((resolve, reject) => {
          pendingStorageById.set(id, { resolve, reject });
        }) as Promise<Record<string, AppletStorageValue>>;
      },
    },
    dialog: {
      selectFile: async (options?: AppletSelectFileOptions): Promise<AppletSelectFileResult> => {
        const id = `dlg-file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        send({ type: "dialog:selectFile", id, options });
        return new Promise((resolve, reject) => {
          pendingDialogById.set(id, { resolve, reject });
        }) as Promise<AppletSelectFileResult>;
      },
      selectDirectory: async (options?: AppletSelectDirectoryOptions): Promise<AppletSelectDirectoryResult> => {
        const id = `dlg-dir-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        send({ type: "dialog:selectDirectory", id, options });
        return new Promise((resolve, reject) => {
          pendingDialogById.set(id, { resolve, reject });
        }) as Promise<AppletSelectDirectoryResult>;
      },
      saveFile: async (options?: AppletSaveFileOptions): Promise<AppletSaveFileResult> => {
        const id = `dlg-save-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        send({ type: "dialog:saveFile", id, options });
        return new Promise((resolve, reject) => {
          pendingDialogById.set(id, { resolve, reject });
        }) as Promise<AppletSaveFileResult>;
      },
    },
    shell: {
      openExternal: async (url: string): Promise<AppletShellResult> => {
        const id = `sh-ext-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        send({ type: "shell:openExternal", id, url: String(url || "") });
        return new Promise((resolve, reject) => {
          pendingShellById.set(id, { resolve, reject });
        });
      },
      showItemInFolder: async (targetPath: string): Promise<AppletShellResult> => {
        const id = `sh-folder-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        send({ type: "shell:showItemInFolder", id, path: String(targetPath || "") });
        return new Promise((resolve, reject) => {
          pendingShellById.set(id, { resolve, reject });
        });
      },
      openPath: async (targetPath: string): Promise<AppletShellResult> => {
        const id = `sh-path-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        send({ type: "shell:openPath", id, path: String(targetPath || "") });
        return new Promise((resolve, reject) => {
          pendingShellById.set(id, { resolve, reject });
        });
      },
    },
    toast: (input: AppletToastInput) => {
      send({ type: "toast:show", input: normalizeToastInput(input) });
    },
  };
  host = h;

  createAndSendReady();
}

process.on("message", async (msg: MessageFromParent) => {
  if (msg.type === "llm:result") {
    const pending = pendingLlmById.get(msg.id);
    if (pending) {
      pendingLlmById.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error));
      else pending.resolve(msg.text ?? "");
    }
    return;
  }
  if (msg.type === "search:result") {
    const pending = pendingSearchById.get(msg.id);
    if (pending) {
      pendingSearchById.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error));
      else pending.resolve(msg.result ?? { success: false, error: "Unknown error" });
    }
    return;
  }
  if (msg.type === "clipboard:result") {
    const pending = pendingClipboardById.get(msg.id);
    if (pending) {
      pendingClipboardById.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error));
      else pending.resolve({ success: msg.success, text: msg.text });
    }
    return;
  }
  if (msg.type === "storage:result") {
    const pending = pendingStorageById.get(msg.id);
    if (pending) {
      pendingStorageById.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error));
      else if (msg.values) pending.resolve(msg.values);
      else pending.resolve(msg.value);
    }
    return;
  }
  if (msg.type === "dialog:result") {
    const pending = pendingDialogById.get(msg.id);
    if (pending) {
      pendingDialogById.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error));
      else pending.resolve(msg.result);
    }
    return;
  }
  if (msg.type === "shell:result") {
    const pending = pendingShellById.get(msg.id);
    if (pending) {
      pendingShellById.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error));
      else pending.resolve(msg.result ?? { ok: false, error: "Unknown shell error" });
    }
    return;
  }
  if (msg.type === "llm:delta") {
    const pending = pendingLlmById.get(msg.id);
    if (pending) {
      pending.accumulated = (pending.accumulated ?? "") + msg.delta;
      if (pending.path && engine) {
        engine.setStateByPath(pending.path, pending.accumulated);
        emitStateSchema();
      }
      pending.onDelta?.(msg.delta);
    }
    return;
  }
  if (msg.type === "init") {
    runtimeModels = normalizeModelOptions(msg.models);
    await loadAndRun();
    return;
  }
  if (msg.type === "reload" && script && host) {
    createAndSendReady();
    return;
  }
  if (msg.type === "action" && engine) {
    try {
      await engine.dispatch(msg.action);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      send({ type: "error", message });
    }
  }
});
