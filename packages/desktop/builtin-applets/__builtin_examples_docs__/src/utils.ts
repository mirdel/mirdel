import type { ActionOf, AppletCtx } from "@mirdel/applet-core";
import { DEFAULT_DOC_ID, DOC_GROUPS, getDocById } from "./docs";

export const STREAM_KEY = "examples-docs-stream";

export type ExamplesDocsAction = ActionOf<{
  selectDoc: { docId: string };
  demoViewClick: undefined;
  demoButtonClick: undefined;
  demoSetField: { key: string; value?: unknown };
  demoSetValuesField: { key: string; values?: unknown };
  demoSetRangeField: { key: string; rangeValue?: unknown };
  demoSetOpenField: { key: string; open?: unknown };
  demoProgressAdjust: { delta: number };
  demoDropdownSelect: { label?: unknown; value?: unknown };
  demoTableRowClick: { row?: unknown };
  demoTableSortChange: { key?: unknown; desc?: unknown };
  methodGenerateText: undefined;
  methodRunStream: undefined;
  methodRunStreamExec: { prompt?: unknown; model?: unknown };
  methodStopStream: undefined;
  methodSearchRun: undefined;
  methodSearchRunExec: { query?: unknown };
  methodCopyOutput: undefined;
  methodReadClipboard: undefined;
  methodReadFs: undefined;
  methodToastDemo: { message?: unknown };
  methodStorageSet: undefined;
  methodStorageGet: undefined;
  methodStorageRemove: undefined;
  methodStorageClear: undefined;
  methodStorageGetAll: undefined;
  methodDialogSelectFile: undefined;
  methodDialogSelectDirectory: undefined;
  methodDialogSaveFile: undefined;
  methodShellOpenExternal: undefined;
  methodShellShowItemInFolder: undefined;
  methodShellOpenPath: undefined;
}>;

export function createInitialState() {
  return {
    selectedDocId: DEFAULT_DOC_ID,
    demoClickCount: 0,
    buttonClickCount: 0,
    lastToastMessage: "",
    inputValue: "Quarterly planning",
    textareaValue: "This release focuses on component documentation, interaction polish, and clearer API examples.",
    switchValue: true,
    checkboxValue: true,
    radioValue: "team",
    selectValue: "design",
    selectValues: ["docs", "priority"],
    modelValue: "",
    tabsValue: "overview",
    accordionValues: ["setup"],
    progressValue: 62,
    popoverOpen: false,
    modalOpen: false,
    dropdownResult: "",
    calendarValue: "2026-04-08",
    calendarRange: { start: "2026-04-05", end: "2026-04-10" },
    dateValue: "2026-04-08",
    dateRange: { start: "2026-04-06", end: "2026-04-09" },
    timeValue: "09:30",
    timeRange: { start: "09:00", end: "17:30" },
    tableSortKey: "updatedAt",
    tableSortDesc: true,
    tableLastRow: "",
    generateModel: "",
    generatePrompt: "",
    generateOutput: "",
    streamModel: "",
    streamPrompt: "",
    streamOutput: "",
    streamRunning: false,
    streamStatus: "idle",
    searchQuery: "",
    searchOutput: "",
    searchLoading: false,
    clipboardOutput: "",
    fsOutput: "",
    toastOutput: "",
    storageKey: "demo",
    storageValue: '{\n  "theme": "compact",\n  "pinned": true\n}',
    storageOutput: "",
    dialogDefaultPath: "",
    dialogOutput: "",
    shellUrl: "https://example.com",
    shellPath: "",
    shellOutput: "",
  };
}

export type ExamplesDocsState = ReturnType<typeof createInitialState>;
export type ExamplesDocsCtx = AppletCtx<ExamplesDocsState, ExamplesDocsAction>;

export const DOCS_SIDEBAR_GROUPS = DOC_GROUPS;

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asBool(value: unknown): boolean {
  return value === true;
}

export function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

export function asNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function asRange(value: unknown): { start?: string; end?: string } {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    start: typeof row.start === "string" ? row.start : undefined,
    end: typeof row.end === "string" ? row.end : undefined,
  };
}

export function asModelId(value: unknown): string {
  return asString(value).trim();
}

export function streamStatusText(ctx: ExamplesDocsCtx): string {
  return ctx.runs.status(STREAM_KEY);
}

export function normalizeSearchResult(result: any): string {
  if (!result || !result.success) {
    return `Search failed: ${asString(result?.error ?? "Unknown error")}`;
  }
  if (!Array.isArray(result.results) || result.results.length === 0) {
    return "Search completed with no results.";
  }

  return result.results
    .slice(0, 5)
    .map((item: any, index: number) => {
      const title = asString(item.title) || "Untitled";
      const url = asString(item.url);
      return `${index + 1}. ${title}\n${url}`;
    })
    .join("\n\n");
}

export function stringifyValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function getSelectedDoc(docId: unknown) {
  const normalized = asString(docId);
  return getDocById(normalized) ?? getDocById(DEFAULT_DOC_ID)!;
}
