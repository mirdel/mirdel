<template>
  <div ref="containerRef" class="source-editor-root" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { useAppColorModeState } from "@/composables/useAppColorModeState";
import appletCoreTypesSource from "../../../../../applet-core/src/types.ts?raw";
import appletEditorTypesSource from "../../../../../applet-core/src/editor-applet.d.ts?raw";

type SourceLanguage = string;
type SourceEditorVariant = "default" | "markdown-writing";
type RelatedSourceFile = {
  path: string;
  content: string;
};

const props = withDefaults(defineProps<{
  modelValue: string;
  language?: SourceLanguage;
  modelPath?: string;
  relatedFiles?: RelatedSourceFile[];
  readOnly?: boolean;
  variant?: SourceEditorVariant;
}>(), {
  language: "markdown",
  modelPath: "",
  relatedFiles: () => [],
  readOnly: false,
  variant: "default",
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "open-file": [payload: { path: string; line: number; column: number }];
  "selection-change": [payload: {
    selectedText: string;
    nearbyContext?: string;
    selectionRange: {
      mode: "source";
      from: number;
      to: number;
    };
  } | null];
}>();

const containerRef = ref<HTMLElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
let model: monaco.editor.ITextModel | null = null;
let editorOpenerDisposable: monaco.IDisposable | null = null;
const auxiliaryModels = new Map<string, monaco.editor.ITextModel>();
const { isDark } = useAppColorModeState();

const MONACO_ENV_READY_KEY = "__AI_CLIENT_X_MONACO_ENV_READY__";
const MONACO_THEME_READY_KEY = "__AI_CLIENT_X_MONACO_THEME_READY__";
const MONACO_TYPES_VERSION_KEY = "__AI_CLIENT_X_MONACO_TYPES_VERSION__";
const MONACO_TYPES_DISPOSERS_KEY = "__AI_CLIENT_X_MONACO_TYPES_DISPOSERS__";
const globalWithMonaco = globalThis as typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: (_moduleId: string, label: string) => Worker;
  };
  [MONACO_ENV_READY_KEY]?: boolean;
  [MONACO_THEME_READY_KEY]?: boolean;
  [MONACO_TYPES_VERSION_KEY]?: string;
  [MONACO_TYPES_DISPOSERS_KEY]?: monaco.IDisposable[];
};
let modelSeq = 0;

const APPLET_MODULE_TYPES_URI = "file:///__applet__/types/applet-core-module.d.ts";
const APPLET_EDITOR_TYPES_URI = "file:///__applet__/types/editor-applet.d.ts";
const APPLET_MODULE_TYPES_SOURCE = `declare module "@mirdel/applet-core" {\n${appletCoreTypesSource}\n}`;
const APPLET_EDITOR_TYPES_SOURCE = appletEditorTypesSource;
const APPLET_TYPES_VERSION = `${APPLET_MODULE_TYPES_SOURCE.length}:${APPLET_EDITOR_TYPES_SOURCE.length}`;

function getNearbyContext(content: string, from: number, to: number, maxChars = 2600) {
  const safeFrom = Math.max(0, Math.min(from, content.length));
  const safeTo = Math.max(safeFrom, Math.min(to, content.length));
  const selectedLen = safeTo - safeFrom;
  const available = Math.max(0, maxChars - selectedLen);
  const side = Math.floor(available / 2);
  const start = Math.max(0, safeFrom - side);
  const end = Math.min(content.length, safeTo + side);
  return content.slice(start, end);
}

function emitSelectionChange() {
  if (!editor || !model) {
    emit("selection-change", null);
    return;
  }

  const selection = editor.getSelection();
  if (!selection || selection.isEmpty()) {
    emit("selection-change", null);
    return;
  }

  const from = model.getOffsetAt(selection.getStartPosition());
  const to = model.getOffsetAt(selection.getEndPosition());
  if (!Number.isInteger(from) || !Number.isInteger(to) || to <= from) {
    emit("selection-change", null);
    return;
  }

  const selectedText = model.getValueInRange(selection);
  if (!selectedText.trim()) {
    emit("selection-change", null);
    return;
  }

  const content = model.getValue();
  emit("selection-change", {
    selectedText,
    nearbyContext: getNearbyContext(content, from, to),
    selectionRange: {
      mode: "source",
      from,
      to,
    },
  });
}

function resolveLanguage(language: SourceLanguage): string {
  const normalized = String(language || "").trim().toLowerCase();
  if (!normalized) return "markdown";
  if (normalized === "js") return "javascript";
  if (normalized === "ts") return "typescript";
  if (normalized === "md") return "markdown";
  if (normalized === "yml") return "yaml";
  return normalized;
}

function normalizeModelPath(input: string): string {
  return String(input || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function resolveLanguageByPath(filePath: string): string {
  const normalized = normalizeModelPath(filePath).toLowerCase();
  const ext = normalized.includes(".") ? normalized.slice(normalized.lastIndexOf(".") + 1) : "";
  if (!ext) return "plaintext";
  if (ext === "ts" || ext === "tsx") return "typescript";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "javascript";
  if (ext === "json") return "json";
  if (ext === "css") return "css";
  if (ext === "scss") return "scss";
  if (ext === "less") return "less";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "md") return "markdown";
  if (ext === "yaml" || ext === "yml") return "yaml";
  return "plaintext";
}

function createModelUriByPath(filePath: string): monaco.Uri {
  return monaco.Uri.from({
    scheme: "inmemory",
    authority: "source",
    path: `/${normalizeModelPath(filePath)}`,
  });
}

function ensureMonacoEnvironment() {
  if (globalWithMonaco[MONACO_ENV_READY_KEY]) return;

  globalWithMonaco.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      if (label === "json") return new jsonWorker();
      if (label === "css" || label === "scss" || label === "less") return new cssWorker();
      if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
      if (label === "typescript" || label === "javascript") return new tsWorker();
      return new editorWorker();
    },
  };
  globalWithMonaco[MONACO_ENV_READY_KEY] = true;
}

function ensureMonacoThemes() {
  if (globalWithMonaco[MONACO_THEME_READY_KEY]) return;

  monaco.editor.defineTheme("mirdel-writer-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "markup.heading.markdown", foreground: "1f2937", fontStyle: "bold" },
      { token: "markup.bold.markdown", foreground: "1f2937", fontStyle: "bold" },
      { token: "markup.italic.markdown", foreground: "334155", fontStyle: "italic" },
      { token: "markup.inline.raw.markdown", foreground: "475569" },
      { token: "markup.raw.block.markdown", foreground: "475569" },
      { token: "string.link", foreground: "2563eb" },
      { token: "comment", foreground: "94a3b8" },
    ],
    colors: {
      "editor.background": "#FBFBFA",
      "editor.foreground": "#1F2937",
      "editor.lineHighlightBackground": "#F5F6F7",
      "editor.selectionBackground": "#DCEBFF",
      "editor.inactiveSelectionBackground": "#E7EEF8",
      "editorCursor.foreground": "#334155",
      "editorLineNumber.foreground": "#CBD5E1",
      "editorLineNumber.activeForeground": "#94A3B8",
    },
  });

  monaco.editor.defineTheme("mirdel-writer-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "markup.heading.markdown", foreground: "E5E7EB", fontStyle: "bold" },
      { token: "markup.bold.markdown", foreground: "E5E7EB", fontStyle: "bold" },
      { token: "markup.italic.markdown", foreground: "CBD5E1", fontStyle: "italic" },
      { token: "markup.inline.raw.markdown", foreground: "A3B0C2" },
      { token: "markup.raw.block.markdown", foreground: "A3B0C2" },
      { token: "string.link", foreground: "7AB4FF" },
      { token: "comment", foreground: "7A8699" },
    ],
    colors: {
      "editor.background": "#11151A",
      "editor.foreground": "#DDE3EA",
      "editor.lineHighlightBackground": "#1A2028",
      "editor.selectionBackground": "#1F3A5A",
      "editor.inactiveSelectionBackground": "#1B2735",
      "editorCursor.foreground": "#C7D2E0",
      "editorLineNumber.foreground": "#516072",
      "editorLineNumber.activeForeground": "#8B99AB",
    },
  });

  monaco.editor.defineTheme("mirdel-github-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6E7781" },
      { token: "keyword", foreground: "CF222E" },
      { token: "string", foreground: "0A3069" },
      { token: "number", foreground: "0550AE" },
      { token: "type", foreground: "953800" },
      { token: "function", foreground: "8250DF" },
    ],
    colors: {
      "editor.background": "#FFFFFF",
      "editor.foreground": "#1F2328",
      "editor.lineHighlightBackground": "#F6F8FA",
      "editor.selectionBackground": "#ADD6FF66",
      "editor.inactiveSelectionBackground": "#D8DEE466",
      "editorCursor.foreground": "#1F2328",
      "editorLineNumber.foreground": "#6E7781",
      "editorLineNumber.activeForeground": "#1F2328",
      "editorIndentGuide.background1": "#D0D7DE",
      "editorIndentGuide.activeBackground1": "#8C959F",
    },
  });

  monaco.editor.defineTheme("mirdel-github-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8B949E" },
      { token: "keyword", foreground: "FF7B72" },
      { token: "string", foreground: "A5D6FF" },
      { token: "number", foreground: "79C0FF" },
      { token: "type", foreground: "FFA657" },
      { token: "function", foreground: "D2A8FF" },
    ],
    colors: {
      "editor.background": "#0D1117",
      "editor.foreground": "#E6EDF3",
      "editor.lineHighlightBackground": "#161B22",
      "editor.selectionBackground": "#264F78",
      "editor.inactiveSelectionBackground": "#1F2937",
      "editorCursor.foreground": "#E6EDF3",
      "editorLineNumber.foreground": "#7D8590",
      "editorLineNumber.activeForeground": "#E6EDF3",
      "editorIndentGuide.background1": "#30363D",
      "editorIndentGuide.activeBackground1": "#8B949E",
    },
  });

  globalWithMonaco[MONACO_THEME_READY_KEY] = true;
}

function ensureMonacoTypeSystem() {
  const tsDefaults = monaco.languages.typescript.typescriptDefaults;
  const jsDefaults = monaco.languages.typescript.javascriptDefaults;
  const compilerOptions: monaco.languages.typescript.CompilerOptions = {
    allowNonTsExtensions: true,
    allowJs: true,
    checkJs: false,
    strict: false,
    target: monaco.languages.typescript.ScriptTarget.ES2022,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    jsx: monaco.languages.typescript.JsxEmit.Preserve,
    noEmit: true,
    resolveJsonModule: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    isolatedModules: true,
    skipLibCheck: true,
    lib: ["es2022", "dom", "dom.iterable"],
  };

  tsDefaults.setCompilerOptions(compilerOptions);
  jsDefaults.setCompilerOptions(compilerOptions);
  tsDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
  jsDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
  tsDefaults.setEagerModelSync(true);
  jsDefaults.setEagerModelSync(true);

  if (globalWithMonaco[MONACO_TYPES_VERSION_KEY] === APPLET_TYPES_VERSION) return;

  for (const disposer of globalWithMonaco[MONACO_TYPES_DISPOSERS_KEY] ?? []) {
    disposer.dispose();
  }

  globalWithMonaco[MONACO_TYPES_DISPOSERS_KEY] = [
    tsDefaults.addExtraLib(APPLET_MODULE_TYPES_SOURCE, APPLET_MODULE_TYPES_URI),
    jsDefaults.addExtraLib(APPLET_MODULE_TYPES_SOURCE, APPLET_MODULE_TYPES_URI),
    tsDefaults.addExtraLib(APPLET_EDITOR_TYPES_SOURCE, APPLET_EDITOR_TYPES_URI),
    jsDefaults.addExtraLib(APPLET_EDITOR_TYPES_SOURCE, APPLET_EDITOR_TYPES_URI),
  ];
  globalWithMonaco[MONACO_TYPES_VERSION_KEY] = APPLET_TYPES_VERSION;
}

function isWritingStyleMarkdown() {
  return props.variant === "markdown-writing" && resolveLanguage(props.language) === "markdown";
}

function resolveThemeName() {
  return isDark.value ? "mirdel-github-dark" : "mirdel-github-light";
}

function getEditorOptions() {
  const writingMode = isWritingStyleMarkdown();
  return {
    automaticLayout: true,
    readOnly: props.readOnly,
    minimap: { enabled: false },
    wordWrap: "on" as const,
    scrollBeyondLastLine: false,
    tabSize: 2,
    lineNumbers: (writingMode ? "off" : "on") as const,
    glyphMargin: !writingMode,
    folding: !writingMode,
    lineNumbersMinChars: writingMode ? 0 : 3,
    lineDecorationsWidth: writingMode ? 8 : 10,
    fontSize: writingMode ? 16 : 14,
    lineHeight: writingMode ? 28 : 22,
    padding: writingMode ? { top: 16, bottom: 20 } : { top: 10, bottom: 12 },
    smoothScrolling: true,
    bracketPairColorization: { enabled: !writingMode },
    guides: { bracketPairs: !writingMode, indentation: !writingMode },
    renderLineHighlight: writingMode ? ("line" as const) : ("all" as const),
    definitionLinkOpensInPeek: false,
    theme: resolveThemeName(),
  };
}

function guessFileExtension(language: string): string {
  if (language === "typescript") return "ts";
  if (language === "javascript") return "js";
  if (language === "json") return "json";
  if (language === "css" || language === "scss" || language === "less") return "css";
  if (language === "html") return "html";
  if (language === "markdown") return "md";
  if (language === "yaml") return "yml";
  return "txt";
}

function resolveModelUri(language: string): monaco.Uri {
  const normalizedPath = normalizeModelPath(props.modelPath || "");
  if (normalizedPath) {
    return createModelUriByPath(normalizedPath);
  }
  modelSeq += 1;
  return monaco.Uri.from({
    scheme: "inmemory",
    authority: "source",
    path: `/untitled-${modelSeq}.${guessFileExtension(language)}`,
  });
}

function createTextModel(value: string): monaco.editor.ITextModel {
  const language = resolveLanguage(props.language);
  return monaco.editor.createModel(value, language, resolveModelUri(language));
}

function isModelDisposed(modelRow: monaco.editor.ITextModel): boolean {
  try {
    modelRow.getVersionId();
    return false;
  } catch {
    return true;
  }
}

function syncAuxiliaryModels() {
  for (const [path, modelRow] of auxiliaryModels) {
    if (!isModelDisposed(modelRow)) continue;
    auxiliaryModels.delete(path);
  }

  const currentPath = normalizeModelPath(props.modelPath || "");
  const nextPaths = new Set<string>();

  for (const row of props.relatedFiles ?? []) {
    const path = normalizeModelPath(row.path);
    if (!path) continue;
    if (path === currentPath) continue;
    nextPaths.add(path);
    const uri = createModelUriByPath(path);
    const language = resolveLanguageByPath(path);
    let existing = auxiliaryModels.get(path) ?? monaco.editor.getModel(uri) ?? null;
    if (existing && isModelDisposed(existing)) {
      auxiliaryModels.delete(path);
      existing = null;
    }
    if (existing) {
      if (existing.getValue() !== row.content) {
        existing.setValue(row.content ?? "");
      }
      monaco.editor.setModelLanguage(existing, language);
      auxiliaryModels.set(path, existing);
      continue;
    }
    const created = monaco.editor.createModel(row.content ?? "", language, uri);
    auxiliaryModels.set(path, created);
  }

  for (const [path, modelRow] of auxiliaryModels) {
    if (nextPaths.has(path)) continue;
    if (!isModelDisposed(modelRow)) {
      modelRow.dispose();
    }
    auxiliaryModels.delete(path);
  }
}

function recreateModelFromCurrentValue() {
  if (!editor || !model) return;
  const language = resolveLanguage(props.language);
  const nextUri = resolveModelUri(language);
  const prevModel = model;
  const nextPath = normalizeModelPath(props.modelPath || "");
  const nextValue = props.modelValue ?? "";
  const prevPath = normalizeModelPath(prevModel.uri.path);
  const shouldKeepPrevAsAux = !!prevPath && prevPath !== nextPath && (props.relatedFiles ?? []).some(
    (row) => normalizeModelPath(row.path) === prevPath
  );
  const found = monaco.editor.getModel(nextUri);
  const existing = found && !isModelDisposed(found) ? found : null;
  let nextModel: monaco.editor.ITextModel;

  if (existing && existing !== prevModel) {
    if (nextPath) {
      auxiliaryModels.delete(nextPath);
    }
    nextModel = existing;
    if (nextModel.getValue() !== nextValue) {
      nextModel.setValue(nextValue);
    }
    monaco.editor.setModelLanguage(nextModel, language);
  } else {
    nextModel = monaco.editor.createModel(nextValue, language, nextUri);
  }

  model = nextModel;
  editor.setModel(nextModel);
  if (prevModel !== nextModel) {
    if (shouldKeepPrevAsAux && !isModelDisposed(prevModel)) {
      auxiliaryModels.set(prevPath, prevModel);
    } else if (!isModelDisposed(prevModel)) {
      prevModel.dispose();
      auxiliaryModels.delete(prevPath);
    }
  }
  editor.updateOptions(getEditorOptions());
  emitSelectionChange();
}

function resolveLineAndColumn(
  selectionOrPosition?: monaco.IRange | monaco.IPosition
): { line: number; column: number } {
  if (!selectionOrPosition) return { line: 1, column: 1 };
  if ("startLineNumber" in selectionOrPosition) {
    return {
      line: selectionOrPosition.startLineNumber || 1,
      column: selectionOrPosition.startColumn || 1,
    };
  }
  return {
    line: selectionOrPosition.lineNumber || 1,
    column: selectionOrPosition.column || 1,
  };
}

function handleOpenCodeEditor(resource: monaco.Uri, selectionOrPosition?: monaco.IRange | monaco.IPosition): boolean {
  if (resource.scheme !== "inmemory" || resource.authority !== "source") return false;
  const targetPath = normalizeModelPath(resource.path);
  if (!targetPath) return false;
  const currentPath = normalizeModelPath(props.modelPath || "");
  if (targetPath === currentPath) return false;
  const { line, column } = resolveLineAndColumn(selectionOrPosition);
  emit("open-file", { path: targetPath, line, column });
  return true;
}

function createEditor() {
  if (!containerRef.value) return;
  ensureMonacoEnvironment();
  ensureMonacoThemes();
  ensureMonacoTypeSystem();
  syncAuxiliaryModels();

  model = createTextModel(props.modelValue ?? "");

  editor = monaco.editor.create(containerRef.value, {
    model,
    ...getEditorOptions(),
  });

  editorOpenerDisposable?.dispose();
  editorOpenerDisposable = monaco.editor.registerEditorOpener({
    openCodeEditor(source, resource, selectionOrPosition) {
      if (!editor) return false;
      if (source !== editor) return false;
      return handleOpenCodeEditor(resource, selectionOrPosition);
    },
  });

  editor.onDidChangeModelContent(() => {
    if (!editor) return;
    const activeModel = editor.getModel();
    if (!activeModel) return;
    const activePath = normalizeModelPath(activeModel.uri.path);
    const currentPath = normalizeModelPath(props.modelPath || "");
    if (activePath !== currentPath) return;
    const value = editor.getValue();
    if (value === props.modelValue) return;
    emit("update:modelValue", value);
    emitSelectionChange();
  });

  editor.onDidChangeCursorSelection((e) => {
    if (e.reason === monaco.editor.CursorChangeReason.ContentFlush) return;
    emitSelectionChange();
  });
}

onMounted(() => {
  createEditor();
});

watch(
  () => props.modelValue,
  (nextValue) => {
    if (!editor) return;
    const current = editor.getValue();
    if (current === nextValue) return;
    editor.setValue(nextValue ?? "");
  }
);

watch(
  () => props.language,
  (nextLanguage) => {
    if (!model) return;
    monaco.editor.setModelLanguage(model, resolveLanguage(nextLanguage));
    editor?.updateOptions(getEditorOptions());
  }
);

watch(
  () => props.modelPath,
  (nextPath, prevPath) => {
    if (!editor || !model) return;
    if ((nextPath || "") === (prevPath || "")) return;
    recreateModelFromCurrentValue();
    syncAuxiliaryModels();
  }
);

watch(
  () => props.relatedFiles,
  () => {
    if (!editor) return;
    syncAuxiliaryModels();
  },
  { deep: true }
);

watch(
  () => props.readOnly,
  (readOnly) => {
    editor?.updateOptions({ readOnly });
  }
);

watch(
  () => props.variant,
  () => {
    editor?.updateOptions(getEditorOptions());
  }
);

watch(
  isDark,
  () => {
    editor?.updateOptions({ theme: resolveThemeName() });
  }
);

function applyEdits(edits: Array<{ from: number; to: number; text: string }>) {
  if (!editor) return false;
  const activeModel = editor.getModel();
  if (!activeModel) return false;
  const monacoEdits = edits.map((edit) => {
    const startPos = activeModel.getPositionAt(edit.from);
    const endPos = activeModel.getPositionAt(edit.to);
    return {
      range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
      text: edit.text,
    };
  });
  editor.executeEdits("ai-apply", monacoEdits);
  return true;
}

function revealPosition(line: number, column = 1) {
  if (!editor) return;
  const activeModel = editor.getModel();
  if (!activeModel) return;
  const safeLine = Math.max(1, Math.min(activeModel.getLineCount(), Math.floor(line) || 1));
  const maxColumn = activeModel.getLineMaxColumn(safeLine);
  const safeColumn = Math.max(1, Math.min(maxColumn, Math.floor(column) || 1));
  editor.setPosition({ lineNumber: safeLine, column: safeColumn });
  editor.revealPositionInCenterIfOutsideViewport({ lineNumber: safeLine, column: safeColumn });
  editor.focus();
}

defineExpose({ applyEdits, revealPosition });

onBeforeUnmount(() => {
  editorOpenerDisposable?.dispose();
  editorOpenerDisposable = null;
  editor?.dispose();
  editor = null;
  model?.dispose();
  model = null;
  for (const modelRow of auxiliaryModels.values()) modelRow.dispose();
  auxiliaryModels.clear();
});
</script>

<style scoped>
.source-editor-root {
  width: 100%;
  height: 100%;
}
</style>
