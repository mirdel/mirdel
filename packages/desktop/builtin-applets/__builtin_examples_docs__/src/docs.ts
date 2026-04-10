export type DocStatus = "ready" | "coming-soon";

export type DocItem = {
  id: string;
  label: string;
  kind: "guide" | "component" | "method";
  summary: string;
  status: DocStatus;
};

export type DocGroup = {
  id: string;
  label: string;
  items: DocItem[];
};

export const DOC_GROUPS: DocGroup[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    items: [
      {
        id: "guide-overview",
        label: "Overview",
        kind: "guide",
        summary: "What applets are, when to use them, and how to read this documentation.",
        status: "ready",
      },
      {
        id: "guide-actions",
        label: "Actions and State",
        kind: "guide",
        summary: "How state updates, actions, render, and onAction fit together.",
        status: "ready",
      },
    ],
  },
  {
    id: "layout",
    label: "Layout",
    items: [
      {
        id: "component-view",
        label: "View",
        kind: "component",
        summary: "The base container for styling, decoration, and click handling.",
        status: "ready",
      },
      {
        id: "component-row",
        label: "Row",
        kind: "component",
        summary: "Horizontal layout container.",
        status: "coming-soon",
      },
      {
        id: "component-col",
        label: "Col",
        kind: "component",
        summary: "Vertical layout container.",
        status: "coming-soon",
      },
    ],
  },
  {
    id: "display",
    label: "Display",
    items: [
      { id: "component-text", label: "Text", kind: "component", summary: "Text and typography.", status: "coming-soon" },
      { id: "component-markdown", label: "Markdown", kind: "component", summary: "Markdown rendering.", status: "coming-soon" },
      { id: "component-badge", label: "Badge", kind: "component", summary: "Labels and status pills.", status: "coming-soon" },
      { id: "component-alert", label: "Alert", kind: "component", summary: "Inline status messaging.", status: "coming-soon" },
      { id: "component-icon", label: "Icon", kind: "component", summary: "Icon rendering.", status: "coming-soon" },
      { id: "component-image", label: "Image", kind: "component", summary: "Image display.", status: "coming-soon" },
      { id: "component-separator", label: "Separator", kind: "component", summary: "Section separators.", status: "coming-soon" },
      { id: "component-progress", label: "Progress", kind: "component", summary: "Progress indicators.", status: "coming-soon" },
    ],
  },
  {
    id: "inputs",
    label: "Inputs",
    items: [
      { id: "component-button", label: "Button", kind: "component", summary: "Buttons and triggers.", status: "coming-soon" },
      { id: "component-input", label: "Input", kind: "component", summary: "Single-line input.", status: "coming-soon" },
      { id: "component-textarea", label: "Textarea", kind: "component", summary: "Multi-line text input.", status: "coming-soon" },
      { id: "component-switch", label: "Switch", kind: "component", summary: "Boolean toggle.", status: "coming-soon" },
      { id: "component-checkbox", label: "Checkbox", kind: "component", summary: "Checkbox input.", status: "coming-soon" },
      { id: "component-radiogroup", label: "RadioGroup", kind: "component", summary: "Single-choice groups.", status: "coming-soon" },
    ],
  },
  {
    id: "selection-data",
    label: "Selection and Data",
    items: [
      { id: "component-select", label: "Select", kind: "component", summary: "Single and multi-select menus.", status: "coming-soon" },
      { id: "component-modelselect", label: "ModelSelect", kind: "component", summary: "Runtime-backed model selector.", status: "coming-soon" },
      { id: "component-tabs", label: "Tabs", kind: "component", summary: "Tab switching.", status: "coming-soon" },
      { id: "component-accordion", label: "Accordion", kind: "component", summary: "Collapsible content.", status: "coming-soon" },
      { id: "component-table", label: "Table", kind: "component", summary: "Structured data tables.", status: "coming-soon" },
      { id: "component-calendar", label: "Calendar", kind: "component", summary: "Calendar picker.", status: "coming-soon" },
      { id: "component-datepicker", label: "DatePicker", kind: "component", summary: "Date input.", status: "coming-soon" },
      { id: "component-inputtime", label: "InputTime", kind: "component", summary: "Time input.", status: "coming-soon" },
    ],
  },
  {
    id: "overlays",
    label: "Overlays and Feedback",
    items: [
      { id: "component-tooltip", label: "Tooltip", kind: "component", summary: "Hover and focus hints.", status: "coming-soon" },
      { id: "component-popover", label: "Popover", kind: "component", summary: "Lightweight floating container.", status: "coming-soon" },
      { id: "component-dropdownmenu", label: "DropdownMenu", kind: "component", summary: "Action menus.", status: "coming-soon" },
      { id: "component-modal", label: "Modal", kind: "component", summary: "Modal dialogs.", status: "coming-soon" },
    ],
  },
  {
    id: "runtime",
    label: "Runtime Methods",
    items: [
      { id: "method-llm-generate", label: "llm.generateText", kind: "method", summary: "Single-shot text generation.", status: "ready" },
      { id: "method-llm-stream", label: "llm.streamText", kind: "method", summary: "Streaming text generation.", status: "ready" },
      { id: "method-search", label: "search", kind: "method", summary: "Built-in web search.", status: "ready" },
      { id: "method-clipboard", label: "clipboard", kind: "method", summary: "Clipboard read and write.", status: "ready" },
      { id: "method-fs", label: "fs", kind: "method", summary: "Filesystem access.", status: "ready" },
      { id: "method-toast", label: "toast", kind: "method", summary: "Toast notifications.", status: "ready" },
      { id: "method-storage", label: "storage", kind: "method", summary: "Applet-scoped JSON persistence.", status: "ready" },
      { id: "method-dialog", label: "dialog", kind: "method", summary: "Open and save dialogs from the host.", status: "ready" },
      { id: "method-shell", label: "shell", kind: "method", summary: "Open URLs and reveal files in the host OS.", status: "ready" },
    ],
  },
];

export const DEFAULT_DOC_ID = "component-view";

export function getDocById(docId: string) {
  for (const group of DOC_GROUPS) {
    const found = group.items.find((item) => item.id === docId);
    if (found) return found;
  }
  return undefined;
}
