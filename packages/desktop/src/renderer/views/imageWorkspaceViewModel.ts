export type ImageWorkspaceViewGroup = {
  id: string;
  images: Array<{ id: string }>;
};

export type ImageWorkspaceViewRecord = {
  id: string;
  name: string;
  createdAt?: number;
  updatedAt: number;
  groups: ImageWorkspaceViewGroup[];
  lastComposer?: unknown;
};

export type ImageGroupCreateResult = {
  id: string;
  prompt: string;
  createdAt: number;
  status: string;
  params: Record<string, unknown>;
  images: Array<{ id: string }>;
  selectedModel: string;
  errorMessage?: string;
  warningMessage?: string;
  runs: Array<{ id: string }>;
};

export type ImageReuseGroup = {
  id: string;
  prompt: string;
  params: {
    taskType?: string;
    modelKey?: string;
    aspectRatio?: string;
    size?: string;
    quality?: string;
    count?: number;
    seed?: number | null;
    negativePrompt?: string;
    promptExtend?: boolean;
    watermark?: boolean;
    editFunction?: string;
    providerOptions?: Record<string, unknown>;
    referenceImages?: Array<{ id?: string; name?: string; url?: string }>;
    maskImage?: { id?: string; name?: string; url?: string } | null;
  };
};

export type ImageRunRetryCandidate = {
  id: string;
  prompt: string;
  status: string;
  selectedModel: string;
  params: Record<string, unknown>;
};

export function normalizeImageWorkspaceRows(
  rows: Array<Partial<Omit<ImageWorkspaceViewRecord, "groups">>> | null | undefined
): ImageWorkspaceViewRecord[] {
  return (rows ?? [])
    .filter((item): item is Partial<Omit<ImageWorkspaceViewRecord, "groups">> & { id: string; name: string } => (
      !!item
      && typeof item.id === "string"
      && item.id.trim().length > 0
      && typeof item.name === "string"
      && item.name.trim().length > 0
    ))
    .map((item) => ({
      id: item.id.trim(),
      name: item.name.trim(),
      createdAt: item.createdAt,
      updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : 0,
      groups: [],
      lastComposer: item.lastComposer,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function resolveWorkspaceSelection(
  workspaces: Array<Pick<ImageWorkspaceViewRecord, "id">>,
  routeWorkspaceId: string,
  activeWorkspaceId: string
) {
  if (routeWorkspaceId && workspaces.some((item) => item.id === routeWorkspaceId)) {
    return routeWorkspaceId;
  }

  if (activeWorkspaceId && workspaces.some((item) => item.id === activeWorkspaceId)) {
    return activeWorkspaceId;
  }

  return workspaces[0]?.id ?? "";
}

export function removeWorkspaceFromState(
  workspaces: ImageWorkspaceViewRecord[],
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
    ? (nextWorkspaces[Math.max(0, index - 1)]?.id ?? nextWorkspaces[0]?.id ?? "")
    : activeWorkspaceId;

  return {
    workspaces: nextWorkspaces,
    activeWorkspaceId: nextActiveWorkspaceId,
  };
}

export function appendCreatedImageGroup(
  workspaces: ImageWorkspaceViewRecord[],
  workspaceId: string,
  group: ImageGroupCreateResult,
  updatedAt: number,
  lastComposer?: unknown
) {
  return workspaces.map((workspace) => (
    workspace.id === workspaceId
      ? {
        ...workspace,
        updatedAt,
        groups: [...workspace.groups, group],
        lastComposer: lastComposer ?? workspace.lastComposer,
      }
      : workspace
  ));
}

export function clearImageSelectionAfterRemoval(
  selectedGroupId: string,
  selectedImageId: string,
  removedGroupId: string,
  removedImageId: string
) {
  if (selectedGroupId !== removedGroupId || selectedImageId !== removedImageId) {
    return {
      selectedGroupId,
      selectedImageId,
    };
  }

  return {
    selectedGroupId: "",
    selectedImageId: "",
  };
}

export function resolveImageRemovalAction(groupStatus: string, imageCount: number) {
  if (groupStatus === "queued" || groupStatus === "running") {
    return "noop" as const;
  }

  return imageCount <= 1 ? "delete-group" as const : "delete-asset" as const;
}

export function buildImageRetryRunInput(
  workspaceId: string,
  groupId: string,
  run: ImageRunRetryCandidate
) {
  if (!workspaceId) return null;
  if (run.status !== "failed" && run.status !== "cancelled") return null;

  return {
    workspaceId,
    groupId,
    prompt: run.prompt,
    selectedModel: run.selectedModel,
    params: run.params,
    replaceFailedRunId: run.id,
  };
}

export function buildImageReuseComposerState(
  group: ImageReuseGroup,
  createId: (prefix: string) => string
) {
  const nextTask = group.params.taskType === "edit" ? "edit" as const : "generate" as const;

  return {
    activeTask: nextTask,
    composer: {
      prompt: group.prompt,
      taskType: nextTask,
      modelKey: group.params.modelKey || "",
      aspectRatio: group.params.aspectRatio || "",
      size: group.params.size || "",
      quality: typeof group.params.quality === "string" ? group.params.quality : "",
      count: typeof group.params.count === "number" ? group.params.count : 1,
      seed: typeof group.params.seed === "number" ? group.params.seed : null,
      negativePrompt: group.params.negativePrompt || "",
      promptExtend: !!group.params.promptExtend,
      watermark: !!group.params.watermark,
      editFunction: typeof group.params.editFunction === "string" ? group.params.editFunction : "",
      providerOptions: { ...(group.params.providerOptions || {}) },
      referenceImages: (group.params.referenceImages || [])
        .filter((item) => !!item && typeof item.url === "string" && item.url.length > 0)
        .map((item) => ({ id: item.id || createId("ref"), name: item.name || "", url: item.url as string })),
      maskImage: group.params.maskImage && typeof group.params.maskImage.url === "string" && group.params.maskImage.url.length > 0
        ? {
          id: group.params.maskImage.id || createId("mask"),
          name: group.params.maskImage.name || "",
          url: group.params.maskImage.url,
        }
        : null,
    },
    selection: {
      selectedGroupId: group.id,
      selectedImageId: "",
    },
  };
}
