import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { getPersistentValue, setPersistentValue } from "@/utils/persistentState";

const OPENED_APPLETS_STORAGE_KEY = "mirdel.openedAppletIds";

export type OpenedApplet = {
  id: string;
  type: "applet" | "web";
  name: string;
  description?: string;
  webUrl?: string;
  logo?: string;
};

function toOpenedApplet(input: unknown): OpenedApplet | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!id || !name) return null;
  return {
    id,
    type: obj.type === "web" ? "web" : "applet",
    name,
    description: typeof obj.description === "string" ? obj.description : undefined,
    webUrl: typeof obj.webUrl === "string" ? obj.webUrl : undefined,
    logo: typeof obj.logo === "string" ? obj.logo : undefined,
  };
}

function readPersistedAppletIds(): string[] {
  try {
    const parsed = getPersistentValue<unknown>(OPENED_APPLETS_STORAGE_KEY, []);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const seen = new Set<string>();
    return parsed
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((id) => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  } catch {
    return [];
  }
}

async function writePersistedAppletIds(ids: string[]) {
  await setPersistentValue(OPENED_APPLETS_STORAGE_KEY, ids);
}

export const useOpenedAppStore = defineStore("openedApps", () => {
  const openedApplets = ref<OpenedApplet[]>([]);
  const openedAppletIds = computed(() => new Set(openedApplets.value.map((item) => item.id)));
  let restorePromise: Promise<void> | null = null;

  async function persistOpenedAppletIds() {
    await writePersistedAppletIds(openedApplets.value.map((item) => item.id));
  }

  async function upsertApplet(applet: OpenedApplet) {
    const existingIndex = openedApplets.value.findIndex((item) => item.id === applet.id);
    if (existingIndex >= 0) {
      openedApplets.value.splice(existingIndex, 1, {
        ...openedApplets.value[existingIndex],
        ...applet,
      });
      await persistOpenedAppletIds();
      return;
    }
    openedApplets.value.push(applet);
    await persistOpenedAppletIds();
  }

  async function restoreOpenedApplets(): Promise<void> {
    if (restorePromise) {
      return restorePromise;
    }

    restorePromise = (async () => {
      const persistedIds = readPersistedAppletIds();
      if (persistedIds.length === 0) {
        return;
      }

      const list = await window.ipc("applet:list");
      const appletById = new Map<string, OpenedApplet>();
      if (Array.isArray(list)) {
        for (const item of list) {
          const applet = toOpenedApplet(item);
          if (applet) appletById.set(applet.id, applet);
        }
      }

      const restored = persistedIds
        .map((id) => appletById.get(id))
        .filter((item): item is OpenedApplet => Boolean(item));
      const existing = openedApplets.value.filter((item) => !persistedIds.includes(item.id));
      openedApplets.value = [...restored, ...existing];
      await persistOpenedAppletIds();
    })()
      .catch((error) => {
        console.warn("failed to restore opened applets", error);
      })
      .finally(() => {
        restorePromise = null;
      });

    return restorePromise;
  }

  async function openApplet(appletId: string): Promise<OpenedApplet | null> {
    const existing = openedApplets.value.find((item) => item.id === appletId);
    if (existing) return existing;

    const applet = toOpenedApplet(await window.ipc("applet:get", { id: appletId }));
    if (!applet) return null;
    await upsertApplet(applet);
    return applet;
  }

  async function closeApplet(appletId: string): Promise<void> {
    const existing = openedApplets.value.find((item) => item.id === appletId);
    if (existing?.type === "web") {
      window.appWebView.close(appletId);
    }
    openedApplets.value = openedApplets.value.filter((item) => item.id !== appletId);
    await persistOpenedAppletIds();
    await window.ipc("applet:close", { appletId });
  }

  function isAppletOpened(appletId: string): boolean {
    return openedAppletIds.value.has(appletId);
  }

  return {
    openedApplets,
    openedAppletIds,
    upsertApplet,
    restoreOpenedApplets,
    openApplet,
    closeApplet,
    isAppletOpened,
  };
});
