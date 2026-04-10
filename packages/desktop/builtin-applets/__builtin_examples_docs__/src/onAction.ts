import { DEFAULT_DOC_ID, getDocById } from "./docs";
import {
  STREAM_KEY,
  asBool,
  asList,
  asModelId,
  asNumber,
  asRange,
  asString,
  normalizeSearchResult,
  stringifyValue,
  streamStatusText,
  type ExamplesDocsAction,
  type ExamplesDocsCtx,
} from "./utils";

function setStateField(ctx: ExamplesDocsCtx, key: unknown, value: unknown) {
  const normalizedKey = asString(key);
  if (!normalizedKey) return;
  (ctx.state as Record<string, unknown>)[normalizedKey] = value;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function showErrorToast(ctx: ExamplesDocsCtx, title: string, error: unknown) {
  const description = asErrorMessage(error);
  if (typeof ctx.toast === "function") {
    ctx.toast({
      title,
      description,
      icon: "circle-alert",
      color: "error",
    });
    return;
  }
  ctx.state.toastOutput = `${title}: ${description}`;
}

function requireModelId(ctx: ExamplesDocsCtx, modelValue: unknown, title: string): string | null {
  const model = asModelId(modelValue);
  if (!model) {
    showErrorToast(ctx, title, "Model is required. Use providerId::modelId.");
    return null;
  }
  if (!model.includes("::")) {
    showErrorToast(ctx, title, `Invalid model format: ${model}`);
    return null;
  }
  return model;
}

function parseStorageValue(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) return "";
  return JSON.parse(trimmed);
}

export async function onAction(ctx: ExamplesDocsCtx, action: ExamplesDocsAction) {
  if (action.type === "selectDoc") {
    const nextDocId = asString(action.docId);
    ctx.state.selectedDocId = getDocById(nextDocId) ? nextDocId : DEFAULT_DOC_ID;
    return;
  }

  if (action.type === "demoViewClick") {
    ctx.state.demoClickCount += 1;
    ctx.state.lastToastMessage = `View onClick fired ${String(ctx.state.demoClickCount)} times`;
    if (typeof ctx.toast === "function") {
      ctx.toast({
        title: "View clicked",
        description: ctx.state.lastToastMessage,
        icon: "layout-panel-top",
        color: "info",
      });
    }
    return;
  }

  if (action.type === "demoButtonClick") {
    ctx.state.buttonClickCount += 1;
    ctx.state.lastToastMessage = `Button onClick fired ${String(ctx.state.buttonClickCount)} times`;
    if (typeof ctx.toast === "function") {
      ctx.toast({
        title: "Button clicked",
        description: ctx.state.lastToastMessage,
        icon: "mouse-pointer-click",
        color: "success",
      });
    }
    return;
  }

  if (action.type === "demoSetField") {
    setStateField(ctx, action.key, action.value);
    return;
  }

  if (action.type === "demoSetValuesField") {
    setStateField(ctx, action.key, asList(action.values));
    return;
  }

  if (action.type === "demoSetRangeField") {
    setStateField(ctx, action.key, asRange(action.rangeValue));
    return;
  }

  if (action.type === "demoSetOpenField") {
    setStateField(ctx, action.key, asBool(action.open));
    return;
  }

  if (action.type === "demoProgressAdjust") {
    const next = asNumber(ctx.state.progressValue, 0) + asNumber(action.delta, 0);
    ctx.state.progressValue = Math.max(0, Math.min(100, next));
    return;
  }

  if (action.type === "demoDropdownSelect") {
    const label = asString(action.label);
    const value = asString(action.value);
    ctx.state.dropdownResult = value ? `Selected ${label} (${value})` : "";
    return;
  }

  if (action.type === "demoTableRowClick") {
    const row = action.row && typeof action.row === "object" ? (action.row as Record<string, unknown>) : {};
    ctx.state.tableLastRow = asString(row.name) ? `Selected row: ${asString(row.name)}` : "";
    return;
  }

  if (action.type === "demoTableSortChange") {
    ctx.state.tableSortKey = asString(action.key);
    ctx.state.tableSortDesc = asBool(action.desc);
    return;
  }

  if (action.type === "methodToastDemo") {
    const message = asString(action.message) || "Toast triggered from the docs applet";
    if (typeof ctx.toast === "function") {
      ctx.toast({
        title: "Toast demo",
        description: message,
        icon: "sparkles",
        color: "info",
      });
      ctx.state.toastOutput = "Toast triggered.";
    } else {
      ctx.state.toastOutput = "Toast API is unavailable in this environment.";
    }
    return;
  }

  if (action.type === "methodGenerateText") {
    try {
      const model = requireModelId(ctx, ctx.state.generateModel, "Generate failed");
      if (!model) return;
      const prompt = asString(ctx.state.generatePrompt).trim();
      if (!prompt) {
        showErrorToast(ctx, "Generate failed", "Prompt is required.");
        return;
      }
      ctx.state.generateOutput = "";
      const text = await ctx.llm.generateText({
        prompt,
        model,
        temperature: 0.3,
        maxOutputTokens: 600,
      });
      ctx.state.generateOutput = asString(text);
    } catch (error) {
      showErrorToast(ctx, "Generate failed", error);
    }
    return;
  }

  if (action.type === "methodRunStream") {
    const model = requireModelId(ctx, ctx.state.streamModel, "Stream failed");
    if (!model) return;
    const prompt = asString(ctx.state.streamPrompt).trim();
    if (!prompt) {
      showErrorToast(ctx, "Stream failed", "Prompt is required.");
      return;
    }
    ctx.state.streamOutput = "";
    ctx.state.streamRunning = true;
    ctx.state.streamStatus = streamStatusText(ctx);
    ctx.dispatch({ type: "methodRunStreamExec", prompt, model });
    return;
  }

  if (action.type === "methodRunStreamExec") {
    try {
      await ctx.llm.streamText({
        key: STREAM_KEY,
        statePath: "streamOutput",
        prompt: asString(action.prompt),
        model: asModelId(action.model),
        temperature: 0.4,
        maxOutputTokens: 800,
      });
    } catch (error) {
      showErrorToast(ctx, "Stream failed", error);
    } finally {
      ctx.state.streamRunning = false;
      ctx.state.streamStatus = streamStatusText(ctx);
    }
    return;
  }

  if (action.type === "methodStopStream") {
    ctx.runs.cancel(STREAM_KEY);
    ctx.state.streamRunning = false;
    ctx.state.streamStatus = streamStatusText(ctx);
    return;
  }

  if (action.type === "methodSearchRun") {
    ctx.state.searchLoading = true;
    ctx.state.searchOutput = "";
    ctx.dispatch({ type: "methodSearchRunExec", query: asString(ctx.state.searchQuery) });
    return;
  }

  if (action.type === "methodSearchRunExec") {
    try {
      const query = asString(action.query).trim();
      if (!query) {
        ctx.state.searchOutput = "Please enter a query first.";
        return;
      }
      if (typeof ctx.search !== "function") {
        ctx.state.searchOutput = "Search API is unavailable in this environment.";
        showErrorToast(ctx, "Search failed", "Search API is unavailable in this environment.");
        return;
      }
      const result = await ctx.search(query, { limit: 5 });
      ctx.state.searchOutput = normalizeSearchResult(result);
      if (!result || result.success !== true) {
        showErrorToast(ctx, "Search failed", result?.error ?? "Unknown error");
      }
    } catch (error) {
      showErrorToast(ctx, "Search failed", error);
    } finally {
      ctx.state.searchLoading = false;
    }
    return;
  }

  if (action.type === "methodCopyOutput") {
    try {
      if (!ctx.clipboard || typeof ctx.clipboard.write !== "function") {
        ctx.state.clipboardOutput = "Clipboard write API is unavailable.";
        return;
      }
      const content = asString(ctx.state.streamOutput) || asString(ctx.state.generateOutput);
      const copied = await ctx.clipboard.write(content);
      ctx.state.clipboardOutput = copied ? "Copied current output." : "Copy failed.";
    } catch (error) {
      ctx.state.clipboardOutput = asErrorMessage(error);
    }
    return;
  }

  if (action.type === "methodReadClipboard") {
    try {
      if (!ctx.clipboard || typeof ctx.clipboard.read !== "function") {
        ctx.state.clipboardOutput = "Clipboard read API is unavailable.";
        return;
      }
      const content = await ctx.clipboard.read();
      ctx.state.clipboardOutput = `Clipboard:\n${asString(content).slice(0, 400)}`;
    } catch (error) {
      ctx.state.clipboardOutput = asErrorMessage(error);
    }
    return;
  }

  if (action.type === "methodReadFs") {
    try {
      const fsApi = ctx.fs || {};
      if (typeof fsApi.readdir !== "function") {
        ctx.state.fsOutput = "fs.readdir API is unavailable.";
        return;
      }
      const files = await fsApi.readdir(".", { withFileTypes: false });
      const rows = Array.isArray(files) ? files.slice(0, 20).map((item: unknown) => String(item)) : [];
      ctx.state.fsOutput = rows.length > 0 ? rows.join("\n") : "Current directory is empty.";
    } catch (error) {
      ctx.state.fsOutput = asErrorMessage(error);
    }
    return;
  }

  if (action.type === "methodStorageSet") {
    try {
      if (!ctx.storage) {
        ctx.state.storageOutput = "Storage API is unavailable in this environment.";
        return;
      }
      const key = asString(ctx.state.storageKey).trim();
      if (!key) {
        ctx.state.storageOutput = "Storage key is required.";
        return;
      }
      const value = parseStorageValue(asString(ctx.state.storageValue));
      await ctx.storage.set(key, value as any);
      ctx.state.storageOutput = `Saved ${key}.\n\n${stringifyValue(value)}`;
    } catch (error) {
      ctx.state.storageOutput = asErrorMessage(error);
    }
    return;
  }

  if (action.type === "methodStorageGet") {
    try {
      if (!ctx.storage) {
        ctx.state.storageOutput = "Storage API is unavailable in this environment.";
        return;
      }
      const key = asString(ctx.state.storageKey).trim();
      if (!key) {
        ctx.state.storageOutput = "Storage key is required.";
        return;
      }
      const value = await ctx.storage.get(key);
      ctx.state.storageOutput = value === undefined ? `${key} is not set.` : stringifyValue(value);
    } catch (error) {
      ctx.state.storageOutput = asErrorMessage(error);
    }
    return;
  }

  if (action.type === "methodStorageRemove") {
    try {
      if (!ctx.storage) {
        ctx.state.storageOutput = "Storage API is unavailable in this environment.";
        return;
      }
      const key = asString(ctx.state.storageKey).trim();
      if (!key) {
        ctx.state.storageOutput = "Storage key is required.";
        return;
      }
      await ctx.storage.remove(key);
      ctx.state.storageOutput = `Removed ${key}.`;
    } catch (error) {
      ctx.state.storageOutput = asErrorMessage(error);
    }
    return;
  }

  if (action.type === "methodStorageClear") {
    try {
      if (!ctx.storage) {
        ctx.state.storageOutput = "Storage API is unavailable in this environment.";
        return;
      }
      await ctx.storage.clear();
      ctx.state.storageOutput = "Storage cleared.";
    } catch (error) {
      ctx.state.storageOutput = asErrorMessage(error);
    }
    return;
  }

  if (action.type === "methodStorageGetAll") {
    try {
      if (!ctx.storage) {
        ctx.state.storageOutput = "Storage API is unavailable in this environment.";
        return;
      }
      const values = await ctx.storage.getAll();
      ctx.state.storageOutput = stringifyValue(values) || "{}";
    } catch (error) {
      ctx.state.storageOutput = asErrorMessage(error);
    }
    return;
  }

  if (action.type === "methodDialogSelectFile") {
    try {
      if (!ctx.dialog) {
        ctx.state.dialogOutput = "Dialog API is unavailable in this environment.";
        return;
      }
      const result = await ctx.dialog.selectFile({
        title: "Select files",
        defaultPath: asString(ctx.state.dialogDefaultPath).trim() || undefined,
        multiSelections: true,
        filters: [{ name: "Text and Markdown", extensions: ["txt", "md", "markdown"] }],
      });
      ctx.state.dialogOutput = stringifyValue(result);
    } catch (error) {
      ctx.state.dialogOutput = asErrorMessage(error);
    }
    return;
  }

  if (action.type === "methodDialogSelectDirectory") {
    try {
      if (!ctx.dialog) {
        ctx.state.dialogOutput = "Dialog API is unavailable in this environment.";
        return;
      }
      const result = await ctx.dialog.selectDirectory({
        title: "Select directory",
        defaultPath: asString(ctx.state.dialogDefaultPath).trim() || undefined,
      });
      ctx.state.dialogOutput = stringifyValue(result);
    } catch (error) {
      ctx.state.dialogOutput = asErrorMessage(error);
    }
    return;
  }

  if (action.type === "methodDialogSaveFile") {
    try {
      if (!ctx.dialog) {
        ctx.state.dialogOutput = "Dialog API is unavailable in this environment.";
        return;
      }
      const result = await ctx.dialog.saveFile({
        title: "Save file",
        defaultPath: asString(ctx.state.dialogDefaultPath).trim() || undefined,
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      });
      ctx.state.dialogOutput = stringifyValue(result);
    } catch (error) {
      ctx.state.dialogOutput = asErrorMessage(error);
    }
    return;
  }

  if (action.type === "methodShellOpenExternal") {
    try {
      if (!ctx.shell) {
        ctx.state.shellOutput = "Shell API is unavailable in this environment.";
        return;
      }
      const url = asString(ctx.state.shellUrl).trim();
      if (!url) {
        ctx.state.shellOutput = "URL is required.";
        return;
      }
      const result = await ctx.shell.openExternal(url);
      ctx.state.shellOutput = stringifyValue(result);
    } catch (error) {
      ctx.state.shellOutput = asErrorMessage(error);
    }
    return;
  }

  if (action.type === "methodShellShowItemInFolder") {
    try {
      if (!ctx.shell) {
        ctx.state.shellOutput = "Shell API is unavailable in this environment.";
        return;
      }
      const targetPath = asString(ctx.state.shellPath).trim();
      if (!targetPath) {
        ctx.state.shellOutput = "Path is required.";
        return;
      }
      const result = await ctx.shell.showItemInFolder(targetPath);
      ctx.state.shellOutput = stringifyValue(result);
    } catch (error) {
      ctx.state.shellOutput = asErrorMessage(error);
    }
    return;
  }

  if (action.type === "methodShellOpenPath") {
    try {
      if (!ctx.shell) {
        ctx.state.shellOutput = "Shell API is unavailable in this environment.";
        return;
      }
      const targetPath = asString(ctx.state.shellPath).trim();
      if (!targetPath) {
        ctx.state.shellOutput = "Path is required.";
        return;
      }
      const result = await ctx.shell.openPath(targetPath);
      ctx.state.shellOutput = stringifyValue(result);
    } catch (error) {
      ctx.state.shellOutput = asErrorMessage(error);
    }
    return;
  }
}
