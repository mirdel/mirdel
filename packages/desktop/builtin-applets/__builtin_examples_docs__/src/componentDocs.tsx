import type { UINode } from "@mirdel/applet-core";
import { asBool, asList, asNumber, asRange, asString, type ExamplesDocsCtx } from "./utils";

type ApiRow = Record<string, unknown>;

type ComponentDocConfig = {
  title: string;
  description: string;
  demoIntro: string;
  source: string;
  propsRows: ApiRow[];
  eventRows?: ApiRow[];
  notes: string[];
  demo: (ctx: ExamplesDocsCtx) => UINode;
};

const DEMO_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='460' height='220' viewBox='0 0 460 220'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%230ea5e9'/%3E%3Cstop offset='100%25' stop-color='%2314b8a6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='460' height='220' rx='24' fill='url(%23g)'/%3E%3Cpath d='M68 76h220M68 112h308M68 148h270' stroke='white' stroke-width='10' stroke-linecap='round'/%3E%3Ccircle cx='378' cy='86' r='30' fill='rgba(255,255,255,0.26)'/%3E%3C/svg%3E";

const DOC_PROPS_COLUMNS = [
  { key: "prop", label: "Prop", sortable: false, width: 160 },
  { key: "type", label: "Type", sortable: false, width: 300 },
  { key: "default", label: "Default", sortable: false, width: 120 },
  { key: "description", label: "Description", sortable: false },
];

const DOC_EVENT_COLUMNS = [
  { key: "event", label: "Event", sortable: false, width: 160 },
  { key: "payload", label: "Payload", sortable: false, width: 220 },
  { key: "description", label: "Description", sortable: false },
];

const SELECT_ITEMS = [
  { label: "Design", value: "design" },
  { label: "Engineering", value: "engineering" },
  { label: "Research", value: "research" },
];

const TAG_ITEMS = [
  { label: "Docs", value: "docs" },
  { label: "Priority", value: "priority" },
  { label: "Launch", value: "launch" },
];

const RADIO_ITEMS = [
  { label: "Team", value: "team", description: "For shared workflows and planning." },
  { label: "Personal", value: "personal", description: "For solo work and experiments." },
  { label: "Archive", value: "archive", description: "Read-only historical state." },
];

const TABS_ITEMS = [
  { label: "Overview", value: "overview" },
  { label: "Specs", value: "specs" },
  { label: "Logs", value: "logs" },
];

const ACCORDION_ITEMS = [
  { label: "Setup", value: "setup", content: "Create state in init, then update it from onAction." },
  { label: "Styling", value: "styling", content: "Use class names for visual control and layout utilities." },
  { label: "Runtime", value: "runtime", content: "Call host capabilities from event handlers, not from render." },
];

const TABLE_COLUMNS = [
  { key: "name", label: "Name", sortable: true },
  { key: "type", label: "Type", sortable: true },
  { key: "updatedAt", label: "Updated", sortable: true },
];

const TABLE_ROWS = [
  { id: "1", name: "main.tsx", type: "TSX", updatedAt: "2026-04-08" },
  { id: "2", name: "layout.tsx", type: "TSX", updatedAt: "2026-04-07" },
  { id: "3", name: "notes.md", type: "MD", updatedAt: "2026-04-05" },
];

const LAYOUT_PROPS_ROWS = [
  { id: "children", prop: "children", type: "UINode[]", default: "[]", description: "Renders nested applet nodes." },
  { id: "class", prop: "class", type: "string", default: "-", description: "Applies utility classes directly on the layout container." },
  { id: "gap", prop: "gap", type: "number | string", default: "-", description: "Controls spacing between child nodes." },
  { id: "justify", prop: "justify", type: "layout alignment", default: "start", description: "Controls alignment on the main axis." },
  { id: "align", prop: "align", type: "layout alignment", default: "start", description: "Controls alignment on the cross axis." },
  { id: "wrap", prop: "wrap", type: "boolean", default: "false", description: "Allows children to wrap when space is limited." },
  { id: "overflow", prop: "overflow", type: "auto | hidden", default: "-", description: "Explicitly enables scrolling or clipping." },
  { id: "onClick", prop: "onClick", type: "Action", default: "-", description: "Makes the whole layout surface clickable." },
];

const LAYOUT_EVENT_ROWS = [
  { id: "onClick", event: "onClick", payload: "No extra payload", description: "Dispatches the configured action when the full layout surface is clicked." },
];

function renderDocPage(ctx: ExamplesDocsCtx, config: ComponentDocConfig): UINode {
  const ui = ctx.ui;

  return (
    <ui.View class="flex flex-col gap-5">
      <ui.View class="shrink-0 flex flex-col gap-3 rounded-[24px] border border-default bg-[linear-gradient(135deg,rgba(13,148,136,0.10),rgba(255,255,255,0.96))] p-5">
        <ui.Row class="items-center gap-2" wrap>
          <ui.Badge label="Component" variant="soft" color="info" />
          <ui.Badge label="Ready" variant="soft" color="success" />
        </ui.Row>
        <ui.View class="flex flex-col gap-1">
          <ui.Text value={config.title} size="xl" bold />
          <ui.Text value={config.description} size="sm" color="muted" />
        </ui.View>
      </ui.View>

      <ui.View class="shrink-0 flex flex-col gap-3">
        <ui.Text value="Demo" size="lg" bold />
        <ui.Text value={config.demoIntro} size="sm" color="muted" />
        {config.demo(ctx)}
      </ui.View>

      <ui.View class="shrink-0 flex flex-col gap-3">
        <ui.Text value="Source" size="lg" bold />
        <ui.Text value="The code below matches the demo above and can be used as a starting point." size="sm" color="muted" />
        <ui.Markdown value={`\`\`\`tsx\n${config.source}\n\`\`\``} />
      </ui.View>

      <ui.View class="shrink-0 flex flex-col gap-3">
        <ui.Text value="API" size="lg" bold />
        <ui.View class="flex flex-col gap-3 rounded-[20px] border border-default bg-white/70 p-4">
          <ui.Text value="Props" size="sm" bold />
          <ui.Table columns={DOC_PROPS_COLUMNS} rows={config.propsRows} rowKey="id" />
        </ui.View>
        {config.eventRows && config.eventRows.length > 0 ? (
          <ui.View class="flex flex-col gap-3 rounded-[20px] border border-default bg-white/70 p-4">
            <ui.Text value="Events" size="sm" bold />
            <ui.Table columns={DOC_EVENT_COLUMNS} rows={config.eventRows} rowKey="id" />
          </ui.View>
        ) : null}
      </ui.View>

      <ui.View class="shrink-0 flex flex-col gap-3">
        <ui.Text value="Notes" size="lg" bold />
        <ui.Markdown value={config.notes.map((item) => `- ${item}`).join("\n")} />
      </ui.View>
    </ui.View>
  );
}

function viewDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const clickCount = asNumber(ctx.state.demoClickCount, 0);
  return {
    title: "View",
    description:
      "View is the most general-purpose container node. It does not express horizontal or vertical layout semantics by itself. Its job is to carry background, border, radius, shadow, overflow, and whole-surface click behavior.",
    demoIntro: "This single example combines styling, grouping, nested content, and whole-surface interaction in one View.",
    source: [
      "<ui.View",
      "  class=\"rounded-[28px] border border-info/20 bg-[linear-gradient(135deg,rgba(13,148,136,0.16),rgba(255,255,255,0.96))] p-5 shadow-lg\"",
      "  onClick={{ type: \"demoViewClick\" }}",
      ">",
      "  <ui.View class=\"flex flex-col gap-4\">",
      "    <ui.Row class=\"items-start justify-between gap-3\" wrap>",
      "      <ui.View class=\"flex flex-col gap-1\">",
      "        <ui.Text value=\"Project Workspace\" size=\"lg\" bold />",
      "        <ui.Text",
      "          value=\"This single View acts as a styled surface, wraps nested content, and handles whole-card click interaction.\"",
      "          size=\"sm\"",
      "          color=\"muted\"",
      "        />",
      "      </ui.View>",
      "      <ui.Badge label={`Clicked ${String(clickCount)} times`} color=\"info\" variant=\"soft\" />",
      "    </ui.Row>",
      "    <ui.Row class=\"gap-3\" wrap>",
      "      <ui.View class=\"min-w-[150px] flex-1 rounded-2xl bg-white/78 p-4\">...</ui.View>",
      "      <ui.View class=\"min-w-[150px] flex-1 rounded-2xl border border-dashed border-default bg-white/56 p-4\">...</ui.View>",
      "      <ui.View class=\"min-w-[150px] flex-1 rounded-2xl bg-[rgba(15,23,42,0.06)] p-4\">...</ui.View>",
      "    </ui.Row>",
      "  </ui.View>",
      "</ui.View>",
    ].join("\n"),
    propsRows: [
      { id: "children", prop: "children", type: "UINode[]", default: "[]", description: "Renders nested applet nodes inside the container." },
      { id: "class", prop: "class", type: "string", default: "-", description: "Pass classes directly to the container, typically with Tailwind utilities." },
      { id: "padding", prop: "padding", type: "number | string | array", default: "-", description: "Controls internal spacing without adding another wrapper." },
      { id: "bgColor", prop: "bgColor", type: "default | transparent | success | info | warning | error", default: "default", description: "Applies a host theme background color to the container." },
      { id: "border", prop: "border", type: "none | solid | dashed | dotted", default: "none", description: "Defines the border style for the container." },
      { id: "rounded", prop: "rounded", type: "none | sm | md | lg | xl", default: "none", description: "Controls the corner radius." },
      { id: "shadow", prop: "shadow", type: "none | sm | md | lg | xl", default: "none", description: "Controls the shadow elevation." },
      { id: "overflow", prop: "overflow", type: "auto | hidden", default: "-", description: "Explicitly controls clipping or scrolling when content overflows." },
      { id: "onClick", prop: "onClick", type: "Action", default: "-", description: "Turns the full container into a clickable interaction surface." },
    ],
    eventRows: [
      { id: "onClick", event: "onClick", payload: "No extra payload", description: "Dispatches the configured action when the whole View surface is clicked." },
    ],
    notes: [
      "Use View when one container should own styling, grouping, and optional click behavior.",
      "Prefer Row or Col when the main purpose is layout semantics rather than presentation.",
      "overflow is explicit. Add it only when this View should become a scroll or clip container.",
      "onClick dispatches the configured action without adding extra payload.",
    ],
    demo: () => (
      <ctx.ui.View
        class="rounded-[28px] border border-info/20 bg-[linear-gradient(135deg,rgba(13,148,136,0.16),rgba(255,255,255,0.96))] p-5 shadow-lg"
        onClick={{ type: "demoViewClick" }}
      >
        <ctx.ui.View class="flex flex-col gap-4">
          <ctx.ui.Row class="items-start justify-between gap-3" wrap>
            <ctx.ui.View class="flex flex-col gap-1">
              <ctx.ui.Text value="Project Workspace" size="lg" bold />
              <ctx.ui.Text
                value="This single View acts as a styled surface, wraps nested content, and handles whole-card click interaction."
                size="sm"
                color="muted"
              />
            </ctx.ui.View>
            <ctx.ui.Badge label={`Clicked ${String(clickCount)} times`} color="info" variant="soft" />
          </ctx.ui.Row>
          <ctx.ui.Row class="gap-3" wrap>
            <ctx.ui.View class="min-w-[150px] flex-1 rounded-2xl bg-white/78 p-4">
              <ctx.ui.View class="flex flex-col gap-1">
                <ctx.ui.Text value="Surface" size="sm" color="muted" />
                <ctx.ui.Text value="Owns background, border, radius, and shadow." bold />
              </ctx.ui.View>
            </ctx.ui.View>
            <ctx.ui.View class="min-w-[150px] flex-1 rounded-2xl border border-dashed border-default bg-white/56 p-4">
              <ctx.ui.View class="flex flex-col gap-1">
                <ctx.ui.Text value="Grouping" size="sm" color="muted" />
                <ctx.ui.Text value="Collects related content into one visual block." bold />
              </ctx.ui.View>
            </ctx.ui.View>
            <ctx.ui.View class="min-w-[150px] flex-1 rounded-2xl bg-[rgba(15,23,42,0.06)] p-4">
              <ctx.ui.View class="flex flex-col gap-1">
                <ctx.ui.Text value="Interaction" size="sm" color="muted" />
                <ctx.ui.Text value="Turns the whole area into a single clickable target." bold />
              </ctx.ui.View>
            </ctx.ui.View>
          </ctx.ui.Row>
          <ctx.ui.Text value="Click anywhere inside this demo card to trigger the documented onClick behavior." size="sm" color="muted" />
          <ctx.ui.Text value={asString(ctx.state.lastToastMessage)} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function rowDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  return {
    title: "Row",
    description: "Row arranges child nodes horizontally. Use it when horizontal flow is the main intent, optionally with wrapping and alignment controls.",
    demoIntro: "This example uses one Row to build a toolbar-like strip with badges, actions, and responsive wrapping.",
    source: [
      "<ui.Row class=\"items-center justify-between gap-3 rounded-3xl border border-default bg-white/80 p-4\" wrap>",
      "  <ui.Row class=\"items-center gap-2\" wrap>",
      "    <ui.Badge label=\"Ready\" color=\"success\" variant=\"soft\" />",
      "    <ui.Badge label=\"Design review\" color=\"info\" variant=\"soft\" />",
      "    <ui.Text value=\"Horizontal grouping stays readable as content grows.\" size=\"sm\" color=\"muted\" />",
      "  </ui.Row>",
      "  <ui.Row class=\"gap-2\" wrap>",
      "    <ui.Button text=\"Share\" variant=\"soft\" />",
      "    <ui.Button text=\"Open\" />",
      "  </ui.Row>",
      "</ui.Row>",
    ].join("\n"),
    propsRows: LAYOUT_PROPS_ROWS,
    eventRows: LAYOUT_EVENT_ROWS,
    notes: [
      "Use Row when horizontal ordering matters more than decoration.",
      "Enable wrap when the number of children can exceed the available width.",
      "Use nested Rows to group related actions without losing the larger horizontal structure.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-[rgba(255,255,255,0.82)] p-5 shadow-sm">
        <ctx.ui.Row class="items-center justify-between gap-3 rounded-3xl border border-default bg-white/80 p-4" wrap>
          <ctx.ui.Row class="items-center gap-2" wrap>
            <ctx.ui.Badge label="Ready" color="success" variant="soft" />
            <ctx.ui.Badge label="Design review" color="info" variant="soft" />
            <ctx.ui.Text value="Horizontal grouping stays readable as content grows." size="sm" color="muted" />
          </ctx.ui.Row>
          <ctx.ui.Row class="gap-2" wrap>
            <ctx.ui.Button text="Share" variant="soft" />
            <ctx.ui.Button text="Open" />
          </ctx.ui.Row>
        </ctx.ui.Row>
      </ctx.ui.View>
    ),
  };
}

function colDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  return {
    title: "Col",
    description: "Col arranges child nodes vertically. Use it for stacked sections, cards, and flows where top-to-bottom reading order matters.",
    demoIntro: "This example uses one Col to build a compact project summary card with clearly stacked content.",
    source: [
      "<ui.Col class=\"gap-4 rounded-3xl border border-default bg-white/82 p-5 shadow-sm\">",
      "  <ui.Text value=\"Project Summary\" size=\"lg\" bold />",
      "  <ui.Text value=\"Col keeps content in a predictable vertical reading order.\" size=\"sm\" color=\"muted\" />",
      "  <ui.Separator label=\"Milestones\" />",
      "  <ui.Col class=\"gap-2\">",
      "    <ui.Badge label=\"Docs ready\" color=\"success\" variant=\"soft\" />",
      "    <ui.Badge label=\"QA pending\" color=\"warning\" variant=\"soft\" />",
      "  </ui.Col>",
      "</ui.Col>",
    ].join("\n"),
    propsRows: LAYOUT_PROPS_ROWS,
    eventRows: LAYOUT_EVENT_ROWS,
    notes: [
      "Use Col for vertically stacked sections, especially inside cards and side panels.",
      "Nested Col containers are often clearer than adding many margin classes to individual items.",
      "Use Row inside Col when one subsection needs a horizontal arrangement.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-[rgba(255,255,255,0.82)] p-5">
        <ctx.ui.Col class="gap-4 rounded-3xl border border-default bg-white/82 p-5 shadow-sm">
          <ctx.ui.Text value="Project Summary" size="lg" bold />
          <ctx.ui.Text value="Col keeps content in a predictable vertical reading order." size="sm" color="muted" />
          <ctx.ui.Separator label="Milestones" />
          <ctx.ui.Col class="gap-2">
            <ctx.ui.Badge label="Docs ready" color="success" variant="soft" />
            <ctx.ui.Badge label="QA pending" color="warning" variant="soft" />
            <ctx.ui.Badge label="Launch approved" color="info" variant="soft" />
          </ctx.ui.Col>
        </ctx.ui.Col>
      </ctx.ui.View>
    ),
  };
}

function textDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  return {
    title: "Text",
    description: "Text renders plain strings with size, color, and emphasis controls. It is the basic typography primitive in applet UI.",
    demoIntro: "This example uses one content block to show heading, helper text, inline emphasis, and status copy.",
    source: [
      "<ui.View class=\"rounded-3xl border border-default bg-white/82 p-5\">",
      "  <ui.Text value=\"Design Notes\" size=\"xl\" bold />",
      "  <ui.Text value=\"Use Text for UI copy, labels, helper copy, and emphasized values.\" size=\"sm\" color=\"muted\" />",
      "  <ui.Text value=\"Critical paths should stay readable even in condensed layouts.\" />",
      "  <ui.Text value=\"Muted support text\" size=\"sm\" color=\"muted\" />",
      "  <ui.Text value=\"Reviewed\" size=\"sm\" color=\"success\" bold underline />",
      "</ui.View>",
    ].join("\n"),
    propsRows: [
      { id: "value", prop: "value", type: "string", default: '""', description: "The text content to render." },
      { id: "size", prop: "size", type: "xs | sm | md | lg | xl", default: "md", description: "Controls the visual text size." },
      { id: "color", prop: "color", type: "default | muted | success | info | warning | error", default: "default", description: "Applies semantic text color." },
      { id: "bold", prop: "bold", type: "boolean", default: "false", description: "Renders bold text." },
      { id: "italic", prop: "italic", type: "boolean", default: "false", description: "Renders italic text." },
      { id: "underline", prop: "underline", type: "boolean", default: "false", description: "Adds underline decoration." },
      { id: "lineClamp", prop: "lineClamp", type: "number", default: "-", description: "Limits the number of visible text lines." },
    ],
    notes: [
      "Use Text for UI copy and simple content, not for rich markdown-like formatting.",
      "Use color sparingly so semantic colors still stand out where they matter.",
      "lineClamp is useful in cards and compact list items.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-2">
          <ctx.ui.Text value="Design Notes" size="xl" bold />
          <ctx.ui.Text value="Use Text for UI copy, labels, helper copy, and emphasized values." size="sm" color="muted" />
          <ctx.ui.Text value="Critical paths should stay readable even in condensed layouts." />
          <ctx.ui.Text value="Muted support text" size="sm" color="muted" />
          <ctx.ui.Text value="Reviewed" size="sm" color="success" bold underline />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function markdownDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const markdown = [
    "## Release Notes",
    "",
    "- Supports **lists**, `inline code`, and headings",
    "- Keeps docs content readable inside applets",
    "",
    "```ts",
    "const ready = true;",
    "```",
  ].join("\n");
  return {
    title: "Markdown",
    description: "Markdown renders formatted content from a string. It is useful for generated text, documentation, and structured notes.",
    demoIntro: "This example shows one markdown document with headings, emphasis, lists, and a code block.",
    source: [
      "<ui.Markdown",
      "  value={`## Release Notes\\n\\n- Supports **lists**, \\`inline code\\`, and headings\\n- Keeps docs content readable inside applets\\n\\n\\`\\`\\`ts\\nconst ready = true;\\n\\`\\`\\``}",
      "/>",
    ].join("\n"),
    propsRows: [
      { id: "value", prop: "value", type: "string", default: '""', description: "The markdown source to render." },
      { id: "class", prop: "class", type: "string", default: "-", description: "Applies classes to the markdown block wrapper." },
    ],
    notes: [
      "Use Markdown for formatted content, generated summaries, and user-facing rich text.",
      "Keep the source string clean and predictable if it comes from a model.",
      "Use Text instead when the content is simple and does not need formatting.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.Markdown value={markdown} />
      </ctx.ui.View>
    ),
  };
}

function badgeDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  return {
    title: "Badge",
    description: "Badge renders compact labels for status, metadata, and tags. It works well in dense surfaces where full alerts would be too heavy.",
    demoIntro: "This example shows one metadata strip with several semantic badges used inside a project card.",
    source: [
      "<ui.Row class=\"gap-2\" wrap>",
      "  <ui.Badge label=\"Ready\" color=\"success\" variant=\"soft\" />",
      "  <ui.Badge label=\"Needs review\" color=\"warning\" variant=\"soft\" />",
      "  <ui.Badge label=\"Launch\" color=\"info\" variant=\"soft\" />",
      "</ui.Row>",
    ].join("\n"),
    propsRows: [
      { id: "label", prop: "label", type: "string", default: '""', description: "The text content shown inside the badge." },
      { id: "color", prop: "color", type: "semantic color", default: "neutral", description: "Applies semantic color styling." },
      { id: "variant", prop: "variant", type: "solid | outline | soft | subtle", default: "solid", description: "Controls the visual emphasis style." },
      { id: "size", prop: "size", type: "xs | sm | md | lg | xl", default: "md", description: "Controls badge size." },
      { id: "icon", prop: "icon", type: "string", default: "-", description: "Renders an icon inside the badge." },
    ],
    notes: [
      "Badges are best for concise metadata like status, type, or category.",
      "Use Alert for fuller feedback that needs a title and description.",
      "Prefer short labels so badges stay compact.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Text value="Metadata Strip" size="lg" bold />
          <ctx.ui.Row class="gap-2" wrap>
            <ctx.ui.Badge label="Ready" color="success" variant="soft" />
            <ctx.ui.Badge label="Needs review" color="warning" variant="soft" />
            <ctx.ui.Badge label="Launch" color="info" variant="soft" />
            <ctx.ui.Badge label="v1.2" variant="outline" />
          </ctx.ui.Row>
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function alertDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  return {
    title: "Alert",
    description: "Alert is for inline status messaging with a title, description, icon, and semantic emphasis.",
    demoIntro: "This example uses one alert stack to show different message weights in the same workflow context.",
    source: [
      "<ui.Col class=\"gap-3\">",
      "  <ui.Alert title=\"Sync completed\" description=\"All design files are up to date.\" icon=\"check-circle-2\" color=\"success\" variant=\"soft\" />",
      "  <ui.Alert title=\"Review pending\" description=\"Two screens still need approval.\" icon=\"triangle-alert\" color=\"warning\" variant=\"soft\" />",
      "</ui.Col>",
    ].join("\n"),
    propsRows: [
      { id: "title", prop: "title", type: "string", default: "-", description: "Optional alert title." },
      { id: "description", prop: "description", type: "string", default: "-", description: "Optional supporting description." },
      { id: "icon", prop: "icon", type: "string", default: "-", description: "Semantic icon to render with the alert." },
      { id: "color", prop: "color", type: "semantic color", default: "neutral", description: "Applies alert tone." },
      { id: "variant", prop: "variant", type: "solid | outline | soft | subtle", default: "soft", description: "Controls the visual emphasis level." },
    ],
    notes: [
      "Alert is stronger than Badge and lighter than a Modal.",
      "Use a clear title first, then keep the description short and actionable.",
      "Choose color based on semantics, not decoration.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.Col class="gap-3">
          <ctx.ui.Alert title="Sync completed" description="All design files are up to date." icon="check-circle-2" color="success" variant="soft" />
          <ctx.ui.Alert title="Review pending" description="Two screens still need approval." icon="triangle-alert" color="warning" variant="soft" />
          <ctx.ui.Alert title="Release blocked" description="One dependency is still unresolved." icon="circle-alert" color="error" variant="outline" />
        </ctx.ui.Col>
      </ctx.ui.View>
    ),
  };
}

function iconDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  return {
    title: "Icon",
    description: "Icon renders a standalone icon. Use it when an icon needs to appear inside custom compositions rather than inside another component prop.",
    demoIntro: "This example uses several icons as visual anchors inside one compact control strip.",
    source: [
      "<ui.Row class=\"items-center gap-4\">",
      "  <ui.Icon name=\"sparkles\" size={18} />",
      "  <ui.Icon name=\"calendar\" size={18} />",
      "  <ui.Icon name=\"panel-top\" size={18} />",
      "</ui.Row>",
    ].join("\n"),
    propsRows: [
      { id: "name", prop: "name", type: "string", default: '""', description: "The icon identifier to render." },
      { id: "size", prop: "size", type: "number | string", default: "-", description: "Controls the rendered icon size." },
      { id: "class", prop: "class", type: "string", default: "-", description: "Applies utility classes directly to the icon." },
    ],
    notes: [
      "Use Icon when no higher-level component already accepts an icon prop.",
      "Keep icon choices semantically meaningful and visually consistent.",
      "Prefer adjacent text labels when the icon meaning is not obvious.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.Row class="items-center gap-4">
          <ctx.ui.Icon name="sparkles" size={18} />
          <ctx.ui.Icon name="calendar" size={18} />
          <ctx.ui.Icon name="panel-top" size={18} />
          <ctx.ui.Icon name="table-2" size={18} />
        </ctx.ui.Row>
      </ctx.ui.View>
    ),
  };
}

function imageDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  return {
    title: "Image",
    description: "Image renders a remote URL or data URI. It is useful for previews, illustrations, and generated media results.",
    demoIntro: "This example shows one image used as a visual header inside a simple content card.",
    source: [
      "<ui.Image src={DEMO_IMAGE} alt=\"Visual preview\" class=\"w-full rounded-3xl\" />",
    ].join("\n"),
    propsRows: [
      { id: "src", prop: "src", type: "string", default: '""', description: "The image source URL or data URI." },
      { id: "alt", prop: "alt", type: "string", default: "-", description: "Optional alt text for the image." },
      { id: "class", prop: "class", type: "string", default: "-", description: "Applies layout and visual classes to the image element." },
    ],
    notes: [
      "Use Image for previews and generated assets, not for decorative backgrounds that belong in CSS.",
      "Add alt text when the image carries useful information.",
      "Control the final size with class utilities rather than pre-scaling the asset externally.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Image src={DEMO_IMAGE} alt="Visual preview" class="w-full rounded-3xl" />
          <ctx.ui.Text value="Image works well for previews and hero-like surfaces inside docs and generated flows." size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function separatorDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  return {
    title: "Separator",
    description: "Separator visually divides sections, optionally with a label and icon. It keeps dense layouts easier to scan.",
    demoIntro: "This example splits one settings card into clear subsections without introducing extra containers.",
    source: [
      "<ui.Separator label=\"Preferences\" icon=\"panel-top\" />",
    ].join("\n"),
    propsRows: [
      { id: "label", prop: "label", type: "string", default: "-", description: "Optional label shown alongside the separator line." },
      { id: "icon", prop: "icon", type: "string", default: "-", description: "Optional icon displayed with the label." },
      { id: "color", prop: "color", type: "semantic color", default: "neutral", description: "Controls separator accent color." },
      { id: "type", prop: "type", type: "solid | dashed | dotted", default: "solid", description: "Controls the line style." },
      { id: "orientation", prop: "orientation", type: "horizontal | vertical", default: "horizontal", description: "Controls direction." },
    ],
    notes: [
      "Separator is best for scanning and grouping, not for adding strong emphasis.",
      "Use labels when sections need quick identification.",
      "Prefer one separator between sections rather than one after every row.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-4">
          <ctx.ui.Text value="Workspace Settings" size="lg" bold />
          <ctx.ui.Separator label="Preferences" icon="panel-top" />
          <ctx.ui.Text value="Theme, density, and default behavior live in this section." size="sm" color="muted" />
          <ctx.ui.Separator label="Access" type="dashed" />
          <ctx.ui.Text value="Roles, permissions, and linked services live here." size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function progressDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const progressValue = asNumber(ctx.state.progressValue, 0);
  return {
    title: "Progress",
    description: "Progress shows completion state or activity level. It works best when users need feedback on advancing tasks.",
    demoIntro: "This example pairs one Progress bar with controls so the state change is immediately visible.",
    source: [
      "<ui.Progress value={progressValue} max={100} />",
      "<ui.Row class=\"gap-2\">",
      "  <ui.Button text=\"-10\" size=\"sm\" variant=\"outline\" onClick={{ type: \"demoProgressAdjust\", delta: -10 }} />",
      "  <ui.Button text=\"+10\" size=\"sm\" variant=\"soft\" onClick={{ type: \"demoProgressAdjust\", delta: 10 }} />",
      "</ui.Row>",
    ].join("\n"),
    propsRows: [
      { id: "value", prop: "value", type: "number", default: "-", description: "Current progress value." },
      { id: "max", prop: "max", type: "number", default: "-", description: "Upper bound for the progress range." },
      { id: "color", prop: "color", type: "semantic color", default: "neutral", description: "Progress accent color." },
      { id: "size", prop: "size", type: "2xs | xs | sm | md | lg | xl | 2xl", default: "md", description: "Controls thickness." },
      { id: "orientation", prop: "orientation", type: "horizontal | vertical", default: "horizontal", description: "Controls progress direction." },
    ],
    notes: [
      "Use Progress when change over time matters, not just a static number.",
      "Pair it with text or actions when users need context.",
      "Keep the range obvious so the visual state is easy to interpret.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Text value={`Completion: ${String(progressValue)}%`} size="lg" bold />
          <ctx.ui.Progress value={progressValue} max={100} color="info" />
          <ctx.ui.Row class="gap-2">
            <ctx.ui.Button text="-10" size="sm" variant="outline" onClick={{ type: "demoProgressAdjust", delta: -10 }} />
            <ctx.ui.Button text="+10" size="sm" variant="soft" onClick={{ type: "demoProgressAdjust", delta: 10 }} />
          </ctx.ui.Row>
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function buttonDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const count = asNumber(ctx.state.buttonClickCount, 0);
  return {
    title: "Button",
    description: "Button is the primary action trigger. It supports variants, icons, size, loading, and disabled states.",
    demoIntro: "This example uses one action cluster to show a primary button, supporting actions, and a click-driven counter.",
    source: [
      "<ui.Row class=\"items-center gap-3\" wrap>",
      "  <ui.Button text={`Publish (${String(buttonClickCount)})`} onClick={{ type: \"demoButtonClick\" }} />",
      "  <ui.Button text=\"Preview\" variant=\"soft\" />",
      "  <ui.Button text=\"Archive\" variant=\"outline\" color=\"warning\" />",
      "</ui.Row>",
    ].join("\n"),
    propsRows: [
      { id: "text", prop: "text", type: "string", default: '""', description: "Button label text." },
      { id: "variant", prop: "variant", type: "solid | outline | soft | subtle | ghost | link", default: "solid", description: "Controls visual emphasis." },
      { id: "color", prop: "color", type: "default | primary | secondary | neutral | success | info | warning | error", default: "default", description: "Controls semantic tone." },
      { id: "size", prop: "size", type: "xs | sm | md | lg | xl", default: "md", description: "Controls button size." },
      { id: "loading", prop: "loading", type: "boolean", default: "false", description: "Shows a loading state." },
      { id: "disabled", prop: "disabled", type: "boolean", default: "false", description: "Disables interaction." },
      { id: "icon", prop: "icon", type: "string", default: "-", description: "Renders an icon with the button." },
      { id: "onClick", prop: "onClick", type: "Action", default: "-", description: "Dispatches an action when clicked." },
    ],
    eventRows: [
      { id: "onClick", event: "onClick", payload: "No extra payload", description: "Dispatches the configured action when the button is clicked." },
    ],
    notes: [
      "Use Button for explicit user actions, not passive labels.",
      "Reserve the strongest variant for the primary action in a group.",
      "Use loading and disabled states when the system needs to signal action state clearly.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Row class="items-center gap-3" wrap>
            <ctx.ui.Button text={`Publish (${String(count)})`} onClick={{ type: "demoButtonClick" }} />
            <ctx.ui.Button text="Preview" variant="soft" />
            <ctx.ui.Button text="Archive" variant="outline" color="warning" />
          </ctx.ui.Row>
          <ctx.ui.Text value={asString(ctx.state.lastToastMessage) || "Click Publish to see the action result."} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function inputDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const value = asString(ctx.state.inputValue);
  return {
    title: "Input",
    description: "Input is the single-line text field. Use it for short values such as search, titles, IDs, or compact numeric input.",
    demoIntro: "This example uses one search-like field and mirrors the current value below it.",
    source: [
      "<ui.Input",
      "  value={inputValue}",
      "  placeholder=\"Search projects\"",
      "  icon=\"search\"",
      "  block",
      "  onChange={{ type: \"demoSetField\", key: \"inputValue\" }}",
      "/>",
    ].join("\n"),
    propsRows: [
      { id: "value", prop: "value", type: "string", default: '""', description: "Current input value." },
      { id: "placeholder", prop: "placeholder", type: "string", default: "-", description: "Placeholder text." },
      { id: "type", prop: "type", type: "text | number | password | search | email | url | tel", default: "text", description: "Underlying input type." },
      { id: "icon", prop: "icon", type: "string", default: "-", description: "Inline leading icon." },
      { id: "block", prop: "block", type: "boolean", default: "false", description: "Expands the input to full width." },
      { id: "readonly", prop: "readonly", type: "boolean", default: "false", description: "Makes the input read-only." },
      { id: "disabled", prop: "disabled", type: "boolean", default: "false", description: "Disables interaction." },
      { id: "onChange", prop: "onChange", type: "Action", default: "-", description: "Receives updates while the value changes." },
      { id: "onBlur", prop: "onBlur", type: "Action", default: "-", description: "Runs when focus leaves the input." },
    ],
    eventRows: [
      { id: "onChange", event: "onChange", payload: "{ value: string }", description: "Fires when the value changes." },
      { id: "onBlur", event: "onBlur", payload: "{ value: string }", description: "Fires when the input loses focus." },
    ],
    notes: [
      "Use Input for short values. Use Textarea when the content can span multiple lines.",
      "Prefer placeholder for hints, not for essential instructions.",
      "Mirror state elsewhere when users need confirmation or derived output.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Input
            value={value}
            placeholder="Search projects"
            icon="search"
            block
            onChange={{ type: "demoSetField", key: "inputValue" }}
          />
          <ctx.ui.Text value={`Current value: ${value || "empty"}`} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function textareaDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const value = asString(ctx.state.textareaValue);
  return {
    title: "Textarea",
    description: "Textarea is the multi-line text input. Use it for notes, prompts, descriptions, and other longer text.",
    demoIntro: "This example uses one Textarea with a live summary below it.",
    source: [
      "<ui.Textarea",
      "  value={textareaValue}",
      "  placeholder=\"Write a release summary\"",
      "  rows={5}",
      "  block",
      "  onChange={{ type: \"demoSetField\", key: \"textareaValue\" }}",
      "/>",
    ].join("\n"),
    propsRows: [
      { id: "value", prop: "value", type: "string", default: '""', description: "Current textarea value." },
      { id: "placeholder", prop: "placeholder", type: "string", default: "-", description: "Placeholder text." },
      { id: "rows", prop: "rows", type: "number", default: "4", description: "Initial visible rows." },
      { id: "autoresize", prop: "autoresize", type: "boolean", default: "false", description: "Allows auto-resizing height." },
      { id: "block", prop: "block", type: "boolean", default: "false", description: "Expands to full width." },
      { id: "disabled", prop: "disabled", type: "boolean", default: "false", description: "Disables interaction." },
      { id: "onChange", prop: "onChange", type: "Action", default: "-", description: "Receives updates while the value changes." },
      { id: "onBlur", prop: "onBlur", type: "Action", default: "-", description: "Runs when focus leaves the textarea." },
    ],
    eventRows: [
      { id: "onChange", event: "onChange", payload: "{ value: string }", description: "Fires when the value changes." },
      { id: "onBlur", event: "onBlur", payload: "{ value: string }", description: "Fires when the textarea loses focus." },
    ],
    notes: [
      "Textarea is for larger text entry, not compact metadata.",
      "Use rows for predictable initial height.",
      "Summaries or counters below the field help users understand what they entered.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Textarea
            value={value}
            placeholder="Write a release summary"
            rows={5}
            block
            onChange={{ type: "demoSetField", key: "textareaValue" }}
          />
          <ctx.ui.Text value={`Characters: ${String(value.length)}`} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function switchDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const checked = asBool(ctx.state.switchValue);
  return {
    title: "Switch",
    description: "Switch controls a boolean state with a single toggle. Use it for settings and mode toggles.",
    demoIntro: "This example uses one switch to control an autosave setting and mirrors the result below it.",
    source: [
      "<ui.Switch",
      "  label=\"Enable autosave\"",
      "  description=\"Save changes every time the form updates\"",
      "  checked={switchValue}",
      "  onChange={{ type: \"demoSetField\", key: \"switchValue\" }}",
      "/>",
    ].join("\n"),
    propsRows: [
      { id: "checked", prop: "checked", type: "boolean", default: "false", description: "Current checked state." },
      { id: "label", prop: "label", type: "string", default: "-", description: "Primary label text." },
      { id: "description", prop: "description", type: "string", default: "-", description: "Secondary helper text." },
      { id: "color", prop: "color", type: "semantic color", default: "neutral", description: "Visual accent color." },
      { id: "disabled", prop: "disabled", type: "boolean", default: "false", description: "Disables the control." },
      { id: "onChange", prop: "onChange", type: "Action", default: "-", description: "Receives toggle updates." },
    ],
    eventRows: [
      { id: "onChange", event: "onChange", payload: "{ value: boolean }", description: "Fires when the switch value changes." },
    ],
    notes: [
      "Use Switch for immediate binary settings, not for multi-choice inputs.",
      "The label should clearly describe the enabled state.",
      "Mirror the active state somewhere nearby when the effect is important.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Switch
            label="Enable autosave"
            description="Save changes every time the form updates"
            checked={checked}
            onChange={{ type: "demoSetField", key: "switchValue" }}
          />
          <ctx.ui.Text value={`Autosave is ${checked ? "enabled" : "disabled"}.`} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function checkboxDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const checked = asBool(ctx.state.checkboxValue);
  return {
    title: "Checkbox",
    description: "Checkbox controls a boolean state but is visually better suited to confirmations and list-style selection.",
    demoIntro: "This example uses one checkbox as a lightweight confirmation control before publishing.",
    source: [
      "<ui.Checkbox",
      "  label=\"I reviewed the release notes\"",
      "  description=\"Publishing will notify the whole workspace\"",
      "  checked={checkboxValue}",
      "  onChange={{ type: \"demoSetField\", key: \"checkboxValue\" }}",
      "/>",
    ].join("\n"),
    propsRows: [
      { id: "checked", prop: "checked", type: "boolean", default: "false", description: "Current checked state." },
      { id: "label", prop: "label", type: "string", default: "-", description: "Primary label text." },
      { id: "description", prop: "description", type: "string", default: "-", description: "Secondary helper text." },
      { id: "variant", prop: "variant", type: "card | list", default: "list", description: "Controls visual style." },
      { id: "indicator", prop: "indicator", type: "start | end | hidden", default: "-", description: "Controls indicator placement." },
      { id: "disabled", prop: "disabled", type: "boolean", default: "false", description: "Disables the checkbox." },
      { id: "onChange", prop: "onChange", type: "Action", default: "-", description: "Receives checked state updates." },
    ],
    eventRows: [
      { id: "onChange", event: "onChange", payload: "{ value: boolean }", description: "Fires when the checkbox value changes." },
    ],
    notes: [
      "Use Checkbox for confirmations and list selection, especially when the label carries more context.",
      "Choose Switch instead when the control feels like a live setting.",
      "Descriptions are especially useful when a confirmation has consequences.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Checkbox
            label="I reviewed the release notes"
            description="Publishing will notify the whole workspace"
            checked={checked}
            onChange={{ type: "demoSetField", key: "checkboxValue" }}
          />
          <ctx.ui.Text value={checked ? "Ready to publish." : "Review is still pending."} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function radioDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const value = asString(ctx.state.radioValue);
  return {
    title: "RadioGroup",
    description: "RadioGroup lets users choose exactly one option from a known set. It is suited to mode or profile selection.",
    demoIntro: "This example uses one RadioGroup to choose a workspace mode and mirrors the current choice below it.",
    source: [
      "<ui.RadioGroup",
      "  legend=\"Workspace mode\"",
      "  value={radioValue}",
      "  items={RADIO_ITEMS}",
      "  onChange={{ type: \"demoSetField\", key: \"radioValue\" }}",
      "/>",
    ].join("\n"),
    propsRows: [
      { id: "value", prop: "value", type: "string", default: "-", description: "Current selected value." },
      { id: "legend", prop: "legend", type: "string", default: "-", description: "Optional fieldset legend." },
      { id: "items", prop: "items", type: "RadioItem[]", default: "[]", description: "The available radio choices." },
      { id: "variant", prop: "variant", type: "card | list | table", default: "list", description: "Controls the visual presentation." },
      { id: "orientation", prop: "orientation", type: "horizontal | vertical", default: "vertical", description: "Controls axis layout." },
      { id: "disabled", prop: "disabled", type: "boolean", default: "false", description: "Disables interaction." },
      { id: "onChange", prop: "onChange", type: "Action", default: "-", description: "Receives selection changes." },
    ],
    eventRows: [
      { id: "onChange", event: "onChange", payload: "{ value: string }", description: "Fires when the selected option changes." },
    ],
    notes: [
      "Use RadioGroup when users must choose one option and all options should be visible.",
      "Use Select instead when the list is longer or should be collapsed by default.",
      "Descriptions help when choices are conceptually similar.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.RadioGroup
            legend="Workspace mode"
            value={value}
            items={RADIO_ITEMS}
            onChange={{ type: "demoSetField", key: "radioValue" }}
          />
          <ctx.ui.Text value={`Selected mode: ${value || "none"}`} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function selectDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const selectValue = asString(ctx.state.selectValue);
  const selectValues = asList(ctx.state.selectValues);
  return {
    title: "Select",
    description: "Select handles single or multiple choice in a compact dropdown surface. It supports search and clear affordances.",
    demoIntro: "This example combines one single-select and one multi-select in the same filter panel.",
    source: [
      "<ui.Select",
      "  value={selectValue}",
      "  items={SELECT_ITEMS}",
      "  search",
      "  clear",
      "  onChange={{ type: \"demoSetField\", key: \"selectValue\" }}",
      "/>",
      "<ui.Select",
      "  multiple",
      "  values={selectValues}",
      "  items={TAG_ITEMS}",
      "  onChange={{ type: \"demoSetValuesField\", key: \"selectValues\" }}",
      "/>",
    ].join("\n"),
    propsRows: [
      { id: "value", prop: "value", type: "string", default: "-", description: "Current selected value in single mode." },
      { id: "values", prop: "values", type: "string[]", default: "[]", description: "Current selected values in multiple mode." },
      { id: "items", prop: "items", type: "SelectItem[]", default: "[]", description: "Available options." },
      { id: "multiple", prop: "multiple", type: "boolean", default: "false", description: "Enables multi-select mode." },
      { id: "search", prop: "search", type: "boolean", default: "false", description: "Adds search inside the menu." },
      { id: "clear", prop: "clear", type: "boolean", default: "false", description: "Adds a clear affordance." },
      { id: "placeholder", prop: "placeholder", type: "string", default: "-", description: "Placeholder text when empty." },
      { id: "onChange", prop: "onChange", type: "Action", default: "-", description: "Receives selection updates." },
      { id: "onBlur", prop: "onBlur", type: "Action", default: "-", description: "Runs when the control loses focus." },
    ],
    eventRows: [
      { id: "onChange-single", event: "onChange", payload: "{ value: string } or { values: string[] }", description: "Fires when the selected option set changes." },
      { id: "onBlur", event: "onBlur", payload: "No extra payload", description: "Fires when the control loses focus." },
    ],
    notes: [
      "Use Select when the list of choices should stay compact until needed.",
      "Use multiple mode for tags or filters, not for long prose-like choices.",
      "Search is useful when the list is too long to scan comfortably.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Select
            value={selectValue}
            items={SELECT_ITEMS}
            search
            clear
            placeholder="Choose one team"
            onChange={{ type: "demoSetField", key: "selectValue" }}
          />
          <ctx.ui.Select
            multiple
            values={selectValues}
            items={TAG_ITEMS}
            placeholder="Choose tags"
            onChange={{ type: "demoSetValuesField", key: "selectValues" }}
          />
          <ctx.ui.Text value={`Team: ${selectValue || "none"} | Tags: ${selectValues.join(", ") || "none"}`} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function modelSelectDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const modelValue = asString(ctx.state.modelValue);
  return {
    title: "ModelSelect",
    description: "ModelSelect is a runtime-backed selector for models. It behaves like Select but sources options from the host model list.",
    demoIntro: "This example shows one model picker backed by the current runtime model inventory.",
    source: [
      "<ui.ModelSelect",
      "  value={modelValue}",
      "  purpose=\"chat\"",
      "  search",
      "  clear",
      "  placeholder=\"Select a chat model\"",
      "  onChange={{ type: \"demoSetField\", key: \"modelValue\" }}",
      "/>",
    ].join("\n"),
    propsRows: [
      { id: "value", prop: "value", type: "string", default: "-", description: "Current selected model id." },
      { id: "purpose", prop: "purpose", type: "chat | embedding | rerank | image | video", default: "chat", description: "Filters models by intended purpose." },
      { id: "providerId", prop: "providerId", type: "string", default: "-", description: "Optional provider filter." },
      { id: "search", prop: "search", type: "boolean", default: "false", description: "Enables searching in the model list." },
      { id: "clear", prop: "clear", type: "boolean", default: "false", description: "Allows clearing the selection." },
      { id: "onChange", prop: "onChange", type: "Action", default: "-", description: "Receives selection changes." },
    ],
    eventRows: [
      { id: "onChange", event: "onChange", payload: "{ value: string }", description: "Fires when the selected model changes." },
      { id: "onBlur", event: "onBlur", payload: "No extra payload", description: "Fires when the control loses focus." },
    ],
    notes: [
      "Use ModelSelect instead of Select when choices should reflect the live runtime configuration.",
      "Set purpose whenever possible so the model list stays relevant.",
      "Handle the empty state gracefully because some environments may not have matching models.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.ModelSelect
            value={modelValue}
            purpose="chat"
            search
            clear
            placeholder="Select a chat model"
            onChange={{ type: "demoSetField", key: "modelValue" }}
          />
          <ctx.ui.Text value={`Selected model: ${modelValue || "none"}`} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function tabsDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const value = asString(ctx.state.tabsValue) || "overview";
  const panel =
    value === "overview"
      ? "Overview keeps the default summary visible."
      : value === "specs"
        ? "Specs surfaces the more structured requirements."
        : "Logs is useful for time-based history and diagnostics.";
  return {
    title: "Tabs",
    description: "Tabs switches between sibling content panels while keeping them in the same visual context.",
    demoIntro: "This example uses one Tabs control with three panels and mirrors the active panel below.",
    source: [
      "<ui.Tabs",
      "  value={tabsValue}",
      "  items={TABS_ITEMS}",
      "  onChange={{ type: \"demoSetField\", key: \"tabsValue\" }}",
      "/>",
    ].join("\n"),
    propsRows: [
      { id: "value", prop: "value", type: "string", default: "-", description: "Current selected tab value." },
      { id: "items", prop: "items", type: "TabsItem[]", default: "[]", description: "The available tab definitions." },
      { id: "variant", prop: "variant", type: "pill | link", default: "pill", description: "Controls the tab style." },
      { id: "orientation", prop: "orientation", type: "horizontal | vertical", default: "horizontal", description: "Controls tab direction." },
      { id: "content", prop: "content", type: "boolean", default: "true", description: "Controls whether built-in content should render automatically." },
      { id: "onChange", prop: "onChange", type: "Action", default: "-", description: "Receives tab changes." },
    ],
    eventRows: [
      { id: "onChange", event: "onChange", payload: "{ value: string }", description: "Fires when the active tab changes." },
    ],
    notes: [
      "Use Tabs when users need to switch between closely related slices of content.",
      "Keep the number of tabs modest so labels remain scannable.",
      "Use the selected value to render custom panel content outside the Tabs component when needed.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Tabs value={value} items={TABS_ITEMS} onChange={{ type: "demoSetField", key: "tabsValue" }} />
          <ctx.ui.View class="rounded-2xl border border-default bg-white/76 p-4">
            <ctx.ui.Text value={panel} size="sm" color="muted" />
          </ctx.ui.View>
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function accordionDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const values = asList(ctx.state.accordionValues);
  return {
    title: "Accordion",
    description: "Accordion reveals or hides grouped content in place. It is useful when users need to inspect details without leaving the current surface.",
    demoIntro: "This example uses one Accordion for setup guidance and mirrors the open sections below.",
    source: [
      "<ui.Accordion",
      "  multiple",
      "  values={accordionValues}",
      "  items={ACCORDION_ITEMS}",
      "  onChange={{ type: \"demoSetValuesField\", key: \"accordionValues\" }}",
      "/>",
    ].join("\n"),
    propsRows: [
      { id: "value", prop: "value", type: "string", default: "-", description: "Open item value in single mode." },
      { id: "values", prop: "values", type: "string[]", default: "[]", description: "Open item values in multiple mode." },
      { id: "items", prop: "items", type: "AccordionItem[]", default: "[]", description: "Accordion item definitions." },
      { id: "multiple", prop: "multiple", type: "boolean", default: "false", description: "Allows multiple items to stay open." },
      { id: "collapsible", prop: "collapsible", type: "boolean", default: "false", description: "Allows the active item to close." },
      { id: "onChange", prop: "onChange", type: "Action", default: "-", description: "Receives open item changes." },
    ],
    eventRows: [
      { id: "onChange", event: "onChange", payload: "{ value: string } or { values: string[] }", description: "Fires when open items change." },
    ],
    notes: [
      "Use Accordion when details are secondary but still need to stay nearby.",
      "Prefer concise labels so users can scan closed items quickly.",
      "Use multiple mode when sections are independent of each other.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Accordion
            multiple
            values={values}
            items={ACCORDION_ITEMS}
            onChange={{ type: "demoSetValuesField", key: "accordionValues" }}
          />
          <ctx.ui.Text value={`Open sections: ${values.join(", ") || "none"}`} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function tableDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const sortKey = asString(ctx.state.tableSortKey);
  const sortDesc = asBool(ctx.state.tableSortDesc);
  return {
    title: "Table",
    description: "Table renders structured row data with optional sorting and row click actions.",
    demoIntro: "This example uses one file table with sorting and row selection feedback.",
    source: [
      "<ui.Table",
      "  columns={TABLE_COLUMNS}",
      "  rows={TABLE_ROWS}",
      "  rowKey=\"id\"",
      "  sortKey={tableSortKey}",
      "  sortDesc={tableSortDesc}",
      "  onRowClick={{ type: \"demoTableRowClick\" }}",
      "  onSortChange={{ type: \"demoTableSortChange\" }}",
      "/>",
    ].join("\n"),
    propsRows: [
      { id: "columns", prop: "columns", type: "TableColumn[]", default: "[]", description: "Column definitions." },
      { id: "rows", prop: "rows", type: "Record<string, unknown>[]", default: "[]", description: "Row data objects." },
      { id: "rowKey", prop: "rowKey", type: "string", default: "-", description: "Stable row identifier field." },
      { id: "sortKey", prop: "sortKey", type: "string", default: "-", description: "Current sort column key." },
      { id: "sortDesc", prop: "sortDesc", type: "boolean", default: "false", description: "Current sort direction." },
      { id: "loading", prop: "loading", type: "boolean", default: "false", description: "Shows a loading state." },
      { id: "onRowClick", prop: "onRowClick", type: "Action", default: "-", description: "Receives row click actions." },
      { id: "onSortChange", prop: "onSortChange", type: "Action", default: "-", description: "Receives sort changes." },
    ],
    eventRows: [
      { id: "onRowClick", event: "onRowClick", payload: "{ row: Record<string, unknown> }", description: "Fires when a row is clicked." },
      { id: "onSortChange", event: "onSortChange", payload: "{ key: string, desc: boolean }", description: "Fires when sorting changes." },
    ],
    notes: [
      "Use Table when users need to compare rows or scan structured fields.",
      "Provide a rowKey whenever row identity matters.",
      "Surface the selected row or active sort elsewhere when it affects adjacent content.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Table
            columns={TABLE_COLUMNS}
            rows={TABLE_ROWS}
            rowKey="id"
            sortKey={sortKey}
            sortDesc={sortDesc}
            onRowClick={{ type: "demoTableRowClick" }}
            onSortChange={{ type: "demoTableSortChange" }}
          />
          <ctx.ui.Text value={asString(ctx.state.tableLastRow) || "Click a row to inspect selection feedback."} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function calendarDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  return {
    title: "Calendar",
    description: "Calendar renders a visual calendar picker for single, multiple, or range date selection.",
    demoIntro: "This example shows both single-date and range selection inside one planning surface.",
    source: [
      "<ui.Calendar value={calendarValue} onChange={{ type: \"demoSetField\", key: \"calendarValue\" }} />",
      "<ui.Calendar range rangeValue={calendarRange} onChange={{ type: \"demoSetRangeField\", key: \"calendarRange\" }} />",
    ].join("\n"),
    propsRows: [
      { id: "value", prop: "value", type: "YYYY-MM-DD", default: "-", description: "Current selected date in single mode." },
      { id: "rangeValue", prop: "rangeValue", type: "{ start?: string, end?: string }", default: "-", description: "Current selected range in range mode." },
      { id: "range", prop: "range", type: "boolean", default: "false", description: "Enables range selection." },
      { id: "multiple", prop: "multiple", type: "boolean", default: "false", description: "Enables multiple selection." },
      { id: "minValue", prop: "minValue", type: "YYYY-MM-DD", default: "-", description: "Minimum selectable date." },
      { id: "maxValue", prop: "maxValue", type: "YYYY-MM-DD", default: "-", description: "Maximum selectable date." },
      { id: "onChange", prop: "onChange", type: "Action", default: "-", description: "Receives date changes." },
    ],
    eventRows: [
      { id: "onChange", event: "onChange", payload: "{ value: string } or { rangeValue: { start?: string, end?: string } }", description: "Fires when the selected date state changes." },
    ],
    notes: [
      "Use Calendar when visual date selection matters.",
      "Prefer DatePicker when a compact input-like control fits better.",
      "Keep date formats in the protocol form YYYY-MM-DD.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Calendar
            value={asString(ctx.state.calendarValue)}
            onChange={{ type: "demoSetField", key: "calendarValue" }}
          />
          <ctx.ui.Calendar
            range
            rangeValue={asRange(ctx.state.calendarRange)}
            onChange={{ type: "demoSetRangeField", key: "calendarRange" }}
          />
          <ctx.ui.Text value={`Single: ${asString(ctx.state.calendarValue) || "none"}`} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function datePickerDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  return {
    title: "DatePicker",
    description: "DatePicker is the compact date input counterpart to Calendar. It fits forms and tighter layouts better.",
    demoIntro: "This example shows one single-date picker and one range picker in a form-style layout.",
    source: [
      "<ui.DatePicker value={dateValue} onChange={{ type: \"demoSetField\", key: \"dateValue\" }} />",
      "<ui.DatePicker range rangeValue={dateRange} onChange={{ type: \"demoSetRangeField\", key: \"dateRange\" }} />",
    ].join("\n"),
    propsRows: [
      { id: "value", prop: "value", type: "YYYY-MM-DD", default: "-", description: "Current selected date." },
      { id: "rangeValue", prop: "rangeValue", type: "{ start?: string, end?: string }", default: "-", description: "Current selected range." },
      { id: "range", prop: "range", type: "boolean", default: "false", description: "Enables range mode." },
      { id: "readonly", prop: "readonly", type: "boolean", default: "false", description: "Makes the control read-only." },
      { id: "disabled", prop: "disabled", type: "boolean", default: "false", description: "Disables interaction." },
      { id: "onChange", prop: "onChange", type: "Action", default: "-", description: "Receives date changes." },
      { id: "onBlur", prop: "onBlur", type: "Action", default: "-", description: "Runs when the control loses focus." },
    ],
    eventRows: [
      { id: "onChange", event: "onChange", payload: "{ value: string } or { rangeValue: { start?: string, end?: string } }", description: "Fires when the date value changes." },
      { id: "onBlur", event: "onBlur", payload: "No extra payload", description: "Fires when the picker loses focus." },
    ],
    notes: [
      "Use DatePicker inside forms where space is tighter than a full Calendar allows.",
      "DatePicker and Calendar share the same protocol date format.",
      "Use range mode when start and end dates belong to one compact field.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.DatePicker
            value={asString(ctx.state.dateValue)}
            onChange={{ type: "demoSetField", key: "dateValue" }}
          />
          <ctx.ui.DatePicker
            range
            rangeValue={asRange(ctx.state.dateRange)}
            onChange={{ type: "demoSetRangeField", key: "dateRange" }}
          />
          <ctx.ui.Text value={`Date: ${asString(ctx.state.dateValue) || "none"}`} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function inputTimeDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  return {
    title: "InputTime",
    description: "InputTime is the time counterpart to DatePicker. It supports single values and ranges in protocol time strings.",
    demoIntro: "This example combines one single time input and one time range input in one scheduling block.",
    source: [
      "<ui.InputTime value={timeValue} hourCycle={24} granularity=\"minute\" onChange={{ type: \"demoSetField\", key: \"timeValue\" }} />",
      "<ui.InputTime range rangeValue={timeRange} hourCycle={24} granularity=\"minute\" onChange={{ type: \"demoSetRangeField\", key: \"timeRange\" }} />",
    ].join("\n"),
    propsRows: [
      { id: "value", prop: "value", type: "HH:mm or HH:mm:ss", default: "-", description: "Current selected time in single mode." },
      { id: "rangeValue", prop: "rangeValue", type: "{ start?: string, end?: string }", default: "-", description: "Current selected time range." },
      { id: "range", prop: "range", type: "boolean", default: "false", description: "Enables range mode." },
      { id: "hourCycle", prop: "hourCycle", type: "12 | 24", default: "24", description: "Controls hour formatting." },
      { id: "granularity", prop: "granularity", type: "hour | minute | second", default: "minute", description: "Controls time precision." },
      { id: "onChange", prop: "onChange", type: "Action", default: "-", description: "Receives time changes." },
      { id: "onBlur", prop: "onBlur", type: "Action", default: "-", description: "Runs when the control loses focus." },
    ],
    eventRows: [
      { id: "onChange", event: "onChange", payload: "{ value: string } or { rangeValue: { start?: string, end?: string } }", description: "Fires when the time value changes." },
      { id: "onBlur", event: "onBlur", payload: "No extra payload", description: "Fires when the control loses focus." },
    ],
    notes: [
      "Use InputTime for protocol-level time values rather than custom string parsing.",
      "Choose granularity based on the user task so precision matches intent.",
      "Keep range mode for start/end pairs that belong together.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.InputTime
            value={asString(ctx.state.timeValue)}
            hourCycle={24}
            granularity="minute"
            onChange={{ type: "demoSetField", key: "timeValue" }}
          />
          <ctx.ui.InputTime
            range
            rangeValue={asRange(ctx.state.timeRange)}
            hourCycle={24}
            granularity="minute"
            onChange={{ type: "demoSetRangeField", key: "timeRange" }}
          />
          <ctx.ui.Text value={`Time: ${asString(ctx.state.timeValue) || "none"}`} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function tooltipDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  return {
    title: "Tooltip",
    description: "Tooltip shows brief contextual help on hover or focus. It is best for clarifying small controls without adding visual weight.",
    demoIntro: "This example shows two tooltip triggers inside one compact control row.",
    source: [
      "<ui.Tooltip text=\"Search the workspace\" triggerLabel=\"Search\" />",
      "<ui.Tooltip text=\"Open settings\" triggerIcon=\"settings-2\" />",
    ].join("\n"),
    propsRows: [
      { id: "text", prop: "text", type: "string", default: '""', description: "Tooltip content text." },
      { id: "triggerLabel", prop: "triggerLabel", type: "string", default: "-", description: "Optional text label for the trigger button." },
      { id: "triggerIcon", prop: "triggerIcon", type: "string", default: "-", description: "Optional icon for the trigger button." },
      { id: "side", prop: "side", type: "top | right | bottom | left", default: "-", description: "Preferred tooltip side." },
      { id: "align", prop: "align", type: "start | center | end", default: "-", description: "Floating alignment." },
    ],
    notes: [
      "Tooltip is for short clarifications, not full explanations.",
      "Use clear trigger affordances so users know help is available.",
      "Prefer nearby text instead of tooltips when the information is essential.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.Row class="gap-3" wrap>
          <ctx.ui.Tooltip text="Search the workspace" triggerLabel="Search" />
          <ctx.ui.Tooltip text="Open settings" triggerIcon="settings-2" />
        </ctx.ui.Row>
      </ctx.ui.View>
    ),
  };
}

function popoverDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const open = asBool(ctx.state.popoverOpen);
  return {
    title: "Popover",
    description: "Popover shows lightweight floating content anchored to a trigger. It is useful for contextual actions or compact panels.",
    demoIntro: "This example uses one Popover to reveal a small contextual panel and mirrors the open state below.",
    source: [
      "<ui.Popover",
      "  open={popoverOpen}",
      "  triggerLabel=\"Open popover\"",
      "  onOpenChange={{ type: \"demoSetOpenField\", key: \"popoverOpen\" }}",
      ">",
      "  <ui.Col class=\"gap-2\">",
      "    <ui.Text value=\"Popover content area.\" size=\"sm\" />",
      "    <ui.Row class=\"gap-2\" wrap>",
      "      <ui.Button text=\"Close\" size=\"sm\" variant=\"outline\" onClick={{ type: \"demoSetOpenField\", key: \"popoverOpen\", open: false }} />",
      "    </ui.Row>",
      "  </ui.Col>",
      "</ui.Popover>",
    ].join("\n"),
    propsRows: [
      { id: "open", prop: "open", type: "boolean", default: "-", description: "Controlled open state." },
      { id: "triggerLabel", prop: "triggerLabel", type: "string", default: "-", description: "Trigger button label." },
      { id: "triggerIcon", prop: "triggerIcon", type: "string", default: "-", description: "Trigger button icon." },
      { id: "mode", prop: "mode", type: "click | hover", default: "click", description: "Popover trigger mode." },
      { id: "children", prop: "children", type: "UINode[]", default: "[]", description: "Content rendered inside the popover." },
      { id: "onOpenChange", prop: "onOpenChange", type: "Action", default: "-", description: "Receives open state changes." },
    ],
    eventRows: [
      { id: "onOpenChange", event: "onOpenChange", payload: "{ open: boolean }", description: "Fires when the popover opens or closes." },
    ],
    notes: [
      "Popover is for compact contextual content, not full-screen workflows.",
      "Keep content brief so the floating panel stays lightweight.",
      "Use controlled open state when surrounding UI needs to react to visibility changes.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Row class="gap-2" wrap>
            <ctx.ui.Popover
              open={open}
              triggerLabel="Open popover"
              onOpenChange={{ type: "demoSetOpenField", key: "popoverOpen" }}
            >
              <ctx.ui.Col class="gap-2">
                <ctx.ui.Text value="Popover content area." size="sm" />
                <ctx.ui.Row class="gap-2" wrap>
                  <ctx.ui.Button text="Close" size="sm" variant="outline" onClick={{ type: "demoSetOpenField", key: "popoverOpen", open: false }} />
                </ctx.ui.Row>
              </ctx.ui.Col>
            </ctx.ui.Popover>
          </ctx.ui.Row>
          <ctx.ui.Text value={`Popover is ${open ? "open" : "closed"}.`} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function dropdownMenuDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const result = asString(ctx.state.dropdownResult);
  return {
    title: "DropdownMenu",
    description: "DropdownMenu exposes a compact action list from a trigger. It is useful when several related actions should stay collapsed until needed.",
    demoIntro: "This example uses one DropdownMenu and mirrors the selected action below.",
    source: [
      "<ui.Row class=\"gap-2\" wrap>",
      "  <ui.DropdownMenu",
      "    triggerLabel=\"More actions\"",
      "    items={[",
      "      { label: \"Open\", value: \"open\" },",
      "      { label: \"Duplicate\", value: \"duplicate\" },",
      "      { label: \"Archive\", value: \"archive\", color: \"warning\" },",
      "    ]}",
      "    onSelect={{ type: \"demoDropdownSelect\" }}",
      "  />",
      "</ui.Row>",
    ].join("\n"),
    propsRows: [
      { id: "items", prop: "items", type: "DropdownMenuItem[]", default: "[]", description: "Menu action items." },
      { id: "triggerLabel", prop: "triggerLabel", type: "string", default: "-", description: "Default trigger label." },
      { id: "triggerIcon", prop: "triggerIcon", type: "string", default: "-", description: "Default trigger icon." },
      { id: "children", prop: "children", type: "UINode[]", default: "[]", description: "Optional custom trigger content." },
      { id: "onSelect", prop: "onSelect", type: "Action", default: "-", description: "Receives selected item info." },
      { id: "onOpenChange", prop: "onOpenChange", type: "Action", default: "-", description: "Receives menu visibility changes." },
    ],
    eventRows: [
      { id: "onSelect", event: "onSelect", payload: "{ value?: string, label?: string, index: number }", description: "Fires when a menu item is selected." },
      { id: "onOpenChange", event: "onOpenChange", payload: "{ open: boolean }", description: "Fires when the menu opens or closes." },
    ],
    notes: [
      "DropdownMenu is useful when several secondary actions should stay out of the main flow.",
      "Keep the top-level labels short and obvious.",
      "Use color sparingly so destructive actions remain distinct.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Row class="gap-2" wrap>
            <ctx.ui.DropdownMenu
              triggerLabel="More actions"
              items={[
                { label: "Open", value: "open" },
                { label: "Duplicate", value: "duplicate" },
                { label: "Archive", value: "archive", color: "warning" },
              ]}
              onSelect={{ type: "demoDropdownSelect" }}
            />
          </ctx.ui.Row>
          <ctx.ui.Text value={result || "Choose a menu item to see the selected action."} size="sm" color="muted" />
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function modalDoc(ctx: ExamplesDocsCtx): ComponentDocConfig {
  const open = asBool(ctx.state.modalOpen);
  return {
    title: "Modal",
    description: "Modal shows focused content above the current surface. Use it for flows or decisions that need stronger interruption than a popover.",
    demoIntro: "This example opens one Modal and keeps the open state controlled from applet state.",
    source: [
      "<ui.Row class=\"gap-2\" wrap>",
      "  <ui.Button text=\"Open modal\" onClick={{ type: \"demoSetOpenField\", key: \"modalOpen\", open: true }} />",
      "</ui.Row>",
      "<ui.Modal",
      "  open={modalOpen}",
      "  title=\"Modal Example\"",
      "  description=\"Modal body can render arbitrary schema nodes.\"",
      "  onOpenChange={{ type: \"demoSetOpenField\", key: \"modalOpen\" }}",
      ">",
      "  <ui.Col class=\"gap-2\">",
      "    <ui.Text value=\"This is modal content.\" />",
      "    <ui.Row class=\"gap-2\" wrap>",
      "      <ui.Button text=\"Close modal\" variant=\"outline\" onClick={{ type: \"demoSetOpenField\", key: \"modalOpen\", open: false }} />",
      "    </ui.Row>",
      "  </ui.Col>",
      "</ui.Modal>",
    ].join("\n"),
    propsRows: [
      { id: "open", prop: "open", type: "boolean", default: "false", description: "Controlled open state." },
      { id: "title", prop: "title", type: "string", default: "-", description: "Modal title." },
      { id: "description", prop: "description", type: "string", default: "-", description: "Modal supporting description." },
      { id: "children", prop: "children", type: "UINode[]", default: "[]", description: "Content rendered inside the modal body." },
      { id: "dismissible", prop: "dismissible", type: "boolean", default: "true", description: "Controls whether outside click can dismiss the modal." },
      { id: "fullscreen", prop: "fullscreen", type: "boolean", default: "false", description: "Uses fullscreen modal presentation." },
      { id: "onOpenChange", prop: "onOpenChange", type: "Action", default: "-", description: "Receives open state changes." },
    ],
    eventRows: [
      { id: "onOpenChange", event: "onOpenChange", payload: "{ open: boolean }", description: "Fires when the modal opens or closes." },
    ],
    notes: [
      "Use Modal for focused flows that deserve strong separation from the background UI.",
      "Keep the content purposeful so users understand why the modal interrupted them.",
      "Use controlled open state when the applet needs to coordinate follow-up behavior.",
    ],
    demo: () => (
      <ctx.ui.View class="rounded-[28px] border border-default bg-white/82 p-5">
        <ctx.ui.View class="flex flex-col gap-3">
          <ctx.ui.Row class="gap-2" wrap>
            <ctx.ui.Button text="Open modal" onClick={{ type: "demoSetOpenField", key: "modalOpen", open: true }} />
          </ctx.ui.Row>
          <ctx.ui.Text value={`Modal is ${open ? "open" : "closed"}.`} size="sm" color="muted" />
          <ctx.ui.Modal
            open={open}
            title="Modal Example"
            description="Modal body can render arbitrary schema nodes."
            onOpenChange={{ type: "demoSetOpenField", key: "modalOpen" }}
          >
            <ctx.ui.Col class="gap-2">
              <ctx.ui.Text value="This is modal content." />
              <ctx.ui.Row class="gap-2" wrap>
                <ctx.ui.Button text="Close modal" variant="outline" onClick={{ type: "demoSetOpenField", key: "modalOpen", open: false }} />
              </ctx.ui.Row>
            </ctx.ui.Col>
          </ctx.ui.Modal>
        </ctx.ui.View>
      </ctx.ui.View>
    ),
  };
}

function buildDocConfig(ctx: ExamplesDocsCtx, docId: string): ComponentDocConfig | null {
  switch (docId) {
    case "component-view":
      return viewDoc(ctx);
    case "component-row":
      return rowDoc(ctx);
    case "component-col":
      return colDoc(ctx);
    case "component-text":
      return textDoc(ctx);
    case "component-markdown":
      return markdownDoc(ctx);
    case "component-badge":
      return badgeDoc(ctx);
    case "component-alert":
      return alertDoc(ctx);
    case "component-icon":
      return iconDoc(ctx);
    case "component-image":
      return imageDoc(ctx);
    case "component-separator":
      return separatorDoc(ctx);
    case "component-progress":
      return progressDoc(ctx);
    case "component-button":
      return buttonDoc(ctx);
    case "component-input":
      return inputDoc(ctx);
    case "component-textarea":
      return textareaDoc(ctx);
    case "component-switch":
      return switchDoc(ctx);
    case "component-checkbox":
      return checkboxDoc(ctx);
    case "component-radiogroup":
      return radioDoc(ctx);
    case "component-select":
      return selectDoc(ctx);
    case "component-modelselect":
      return modelSelectDoc(ctx);
    case "component-tabs":
      return tabsDoc(ctx);
    case "component-accordion":
      return accordionDoc(ctx);
    case "component-table":
      return tableDoc(ctx);
    case "component-calendar":
      return calendarDoc(ctx);
    case "component-datepicker":
      return datePickerDoc(ctx);
    case "component-inputtime":
      return inputTimeDoc(ctx);
    case "component-tooltip":
      return tooltipDoc(ctx);
    case "component-popover":
      return popoverDoc(ctx);
    case "component-dropdownmenu":
      return dropdownMenuDoc(ctx);
    case "component-modal":
      return modalDoc(ctx);
    default:
      return null;
  }
}

export function renderComponentDetail(ctx: ExamplesDocsCtx, docId: string): UINode | null {
  const config = buildDocConfig(ctx, docId);
  if (!config) return null;
  return renderDocPage(ctx, config);
}
