<template>
  <section class="h-full min-w-0 flex flex-col bg-default rounded-xl overflow-hidden">
    <div
      v-if="appInfo && appInfo.type !== 'web'"
      class="h-11 shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 border-b border-default bg-default"
    >
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-rotate-cw"
          size="sm"
          variant="ghost"
          color="neutral"
          @click="refreshApplet"
        />
      </div>
      <div class="min-w-0 max-w-96 truncate text-sm font-medium text-default">
        {{ appInfo.name }}
      </div>
      <div class="flex items-center justify-end gap-1">
        <UButton
          icon="i-lucide-x"
          size="sm"
          variant="ghost"
          color="neutral"
          @click="closeCurrentApplet"
        />
      </div>
    </div>
    <div v-if="errorMsg" class="flex-1 min-h-0 flex items-center justify-center p-8">
      <UEmpty
        icon="i-lucide-circle-alert"
        :title="t('applet.workspaceErrorTitle')"
        :description="errorMsg"
        size="lg"
      />
    </div>
    <WebAppWorkspace v-else-if="appInfo?.type === 'web'" :app="appInfo" />
    <div v-else-if="schema" class="flex-1 min-h-0 overflow-auto">
      <AppletSchemaRenderer
        :node="schema"
        :applet-state="appletState"
        :streaming-paths="streamingPaths"
        :applet-id="appletId"
        :dispatch="doDispatch"
      />
    </div>
    <div v-else class="flex-1 min-h-0 flex items-center justify-center text-muted">
      <UIcon name="i-lucide-loader" class="size-5 animate-spin" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import AppletSchemaRenderer from "@/components/applet/AppletSchemaRenderer.vue";
import WebAppWorkspace from "@/components/applet/WebAppWorkspace.vue";
import { useOpenedAppStore, type OpenedApplet } from "@/stores/useOpenedAppStore";
import type { AppletToastInput, UINode } from "@mirdel/applet-core";

defineOptions({ name: "AppWorkspaceView" });

const props = defineProps<{
  id: string;
}>();
const { t } = useI18n();
const toast = useToast();
const router = useRouter();
const openedAppStore = useOpenedAppStore();

const appletId = computed(() => {
  return typeof props.id === "string" ? props.id : "";
});
const schema = ref<UINode | null>(null);
const appletState = ref<Record<string, unknown>>({});
const streamingPaths = ref<string[]>([]);
const errorMsg = ref("");
const startedAppletId = ref("");
const appInfo = ref<OpenedApplet | null>(null);

let unsubStateSchema: (() => void) | null = null;
let unsubError: (() => void) | null = null;
let unsubToast: (() => void) | null = null;
let appletStyleLink: HTMLLinkElement | null = null;
let appliedAssetRunId = "";
let startVersion = 0;
let startPromiseById: { id: string; promise: Promise<void> } | null = null;

function resetRuntimeState() {
  startVersion += 1;
  schema.value = null;
  appletState.value = {};
  streamingPaths.value = [];
  errorMsg.value = "";
  startedAppletId.value = "";
  appInfo.value = null;
  appliedAssetRunId = "";
  if (appletStyleLink) {
    appletStyleLink.remove();
    appletStyleLink = null;
  }
}

function disposeSubscriptions() {
  unsubStateSchema?.();
  unsubError?.();
  unsubToast?.();
  unsubStateSchema = null;
  unsubError = null;
  unsubToast = null;
}

function applyAppletStyles(assetRunId: string | null | undefined) {
  const runId = String(assetRunId || "").trim();
  if (!runId || runId === appliedAssetRunId) return;
  appliedAssetRunId = runId;

  const href = `applet-asset://${encodeURIComponent(runId)}/applet.css?v=${Date.now()}`;
  if (!appletStyleLink) {
    appletStyleLink = document.createElement("link");
    appletStyleLink.rel = "stylesheet";
    document.head.appendChild(appletStyleLink);
  }
  appletStyleLink.href = href;
}

function isCurrentAppletPayload(payload: { appletId?: string } | null | undefined): boolean {
  return !payload?.appletId || payload.appletId === appletId.value;
}

function applyStatePayload(payload: {
  appletId?: string;
  state: unknown;
  schema: unknown;
  assetRunId?: string | null;
  streamingPaths?: string[];
}) {
  if (!isCurrentAppletPayload(payload)) return;
  errorMsg.value = "";
  schema.value = payload.schema as UINode;
  appletState.value =
    payload.state && typeof payload.state === "object" && !Array.isArray(payload.state)
      ? (payload.state as Record<string, unknown>)
      : {};
  streamingPaths.value = Array.isArray(payload.streamingPaths)
    ? payload.streamingPaths.map((item) => String(item)).filter((path) => path.trim().length > 0)
    : [];
  applyAppletStyles(payload.assetRunId);
}

function doDispatch(appletIdVal: string, action: unknown) {
  void window.applet.dispatch(appletIdVal, action);
}

function normalizeErrorPayload(payload: string | { appletId?: string; message?: string }): string | null {
  if (typeof payload === "string") return payload;
  if (!isCurrentAppletPayload(payload)) return null;
  return payload.message || t("applet.workspaceUnknownError");
}

function normalizeToastPayload(payload: AppletToastInput | { appletId?: string; input?: AppletToastInput }): AppletToastInput | null | undefined {
  if (payload && typeof payload === "object" && "input" in payload) {
    const wrapped = payload as { appletId?: string; input?: AppletToastInput };
    if (!isCurrentAppletPayload(wrapped)) return null;
    return wrapped.input;
  }
  return payload;
}

function ensureSubscriptions() {
  if (!unsubStateSchema) {
    unsubStateSchema = window.applet.onStateSchema(applyStatePayload);
  }
  if (!unsubError) {
    unsubError = window.applet.onError((payload) => {
      const message = normalizeErrorPayload(payload);
      if (message) errorMsg.value = message;
    });
  }
  if (!unsubToast) {
    unsubToast = window.applet.onToast((payload) => {
      const input = normalizeToastPayload(payload);
      if (!input) return;
      toast.add({
        title: input.title,
        description: input.description,
        icon: input.icon,
        color: input.color,
        duration: input.duration,
        close: input.close,
        progress: input.progress,
      });
    });
  }
}

async function doStartApplet(id: string, version: number) {
  resetRuntimeState();

  const applet = await openedAppStore.openApplet(id);
  if (!applet) {
    disposeSubscriptions();
    errorMsg.value = t("applet.notFound");
    return;
  }
  appInfo.value = applet;

  if (applet.type === "web") {
    startedAppletId.value = id;
    return;
  }

  ensureSubscriptions();

  const opened = await window.ipc("applet:workspaceOpen", { appletId: id });
  if (opened?.ok === false) {
    disposeSubscriptions();
    errorMsg.value = opened.error || t("applet.workspaceUnknownError");
    return;
  }

  startedAppletId.value = id;
  try {
    const payload = await window.applet.getInitialStateSchema(id);
    if (version !== startVersion) return;
    applyStatePayload(payload);
  } catch (error) {
    if (version !== startVersion) return;
    errorMsg.value = error instanceof Error ? error.message : String(error);
  }
}

async function startApplet() {
  const id = appletId.value;
  if (!id) return;
  if (startedAppletId.value === id) {
    await openedAppStore.markAppletOpened(id);
    return;
  }

  if (startPromiseById?.id === id) {
    await startPromiseById.promise;
    return;
  }

  const version = startVersion + 1;
  const promise = doStartApplet(id, version).finally(() => {
    if (startPromiseById?.id === id && startPromiseById.promise === promise) {
      startPromiseById = null;
    }
  });
  startPromiseById = { id, promise };
  await promise;
}

async function refreshApplet() {
  const id = appletId.value;
  if (!id) return;
  disposeSubscriptions();
  await window.ipc("applet:close", { appletId: id });
  resetRuntimeState();
  await startApplet();
}

async function closeCurrentApplet() {
  const id = appletId.value;
  if (!id) return;
  await openedAppStore.closeApplet(id);
  await router.push({ name: "applet" });
}

watch(
  () => openedAppStore.isAppletOpened(appletId.value),
  (isOpened) => {
    if (!isOpened && startedAppletId.value === appletId.value) {
      disposeSubscriptions();
      resetRuntimeState();
    }
  }
);

onMounted(() => {
  void startApplet();
});

onActivated(() => {
  void startApplet();
});

onUnmounted(() => {
  disposeSubscriptions();
  resetRuntimeState();
});
</script>
