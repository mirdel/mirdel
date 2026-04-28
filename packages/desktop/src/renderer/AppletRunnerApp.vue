<template>
  <UApp
    :tooltip="{ disableHoverableContent: true, ignoreNonKeyboardFocus: true, delayDuration: 0 }"
    :toaster="{ position: 'top-center', ui: { viewport: 'z-[9999]' } }"
  >
    <div class="h-screen flex flex-col bg-default text-default overflow-hidden">
      <div v-if="errorMsg" class="p-4 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-sm">
        {{ errorMsg }}
      </div>
      <div v-else-if="schema" class="flex-1 min-h-0 overflow-auto">
        <AppletSchemaRenderer
          :node="schema"
          :applet-state="appletState"
          :streaming-paths="streamingPaths"
          :applet-id="appletId"
          :dispatch="doDispatch"
        />
      </div>
      <div v-else class="flex-1 flex items-center justify-center text-muted">
        {{ t('applet.loading') }}
      </div>
    </div>
  </UApp>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import AppletSchemaRenderer from "./components/applet/AppletSchemaRenderer.vue";
import type { UINode } from "@mirdel/applet-core";
import { initColorModeForWindow } from "@/utils/initColorMode";

const { t } = useI18n();
const toast = useToast();

/** 重新载入轻应用窗口（丢弃当前 state，刷新后从 lastStateSchema 恢复）。可被快捷键或其它触发点调用 */
function reloadApplet() {
  location.reload();
}

defineShortcuts({
  meta_r: {
    handler: reloadApplet,
    usingInput: true
  },
});

const appletId = ref("");
const schema = ref<UINode | null>(null);
const appletState = ref<Record<string, unknown>>({});
const streamingPaths = ref<string[]>([]);
const errorMsg = ref("");

let unsubStateSchema: (() => void) | null = null;
let unsubError: (() => void) | null = null;
let unsubToast: (() => void) | null = null;
let appletStyleLink: HTMLLinkElement | null = null;
let appliedAssetRunId = "";

function applyAppletStyles(assetRunId: string | null | undefined) {
  const runId = String(assetRunId || "").trim();
  if (!runId) return;
  if (runId === appliedAssetRunId) return;
  appliedAssetRunId = runId;

  const href = `applet-asset://${encodeURIComponent(runId)}/applet.css?v=${Date.now()}`;
  if (!appletStyleLink) {
    appletStyleLink = document.createElement("link");
    appletStyleLink.rel = "stylesheet";
    document.head.appendChild(appletStyleLink);
  }
  appletStyleLink.href = href;
}

function doDispatch(appletIdVal: string, action: unknown) {
  void window.applet.dispatch(appletIdVal, action);
}

function parseAppletIdFromHash(): string {
  const hash = typeof location !== "undefined" ? location.hash : "";
  const m = hash.match(/appletId=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

onMounted(async () => {
  initColorModeForWindow();
  const applet = window.applet;
  const id = parseAppletIdFromHash();
  if (!id) {
    errorMsg.value = t("applet.missingAppletId");
    return;
  }
  appletId.value = id;

  unsubStateSchema = applet.onStateSchema((payload) => {
    schema.value = payload.schema;
    appletState.value =
      payload.state && typeof payload.state === "object" && !Array.isArray(payload.state)
        ? (payload.state as Record<string, unknown>)
        : {};
    streamingPaths.value = Array.isArray(payload.streamingPaths)
      ? payload.streamingPaths.map((item) => String(item)).filter((path) => path.trim().length > 0)
      : [];
    applyAppletStyles(payload.assetRunId);
  });
  unsubError = applet.onError((message) => {
    errorMsg.value = typeof message === "string" ? message : message.message || "";
  });
  unsubToast = applet.onToast((payload) => {
    const input = payload && typeof payload === "object" && "input" in payload ? payload.input : payload;
    toast.add({
      title: input?.title,
      description: input?.description,
      icon: input?.icon,
      color: input?.color,
      duration: input?.duration,
      close: input?.close,
      progress: input?.progress,
    });
  });

  try {
    const payload = await applet.getInitialStateSchema(id);
    schema.value = payload.schema;
    appletState.value =
      payload.state && typeof payload.state === "object" && !Array.isArray(payload.state)
        ? (payload.state as Record<string, unknown>)
        : {};
    streamingPaths.value = Array.isArray(payload.streamingPaths)
      ? payload.streamingPaths.map((item) => String(item)).filter((path) => path.trim().length > 0)
      : [];
    applyAppletStyles(payload.assetRunId);
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e);
  }
});

onUnmounted(() => {
  unsubStateSchema?.();
  unsubError?.();
  unsubToast?.();
  if (appletStyleLink) {
    appletStyleLink.remove();
    appletStyleLink = null;
  }
  appliedAssetRunId = "";
  streamingPaths.value = [];
});
</script>
