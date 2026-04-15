export type SessionCategoryId =
  | string
  | "__all__"
  | "__uncategorized__"
  | "__starred__"
  | "__archived__"
  | null;

export type SessionCategorySession = {
  id: string;
  rootSessionId: string | null;
  parentSessionId?: string | null;
  projectId: string | null;
  isTemporary: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  updatedAt: number;
};

export type SessionTreeItem<T extends SessionCategorySession> = T & {
  branches: T[];
};

export function isSessionInCategory(
  projectId: string | null | undefined,
  currentProjectId: SessionCategoryId
) {
  if (currentProjectId === "__all__") return true;
  if (currentProjectId === "__uncategorized__") return !projectId;
  if (currentProjectId === "__starred__") return true;
  return projectId === currentProjectId;
}

export function buildSessionTree<T extends SessionCategorySession>(
  sessions: T[],
  currentProjectId: SessionCategoryId
): SessionTreeItem<T>[] {
  const mainSessions = sessions
    .filter((session) => !session.rootSessionId && !session.isTemporary)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const filteredMainSessions = mainSessions.filter((session) => {
    if (currentProjectId === "__archived__") {
      return session.isArchived;
    }
    if (currentProjectId === "__starred__") {
      return session.isFavorite && !session.isArchived;
    }
    return !session.isArchived && isSessionInCategory(session.projectId, currentProjectId);
  });

  const isArchivedView = currentProjectId === "__archived__";

  const branchesByRoot = new Map<string, T[]>();
  for (const session of sessions) {
    if (!session.rootSessionId) continue;
    if (isArchivedView ? !session.isArchived : session.isArchived) continue;
    if (!isArchivedView && currentProjectId !== "__starred__" && !isSessionInCategory(session.projectId, currentProjectId)) continue;
    const list = branchesByRoot.get(session.rootSessionId);
    if (list) {
      list.push(session);
    } else {
      branchesByRoot.set(session.rootSessionId, [session]);
    }
  }

  return filteredMainSessions.map((mainSession) => ({
    ...mainSession,
    branches: (branchesByRoot.get(mainSession.id) || []).sort((a, b) => b.updatedAt - a.updatedAt),
  }));
}

export function buildProjectSessionStats<T extends SessionCategorySession>(sessions: T[]) {
  const nonTemporarySessions = sessions.filter((session) => !session.isTemporary);
  const activeSessions = nonTemporarySessions.filter((session) => !session.isArchived);
  const sessionCountByProjectId = new Map<string | null, number>();

  for (const session of activeSessions) {
    const key = session.projectId ?? null;
    sessionCountByProjectId.set(key, (sessionCountByProjectId.get(key) ?? 0) + 1);
  }

  return {
    nonTemporarySessions,
    activeSessions,
    sessionCountByProjectId,
    favoriteCount: activeSessions.filter((session) => !session.rootSessionId && session.isFavorite).length,
    archivedCount: nonTemporarySessions.filter((session) => !session.rootSessionId && session.isArchived).length,
  };
}
