export type VideoAssetSelection = {
  id: string;
};

export type VideoGroupSelection = {
  id: string;
  videos: VideoAssetSelection[];
};

export type VideoWorkspaceViewRecord = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  groups: VideoGroupSelection[];
  lastComposer?: unknown;
};

export type VideoRetryGroup = {
  id: string;
};

export type VideoRetryRun = {
  prompt: string;
  status: string;
  selectedModel: string;
  params?: Record<string, unknown>;
};

export type VideoReuseGroup = {
  prompt: string;
  selectedModel?: string;
  params?: Record<string, unknown>;
  runs: Array<{
    prompt: string;
    selectedModel: string;
    params?: Record<string, unknown>;
  }>;
};

export function normalizeVideoWorkspaceRows(
  rows: Array<Partial<Omit<VideoWorkspaceViewRecord, "groups">>> | null | undefined,
  fallbackName: string,
  nowTs: number
): VideoWorkspaceViewRecord[] {
  return (Array.isArray(rows) ? rows : [])
    .map((item) => ({
      ...item,
      id: typeof item?.id === "string" ? item.id : "",
      name: (typeof item?.name === "string" ? item.name.trim() : "") || fallbackName,
      createdAt: typeof item?.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : nowTs,
      updatedAt: typeof item?.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : nowTs,
      groups: [] as VideoGroupSelection[],
    }))
    .filter((item) => item.id.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function resolveWorkspaceSelection(
  workspaces: Array<Pick<VideoWorkspaceViewRecord, "id">>,
  routeWorkspaceId: string,
  activeWorkspaceId: string
) {
  if (routeWorkspaceId && workspaces.some((item) => item.id === routeWorkspaceId)) {
    return routeWorkspaceId;
  }

  if (activeWorkspaceId && workspaces.some((item) => item.id === activeWorkspaceId)) {
    return activeWorkspaceId;
  }

  return workspaces[0]?.id || "";
}

export function removeWorkspaceFromState(
  workspaces: VideoWorkspaceViewRecord[],
  workspaceId: string,
  activeWorkspaceId: string
) {
  const index = workspaces.findIndex((item) => item.id === workspaceId);
  if (index < 0) {
    return {
      workspaces,
      activeWorkspaceId,
    };
  }

  const nextWorkspaces = workspaces.filter((item) => item.id !== workspaceId);
  const nextActiveWorkspaceId = activeWorkspaceId === workspaceId
    ? (nextWorkspaces[Math.max(0, index - 1)]?.id || nextWorkspaces[0]?.id || "")
    : activeWorkspaceId;

  return {
    workspaces: nextWorkspaces,
    activeWorkspaceId: nextActiveWorkspaceId,
  };
}

export function replaceWorkspaceGroups(
  workspaces: VideoWorkspaceViewRecord[],
  workspaceId: string,
  groups: VideoGroupSelection[]
) {
  return workspaces.map((workspace) => (
    workspace.id === workspaceId ? { ...workspace, groups } : workspace
  ));
}

export function reconcileVideoDetailSelection(
  groups: VideoGroupSelection[],
  selectedGroupId: string,
  selectedVideoId: string
) {
  const detailGroup = groups.find((item) => item.id === selectedGroupId);
  const detailVideo = detailGroup?.videos.find((item) => item.id === selectedVideoId);

  if (detailGroup && detailVideo) {
    return {
      selectedGroupId,
      selectedVideoId,
      shouldClearDetail: false,
    };
  }

  return {
    selectedGroupId: "",
    selectedVideoId: "",
    shouldClearDetail: true,
  };
}

export function resolveVideoRemovalAction(groupStatus: string, videoCount: number) {
  if (groupStatus === "queued" || groupStatus === "running") {
    return "noop" as const;
  }

  return videoCount <= 1 ? "delete-group" as const : "delete-asset" as const;
}

export function buildVideoRetryRunInput(
  workspaceId: string,
  group: VideoRetryGroup,
  run: VideoRetryRun
) {
  if (!workspaceId) return null;

  return {
    workspaceId,
    generationId: group.id,
    selectedModel: run.selectedModel,
    prompt: run.prompt,
    params: run.params || {},
  };
}

export function buildVideoReuseComposerState(
  group: VideoReuseGroup,
  createId: (prefix: string) => string,
  countRange: { min: number; max: number }
) {
  const targetRun = group.runs[group.runs.length - 1] || null;
  const params = (targetRun?.params || group.params || {}) as Record<string, unknown>;
  const rawCount = Number(params.count || 1);
  const nextCount = Number.isFinite(rawCount)
    ? Math.min(countRange.max, Math.max(countRange.min, Math.floor(rawCount)))
    : countRange.min;

  return {
    prompt: targetRun?.prompt || group.prompt || "",
    modelKey: targetRun?.selectedModel || group.selectedModel || "",
    aspectRatio: typeof params.aspectRatio === "string" ? params.aspectRatio : "",
    resolution: typeof params.resolution === "string" ? params.resolution : "",
    duration: typeof params.duration === "number" ? params.duration : null,
    fps: typeof params.fps === "number" ? params.fps : null,
    count: nextCount,
    seed: typeof params.seed === "number" ? params.seed : null,
    negativePrompt: typeof params.negativePrompt === "string" ? params.negativePrompt : "",
    referenceImages: Array.isArray(params.referenceImages)
      ? params.referenceImages
        .filter((item): item is { id?: string; name?: string; url: string } => !!item && typeof (item as { url?: unknown }).url === "string" && (item as { url: string }).url.trim().length > 0)
        .map((item) => ({ id: item.id || createId("ref"), name: item.name || "", url: item.url }))
      : [],
    providerOptions: params.providerOptions && typeof params.providerOptions === "object" && !Array.isArray(params.providerOptions)
      ? { ...(params.providerOptions as Record<string, unknown>) }
      : {},
  };
}
