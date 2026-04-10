import { getDb } from "../db";
import { nanoid as nanoId } from "nanoid";

export type Project = {
  id: string;
  name: string;
  description?: string;
  scenarioId: string;
  color?: string;
  icon?: string;
  createdAt: number;
  updatedAt: number;
};

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  scenarioId: string;
  color: string | null;
  icon: string | null;
  createdAt: number;
  updatedAt: number;
};

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    scenarioId: row.scenarioId,
    color: row.color || undefined,
    icon: row.icon || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

/**
 * 获取所有项目，按 updatedAt 降序排序
 */
export function listProjects(): Project[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM projects ORDER BY updatedAt DESC`)
    .all() as ProjectRow[];
  return rows.map(rowToProject);
}

/**
 * 创建新项目
 */
export function createProject(input: {
  name: string;
  description?: string;
  scenarioId: string;
  color?: string;
  icon?: string;
}): Project {
  const db = getDb();
  const now = Date.now();
  const id = nanoId();

  db.prepare(
    `INSERT INTO projects (id, name, description, scenarioId, color, icon, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, 
    input.name, 
    input.description || null, 
    input.scenarioId, 
    input.color || null,
    input.icon || null,
    now, 
    now
  );

  return getProject(id)!;
}

/**
 * 获取单个项目
 */
export function getProject(id: string): Project | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM projects WHERE id = ?`)
    .get(id) as ProjectRow | undefined;
  return row ? rowToProject(row) : null;
}

/**
 * 更新项目
 */
export function updateProject(
  id: string,
  input: Partial<{
    name: string;
    description: string;
    scenarioId: string;
    color: string;
    icon: string;
  }>
): Project {
  const db = getDb();
  const now = Date.now();

  const updates: string[] = [];
  const values: any[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    values.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push('description = ?');
    values.push(input.description || null);
  }
  if (input.scenarioId !== undefined) {
    updates.push('scenarioId = ?');
    values.push(input.scenarioId);
  }
  if (input.color !== undefined) {
    updates.push('color = ?');
    values.push(input.color || null);
  }
  if (input.icon !== undefined) {
    updates.push('icon = ?');
    values.push(input.icon || null);
  }

  updates.push('updatedAt = ?');
  values.push(now);

  values.push(id);

  db.prepare(
    `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`
  ).run(...values);

  return getProject(id)!;
}

/**
 * 删除项目
 * 删除前会将该分类下的会话移至未分类（projectId 置为 null）
 */
export function deleteProject(id: string): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET projectId = NULL WHERE projectId = ?').run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

/**
 * 获取项目下的会话数量
 */
export function getProjectSessionCount(projectId: string): number {
  const db = getDb();
  const result = db
    .prepare(`
      SELECT COUNT(*) as count FROM sessions
      WHERE projectId = ?
        AND (isTemporary IS NULL OR isTemporary = 0)
    `)
    .get(projectId) as { count: number };
  return result.count;
}

/**
 * 获取未分类会话数量
 */
export function getUncategorizedSessionCount(): number {
  const db = getDb();
  const result = db
    .prepare(`
      SELECT COUNT(*) as count FROM sessions
      WHERE projectId IS NULL
        AND (isTemporary IS NULL OR isTemporary = 0)
    `)
    .get() as { count: number };
  return result.count;
}
