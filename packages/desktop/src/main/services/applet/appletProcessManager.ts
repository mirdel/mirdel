/**
 * 轻应用运行实例：一窗口一子进程，主进程负责构建运行入口、fork、转发消息与 LLM。
 */
import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { clipboard, dialog, shell } from "electron";
import type { BrowserWindow, OpenDialogOptions, SaveDialogOptions } from "electron";
import { loggerServiceMain } from "@shared";
import { getApplet } from "./appletData";
import { appletLlmGenerateText, appletLlmStreamText } from "./appletLlmService";
import {
  clearAppletStorage,
  getAllAppletStorageValues,
  getAppletStorageValue,
  removeAppletStorageValue,
  setAppletStorageValue,
} from "./appletStorage";
import { webSearchService } from "../web-search";
import { buildAppletSource } from "./appletBuild";
import { getAppletRootDir } from "./appletPaths";
import { listProviders } from "../providers/providerData";
import type { AppletSearchResult, AppletModelOption } from "@mirdel/applet-core";

const logger = loggerServiceMain.withContext("appletProcess");

type StateSchemaPayload = {
  state: Record<string, unknown>;
  schema: unknown;
  assetRunId?: string | null;
  streamingPaths?: string[];
};

type RunEntry = {
  appletId: string;
  win: BrowserWindow | null;
  child: ChildProcess;
  runtimeFile: string;
  cleanupPaths: string[];
  appletAssetRunId: string | null;
  abortByKey: Map<string, AbortController>;
  pendingStateSchema: StateSchemaPayload | null;
  pendingInitialRequest: {
    resolve: (payload: StateSchemaPayload) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  } | null;
  /** 初始化阶段错误（ready 前发生），用于兜底给 getInitialStateSchema 返回失败 */
  initialError: string | null;
  /** 缓存首次 ready 的 state/schema，供刷新后恢复初始状态（刷新=丢弃当前 state） */
  initialStateSchema: StateSchemaPayload | null;
};

const runByAppletId = new Map<string, RunEntry>();
const appletIdByChild = new Map<ChildProcess, string>();
const appletAssetRootByRunId = new Map<string, string>();
const INITIAL_STATE_SCHEMA_TIMEOUT_MS = 15000;

function normalizeModalities(modalities: unknown): string[] | undefined {
  if (!Array.isArray(modalities)) return undefined;
  const values = modalities
    .map((item) => String(item).trim())
    .filter((item) => !!item);
  return values.length > 0 ? values : undefined;
}

function buildAppletModelOptions(): AppletModelOption[] {
  try {
    const rows: AppletModelOption[] = [];
    for (const provider of listProviders()) {
      if (!provider.enabled) continue;
      const providerId = String(provider.id || "").trim();
      if (!providerId) continue;
      const providerName = String(provider.name || providerId).trim() || providerId;
      const models = Array.isArray(provider.models) ? provider.models : [];
      for (const model of models) {
        const modelId = String(model?.id || "").trim();
        if (!modelId) continue;
        rows.push({
          value: `${providerId}::${modelId}`,
          label: `${providerName} / ${modelId}`,
          providerId,
          providerName,
          modelId,
          modelType: model.modelType,
          inputModalities: normalizeModalities(model.inputModalities),
          outputModalities: normalizeModalities(model.outputModalities),
        });
      }
    }
    return rows.sort((a, b) => {
      const byProvider = (a.providerName || a.providerId).localeCompare(b.providerName || b.providerId, "zh-CN");
      if (byProvider !== 0) return byProvider;
      return a.modelId.localeCompare(b.modelId, "zh-CN");
    });
  } catch (error) {
    logger.warn("buildAppletModelOptions failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function isPathInside(parent: string, target: string): boolean {
  const relative = path.relative(parent, target);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function cleanupRunResources(run: RunEntry): void {
  if (run.appletAssetRunId) {
    appletAssetRootByRunId.delete(run.appletAssetRunId);
  }
  for (const cleanupPath of run.cleanupPaths) {
    fs.rm(cleanupPath, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * 解析 applet-asset://runId/path/to/file 到真实文件路径。
 * 仅允许访问当前注册 runId 对应的构建目录，防止路径穿越。
 */
export function resolveAppletAssetFileByUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "applet-asset:") return null;
    const hostId = decodeURIComponent(url.hostname || "").trim();
    if (!hostId || !/^[a-zA-Z0-9_-]+$/.test(hostId)) return null;
    const root = appletAssetRootByRunId.get(hostId) ?? getAppletRootDir(hostId);
    if (!root) return null;
    const relPath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!relPath || relPath.includes("\0")) return null;
    const fullPath = path.resolve(path.join(root, relPath));
    if (!isPathInside(path.resolve(root), fullPath)) return null;
    return fullPath;
  } catch {
    return null;
  }
}

async function spawnAppletProcessWithEntry(input: {
  appletId: string;
  runtimeFile: string;
  cleanupPaths: string[];
  appletAssetRunId?: string;
  appletAssetRoot?: string;
}): Promise<
  | { alreadyOpen: true; appletId: string }
  | { alreadyOpen: false; appletId: string; child: ChildProcess; runtimeFile: string }
> {
  const { appletId, runtimeFile, cleanupPaths, appletAssetRunId, appletAssetRoot } = input;
  const existing = runByAppletId.get(appletId);
  if (existing) {
    if (existing.win && !existing.win.isDestroyed()) {
      existing.win.focus();
      return { alreadyOpen: true, appletId };
    }
    closeAppletRun(appletId); /* 清理无窗口的残留 */
  }

  const subprocessPath = path.join(__dirname, "applet/subprocessRunner.cjs");
  const child = fork(subprocessPath, [], {
    execPath: process.execPath,
    env: { ...process.env, APPLET_RUN_FILE: runtimeFile, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  child.send({ type: "init", models: buildAppletModelOptions() });

  if (appletAssetRunId && appletAssetRoot) {
    appletAssetRootByRunId.set(appletAssetRunId, appletAssetRoot);
  }

  const abortByKey = new Map<string, AbortController>();
  const entry: RunEntry = {
    appletId,
    win: null,
    child,
    runtimeFile,
    cleanupPaths,
    appletAssetRunId: appletAssetRunId ?? null,
    abortByKey,
    pendingStateSchema: null,
    pendingInitialRequest: null,
    initialError: null,
    initialStateSchema: null,
  };
  runByAppletId.set(appletId, entry);
  appletIdByChild.set(child, appletId);

  child.on("message", (msg: any) => {
    const aid = appletIdByChild.get(child);
    if (!aid) return;
    const run = runByAppletId.get(aid);
    if (!run) return;
    if (msg.type === "ready") {
      const payload: StateSchemaPayload = {
        state: msg.state,
        schema: msg.schema,
        assetRunId: run.appletAssetRunId,
        streamingPaths: Array.isArray(msg.streamingPaths) ? msg.streamingPaths.map((item: unknown) => String(item)) : [],
      };
      if (!run.initialStateSchema) run.initialStateSchema = payload; /* 仅首次设置，刷新时恢复 */
      run.initialError = null;
      run.pendingStateSchema = payload;
      if (run.pendingInitialRequest) {
        const pending = run.pendingInitialRequest;
        clearTimeout(pending.timer);
        pending.resolve(payload);
        run.pendingInitialRequest = null;
      }
      if (run.win && !run.win.isDestroyed()) {
        run.win.webContents.send("applet:state-schema", payload);
      }
      return;
    }
    if (msg.type === "search:query") {
      (async () => {
        try {
          const raw = await webSearchService.searchWithContent(
            msg.query,
            msg.limit,
            msg.providerId
          );
          let result: AppletSearchResult;
          if ("error" in raw) {
            result = { success: false, error: raw.error };
          } else {
            result = {
              success: true,
              source: raw.source,
              results: raw.results.map((r) => ({
                title: r.title,
                url: r.url,
                content: r.content,
                truncated: r.truncated,
                fetchSuccess: r.fetchSuccess,
              })),
              searchDuration: raw.searchDuration,
              duration: raw.duration,
            };
          }
          child.send({ type: "search:result", id: msg.id, result });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          child.send({ type: "search:result", id: msg.id, error: errMsg });
        }
      })();
      return;
    }
    if (msg.type === "clipboard:write") {
      (async () => {
        try {
          clipboard.writeText(msg.text);
          child.send({ type: "clipboard:result", id: msg.id, success: true });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          child.send({ type: "clipboard:result", id: msg.id, success: false, error: errMsg });
        }
      })();
      return;
    }
    if (msg.type === "clipboard:read") {
      (async () => {
        try {
          const text = clipboard.readText();
          child.send({ type: "clipboard:result", id: msg.id, success: true, text });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          child.send({ type: "clipboard:result", id: msg.id, success: false, error: errMsg });
        }
      })();
      return;
    }
    if (msg.type === "storage:get") {
      (async () => {
        try {
          const value = await getAppletStorageValue(aid, msg.key);
          child.send({ type: "storage:result", id: msg.id, value });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          child.send({ type: "storage:result", id: msg.id, error: errMsg });
        }
      })();
      return;
    }
    if (msg.type === "storage:set") {
      (async () => {
        try {
          await setAppletStorageValue(aid, msg.key, msg.value);
          child.send({ type: "storage:result", id: msg.id });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          child.send({ type: "storage:result", id: msg.id, error: errMsg });
        }
      })();
      return;
    }
    if (msg.type === "storage:remove") {
      (async () => {
        try {
          await removeAppletStorageValue(aid, msg.key);
          child.send({ type: "storage:result", id: msg.id });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          child.send({ type: "storage:result", id: msg.id, error: errMsg });
        }
      })();
      return;
    }
    if (msg.type === "storage:clear") {
      (async () => {
        try {
          await clearAppletStorage(aid);
          child.send({ type: "storage:result", id: msg.id });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          child.send({ type: "storage:result", id: msg.id, error: errMsg });
        }
      })();
      return;
    }
    if (msg.type === "storage:getAll") {
      (async () => {
        try {
          const values = await getAllAppletStorageValues(aid);
          child.send({ type: "storage:result", id: msg.id, values });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          child.send({ type: "storage:result", id: msg.id, error: errMsg });
        }
      })();
      return;
    }
    if (msg.type === "dialog:selectFile") {
      (async () => {
        try {
          const options: OpenDialogOptions = {
            title: msg.options?.title,
            defaultPath: msg.options?.defaultPath,
            filters: Array.isArray(msg.options?.filters) ? msg.options?.filters : undefined,
            properties: msg.options?.multiSelections ? ["openFile", "multiSelections"] : ["openFile"],
          };
          const result = run.win
            ? await dialog.showOpenDialog(run.win, options)
            : await dialog.showOpenDialog(options);
          child.send({
            type: "dialog:result",
            id: msg.id,
            result: {
              canceled: result.canceled,
              filePaths: result.filePaths,
            },
          });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          child.send({ type: "dialog:result", id: msg.id, error: errMsg });
        }
      })();
      return;
    }
    if (msg.type === "dialog:selectDirectory") {
      (async () => {
        try {
          const options: OpenDialogOptions = {
            title: msg.options?.title,
            defaultPath: msg.options?.defaultPath,
            properties: ["openDirectory", "createDirectory"],
          };
          const result = run.win
            ? await dialog.showOpenDialog(run.win, options)
            : await dialog.showOpenDialog(options);
          child.send({
            type: "dialog:result",
            id: msg.id,
            result: {
              canceled: result.canceled,
              filePath: result.filePaths[0] || null,
            },
          });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          child.send({ type: "dialog:result", id: msg.id, error: errMsg });
        }
      })();
      return;
    }
    if (msg.type === "dialog:saveFile") {
      (async () => {
        try {
          const options: SaveDialogOptions = {
            title: msg.options?.title,
            defaultPath: msg.options?.defaultPath,
            filters: Array.isArray(msg.options?.filters) ? msg.options?.filters : undefined,
          };
          const result = run.win
            ? await dialog.showSaveDialog(run.win, options)
            : await dialog.showSaveDialog(options);
          child.send({
            type: "dialog:result",
            id: msg.id,
            result: {
              canceled: result.canceled,
              filePath: result.filePath || null,
            },
          });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          child.send({ type: "dialog:result", id: msg.id, error: errMsg });
        }
      })();
      return;
    }
    if (msg.type === "shell:openExternal") {
      (async () => {
        try {
          await shell.openExternal(msg.url);
          child.send({ type: "shell:result", id: msg.id, result: { ok: true } });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          child.send({ type: "shell:result", id: msg.id, result: { ok: false, error: errMsg } });
        }
      })();
      return;
    }
    if (msg.type === "shell:showItemInFolder") {
      (async () => {
        try {
          shell.showItemInFolder(msg.path);
          child.send({ type: "shell:result", id: msg.id, result: { ok: true } });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          child.send({ type: "shell:result", id: msg.id, result: { ok: false, error: errMsg } });
        }
      })();
      return;
    }
    if (msg.type === "shell:openPath") {
      (async () => {
        try {
          const result = await shell.openPath(msg.path);
          child.send({
            type: "shell:result",
            id: msg.id,
            result: { ok: result === "", error: result || undefined },
          });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          child.send({ type: "shell:result", id: msg.id, result: { ok: false, error: errMsg } });
        }
      })();
      return;
    }
    if (msg.type === "toast:show") {
      if (run.win && !run.win.isDestroyed()) {
        run.win.webContents.send("applet:toast", msg.input);
      }
      return;
    }
    if (msg.type === "llm:generateText") {
      (async () => {
        try {
          const ctrl = new AbortController();
          abortByKey.set(msg.id, ctrl);
          const text = await appletLlmGenerateText({ ...msg.params, abortSignal: ctrl.signal });
          child.send({ type: "llm:result", id: msg.id, text });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          child.send({ type: "llm:result", id: msg.id, error: message });
        } finally {
          abortByKey.delete(msg.id);
        }
      })();
      return;
    }
    if (msg.type === "llm:streamText") {
      (async () => {
        try {
          const ctrl = new AbortController();
          const key = msg.key ?? msg.id;
          abortByKey.set(key, ctrl);
          const fullText = await appletLlmStreamText({
            ...msg.params,
            key,
            statePath: msg.statePath ?? "",
            onDelta: (delta) => child.send({ type: "llm:delta", id: msg.id, delta }),
            abortSignal: ctrl.signal,
          });
          child.send({ type: "llm:result", id: msg.id, text: fullText });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          child.send({ type: "llm:result", id: msg.id, error: message });
        } finally {
          abortByKey.delete(msg.key ?? msg.id);
        }
      })();
      return;
    }
    if (msg.type === "llm:abort") {
      const ctrl = abortByKey.get(msg.key);
      if (ctrl) {
        ctrl.abort();
        abortByKey.delete(msg.key);
      }
      return;
    }
    if (msg.type === "state-schema") {
      const payload: StateSchemaPayload = {
        state: msg.state,
        schema: msg.schema,
        assetRunId: run.appletAssetRunId,
        streamingPaths: Array.isArray(msg.streamingPaths) ? msg.streamingPaths.map((item: unknown) => String(item)) : [],
      };
      if (run.win && !run.win.isDestroyed()) {
        run.win.webContents.send("applet:state-schema", payload);
      }
      return;
    }
    if (msg.type === "error") {
      if (!run.initialStateSchema) run.initialError = msg.message;
      if (run.pendingInitialRequest) {
        const pending = run.pendingInitialRequest;
        clearTimeout(pending.timer);
        pending.reject(new Error(msg.message));
        run.pendingInitialRequest = null;
      }
      if (run.win && !run.win.isDestroyed()) {
        run.win.webContents.send("applet:error", msg.message);
      }
      return;
    }
  });

  child.on("exit", (code) => {
    const aid = appletIdByChild.get(child);
    appletIdByChild.delete(child);
    if (aid) {
      const run = runByAppletId.get(aid);
      if (run?.pendingInitialRequest) {
        const pending = run.pendingInitialRequest;
        clearTimeout(pending.timer);
        pending.reject(new Error(`applet process exited before ready (code=${String(code)})`));
        run.pendingInitialRequest = null;
      }
      if (run) cleanupRunResources(run);
      runByAppletId.delete(aid);
      logger.info("applet process exited", { appletId: aid, code });
    }
  });

  child.stderr?.on("data", (data) => logger.warn("applet stderr", { appletId, data: String(data) }));

  return { alreadyOpen: false as const, appletId, child, runtimeFile };
}

/** 若已存在则聚焦窗口并返回；否则构建轻应用目录并启动子进程。 */
export async function spawnAppletProcess(appletId: string): Promise<
  | { alreadyOpen: true; appletId: string }
  | { alreadyOpen: false; appletId: string; child: ChildProcess; runtimeFile: string }
> {
  const applet = await getApplet(appletId);
  if (!applet) throw new Error(`轻应用不存在: ${appletId}`);
  const build = await buildAppletSource(appletId, applet.entryFile);
  return spawnAppletProcessWithEntry({
    appletId,
    runtimeFile: build.entryFile,
    cleanupPaths: [],
    appletAssetRunId: build.runId,
    appletAssetRoot: build.outDir,
  });
}

/** 将窗口与已 spawn 的 run 绑定（由 IPC 在创建窗口后调用） */
export function registerAppletWindow(appletId: string, win: BrowserWindow): void {
  const run = runByAppletId.get(appletId);
  if (!run) return;
  run.win = win;
}

/**
 * 渲染端就绪后主动拉取首帧，避免推送时序竞争（ready 可能在监听注册前就发出）。
 * 若 ready 已到则立即返回；否则返回 Promise，在收到 ready 时 resolve。
 * 刷新后返回 initialStateSchema（首次 ready 的快照），并通知子进程重置 state，实现「刷新=丢弃当前 state」。
 */
export function getInitialStateSchema(appletId: string): Promise<StateSchemaPayload> {
  const run = runByAppletId.get(appletId);
  if (!run) return Promise.reject(new Error("run not found"));
  if (run.pendingStateSchema) {
    const payload = run.pendingStateSchema;
    if (!run.initialStateSchema) run.initialStateSchema = payload;
    run.pendingStateSchema = null;
    return Promise.resolve(payload);
  }
  if (run.initialStateSchema) {
    if (run.child.connected) run.child.send({ type: "reload" }); /* 子进程重置 state，与渲染端同步 */
    return Promise.resolve(run.initialStateSchema);
  }
  if (run.initialError) {
    return Promise.reject(new Error(run.initialError));
  }
  if (!run.child.connected) {
    return Promise.reject(new Error("applet process not connected"));
  }
  return new Promise((resolve, reject) => {
    if (run.pendingInitialRequest) {
      const pending = run.pendingInitialRequest;
      clearTimeout(pending.timer);
      pending.reject(new Error("initial state request superseded"));
    }
    const timer = setTimeout(() => {
      if (run.pendingInitialRequest?.timer === timer) {
        run.pendingInitialRequest = null;
      }
      reject(new Error(`getInitialStateSchema timeout (${INITIAL_STATE_SCHEMA_TIMEOUT_MS}ms)`));
    }, INITIAL_STATE_SCHEMA_TIMEOUT_MS);
    run.pendingInitialRequest = { resolve, reject, timer };
  });
}

/** 向子进程发送 action（由 IPC applet:dispatch 调用） */
export function dispatchAppletAction(appletId: string, action: any): boolean {
  const run = runByAppletId.get(appletId);
  if (!run?.child.connected) return false;
  run.child.send({ type: "action", action });
  return true;
}

/** 关闭轻应用运行：杀子进程、删临时产物、从 Map 移除（窗口关闭时由 index 调用） */
export function closeAppletRun(appletId: string): void {
  const run = runByAppletId.get(appletId);
  if (!run) return;
  if (run.pendingInitialRequest) {
    const pending = run.pendingInitialRequest;
    clearTimeout(pending.timer);
    pending.reject(new Error("applet run closed"));
    run.pendingInitialRequest = null;
  }
  cleanupRunResources(run);
  run.child.kill();
  runByAppletId.delete(appletId);
  appletIdByChild.delete(run.child);
}

export function getRunByAppletId(appletId: string): RunEntry | undefined {
  return runByAppletId.get(appletId);
}
