<template>
  <UEditor
    ref="uEditorRef"
    v-slot="{ editor, handlers }"
    :model-value="modelValue"
    :content-type="contentType"
    :placeholder="placeholder"
    :autofocus="autofocus"
    :starter-kit="starterKitOptions"
    :extensions="editorExtensions"
    :handlers="editorHandlers"
    :ui="resolvedUi"
    class="w-full flex-1 min-h-0"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <UEditorToolbar
      v-if="showToolbar"
      :editor="editor"
      :items="resolvedToolbarItems"
      :layout="toolbarLayout"
      :should-show="toolbarShouldShow"
      active-color="neutral"
      :class="toolbarClass"
    >
      <slot
        name="toolbar"
        :editor="editor"
      />
      <template #link>
        <slot name="link" :editor="editor">
          <EditorLinkPopover :editor="editor" auto-open />
        </slot>
      </template>
    </UEditorToolbar>

    <UEditorToolbar
      v-if="showImageToolbar"
      :editor="editor"
      :items="imageToolbarItems(editor)"
      layout="bubble"
      :should-show="({ editor, view }) => !!getSelectedImage(editor, { allowAnchorFallback: false }) && view.hasFocus()"
    />
    <UEditorToolbar
      v-if="showTableToolbar"
      :editor="editor"
      :items="tableToolbarItems(editor)"
      layout="bubble"
      active-color="neutral"
      :should-show="({ editor, view }) => editor.isActive('table') && view.hasFocus()"
    />
    <UEditorToolbar
      v-if="showSelectionAiToolbar"
      :editor="editor"
      :items="selectionAiToolbarItems(editor)"
      layout="bubble"
      :should-show="({ editor, view }) => shouldShowSelectionAiToolbar(editor) && view.hasFocus()"
    />

    <UEditorDragHandle
      v-if="showDragHandle"
      v-slot="{ ui: dragHandleUi, onClick }"
      :editor="editor"
      :ui="{ root: '!flex items-center justify-center transition-all duration-200 ease-out', handle: 'cursor-grab px-1 z-10' }"
      @node-change="selectedNode = $event"
    >
      <UButton
        icon="i-lucide-plus"
        color="neutral"
        variant="ghost"
        size="sm"
        :class="dragHandleUi.handle()"
        @click="(e) => {
          e.stopPropagation();
          const selected = onClick();
          handlers.suggestion?.execute(editor, { pos: selected?.pos }).run();
        }"
      />

      <UDropdownMenu
        v-slot="{ open }"
        :modal="false"
        size="md"
        :items="dragHandleMenuItems(editor)"
        :content="{ side: 'left' }"
        :ui="{ content: 'w-48', label: 'text-xs' }"
        @update:open="editor.chain().setMeta('lockDragHandle', $event).run()"
      >
        <UButton
          color="neutral"
          variant="ghost"
          active-variant="soft"
          size="sm"
          icon="i-lucide-grip-vertical"
          :active="open"
          :class="dragHandleUi.handle()"
          @click="onClick"
        />
      </UDropdownMenu>
    </UEditorDragHandle>

    <UEditorSuggestionMenu
      v-if="showDragHandle"
      :editor="editor"
      size="md"
      :items="suggestionItems"
    />
  </UEditor>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mapEditorItems } from "@nuxt/ui/utils/editor";
import type { Editor } from "@tiptap/vue-3";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table/kit";
import { common, createLowlight } from "lowlight";
import type { EditorImageUploader } from "./EditorImageUploadExtension";
import { ImageUpload } from "./EditorImageUploadExtension";
import EditorLinkPopover from "./EditorLinkPopover.vue";

type SelectionAiAction = "polish" | "expand" | "shorten" | "custom";
type SelectionReplaceInput = {
  from: number;
  to: number;
  expectedText: string;
  replacement: string;
};

const props = withDefaults(
  defineProps<{
    modelValue: string;
    contentType?: string;
    placeholder?: string;
    autofocus?: boolean | "start" | "end";
    showToolbar?: boolean;
    toolbarItems?: any[][];
    toolbarLayout?: "bubble" | "floating";
    toolbarShouldShow?: ((args: any) => boolean) | undefined;
    toolbarClass?: string;
    showImageToolbar?: boolean;
    showTableToolbar?: boolean;
    showSelectionAiToolbar?: boolean;
    showDragHandle?: boolean;
    imageUpload?: EditorImageUploader;
    ui?: Record<string, any>;
  }>(),
  {
    contentType: "markdown",
    placeholder: "",
    autofocus: false,
    showToolbar: true,
    showImageToolbar: true,
    showTableToolbar: true,
    showSelectionAiToolbar: false,
    showDragHandle: true,
    toolbarItems: undefined,
    toolbarLayout: undefined,
    toolbarClass: "border-b border-default p-2 overflow-x-auto shrink-0",
    ui: () => ({
      root: "flex-1 min-h-0 flex flex-col overflow-hidden",
      content: "flex-1 min-h-0 overflow-y-auto",
      base: "p-4 sm:p-4",
    }),
  }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "selection-ai-action": [payload: {
    action: SelectionAiAction;
    selectedText: string;
    nearbyContext?: string;
    selectionRange: {
      mode: "visual";
      from: number;
      to: number;
    };
  }];
}>();
const { t } = useI18n();

const starterKitOptions = {
  codeBlock: false,
  horizontalRule: true,
  link: {
    openOnClick: false,
  },
};

const lowlight = createLowlight(common);

const CODE_LANGUAGE_OPTIONS = computed(() => [
  { value: "", label: t("editor.codeLanguage.auto") },
  { value: "plaintext", label: "Plain Text" },
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "json", label: "JSON" },
  { value: "bash", label: "Bash" },
  { value: "python", label: "Python" },
  { value: "sql", label: "SQL" },
  { value: "xml", label: "HTML/XML" },
  { value: "css", label: "CSS" },
  { value: "yaml", label: "YAML" },
  { value: "markdown", label: "Markdown" },
]);

const SELECTION_AI_ACTIONS = computed<Array<{ value: SelectionAiAction; label: string; icon: string }>>(() => [
  { value: "polish", label: t("editor.aiAction.polish"), icon: "i-lucide-pencil-line" },
  { value: "expand", label: t("editor.aiAction.expand"), icon: "i-lucide-unfold-vertical" },
  { value: "shorten", label: t("editor.aiAction.shorten"), icon: "i-lucide-fold-vertical" },
  { value: "custom", label: t("editor.aiAction.custom"), icon: "i-lucide-wand-sparkles" },
]);

const defaultToolbarItems = computed(() => [
  [
    { kind: "undo", icon: "i-lucide-undo", tooltip: { text: t("editor.toolbar.undo"), kbds: ["meta", "z"] } },
    { kind: "redo", icon: "i-lucide-redo", tooltip: { text: t("editor.toolbar.redo"), kbds: ["meta", "shift", "z"] } },
  ],
  [
    {
      icon: "i-lucide-heading",
      tooltip: { text: t("editor.toolbar.heading") },
      content: { align: "start" },
      items: [
        { kind: "heading", level: 1, icon: "i-lucide-heading-1", label: t("editor.toolbar.heading1") },
        { kind: "heading", level: 2, icon: "i-lucide-heading-2", label: t("editor.toolbar.heading2") },
        { kind: "heading", level: 3, icon: "i-lucide-heading-3", label: t("editor.toolbar.heading3") },
        { kind: "heading", level: 4, icon: "i-lucide-heading-4", label: t("editor.toolbar.heading4") },
        { kind: "heading", level: 5, icon: "i-lucide-heading-5", label: t("editor.toolbar.heading5") },
        { kind: "heading", level: 6, icon: "i-lucide-heading-6", label: t("editor.toolbar.heading6") },
      ],
    },
    { kind: "paragraph", icon: "i-lucide-type", tooltip: { text: t("editor.toolbar.paragraph") } },
    { kind: "bulletList", icon: "i-lucide-list", tooltip: { text: t("editor.toolbar.bulletList"), kbds: ["meta", "shift", "8"] } },
    { kind: "orderedList", icon: "i-lucide-list-ordered", tooltip: { text: t("editor.toolbar.orderedList"), kbds: ["meta", "shift", "7"] } },
    { kind: "taskList", icon: "i-lucide-list-checks", tooltip: { text: t("editor.toolbar.taskList"), kbds: ["meta", "shift", "9"] } },
    { kind: "blockquote", icon: "i-lucide-quote", tooltip: { text: t("editor.toolbar.blockquote"), kbds: ["meta", "shift", "b"] } },
    
  ],
  [
    { kind: "mark", mark: "bold", icon: "i-lucide-bold", tooltip: { text: t("editor.toolbar.bold"), kbds: ["meta", "b"] } },
    { kind: "mark", mark: "italic", icon: "i-lucide-italic", tooltip: { text: t("editor.toolbar.italic"), kbds: ["meta", "i"] } },
    { kind: "mark", mark: "underline", icon: "i-lucide-underline", tooltip: { text: t("editor.toolbar.underline"), kbds: ["meta", "u"] } },
    { kind: "mark", mark: "strike", icon: "i-lucide-strikethrough", tooltip: { text: t("editor.toolbar.strike"), kbds: ["meta", "shift", "s"] } },
    { kind: "mark", mark: "code", icon: "i-lucide-code", tooltip: { text: t("editor.toolbar.inlineCode"), kbds: ["meta", "e"] } },
  ],
  [
    { kind: "codeBlock", icon: "i-lucide-square-code", tooltip: { text: t("editor.toolbar.codeBlock"), kbds: ["meta", "alt", "c"] } },
    {
      icon: "i-lucide-table-2",
      tooltip: { text: t("editor.toolbar.table") },
      content: { align: "start" },
      ui: { label: "text-xs" },
      items: [
        {
          kind: "insertTable",
          label: t("editor.toolbar.insertTable"),
          icon: "i-lucide-table-2",
        },
        {
          type: "label",
          label: t("editor.toolbar.row"),
        },
        {
          kind: "addRowBefore",
          label: t("editor.toolbar.addRowBefore"),
          icon: "i-lucide-arrow-up",
        },
        {
          kind: "addRowAfter",
          label: t("editor.toolbar.addRowAfter"),
          icon: "i-lucide-arrow-down",
        },
        {
          kind: "deleteRow",
          label: t("editor.toolbar.deleteRow"),
          icon: "i-lucide-rows-3",
        },
        {
          kind: "toggleHeaderRow",
          label: t("editor.toolbar.toggleHeaderRow"),
          icon: "i-lucide-heading",
        },
        {
          type: "label",
          label: t("editor.toolbar.column"),
        },
        {
          kind: "addColumnBefore",
          label: t("editor.toolbar.addColumnBefore"),
          icon: "i-lucide-arrow-left",
        },
        {
          kind: "addColumnAfter",
          label: t("editor.toolbar.addColumnAfter"),
          icon: "i-lucide-arrow-right",
        },
        {
          kind: "deleteColumn",
          label: t("editor.toolbar.deleteColumn"),
          icon: "i-lucide-columns-3",
        },
        {
          kind: "deleteTable",
          label: t("editor.toolbar.deleteTable"),
          icon: "i-lucide-trash",
          color: "error",
        },
      ],
    },
    { kind: "horizontalRule", icon: "i-lucide-separator-horizontal", tooltip: { text: t("editor.toolbar.horizontalRule") } },
    { slot: "link" },
    { kind: "imageUpload", icon: "i-lucide-image", tooltip: { text: t("editor.toolbar.image") } },
  ],
  [
    { kind: "clearFormatting", icon: "i-lucide-eraser", tooltip: { text: t("editor.toolbar.clearFormatting") } },
  ]
]);

const resolvedToolbarItems = computed(() => props.toolbarItems || defaultToolbarItems.value);
const uEditorRef = ref<{ editor?: Editor } | null>(null);
const selectedNode = ref<{ node: Record<string, any>; pos: number }>();
const resolvedUi = computed(() => {
  const input = (props.ui || {}) as Record<string, string | undefined>;
  const base = input.base || "p-4 sm:p-4";

  if (!props.showDragHandle) {
    return input;
  }

  return {
    ...input,
    base: `${base} pl-10 sm:pl-12`,
  };
});

const suggestionItems = computed(() => [[{
  type: "label",
  label: t("editor.suggestion.style"),
}, {
  kind: "paragraph",
  label: t("editor.toolbar.paragraph"),
  icon: "i-lucide-type",
}, {
  kind: "heading",
  level: 1,
  label: t("editor.toolbar.heading1"),
  icon: "i-lucide-heading-1",
}, {
  kind: "heading",
  level: 2,
  label: t("editor.toolbar.heading2"),
  icon: "i-lucide-heading-2",
}, {
  kind: "heading",
  level: 3,
  label: t("editor.toolbar.heading3"),
  icon: "i-lucide-heading-3",
}, {
  kind: "bulletList",
  label: t("editor.toolbar.bulletList"),
  icon: "i-lucide-list",
}, {
  kind: "orderedList",
  label: t("editor.toolbar.orderedList"),
  icon: "i-lucide-list-ordered",
}, {
  kind: "taskList",
  label: t("editor.toolbar.taskList"),
  icon: "i-lucide-list-checks",
}, {
  kind: "blockquote",
  label: t("editor.toolbar.blockquote"),
  icon: "i-lucide-quote",
}, {
  kind: "codeBlock",
  label: t("editor.toolbar.codeBlock"),
  icon: "i-lucide-square-code",
}], [{
  type: "label",
  label: t("editor.suggestion.insert"),
}, {
  kind: "imageUpload",
  label: t("editor.toolbar.image"),
  icon: "i-lucide-image",
}, {
  kind: "horizontalRule",
  label: t("editor.toolbar.horizontalRule"),
  icon: "i-lucide-separator-horizontal",
}, {
  kind: "insertTable",
  label: t("editor.toolbar.table"),
  icon: "i-lucide-table-2",
}]]);

let lastSelectedImagePos: number | null = null;

function getImageNodeAt(editor: Editor, pos: number) {
  if (pos < 0) return null;
  const node = editor.state.doc.nodeAt(pos);
  if (node?.type?.name !== "image") return null;
  return { node, pos };
}

function getSelectedImage(editor: Editor, options: { allowAnchorFallback?: boolean } = {}) {
  const { state } = editor;
  const selection = state.selection as any;
  const selectedNode = selection?.node;
  if (selectedNode?.type?.name === "image") {
    const selected = { node: selectedNode, pos: state.selection.from };
    lastSelectedImagePos = selected.pos;
    return selected;
  }

  const pos = state.selection.from;
  const directSelected =
    getImageNodeAt(editor, pos) ||
    getImageNodeAt(editor, pos - 1) ||
    (() => {
      const nodeAfter = state.selection.$from.nodeAfter;
      if (nodeAfter?.type?.name !== "image") return null;
      return { node: nodeAfter, pos };
    })() ||
    (() => {
      const nodeBefore = state.selection.$from.nodeBefore;
      if (nodeBefore?.type?.name !== "image") return null;
      return { node: nodeBefore, pos: Math.max(0, pos - nodeBefore.nodeSize) };
    })();

  if (directSelected) {
    lastSelectedImagePos = directSelected.pos;
    return directSelected;
  }

  if (options.allowAnchorFallback !== false && typeof lastSelectedImagePos === "number") {
    const fallbackSelected = getImageNodeAt(editor, lastSelectedImagePos);
    if (fallbackSelected) {
      return fallbackSelected;
    }
  }

  return null;
}

function getImageNameFromSrc(src: string | undefined) {
  if (!src) return "image";
  if (src.startsWith("asset://")) {
    return src.replace(/^asset:\/\//, "") || "image";
  }

  try {
    const url = new URL(src);
    const fileName = url.pathname.split("/").filter(Boolean).pop();
    return fileName || "image";
  } catch {
    return "image";
  }
}

function imageToolbarItems(editor: Editor) {
  return [[
    {
      icon: "i-lucide-download",
      tooltip: { text: t("editor.image.download") },
      onClick: async () => {
        const current = getSelectedImage(editor);
        const src = current?.node?.attrs?.src as string | undefined;
        if (!src || !window.imageAsset?.download) return;
        await window.imageAsset.download({
          src,
          name: getImageNameFromSrc(src),
        });
      },
    },
    {
      icon: "i-lucide-refresh-cw",
      tooltip: { text: t("editor.image.replace") },
      onClick: () => {
        const current = getSelectedImage(editor);
        if (!current) return;

        editor
          .chain()
          .focus()
          .deleteRange({ from: current.pos, to: current.pos + current.node.nodeSize })
          .insertContentAt(current.pos, { type: "imageUpload" })
          .run();
      },
    },
  ], [
    {
      icon: "i-lucide-trash",
      color: "error",
      tooltip: { text: t("editor.image.delete") },
      onClick: () => {
        const current = getSelectedImage(editor);
        if (!current) return;

        editor
          .chain()
          .focus()
          .deleteRange({ from: current.pos, to: current.pos + current.node.nodeSize })
          .run();
      },
    },
  ]];
}

function canExecuteCommand(editor: Editor, commandName: string, args: unknown[] = []) {
  const canChain = editor.can() as Record<string, (...innerArgs: unknown[]) => boolean>;
  if (typeof canChain[commandName] !== "function") return false;

  try {
    return !!canChain[commandName](...args);
  } catch {
    return false;
  }
}

function executeCommand(editor: Editor, commandName: string, args: unknown[] = []) {
  const chain = editor.chain().focus() as Record<string, (...innerArgs: unknown[]) => any>;
  if (typeof chain[commandName] !== "function") return editor.chain();
  return chain[commandName](...args);
}

function createCommandHandler(
  commandName: string,
  options: {
    getArgs?: (cmd: Record<string, any>) => unknown[];
    isActive?: (editor: Editor) => boolean;
    isDisabled?: (editor: Editor) => boolean;
  } = {}
) {
  return {
    canExecute: (editor: Editor, cmd: Record<string, any>) => {
      const args = options.getArgs ? options.getArgs(cmd) : [];
      return canExecuteCommand(editor, commandName, args);
    },
    execute: (editor: Editor, cmd: Record<string, any>) => {
      const args = options.getArgs ? options.getArgs(cmd) : [];
      return executeCommand(editor, commandName, args);
    },
    isActive: (editor: Editor) => options.isActive?.(editor) ?? false,
    isDisabled: (editor: Editor) => options.isDisabled?.(editor),
  };
}

function getCodeLanguageFromNodePos(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "codeBlock") return "";
  const language = node.attrs?.language;
  return typeof language === "string" ? language : "";
}

function getCodeLanguageLabel(value: string) {
  const current = value || "";
  const matched = CODE_LANGUAGE_OPTIONS.value.find((item) => item.value === current);
  return matched?.label || current || t("editor.codeLanguage.auto");
}

function setCodeLanguageAtPos(editor: Editor, pos: number, language: string) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "codeBlock") return;

  const nextLanguage = language || null;
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        language: nextLanguage,
      });
      return true;
    })
    .run();
}

function codeLanguageChildrenForPos(editor: Editor, pos: number) {
  const current = getCodeLanguageFromNodePos(editor, pos);
  return CODE_LANGUAGE_OPTIONS.value.map((item) => ({
    type: "checkbox",
    label: item.label,
    checked: current === item.value,
    onUpdateChecked: (checked: boolean) => {
      if (!checked) return;
      setCodeLanguageAtPos(editor, pos, item.value);
    },
  }));
}

function getSelectedTextRange(editor: Editor) {
  const selection = editor.state.selection;
  if (selection.empty || selection.from >= selection.to) return null;
  return {
    from: selection.from,
    to: selection.to,
  };
}

function getSelectedPlainText(editor: Editor, range?: { from: number; to: number }) {
  const selected = range || getSelectedTextRange(editor);
  if (!selected) return "";
  return editor.state.doc.textBetween(selected.from, selected.to, "\n", "\n");
}

function getSelectionNearbyPlainText(editor: Editor, range: { from: number; to: number }, maxChars = 2600) {
  const selectedText = getSelectedPlainText(editor, range);
  const available = Math.max(0, maxChars - selectedText.length);
  const side = Math.floor(available / 2);
  const docSize = editor.state.doc.content.size;
  const from = Math.max(1, range.from - side);
  const to = Math.min(docSize, range.to + side);
  return editor.state.doc.textBetween(from, to, "\n", "\n");
}

function shouldShowSelectionAiToolbar(editor: Editor) {
  return getSelectedPlainText(editor).trim().length > 0;
}

function triggerSelectionAiAction(editor: Editor, action: SelectionAiAction) {
  const range = getSelectedTextRange(editor);
  if (!range) return;
  const selectedText = getSelectedPlainText(editor, range);
  if (!selectedText.trim()) return;
  const nearbyContext = getSelectionNearbyPlainText(editor, range);

  emit("selection-ai-action", {
    action,
    selectedText,
    nearbyContext,
    selectionRange: {
      mode: "visual",
      from: range.from,
      to: range.to,
    },
  });
}

function selectionAiToolbarItems(editor: Editor) {
  return [[{
    label: t("editor.selectionAi.title"),
    icon: "i-lucide-sparkles",
    tooltip: { text: t("editor.selectionAi.title") },
    content: { align: "start" },
    items: SELECTION_AI_ACTIONS.value.map((item) => ({
      label: item.label,
      icon: item.icon,
      onSelect: () => {
        triggerSelectionAiAction(editor, item.value);
      },
    })),
  }]];
}

function applySelectionReplace(input: SelectionReplaceInput): { ok: true } | { ok: false; reason: string } {
  const editor = uEditorRef.value?.editor;
  if (!editor) {
    return { ok: false, reason: t("editor.error.notReady") };
  }

  const from = Number(input.from);
  const to = Number(input.to);
  const expectedText = String(input.expectedText || "");
  const replacement = String(input.replacement || "");
  if (!Number.isInteger(from) || !Number.isInteger(to) || from <= 0 || to <= from) {
    return { ok: false, reason: t("editor.error.invalidRange") };
  }
  if (!expectedText) {
    return { ok: false, reason: t("editor.error.missingSelectionText") };
  }
  if (!replacement) {
    return { ok: false, reason: t("editor.error.missingReplacement") };
  }

  let current = "";
  try {
    current = editor.state.doc.textBetween(from, to, "\n", "\n");
  } catch {
    return { ok: false, reason: t("editor.error.rangeExpired") };
  }
  if (current !== expectedText) {
    return { ok: false, reason: t("editor.error.selectionChanged") };
  }

  let shouldReplaceAsPlainText = false;
  try {
    const $from = editor.state.doc.resolve(from);
    const $to = editor.state.doc.resolve(to);
    shouldReplaceAsPlainText =
      $from.sameParent($to) &&
      !!$from.parent?.isTextblock &&
      !expectedText.includes("\n") &&
      !replacement.includes("\n");
  } catch {
    shouldReplaceAsPlainText = false;
  }

  const chain = editor.chain().focus();
  const ok = shouldReplaceAsPlainText
    ? chain
      .command(({ tr }) => {
        tr.insertText(replacement, from, to);
        return true;
      })
      .run()
    : chain
      .insertContentAt({ from, to }, replacement, { contentType: "markdown" } as any)
      .run();

  if (!ok) {
    return { ok: false, reason: t("editor.error.applyFailed") };
  }
  return { ok: true };
}

function getSearchRootElement() {
  const host = (uEditorRef.value as any)?.$el as HTMLElement | undefined;
  if (!host) return null;
  return host.querySelector<HTMLElement>(".ProseMirror");
}

defineExpose({
  applySelectionReplace,
  getSearchRootElement,
});

function tableToolbarItems(_editor: Editor) {
  return [[
    {
      kind: "addRowBefore",
      icon: "i-lucide-arrow-up",
      tooltip: { text: t("editor.toolbar.addRowBefore") },
    },
    {
      kind: "addRowAfter",
      icon: "i-lucide-arrow-down",
      tooltip: { text: t("editor.toolbar.addRowAfter") },
    },
    {
      kind: "addColumnBefore",
      icon: "i-lucide-arrow-left",
      tooltip: { text: t("editor.toolbar.addColumnBefore") },
    },
    {
      kind: "addColumnAfter",
      icon: "i-lucide-arrow-right",
      tooltip: { text: t("editor.toolbar.addColumnAfter") },
    },
    {
      kind: "toggleHeaderRow",
      icon: "i-lucide-heading",
      tooltip: { text: t("editor.toolbar.toggleHeaderRow") },
    },
  ], [
    {
      kind: "deleteRow",
      icon: "i-lucide-rows-3",
      tooltip: { text: t("editor.toolbar.deleteRow") },
    },
    {
      kind: "deleteColumn",
      icon: "i-lucide-columns-3",
      tooltip: { text: t("editor.toolbar.deleteColumn") },
    },
    {
      kind: "deleteTable",
      icon: "i-lucide-trash",
      tooltip: { text: t("editor.toolbar.deleteTable") },
      color: "error",
    },
  ]];
}

function dragHandleMenuItems(editor: Editor) {
  if (!selectedNode.value?.node?.type) {
    return [];
  }

  const pos = selectedNode.value.pos;
  const nodeType = String(selectedNode.value.node.type || "Block");
  const nodeTypeLabel = nodeType.slice(0, 1).toUpperCase() + nodeType.slice(1);
  const isCodeBlock = nodeType === "codeBlock";
  const codeLanguage = isCodeBlock ? getCodeLanguageFromNodePos(editor, pos) : "";

  return mapEditorItems(
    editor,
    [[
      {
        type: "label",
        label: nodeTypeLabel,
      },
      {
        label: t("editor.menu.convertTo"),
        icon: "i-lucide-repeat-2",
        children: [
          { kind: "paragraph", label: t("editor.toolbar.paragraph"), icon: "i-lucide-type" },
          { kind: "heading", level: 1, label: t("editor.toolbar.heading1"), icon: "i-lucide-heading-1" },
          { kind: "heading", level: 2, label: t("editor.toolbar.heading2"), icon: "i-lucide-heading-2" },
          { kind: "heading", level: 3, label: t("editor.toolbar.heading3"), icon: "i-lucide-heading-3" },
          { kind: "bulletList", label: t("editor.toolbar.bulletList"), icon: "i-lucide-list" },
          { kind: "orderedList", label: t("editor.toolbar.orderedList"), icon: "i-lucide-list-ordered" },
          { kind: "taskList", label: t("editor.toolbar.taskList"), icon: "i-lucide-list-checks" },
          { kind: "blockquote", label: t("editor.toolbar.blockquote"), icon: "i-lucide-quote" },
          { kind: "codeBlock", label: t("editor.toolbar.codeBlock"), icon: "i-lucide-square-code" },
        ],
      },
      ...(isCodeBlock
        ? [{
          label: getCodeLanguageLabel(codeLanguage),
          icon: "i-lucide-file-code",
          children: codeLanguageChildrenForPos(editor, pos),
        }]
        : []),
      {
        kind: "clearFormatting",
        pos,
        label: t("editor.toolbar.clearFormatting"),
        icon: "i-lucide-eraser",
      },
    ], [
      {
        kind: "duplicate",
        pos,
        label: t("editor.menu.duplicate"),
        icon: "i-lucide-copy",
      },
      {
        kind: "moveUp",
        pos,
        label: t("editor.menu.moveUp"),
        icon: "i-lucide-arrow-up",
      },
      {
        kind: "moveDown",
        pos,
        label: t("editor.menu.moveDown"),
        icon: "i-lucide-arrow-down",
      },
    ], [
      {
        kind: "delete",
        pos,
        label: t("editor.menu.delete"),
        icon: "i-lucide-trash",
        color: "error",
      },
    ]],
    editorHandlers as any
  ) as any;
}

const editorExtensions = computed(() => {
  return [
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: null,
      HTMLAttributes: {
        class: "hljs",
      },
    }),
    TaskItem,
    TaskList,
    TableKit.configure({
      table: {
        resizable: true,
      },
    }),
    ImageUpload.configure({
      upload: props.imageUpload,
    }),
  ];
});

const editorHandlers = {
  imageUpload: {
    canExecute: (editor: Editor) => editor.can().insertContent({ type: "imageUpload" }),
    execute: (editor: Editor) => editor.chain().focus().insertContent({ type: "imageUpload" }),
    isActive: (editor: Editor) => editor.isActive("imageUpload"),
    isDisabled: undefined,
  },
  insertTable: createCommandHandler("insertTable", {
    getArgs: (cmd) => [cmd?.options || { rows: 3, cols: 3, withHeaderRow: true }],
  }),
  addRowBefore: createCommandHandler("addRowBefore"),
  addRowAfter: createCommandHandler("addRowAfter"),
  deleteRow: createCommandHandler("deleteRow"),
  addColumnBefore: createCommandHandler("addColumnBefore"),
  addColumnAfter: createCommandHandler("addColumnAfter"),
  deleteColumn: createCommandHandler("deleteColumn"),
  toggleHeaderRow: createCommandHandler("toggleHeaderRow"),
  deleteTable: createCommandHandler("deleteTable"),
};
</script>
