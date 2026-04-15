/**
 * 知识库数据层
 * 
 * 负责知识库相关的数据库操作
 */

import { getDb, createKbVectorTable, dropKbVectorTable, toKbVectorTableName, kbVectorTableExists } from "../db";
import { nanoid } from "nanoid";
import { deleteKnowledgeSearchDocsByItemId, deleteKnowledgeSearchDocsByKbId } from "../search/searchIndex";

// ==================== 类型定义 ====================

export type KbItemType = 'text' | 'file' | 'directory' | 'url';
export type KbItemStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  /** embedding 模型配置（格式：providerId/modelId），'__default__' 表示使用默认 */
  embeddingModel?: string;
  /** embedding 向量维度 */
  embeddingDimension?: number;
  createdAt: number;
  updatedAt: number;
}

export interface KbItem {
  id: string;
  kbId: string;
  type: KbItemType;
  name: string;
  /** 文件路径 / URL / 目录路径（text 类型为空） */
  source?: string;
  /** 原始文本内容（text 类型用） */
  content?: string;
  status: KbItemStatus;
  error?: string;
  fileType?: string;
  fileSize?: number;
  /** 文件修改时间（用于变更检测） */
  fileMtime?: number;
  /** 目录扫描深度（仅 directory 类型） */
  maxDepth?: number;
  chunkCount: number;
  lastSyncAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface KbChunk {
  id: number;
  itemId: string;
  kbId: string;
  content: string;
  chunkIndex: number;
  metadata?: string;
  createdAt: number;
}

// ==================== 知识库 CRUD ====================

/**
 * 列出所有知识库
 */
export function listKnowledgeBases(): KnowledgeBase[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, name, description, embeddingModel, embeddingDimension, createdAt, updatedAt
    FROM kbs
    ORDER BY updatedAt DESC
  `).all() as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    embeddingModel: row.embeddingModel || undefined,
    embeddingDimension: row.embeddingDimension != null ? row.embeddingDimension : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

/**
 * 获取单个知识库
 */
export function getKnowledgeBase(id: string): KnowledgeBase | undefined {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, name, description, embeddingModel, embeddingDimension, createdAt, updatedAt
    FROM kbs WHERE id = ?
  `).get(id) as any;

  if (!row) return undefined;

  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    embeddingModel: row.embeddingModel || undefined,
    embeddingDimension: row.embeddingDimension != null ? row.embeddingDimension : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

/**
 * 创建知识库（同时创建专属向量表）
 */
export function createKnowledgeBase(input: {
  name: string;
  description?: string;
  embeddingModel?: string;
  embeddingDimension: number;
}): KnowledgeBase {
  const db = getDb();
  const now = Date.now();
  const id = nanoid();
  const dimension = Math.max(1, Math.floor(input.embeddingDimension));

  db.prepare(`
    INSERT INTO kbs (id, name, description, embeddingModel, embeddingDimension, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.name, input.description || null, input.embeddingModel || null, dimension, now, now);

  createKbVectorTable(id, dimension);

  return {
    id,
    name: input.name,
    description: input.description,
    embeddingModel: input.embeddingModel,
    embeddingDimension: dimension,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * 更新知识库（仅 name、description，不涉及模型/维度）
 */
export function updateKnowledgeBase(id: string, updates: Partial<Pick<KnowledgeBase, 'name' | 'description'>>): void {
  const db = getDb();
  const now = Date.now();
  
  const sets: string[] = ['updatedAt = ?'];
  const values: any[] = [now];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    sets.push('description = ?');
    values.push(updates.description || null);
  }

  values.push(id);
  db.prepare(`UPDATE kbs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * 迁移知识库（更新模型/维度，重建向量表，所有条目需重新处理）
 */
export function migrateKnowledgeBase(id: string, updates: Pick<KnowledgeBase, 'embeddingModel' | 'embeddingDimension'>): void {
  const db = getDb();
  const now = Date.now();
  if (updates.embeddingDimension == null) throw new Error("embeddingDimension is required for migration");
  const dimension = Math.max(1, Math.floor(updates.embeddingDimension));

  dropKbVectorTable(id);
  db.prepare(`DELETE FROM kb_chunks WHERE kbId = ?`).run(id);
  createKbVectorTable(id, dimension);

  db.prepare(`
    UPDATE kbs SET embeddingModel = ?, embeddingDimension = ?, updatedAt = ? WHERE id = ?
  `).run(updates.embeddingModel || null, dimension, now, id);

  db.prepare(`
    UPDATE kb_items SET status = 'pending', error = NULL, chunkCount = 0, lastSyncAt = NULL WHERE kbId = ?
  `).run(id);
  deleteKnowledgeSearchDocsByKbId(id);
}

/**
 * 删除知识库（级联删除 items、chunks、向量表）
 */
export function deleteKnowledgeBase(id: string): void {
  const db = getDb();
  
  dropKbVectorTable(id);
  db.prepare(`DELETE FROM kb_chunks WHERE kbId = ?`).run(id);
  db.prepare(`DELETE FROM kb_items WHERE kbId = ?`).run(id);
  db.prepare(`DELETE FROM kbs WHERE id = ?`).run(id);
  deleteKnowledgeSearchDocsByKbId(id);
}

// ==================== 知识库内容项 CRUD ====================

/**
 * 列出知识库的所有内容项
 */
export function listKbItems(kbId: string): KbItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM kb_items WHERE kbId = ? ORDER BY createdAt DESC
  `).all(kbId) as any[];

  return rows.map(mapKbItemRow);
}

/**
 * 按类型列出内容项
 */
export function listKbItemsByType(kbId: string, type: KbItemType): KbItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM kb_items WHERE kbId = ? AND type = ? ORDER BY createdAt DESC
  `).all(kbId, type) as any[];

  return rows.map(mapKbItemRow);
}

/**
 * 获取单个内容项
 */
export function getKbItem(id: string): KbItem | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM kb_items WHERE id = ?`).get(id) as any;
  if (!row) return undefined;
  return mapKbItemRow(row);
}

/**
 * 创建内容项
 */
export function createKbItem(input: {
  kbId: string;
  type: KbItemType;
  name: string;
  source?: string;
  content?: string;
  fileType?: string;
  fileSize?: number;
  fileMtime?: number;
  maxDepth?: number;
}): KbItem {
  const db = getDb();
  const now = Date.now();
  const id = nanoid();

  db.prepare(`
    INSERT INTO kb_items (
      id, kbId, type, name, source, content, status, 
      fileType, fileSize, fileMtime, maxDepth, chunkCount, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.kbId, input.type, input.name,
    input.source || null, input.content || null, 'pending',
    input.fileType || null, input.fileSize || null, input.fileMtime || null,
    input.maxDepth || null, 0, now, now
  );

  return {
    id,
    kbId: input.kbId,
    type: input.type,
    name: input.name,
    source: input.source,
    content: input.content,
    status: 'pending',
    fileType: input.fileType,
    fileSize: input.fileSize,
    fileMtime: input.fileMtime,
    maxDepth: input.maxDepth,
    chunkCount: 0,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * 更新内容项
 */
export function updateKbItem(id: string, updates: Partial<Omit<KbItem, 'id' | 'kbId' | 'createdAt'>>): void {
  const db = getDb();
  const now = Date.now();
  
  const sets: string[] = ['updatedAt = ?'];
  const values: any[] = [now];

  const fields: (keyof typeof updates)[] = [
    'type', 'name', 'source', 'content', 'status', 'error',
    'fileType', 'fileSize', 'fileMtime', 'maxDepth', 'chunkCount', 'lastSyncAt'
  ];

  for (const field of fields) {
    if (updates[field] !== undefined) {
      sets.push(`${field} = ?`);
      values.push(updates[field] ?? null);
    }
  }

  values.push(id);
  db.prepare(`UPDATE kb_items SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * 删除内容项（级联删除 chunks 和 vectors）
 */
export function deleteKbItem(id: string): void {
  const db = getDb();
  const itemRow = db.prepare(`SELECT kbId FROM kb_items WHERE id = ?`).get(id) as { kbId: string } | undefined;
  const kbId = itemRow?.kbId;

  if (kbId && kbVectorTableExists(kbId)) {
    const tableName = toKbVectorTableName(kbId);
    db.prepare(`
      DELETE FROM "${tableName}" WHERE id IN (SELECT id FROM kb_chunks WHERE itemId = ?)
    `).run(id);
  }

  db.prepare(`DELETE FROM kb_chunks WHERE itemId = ?`).run(id);
  db.prepare(`DELETE FROM kb_items WHERE id = ?`).run(id);
  deleteKnowledgeSearchDocsByItemId(id);
}

// ==================== Chunks CRUD ====================

/**
 * 批量创建 chunks
 */
export function createKbChunks(chunks: Array<{
  itemId: string;
  kbId: string;
  content: string;
  chunkIndex: number;
  metadata?: string;
}>): number[] {
  const db = getDb();
  const now = Date.now();
  const ids: number[] = [];

  const stmt = db.prepare(`
    INSERT INTO kb_chunks (itemId, kbId, content, chunkIndex, metadata, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const chunk of chunks) {
    const result = stmt.run(
      chunk.itemId, chunk.kbId, chunk.content, 
      chunk.chunkIndex, chunk.metadata || null, now
    );
    ids.push(Number(result.lastInsertRowid));
  }

  return ids;
}

/**
 * 获取 item 的所有 chunks
 */
export function getKbChunksByItem(itemId: string): KbChunk[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM kb_chunks WHERE itemId = ? ORDER BY chunkIndex
  `).all(itemId) as any[];

  return rows.map(row => ({
    id: row.id,
    itemId: row.itemId,
    kbId: row.kbId,
    content: row.content,
    chunkIndex: row.chunkIndex,
    metadata: row.metadata || undefined,
    createdAt: row.createdAt
  }));
}

/**
 * 删除 item 的所有 chunks
 */
export function deleteKbChunksByItem(itemId: string): void {
  const db = getDb();
  const row = db.prepare(`SELECT kbId FROM kb_chunks WHERE itemId = ? LIMIT 1`).get(itemId) as { kbId: string } | undefined;
  const kbId = row?.kbId;

  if (kbId && kbVectorTableExists(kbId)) {
    const tableName = toKbVectorTableName(kbId);
    db.prepare(`
      DELETE FROM "${tableName}" WHERE id IN (SELECT id FROM kb_chunks WHERE itemId = ?)
    `).run(itemId);
  }

  db.prepare(`DELETE FROM kb_chunks WHERE itemId = ?`).run(itemId);
}

// ==================== Vectors CRUD ====================

/**
 * 批量存储向量（与 chunk id 一一对应）
 * 使用知识库专属向量表
 */
export function saveKbVectors(kbId: string, vectors: Array<{ chunkId: number; embedding: number[] }>): void {
  if (vectors.length === 0) return;
  if (!kbVectorTableExists(kbId)) throw new Error(`知识库向量表不存在: ${kbId}`);

  const db = getDb();
  const tableName = toKbVectorTableName(kbId);
  const stmt = db.prepare(`
    INSERT INTO "${tableName}" (id, embedding)
    VALUES (?, ?)
  `);

  for (const v of vectors) {
    const float32 = new Float32Array(v.embedding);
    // 使用 BigInt 强制以 INTEGER 类型绑定，避免 better-sqlite3 将 Number 绑成 REAL 导致 vec0 报错
    const id = BigInt(Math.trunc(Number(v.chunkId)));
    stmt.run(id, float32);
  }
}

/**
 * 在单个知识库中 KNN 搜索
 * @param kbId 知识库 ID
 * @param queryVector 查询向量（维度需与该知识库一致）
 * @param topK 返回数量
 */
export function searchKbVectorsForKb(
  kbId: string,
  queryVector: number[],
  topK: number = 10
): Array<{ chunkId: number; distance: number }> {
  if (!kbVectorTableExists(kbId)) return [];

  const db = getDb();
  const tableName = toKbVectorTableName(kbId);
  const float32 = new Float32Array(queryVector);
  const fetchK = Math.min(topK * 10, 500);

  const rows = db.prepare(`
    SELECT v.id as chunkId, v.distance
    FROM (
      SELECT id, distance FROM "${tableName}"
      WHERE embedding MATCH ? AND k = ?
    ) v
    INNER JOIN kb_chunks c ON v.id = c.id
    WHERE c.kbId = ?
    ORDER BY v.distance
    LIMIT ?
  `).all(float32, fetchK, kbId, topK) as any[];

  return rows.map(row => ({
    chunkId: row.chunkId,
    distance: row.distance
  }));
}

/**
 * 根据 chunk id 获取 chunk 内容
 */
export function getKbChunkById(id: number): KbChunk | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM kb_chunks WHERE id = ?`).get(id) as any;
  if (!row) return undefined;
  
  return {
    id: row.id,
    itemId: row.itemId,
    kbId: row.kbId,
    content: row.content,
    chunkIndex: row.chunkIndex,
    metadata: row.metadata || undefined,
    createdAt: row.createdAt
  };
}

/**
 * 批量获取 chunks
 */
export function getKbChunksByIds(ids: number[]): KbChunk[] {
  if (ids.length === 0) return [];
  
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  
  const rows = db.prepare(`
    SELECT * FROM kb_chunks WHERE id IN (${placeholders})
  `).all(...ids) as any[];

  return rows.map(row => ({
    id: row.id,
    itemId: row.itemId,
    kbId: row.kbId,
    content: row.content,
    chunkIndex: row.chunkIndex,
    metadata: row.metadata || undefined,
    createdAt: row.createdAt
  }));
}

// ==================== 辅助函数 ====================

function mapKbItemRow(row: any): KbItem {
  return {
    id: row.id,
    kbId: row.kbId,
    type: row.type,
    name: row.name,
    source: row.source || undefined,
    content: row.content || undefined,
    status: row.status,
    error: row.error || undefined,
    fileType: row.fileType || undefined,
    fileSize: row.fileSize || undefined,
    fileMtime: row.fileMtime || undefined,
    maxDepth: row.maxDepth || undefined,
    chunkCount: row.chunkCount || 0,
    lastSyncAt: row.lastSyncAt || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
