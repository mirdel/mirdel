import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { Router } from "../../main/ipc/router";
import { loggerServiceRenderer } from "@shared";

const logger = loggerServiceRenderer.withContext("updates");

type UpdateState = Awaited<ReturnType<Router["updates:getState"]>>;
type ChangelogVersion = Awaited<ReturnType<Router["updates:getChangelog"]>>[number];
type PendingReleaseNotes = NonNullable<Awaited<ReturnType<Router["updates:getPendingReleaseNotes"]>>>;

const defaultState: UpdateState = {
  status: "idle",
  currentVersion: "",
  availableVersion: null,
  downloadedVersion: null,
  progress: null,
  error: null,
  canCheck: true,
  isPackaged: true,
};

function getMockDownloadedState(currentState: UpdateState): UpdateState {
  return {
    ...currentState,
    status: "downloaded",
    currentVersion: currentState.currentVersion || "0.1.0",
    availableVersion: "0.1.1",
    downloadedVersion: "0.1.1",
    progress: null,
    error: null,
    canCheck: true,
    isPackaged: true,
  };
}

export const useUpdateStore = defineStore("updates", () => {
  const state = ref<UpdateState>({ ...defaultState });
  const changelog = ref<ChangelogVersion[]>([]);
  const pendingReleaseNotes = ref<PendingReleaseNotes | null>(null);
  const restartModalOpen = ref(false);
  const releaseNotesModalOpen = ref(false);
  const initialized = ref(false);
  let unsubscribeState: (() => void) | null = null;
  const mockDownloadedUpdate = ref(false);

  const updateReady = computed(() => state.value.status === "downloaded");
  const checking = computed(() => state.value.status === "checking");
  const downloading = computed(() => state.value.status === "downloading");
  const progressPercent = computed(() => Math.max(0, Math.min(100, state.value.progress?.percent ?? 0)));
  const targetVersion = computed(() => state.value.downloadedVersion || state.value.availableVersion);

  async function initialize(locale: string) {
    if (initialized.value) return;
    initialized.value = true;
    unsubscribeState = window.updates.onState((nextState) => {
      state.value = mockDownloadedUpdate.value ? getMockDownloadedState(nextState) : nextState;
    });
    await refreshState();
    await Promise.all([
      loadChangelog(locale),
      loadPendingReleaseNotes(locale),
    ]);
  }

  async function refreshState() {
    const nextState = await window.ipc("updates:getState");
    state.value = mockDownloadedUpdate.value ? getMockDownloadedState(nextState) : nextState;
  }

  async function checkForUpdates() {
    if (mockDownloadedUpdate.value) {
      state.value = getMockDownloadedState(state.value);
      return;
    }

    try {
      state.value = await window.ipc("updates:check");
    } catch (error) {
      logger.error("failed to check for updates", { error });
      throw error;
    }
  }

  async function installUpdate() {
    if (mockDownloadedUpdate.value) {
      restartModalOpen.value = false;
      return;
    }

    const result = await window.ipc("updates:install");
    if (!result.ok) {
      throw new Error(result.error || "Failed to install update");
    }
  }

  async function loadChangelog(locale: string) {
    changelog.value = await window.ipc("updates:getChangelog", { locale });
  }

  async function loadPendingReleaseNotes(locale: string) {
    pendingReleaseNotes.value = await window.ipc("updates:getPendingReleaseNotes", { locale });
    releaseNotesModalOpen.value = !!pendingReleaseNotes.value;
  }

  async function markPendingReleaseNotesSeen() {
    const version = pendingReleaseNotes.value?.version;
    await window.ipc("updates:markReleaseNotesSeen", { version });
    pendingReleaseNotes.value = null;
    releaseNotesModalOpen.value = false;
  }

  function openRestartModal() {
    if (!updateReady.value) return;
    restartModalOpen.value = true;
  }

  function closeRestartModal() {
    restartModalOpen.value = false;
  }

  function openMockReleaseNotes() {
    if (!import.meta.env.DEV) return;
    const latest = changelog.value[0] || null;
    pendingReleaseNotes.value = {
      version: latest?.version || "0.1.1",
      notes: latest,
    };
    releaseNotesModalOpen.value = true;
  }

  function mockDownloadedUpdateReady() {
    if (!import.meta.env.DEV) return;
    mockDownloadedUpdate.value = true;
    state.value = getMockDownloadedState(state.value);
  }

  function dispose() {
    unsubscribeState?.();
    unsubscribeState = null;
    initialized.value = false;
  }

  return {
    state,
    changelog,
    pendingReleaseNotes,
    restartModalOpen,
    releaseNotesModalOpen,
    updateReady,
    checking,
    downloading,
    progressPercent,
    targetVersion,
    initialize,
    refreshState,
    checkForUpdates,
    installUpdate,
    loadChangelog,
    loadPendingReleaseNotes,
    markPendingReleaseNotesSeen,
    openRestartModal,
    closeRestartModal,
    openMockReleaseNotes,
    mockDownloadedUpdateReady,
    dispose,
  };
});
