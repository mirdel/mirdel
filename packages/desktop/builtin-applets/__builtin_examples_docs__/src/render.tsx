import type { AppletUIApi, UINode } from "@mirdel/applet-core";
import type { DocItem } from "./docs";
import { DOCS_SIDEBAR_GROUPS } from "./utils";
import { getSelectedDoc, type ExamplesDocsCtx } from "./utils";
import { renderComponentDetail } from "./componentDocs";
import { renderExtraDoc } from "./extraDocs";

function kindLabel(doc: DocItem) {
  if (doc.kind === "guide") return "Guide";
  if (doc.kind === "method") return "Method";
  return "Component";
}

function statusLabel(doc: DocItem) {
  return doc.status === "ready" ? "Ready" : "Coming Soon";
}

function statusColor(doc: DocItem) {
  return doc.status === "ready" ? "success" : "warning";
}

function sidebarItem(ui: AppletUIApi, item: DocItem, selectedDocId: string): UINode {
  const active = item.id === selectedDocId;
  return (
    <ui.View
      class={
        active
          ? "shrink-0 rounded-xl border border-info/50 bg-info/10 p-2.5"
          : "shrink-0 rounded-xl border border-transparent p-2.5 hover:bg-default/60"
      }
      onClick={{ type: "selectDoc", docId: item.id }}
    >
      <ui.View class="flex flex-col gap-1">
        <ui.Text value={item.label} size="sm" bold={active} />
        <ui.Text value={item.summary} size="xs" color="muted" />
      </ui.View>
    </ui.View>
  );
}

function renderSidebar(ctx: ExamplesDocsCtx, selectedDocId: string) {
  const ui = ctx.ui;
  return (
    <ui.View class="flex h-full min-h-0 w-[280px] shrink-0 flex-col gap-3 overflow-hidden rounded-[20px] border border-default bg-[rgba(255,255,255,0.78)] p-3 backdrop-blur">
      <ui.View class="shrink-0 flex flex-col gap-1">
        <ui.Text value="Applet Examples and Docs" size="lg" bold />
        <ui.Text value="Playground stays untouched. This new built-in applet will become the structured docs hub." size="sm" color="muted" />
      </ui.View>

      <ui.View class="min-h-0 flex-1 overflow-auto pr-1">
        <ui.View class="flex flex-col gap-3">
          {DOCS_SIDEBAR_GROUPS.map((group) => (
            <ui.View class="shrink-0 flex flex-col gap-2" key={group.id}>
              <ui.Text value={group.label} size="xs" color="muted" bold class="px-1" />
              <ui.View class="flex flex-col gap-1">
                {group.items.map((item) => sidebarItem(ui, item, selectedDocId))}
              </ui.View>
            </ui.View>
          ))}
        </ui.View>
      </ui.View>
    </ui.View>
  );
}

function renderPlaceholder(ui: AppletUIApi, doc: DocItem): UINode {
  return (
    <ui.View class="flex flex-col gap-4 rounded-[24px] border border-dashed border-default bg-white/80 p-6">
      <ui.Row class="items-center gap-2" wrap>
        <ui.Badge label={kindLabel(doc)} variant="soft" color="info" />
        <ui.Badge label={statusLabel(doc)} variant="soft" color={statusColor(doc)} />
      </ui.Row>
      <ui.View class="flex flex-col gap-1">
        <ui.Text value={doc.label} size="xl" bold />
        <ui.Text value={doc.summary} size="sm" color="muted" />
      </ui.View>
      <ui.Alert
        title="This page is intentionally a placeholder"
        description="Component pages are implemented first. Guides and runtime-method pages will follow after the component docs structure is settled."
        variant="soft"
        color="warning"
        icon="clock-3"
      />
    </ui.View>
  );
}

export function render(ctx: ExamplesDocsCtx) {
  const ui = ctx.ui;
  const selectedDoc = getSelectedDoc(ctx.state.selectedDocId);
  const selectedDocId = selectedDoc.id;
  const componentDetail = renderComponentDetail(ctx, selectedDoc.id);
  const extraDetail = renderExtraDoc(ctx, selectedDoc.id);

  return (
    <ui.View class="flex h-full min-h-0 items-stretch gap-3 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(13,148,136,0.12),transparent_35%),linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.92))] p-3">
      {renderSidebar(ctx, selectedDocId)}
      <ui.View class="h-full min-h-0 min-w-0 flex-1 overflow-auto rounded-[24px] border border-default bg-[rgba(255,255,255,0.72)] p-4 backdrop-blur">
        {componentDetail ?? extraDetail ?? renderPlaceholder(ui, selectedDoc)}
      </ui.View>
    </ui.View>
  );
}
