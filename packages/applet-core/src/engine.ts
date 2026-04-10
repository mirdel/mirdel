import type {
  AppletScript,
  AppletCtx,
  AppletLlmHost,
  AppletModelsHost,
  AppletModelsApi,
  AppletRunsHost,
  AppletSearchResult,
  AppletClipboardHost,
  AppletFsHost,
  AppletStorageHost,
  AppletDialogHost,
  AppletShellHost,
  AppletToastHost,
  Action,
  UINode,
} from "./types";
import { createUIApi } from "./schema";

export type AppletEngineHost = {
  llm: AppletLlmHost;
  models?: AppletModelsHost;
  runs: AppletRunsHost;
  onStateSchema?(state: Record<string, unknown>, schema: UINode): void;
  search?(query: string, options?: { limit?: number; providerId?: string }): Promise<AppletSearchResult>;
  clipboard?: AppletClipboardHost;
  fs?: AppletFsHost;
  storage?: AppletStorageHost;
  dialog?: AppletDialogHost;
  shell?: AppletShellHost;
  toast?: AppletToastHost;
};

/**
 * 创建轻应用引擎：管理 state、执行 onAction、生成 schema。
 * 运行在子进程中，host 通过 IPC 与主进程通信。
 */
/** 按路径写 state，用于 streamText 时增量更新，path 如 "detailById.abc.md" */
export function setStateByPath(state: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  if (parts.length === 0) return;
  let current: Record<string, unknown> = state;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = current[key];
    if (next === undefined || typeof next !== "object" || next === null) {
      current[key] = {};
      current = current[key] as Record<string, unknown>;
    } else {
      current = next as Record<string, unknown>;
    }
  }
  current[parts[parts.length - 1]] = value;
}

export function createEngine(script: AppletScript, host: AppletEngineHost): {
  getState: () => Record<string, unknown>;
  setStateByPath: (path: string, value: unknown) => void;
  dispatch: (action: Action) => Promise<void>;
  getSchema: () => UINode;
} {
  const ui = createUIApi({
    listModels(options) {
      return host.models?.listSync?.(options) ?? [];
    },
  });
  let state: Record<string, unknown> = script.init();

  const dispatch = (action: Action) => {
    return runAction(action);
  };

  function buildCtx(): AppletCtx {
    const ctx: AppletCtx = {
      state,
      dispatch(a: Action) {
        return runAction(a) as Promise<void>;
      },
      llm: host.llm,
      models: {
        list(options) {
          return host.models?.list(options) ?? Promise.resolve([]);
        },
      } as AppletModelsApi,
      runs: host.runs,
      ui,
    };
    if (host.search) ctx.search = host.search;
    if (host.clipboard) ctx.clipboard = host.clipboard;
    if (host.fs) ctx.fs = host.fs;
    if (host.storage) ctx.storage = host.storage;
    if (host.dialog) ctx.dialog = host.dialog;
    if (host.shell) ctx.shell = host.shell;
    if (host.toast) ctx.toast = host.toast;
    return ctx;
  }

  async function runAction(action: Action): Promise<void> {
    const ctx = buildCtx();
    await Promise.resolve(script.onAction(ctx, action));
    const schema = script.render(ctx);
    host.onStateSchema?.(JSON.parse(JSON.stringify(state)), schema);
  }

  function getSchema(): UINode {
    return script.render(buildCtx());
  }

  return {
    getState: () => JSON.parse(JSON.stringify(state)),
    setStateByPath: (path: string, value: unknown) => setStateByPath(state, path, value),
    dispatch,
    getSchema,
  };
}
