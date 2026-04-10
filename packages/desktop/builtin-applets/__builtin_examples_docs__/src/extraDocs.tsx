import type { UINode } from "@mirdel/applet-core";
import {
  asBool,
  asString,
  streamStatusText,
  type ExamplesDocsCtx,
} from "./utils";

type TableRow = Record<string, unknown>;

const PARAM_COLUMNS = [
  { key: "name", label: "Parameter", sortable: false, width: 180 },
  { key: "type", label: "Type", sortable: false, width: 260 },
  { key: "required", label: "Required", sortable: false, width: 100 },
  { key: "description", label: "Description", sortable: false },
];

const RESULT_COLUMNS = [
  { key: "name", label: "Result", sortable: false, width: 180 },
  { key: "type", label: "Type", sortable: false, width: 240 },
  { key: "description", label: "Description", sortable: false },
];

function renderDocShell(
  ctx: ExamplesDocsCtx,
  input: {
    title: string;
    description: string;
    demo?: UINode;
    demoIntro?: string;
    source?: string;
    apiBlocks?: Array<{ title: string; columns: Record<string, unknown>[]; rows: TableRow[] }>;
    notes?: string[];
  }
): UINode {
  const ui = ctx.ui;
  return (
    <ui.View class="flex flex-col gap-5">
      <ui.View class="shrink-0 flex flex-col gap-3 rounded-[24px] border border-default bg-[linear-gradient(135deg,rgba(13,148,136,0.10),rgba(255,255,255,0.96))] p-5">
        <ui.Row class="items-center gap-2" wrap>
          <ui.Badge label="Docs" variant="soft" color="info" />
        </ui.Row>
        <ui.View class="flex flex-col gap-1">
          <ui.Text value={input.title} size="xl" bold />
          <ui.Text value={input.description} size="sm" color="muted" />
        </ui.View>
      </ui.View>

      {input.demo ? (
        <ui.View class="shrink-0 flex flex-col gap-3">
          <ui.Text value="Demo" size="lg" bold />
          {input.demoIntro ? <ui.Text value={input.demoIntro} size="sm" color="muted" /> : null}
          {input.demo}
        </ui.View>
      ) : null}

      {input.source ? (
        <ui.View class="shrink-0 flex flex-col gap-3">
          <ui.Text value="Source" size="lg" bold />
          <ui.Markdown value={`\`\`\`tsx\n${input.source}\n\`\`\``} />
        </ui.View>
      ) : null}

      {input.apiBlocks && input.apiBlocks.length > 0 ? (
        <ui.View class="shrink-0 flex flex-col gap-3">
          <ui.Text value="API" size="lg" bold />
          {input.apiBlocks.map((block) => (
            <ui.View class="flex flex-col gap-3 rounded-[20px] border border-default bg-white/70 p-4" key={block.title}>
              <ui.Text value={block.title} size="sm" bold />
              <ui.Table columns={block.columns} rows={block.rows} rowKey="name" />
            </ui.View>
          ))}
        </ui.View>
      ) : null}

      {input.notes && input.notes.length > 0 ? (
        <ui.View class="shrink-0 flex flex-col gap-3">
          <ui.Text value="Notes" size="lg" bold />
          <ui.Markdown value={input.notes.map((item) => `- ${item}`).join("\n")} />
        </ui.View>
      ) : null}
    </ui.View>
  );
}

function overviewGuide(ctx: ExamplesDocsCtx): UINode {
  const ui = ctx.ui;
  const markdown = [
    "## What an applet is",
    "",
    "Applet is a small in-app UI defined with the applet protocol. It can render UI, hold state, react to actions, and call host capabilities such as LLM, search, clipboard, and filesystem.",
    "",
    "## How to read these docs",
    "",
    "- `Demo` shows one integrated example rather than many tiny fragments",
    "- `Source` matches the demo above",
    "- `API` focuses on the practical surface you need to wire",
    "- `Notes` call out usage guidance and pitfalls",
    "",
    "## Mental model",
    "",
    "1. `init()` creates state",
    "2. `render()` maps state to schema UI",
    "3. user interaction dispatches actions",
    "4. `onAction()` updates state or calls runtime methods",
  ].join("\n");

  return renderDocShell(ctx, {
    title: "Overview",
    description: "A high-level explanation of what applets are and how to use this documentation set.",
    demo: (
      <ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ui.Markdown value={markdown} />
      </ui.View>
    ),
    demoIntro: "This page is intentionally conceptual rather than interactive.",
    notes: [
      "Treat applets as small, stateful protocol-driven surfaces inside the desktop app.",
      "Start with one integrated example, then extract patterns into your own applet.",
    ],
  });
}

function actionsStateGuide(ctx: ExamplesDocsCtx): UINode {
  const ui = ctx.ui;
  const markdown = [
    "## State flow",
    "",
    "State lives in the applet process. `render()` only reads state and returns schema nodes. It should stay deterministic and side-effect free.",
    "",
    "## Action flow",
    "",
    "UI callbacks dispatch plain serializable actions. `onAction()` receives them, updates `ctx.state`, and may call runtime methods.",
    "",
    "## Practical rule",
    "",
    "- put visual structure in `render()`",
    "- put state transitions in `onAction()`",
    "- call LLM, search, clipboard, and fs from `onAction()`, not from `render()`",
    "",
    "## Typical loop",
    "",
    "```ts",
    "if (action.type === \"setInput\") {",
    "  ctx.state.inputValue = String(action.value || \"\");",
    "  return;",
    "}",
    "```",
  ].join("\n");

  return renderDocShell(ctx, {
    title: "Actions and State",
    description: "How applet state, UI schema, and action dispatch fit together.",
    demo: (
      <ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ui.Markdown value={markdown} />
      </ui.View>
    ),
    demoIntro: "This page explains the execution model behind every interactive example in this docs applet.",
    notes: [
      "Keep render deterministic so it stays easy to reason about.",
      "Use small, plain action payloads so interactions remain serializable and debuggable.",
    ],
  });
}

function generateTextMethod(ctx: ExamplesDocsCtx): UINode {
  const ui = ctx.ui;
  return renderDocShell(ctx, {
    title: "llm.generateText",
    description: "Runs a single-shot text generation request and resolves with the final string result.",
    demoIntro: "This example lets you select a model, write a prompt, and render the final output below.",
    demo: (
        <ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ui.View class="flex flex-col gap-3">
          <ui.ModelSelect
            value={asString(ctx.state.generateModel)}
            purpose="chat"
            search
            clear
            placeholder="Select a chat model"
            onChange={{ type: "demoSetField", key: "generateModel" }}
          />
          <ui.Textarea
            value={asString(ctx.state.generatePrompt)}
            placeholder="Enter a prompt"
            rows={5}
            block
            onChange={{ type: "demoSetField", key: "generatePrompt" }}
          />
          <ui.Row class="gap-2" wrap>
            <ui.Button text="Generate" onClick={{ type: "methodGenerateText" }} />
          </ui.Row>
          <ui.View class="rounded-2xl bg-white/78 p-4 min-h-[120px]">
            {asString(ctx.state.generateOutput) ? (
              <ui.Markdown value={asString(ctx.state.generateOutput)} />
            ) : (
              <ui.Text value="Generated markdown will appear here." size="sm" color="muted" />
            )}
          </ui.View>
        </ui.View>
      </ui.View>
    ),
    source: [
      "const text = await ctx.llm.generateText({",
      "  prompt,",
      "  model,",
      "  temperature: 0.3,",
      "  maxOutputTokens: 600,",
      "});",
      "ctx.state.generateOutput = String(text || \"\");",
    ].join("\n"),
    apiBlocks: [
      {
        title: "Parameters",
        columns: PARAM_COLUMNS,
        rows: [
          { name: "model", type: "string", required: "Yes", description: "Model id in providerId::modelId format." },
          { name: "prompt", type: "string", required: "No", description: "Shortcut prompt when not using messages." },
          { name: "messages", type: "AppletLlmMessage[]", required: "No", description: "Structured message array alternative to prompt." },
          { name: "system", type: "string", required: "No", description: "Optional system prompt." },
          { name: "temperature", type: "number", required: "No", description: "Sampling temperature." },
          { name: "maxOutputTokens", type: "number", required: "No", description: "Upper output token bound." },
        ],
      },
      {
        title: "Returns",
        columns: RESULT_COLUMNS,
        rows: [
          { name: "result", type: "Promise<string>", description: "The final generated text result." },
        ],
      },
    ],
    notes: [
      "Use generateText when you only need the final result and not incremental updates.",
      "Validate model ids before sending the request.",
      "If the UI should stream progress, use llm.streamText instead.",
    ],
  });
}

function streamTextMethod(ctx: ExamplesDocsCtx): UINode {
  const ui = ctx.ui;
  const running = asBool(ctx.state.streamRunning);
  return renderDocShell(ctx, {
    title: "llm.streamText",
    description: "Runs a streaming text generation request and incrementally writes output into applet state.",
    demoIntro: "This example starts a stream, shows the current status, and lets you abort the run.",
    demo: (
      <ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ui.View class="flex flex-col gap-3">
          <ui.ModelSelect
            value={asString(ctx.state.streamModel)}
            purpose="chat"
            search
            clear
            placeholder="Select a chat model"
            onChange={{ type: "demoSetField", key: "streamModel" }}
          />
          <ui.Textarea
            value={asString(ctx.state.streamPrompt)}
            placeholder="Enter a prompt"
            rows={5}
            block
            onChange={{ type: "demoSetField", key: "streamPrompt" }}
          />
          <ui.Row class="gap-2" wrap>
            <ui.Button
              text={running ? "Abort" : "Start stream"}
              variant={running ? "outline" : "solid"}
              color={running ? "error" : "primary"}
              onClick={running ? { type: "methodStopStream" } : { type: "methodRunStream" }}
            />
          </ui.Row>
          <ui.Text value={`Status: ${streamStatusText(ctx)}`} size="sm" color="muted" />
          <ui.View class="rounded-2xl bg-white/78 p-4 min-h-[140px]">
            {asString(ctx.state.streamOutput) ? (
              <ui.Markdown value={asString(ctx.state.streamOutput)} />
            ) : (
              <ui.Text value="Streaming markdown will appear here." size="sm" color="muted" />
            )}
          </ui.View>
        </ui.View>
      </ui.View>
    ),
    source: [
      "await ctx.llm.streamText({",
      "  key: STREAM_KEY,",
      "  statePath: \"streamOutput\",",
      "  prompt,",
      "  model,",
      "  temperature: 0.4,",
      "  maxOutputTokens: 800,",
      "});",
    ].join("\n"),
    apiBlocks: [
      {
        title: "Parameters",
        columns: PARAM_COLUMNS,
        rows: [
          { name: "model", type: "string", required: "Yes", description: "Model id in providerId::modelId format." },
          { name: "prompt", type: "string", required: "No", description: "Shortcut prompt when not using messages." },
          { name: "messages", type: "AppletLlmMessage[]", required: "No", description: "Structured message array alternative to prompt." },
          { name: "statePath", type: "string", required: "Yes", description: "State field path that receives stream deltas." },
          { name: "key", type: "string", required: "No", description: "Run key used for cancellation and status." },
          { name: "onDelta", type: "(chunk: string) => void", required: "No", description: "Optional delta callback." },
        ],
      },
      {
        title: "Returns",
        columns: RESULT_COLUMNS,
        rows: [
          { name: "result", type: "Promise<void>", description: "Resolves when the stream finishes or rejects on error." },
        ],
      },
    ],
    notes: [
      "Use a stable key when you need cancellation or run status.",
      "streamText is best when the UI should reveal partial output while the model is still working.",
      "Always give users a way to stop long-running streams.",
    ],
  });
}

function searchMethod(ctx: ExamplesDocsCtx): UINode {
  const ui = ctx.ui;
  return renderDocShell(ctx, {
    title: "search",
    description: "Runs a web search query through the host search capability and returns structured results.",
    demoIntro: "This example uses one search field and renders the formatted top results below it.",
    demo: (
      <ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ui.View class="flex flex-col gap-3">
          <ui.Row class="gap-2" wrap>
            <ui.Input
              value={asString(ctx.state.searchQuery)}
              placeholder="Search query"
              icon="search"
              class="w-[280px]"
              onChange={{ type: "demoSetField", key: "searchQuery" }}
            />
            <ui.Button
              text={asBool(ctx.state.searchLoading) ? "Searching..." : "Run search"}
              loading={asBool(ctx.state.searchLoading)}
              onClick={{ type: "methodSearchRun" }}
            />
          </ui.Row>
          <ui.Textarea
            value={asString(ctx.state.searchOutput)}
            rows={8}
            block
            placeholder="Search results"
            disabled
          />
        </ui.View>
      </ui.View>
    ),
    source: [
      "const result = await ctx.search(query, { limit: 5 });",
      "ctx.state.searchOutput = normalizeSearchResult(result);",
    ].join("\n"),
    apiBlocks: [
      {
        title: "Parameters",
        columns: PARAM_COLUMNS,
        rows: [
          { name: "query", type: "string", required: "Yes", description: "User search query." },
          { name: "options.limit", type: "number", required: "No", description: "Maximum number of results." },
        ],
      },
      {
        title: "Returns",
        columns: RESULT_COLUMNS,
        rows: [
          { name: "result", type: "Promise<SearchResult>", description: "Structured search result payload from the host." },
        ],
      },
    ],
    notes: [
      "Guard against empty queries before calling search.",
      "Format the raw result for users rather than dumping the object shape directly.",
      "Search availability depends on the current environment and host configuration.",
    ],
  });
}

function clipboardMethod(ctx: ExamplesDocsCtx): UINode {
  const ui = ctx.ui;
  return renderDocShell(ctx, {
    title: "clipboard",
    description: "Provides read and write access to the host clipboard when the environment allows it.",
    demoIntro: "This example writes the current output or reads existing clipboard text into a log area.",
    demo: (
      <ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ui.View class="flex flex-col gap-3">
          <ui.Row class="gap-2" wrap>
            <ui.Button text="Copy output" variant="soft" onClick={{ type: "methodCopyOutput" }} />
            <ui.Button text="Read clipboard" variant="outline" onClick={{ type: "methodReadClipboard" }} />
          </ui.Row>
          <ui.Textarea
            value={asString(ctx.state.clipboardOutput)}
            rows={5}
            block
            placeholder="Clipboard logs"
            disabled
          />
        </ui.View>
      </ui.View>
    ),
    source: [
      "const copied = await ctx.clipboard.write(content);",
      "const content = await ctx.clipboard.read();",
    ].join("\n"),
    apiBlocks: [
      {
        title: "Available Methods",
        columns: PARAM_COLUMNS,
        rows: [
          { name: "clipboard.write", type: "(text: string) => Promise<boolean>", required: "No", description: "Writes text into the clipboard." },
          { name: "clipboard.read", type: "() => Promise<string>", required: "No", description: "Reads text from the clipboard." },
        ],
      },
      {
        title: "Returns",
        columns: RESULT_COLUMNS,
        rows: [
          { name: "write", type: "Promise<boolean>", description: "Whether the write succeeded." },
          { name: "read", type: "Promise<string>", description: "Clipboard text content." },
        ],
      },
    ],
    notes: [
      "Clipboard access may be unavailable depending on environment restrictions.",
      "Keep clipboard writes explicit so users understand when content changes.",
      "Truncate or sanitize large clipboard reads before rendering them into the UI.",
    ],
  });
}

function fsMethod(ctx: ExamplesDocsCtx): UINode {
  const ui = ctx.ui;
  return renderDocShell(ctx, {
    title: "fs",
    description: "Exposes selected filesystem operations from the host. It is useful for directory inspection or file-driven workflows.",
    demoIntro: "This example reads the current directory and shows the first entries in a text area.",
    demo: (
      <ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ui.View class="flex flex-col gap-3">
          <ui.Row class="gap-2" wrap>
            <ui.Button text="Read directory" variant="outline" onClick={{ type: "methodReadFs" }} />
          </ui.Row>
          <ui.Textarea
            value={asString(ctx.state.fsOutput)}
            rows={6}
            block
            placeholder="Directory entries"
            disabled
          />
        </ui.View>
      </ui.View>
    ),
    source: [
      "const files = await ctx.fs.readdir(\".\", { withFileTypes: false });",
      "ctx.state.fsOutput = files.join(\"\\n\");",
    ].join("\n"),
    apiBlocks: [
      {
        title: "Available Methods",
        columns: PARAM_COLUMNS,
        rows: [
          { name: "fs.readdir", type: "(path: string, options?: object) => Promise<string[]>", required: "No", description: "Reads directory entries." },
        ],
      },
      {
        title: "Returns",
        columns: RESULT_COLUMNS,
        rows: [
          { name: "readdir", type: "Promise<string[]>", description: "A list of directory entries." },
        ],
      },
    ],
    notes: [
      "Filesystem access should be treated as environment-sensitive and potentially unavailable.",
      "Keep directory reads scoped so the UI remains predictable.",
      "Render only a useful subset when a directory contains many entries.",
    ],
  });
}

function toastMethod(ctx: ExamplesDocsCtx): UINode {
  const ui = ctx.ui;
  return renderDocShell(ctx, {
    title: "toast",
    description: "Shows transient toast notifications through the host UI. It is useful for lightweight confirmations and failures.",
    demoIntro: "This example triggers a toast and mirrors the result below it.",
    demo: (
      <ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ui.View class="flex flex-col gap-3">
          <ui.Row class="gap-2" wrap>
            <ui.Button text="Show toast" variant="soft" onClick={{ type: "methodToastDemo", message: "Manual toast trigger" }} />
          </ui.Row>
          <ui.Text value={asString(ctx.state.toastOutput) || "Trigger the toast to see confirmation here."} size="sm" color="muted" />
        </ui.View>
      </ui.View>
    ),
    source: [
      "ctx.toast?.({",
      "  title: \"Toast demo\",",
      "  description: \"Manual toast trigger\",",
      "  icon: \"sparkles\",",
      "  color: \"info\",",
      "});",
    ].join("\n"),
    apiBlocks: [
      {
        title: "Parameters",
        columns: PARAM_COLUMNS,
        rows: [
          { name: "title", type: "string", required: "No", description: "Toast title text." },
          { name: "description", type: "string", required: "No", description: "Supporting description." },
          { name: "icon", type: "string", required: "No", description: "Optional icon identifier." },
          { name: "color", type: "string", required: "No", description: "Semantic toast color." },
          { name: "duration", type: "number", required: "No", description: "Optional display duration." },
        ],
      },
    ],
    notes: [
      "Use toast for lightweight confirmations and errors that do not need a permanent surface.",
      "Keep the message short so users can absorb it quickly.",
      "Avoid chaining too many toasts in a row for one workflow.",
    ],
  });
}

function storageMethod(ctx: ExamplesDocsCtx): UINode {
  const ui = ctx.ui;
  return renderDocShell(ctx, {
    title: "storage",
    description: "Provides applet-scoped JSON persistence under the host userData directory. Use it for drafts, preferences, and small cached values.",
    demoIntro: "This example edits one key and one JSON value, then lets you save, read, remove, clear, or inspect all stored values.",
    demo: (
      <ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ui.View class="flex flex-col gap-3">
          <ui.Input
            value={asString(ctx.state.storageKey)}
            placeholder="Storage key"
            block
            onChange={{ type: "demoSetField", key: "storageKey" }}
          />
          <ui.Textarea
            value={asString(ctx.state.storageValue)}
            placeholder="JSON value"
            rows={6}
            block
            onChange={{ type: "demoSetField", key: "storageValue" }}
          />
          <ui.Row class="gap-2" wrap>
            <ui.Button text="Set" onClick={{ type: "methodStorageSet" }} />
            <ui.Button text="Get" variant="soft" onClick={{ type: "methodStorageGet" }} />
            <ui.Button text="Get all" variant="soft" onClick={{ type: "methodStorageGetAll" }} />
            <ui.Button text="Remove" variant="outline" color="warning" onClick={{ type: "methodStorageRemove" }} />
            <ui.Button text="Clear" variant="outline" color="error" onClick={{ type: "methodStorageClear" }} />
          </ui.Row>
          <ui.Textarea
            value={asString(ctx.state.storageOutput)}
            rows={8}
            block
            placeholder="Storage output"
            disabled
          />
        </ui.View>
      </ui.View>
    ),
    source: [
      "await ctx.storage?.set(key, value);",
      "const value = await ctx.storage?.get(key);",
      "const values = await ctx.storage?.getAll();",
      "await ctx.storage?.remove(key);",
      "await ctx.storage?.clear();",
    ].join("\n"),
    apiBlocks: [
      {
        title: "Available Methods",
        columns: PARAM_COLUMNS,
        rows: [
          { name: "storage.get", type: "(key: string) => Promise<JSONValue | undefined>", required: "No", description: "Reads one stored value." },
          { name: "storage.set", type: "(key: string, value: JSONValue) => Promise<void>", required: "No", description: "Writes one JSON-serializable value." },
          { name: "storage.remove", type: "(key: string) => Promise<void>", required: "No", description: "Deletes one key." },
          { name: "storage.clear", type: "() => Promise<void>", required: "No", description: "Clears all values for the current applet." },
          { name: "storage.getAll", type: "() => Promise<Record<string, JSONValue>>", required: "No", description: "Reads the full key-value map." },
        ],
      },
    ],
    notes: [
      "Values must be JSON-serializable.",
      "Use storage for small durable state, not large datasets or binary content.",
      "Storage is scoped to the current applet id rather than shared across all applets.",
    ],
  });
}

function dialogMethod(ctx: ExamplesDocsCtx): UINode {
  const ui = ctx.ui;
  return renderDocShell(ctx, {
    title: "dialog",
    description: "Opens host file and directory dialogs so the user can choose input or output paths explicitly.",
    demoIntro: "This example lets you supply an optional default path, then opens file, directory, or save dialogs and shows the raw result below.",
    demo: (
      <ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ui.View class="flex flex-col gap-3">
          <ui.Input
            value={asString(ctx.state.dialogDefaultPath)}
            placeholder="Optional default path"
            block
            onChange={{ type: "demoSetField", key: "dialogDefaultPath" }}
          />
          <ui.Row class="gap-2" wrap>
            <ui.Button text="Select file" onClick={{ type: "methodDialogSelectFile" }} />
            <ui.Button text="Select directory" variant="soft" onClick={{ type: "methodDialogSelectDirectory" }} />
            <ui.Button text="Save file" variant="outline" onClick={{ type: "methodDialogSaveFile" }} />
          </ui.Row>
          <ui.Textarea
            value={asString(ctx.state.dialogOutput)}
            rows={8}
            block
            placeholder="Dialog result"
            disabled
          />
        </ui.View>
      </ui.View>
    ),
    source: [
      "const files = await ctx.dialog?.selectFile({",
      "  title: \"Select files\",",
      "  multiSelections: true,",
      "  filters: [{ name: \"Markdown\", extensions: [\"md\", \"markdown\"] }],",
      "});",
      "",
      "const dir = await ctx.dialog?.selectDirectory();",
      "const saveTarget = await ctx.dialog?.saveFile({ defaultPath: \"notes.md\" });",
    ].join("\n"),
    apiBlocks: [
      {
        title: "Available Methods",
        columns: PARAM_COLUMNS,
        rows: [
          { name: "dialog.selectFile", type: "(options?) => Promise<{ canceled: boolean; filePaths: string[] }>", required: "No", description: "Opens a file picker." },
          { name: "dialog.selectDirectory", type: "(options?) => Promise<{ canceled: boolean; filePath: string | null }>", required: "No", description: "Opens a directory picker." },
          { name: "dialog.saveFile", type: "(options?) => Promise<{ canceled: boolean; filePath: string | null }>", required: "No", description: "Opens a save dialog and returns the chosen target path." },
        ],
      },
      {
        title: "Common Options",
        columns: PARAM_COLUMNS,
        rows: [
          { name: "title", type: "string", required: "No", description: "Dialog title." },
          { name: "defaultPath", type: "string", required: "No", description: "Suggested initial path or file name." },
          { name: "filters", type: "Array<{ name: string; extensions: string[] }>", required: "No", description: "File extension filters for open/save file dialogs." },
          { name: "multiSelections", type: "boolean", required: "No", description: "Enables multi-file selection in selectFile." },
        ],
      },
    ],
    notes: [
      "Use dialogs when the user should explicitly choose input or output paths.",
      "saveFile only returns the target path. Write the file yourself with ctx.fs afterwards.",
      "Prefer defaultPath when you already know the likely working directory or file name.",
    ],
  });
}

function shellMethod(ctx: ExamplesDocsCtx): UINode {
  const ui = ctx.ui;
  return renderDocShell(ctx, {
    title: "shell",
    description: "Calls selected host OS shell actions, such as opening external URLs or revealing files in the system file manager.",
    demoIntro: "This example keeps URL and path inputs separate so each shell action can be triggered independently.",
    demo: (
      <ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ui.View class="flex flex-col gap-3">
          <ui.Input
            value={asString(ctx.state.shellUrl)}
            placeholder="External URL"
            block
            onChange={{ type: "demoSetField", key: "shellUrl" }}
          />
          <ui.Row class="gap-2" wrap>
            <ui.Button text="Open external URL" onClick={{ type: "methodShellOpenExternal" }} />
          </ui.Row>
          <ui.Input
            value={asString(ctx.state.shellPath)}
            placeholder="File or directory path"
            block
            onChange={{ type: "demoSetField", key: "shellPath" }}
          />
          <ui.Row class="gap-2" wrap>
            <ui.Button text="Reveal in folder" variant="soft" onClick={{ type: "methodShellShowItemInFolder" }} />
            <ui.Button text="Open path" variant="outline" onClick={{ type: "methodShellOpenPath" }} />
          </ui.Row>
          <ui.Textarea
            value={asString(ctx.state.shellOutput)}
            rows={6}
            block
            placeholder="Shell result"
            disabled
          />
        </ui.View>
      </ui.View>
    ),
    source: [
      "await ctx.shell?.openExternal(url);",
      "await ctx.shell?.showItemInFolder(filePath);",
      "await ctx.shell?.openPath(filePath);",
    ].join("\n"),
    apiBlocks: [
      {
        title: "Available Methods",
        columns: PARAM_COLUMNS,
        rows: [
          { name: "shell.openExternal", type: "(url: string) => Promise<{ ok: boolean; error?: string }>", required: "No", description: "Opens a URL in the default external browser." },
          { name: "shell.showItemInFolder", type: "(path: string) => Promise<{ ok: boolean; error?: string }>", required: "No", description: "Reveals a file inside the system file manager." },
          { name: "shell.openPath", type: "(path: string) => Promise<{ ok: boolean; error?: string }>", required: "No", description: "Opens a file or directory with the default OS handler." },
        ],
      },
    ],
    notes: [
      "Use shell methods when the applet should hand control back to the host operating system.",
      "openExternal is for URLs. Use openPath or showItemInFolder for local filesystem targets.",
      "Validate or normalize user-provided paths before using them in shell actions.",
    ],
  });
}

export function renderExtraDoc(ctx: ExamplesDocsCtx, docId: string): UINode | null {
  switch (docId) {
    case "guide-overview":
      return overviewGuide(ctx);
    case "guide-actions":
      return actionsStateGuide(ctx);
    case "method-llm-generate":
      return generateTextMethod(ctx);
    case "method-llm-stream":
      return streamTextMethod(ctx);
    case "method-search":
      return searchMethod(ctx);
    case "method-clipboard":
      return clipboardMethod(ctx);
    case "method-fs":
      return fsMethod(ctx);
    case "method-toast":
      return toastMethod(ctx);
    case "method-storage":
      return storageMethod(ctx);
    case "method-dialog":
      return dialogMethod(ctx);
    case "method-shell":
      return shellMethod(ctx);
    default:
      return null;
  }
}
