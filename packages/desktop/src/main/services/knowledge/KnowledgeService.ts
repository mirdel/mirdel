/**
 * 知识库服务
 * 
 * 负责知识库内容的处理和向量化
 */

import fs from 'node:fs';
import path from 'node:path';
import { loggerServiceMain } from '@shared';
import { tMain } from '../../i18n';
import { syncKnowledgeSearchDocsByItemId } from '../search/searchIndex';
import {
  getKbItem,
  updateKbItem,
  createKbChunks,
  deleteKbChunksByItem,
  saveKbVectors,
  getKnowledgeBase,
  searchKbVectorsForKb,
  getKbChunksByIds,
  type KbItem,
  type KbItemType
} from './knowledgeData';
import { chunkText, DEFAULT_CHUNK_CONFIG } from './chunker';
import { parseFile, isSupportedFile, getFileType, parseUrl, isValidUrl } from './parsers';

const logger = loggerServiceMain.withContext('KnowledgeService');

/** 默认目录扫描深度 */
export const DEFAULT_MAX_DEPTH = 5;

/** 每批 embedding 的最大数量 */
const EMBED_BATCH_SIZE = 10;

// ==================== 类型定义 ====================

export interface ProcessItemOptions {
  /** embedding 函数 */
  embedFn: (texts: string[]) => Promise<number[][]>;
}

export interface ScanDirectoryResult {
  files: Array<{
    path: string;
    name: string;
    fileType: string;
    fileSize: number;
    fileMtime: number;
  }>;
  skipped: string[];
}

// ==================== 目录扫描 ====================

/**
 * 扫描目录获取支持的文件列表
 */
export async function scanDirectory(
  dirPath: string,
  maxDepth: number = DEFAULT_MAX_DEPTH,
  currentDepth: number = 0
): Promise<ScanDirectoryResult> {
  const result: ScanDirectoryResult = {
    files: [],
    skipped: []
  };

  // 检查深度限制（maxDepth <= 0 表示不限制）
  if (maxDepth > 0 && currentDepth >= maxDepth) {
    return result;
  }

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // 跳过隐藏文件和常见的忽略目录
      if (entry.name.startsWith('.') || 
          entry.name === 'node_modules' || 
          entry.name === '__pycache__' ||
          entry.name === 'dist' ||
          entry.name === 'build') {
        continue;
      }

      if (entry.isDirectory()) {
        // 递归扫描子目录
        const subResult = await scanDirectory(fullPath, maxDepth, currentDepth + 1);
        result.files.push(...subResult.files);
        result.skipped.push(...subResult.skipped);
      } else if (entry.isFile()) {
        if (isSupportedFile(fullPath)) {
          try {
            const stat = await fs.promises.stat(fullPath);
            result.files.push({
              path: fullPath,
              name: entry.name,
              fileType: getFileType(fullPath),
              fileSize: stat.size,
              fileMtime: stat.mtimeMs
            });
          } catch (error) {
            result.skipped.push(fullPath);
          }
        } else {
          result.skipped.push(fullPath);
        }
      }
    }
  } catch (error) {
    logger.error('Failed to scan directory', { dirPath, error });
  }

  return result;
}

/**
 * 获取文件信息
 */
export async function getFileInfo(filePath: string): Promise<{
  name: string;
  fileType: string;
  fileSize: number;
  fileMtime: number;
} | null> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) return null;
    
    return {
      name: path.basename(filePath),
      fileType: getFileType(filePath),
      fileSize: stat.size,
      fileMtime: stat.mtimeMs
    };
  } catch {
    return null;
  }
}

/**
 * 检查文件是否已变更
 */
export async function checkFileChanged(filePath: string, recordedMtime: number): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.mtimeMs > recordedMtime;
  } catch {
    return false;
  }
}

// ==================== 内容处理 ====================

/**
 * 处理知识库内容项
 * 
 * @param itemId 内容项 ID
 * @param options 处理选项
 */
export async function processKbItem(itemId: string, options: ProcessItemOptions): Promise<void> {
  const item = getKbItem(itemId);
  if (!item) {
    throw new Error(tMain('knowledge.itemNotFoundWithId', { itemId }));
  }

  logger.info('Processing kb item', { itemId, type: item.type, name: item.name });

  // 更新状态为处理中
  updateKbItem(itemId, { status: 'processing', error: undefined });

  try {
    // 1. 解析内容
    const text = await extractContent(item);
    
    if (!text || text.trim().length === 0) {
      throw new Error(tMain('knowledge.emptyContent'));
    }

    // 2. 分块
    const chunks = chunkText(text, DEFAULT_CHUNK_CONFIG);
    
    if (chunks.length === 0) {
      throw new Error(tMain('knowledge.emptyChunkResult'));
    }

    logger.info('Chunking complete', { itemId, chunkCount: chunks.length });

    // 3. 删除旧的 chunks 和 vectors
    deleteKbChunksByItem(itemId);

    // 4. 保存新的 chunks
    const chunkIds = createKbChunks(chunks.map((chunk, index) => ({
      itemId,
      kbId: item.kbId,
      content: chunk.content,
      chunkIndex: index,
      metadata: chunk.metadata ? JSON.stringify(chunk.metadata) : undefined
    })));

    // 5. 批量生成向量
    const vectors = await batchEmbed(
      chunks.map(c => c.content),
      options.embedFn
    );

    // 6. 保存向量
    saveKbVectors(item.kbId, chunkIds.map((chunkId, i) => ({
      chunkId,
      embedding: vectors[i]
    })));

    // 7. 更新状态
    const updates: Record<string, any> = {
      status: 'ready',
      error: undefined,
      chunkCount: chunks.length,
      lastSyncAt: Date.now()
    };
    // 文件类型：更新 fileMtime，用于变更检测
    if (item.type === 'file' && item.source) {
      try {
        const stat = await fs.promises.stat(item.source);
        updates.fileMtime = stat.mtimeMs;
      } catch {
        // 文件可能已删除，忽略
      }
    }
    updateKbItem(itemId, updates);
    syncKnowledgeSearchDocsByItemId(itemId);

    logger.info('Kb item processed successfully', { itemId, chunkCount: chunks.length });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to process kb item', { itemId, error: message });
    
    updateKbItem(itemId, {
      status: 'error',
      error: message
    });
    syncKnowledgeSearchDocsByItemId(itemId);
    
    throw error;
  }
}

/**
 * 提取内容文本
 */
async function extractContent(item: KbItem): Promise<string> {
  switch (item.type) {
    case 'text':
      return item.content || '';
    
    case 'file':
      if (!item.source) throw new Error(tMain('knowledge.filePathMissing'));
      return parseFile(item.source);
    
    case 'directory':
      // 目录类型：扫描目录下所有文件，合并内容
      // maxDepth 为 undefined/null/0 表示不限制
      if (!item.source) throw new Error(tMain('knowledge.directoryPathMissing'));
      const dirMaxDepth = item.maxDepth != null && item.maxDepth > 0 ? item.maxDepth : 0;
      return extractDirectoryContent(item.source, dirMaxDepth);
    
    case 'url':
      if (!item.source) throw new Error(tMain('knowledge.urlMissing'));
      if (!isValidUrl(item.source)) throw new Error(tMain('knowledge.invalidUrl'));
      const result = await parseUrl(item.source);
      // 组合标题和内容
      return result.title ? `# ${result.title}\n\n${result.content}` : result.content;
    
    default:
      throw new Error(tMain('knowledge.unsupportedContentType', { type: item.type }));
  }
}

/**
 * 提取目录内所有文件的内容
 * @param maxDepth 0 表示不限制深度
 */
async function extractDirectoryContent(dirPath: string, maxDepth: number): Promise<string> {
  const scanResult = await scanDirectory(dirPath, maxDepth > 0 ? maxDepth : undefined);
  
  if (scanResult.files.length === 0) {
    throw new Error(tMain('knowledge.noParsableFiles'));
  }

  const contents: string[] = [];
  
  for (const file of scanResult.files) {
    try {
      const content = await parseFile(file.path);
      if (content.trim()) {
        // 添加文件路径作为标题
        const relativePath = path.relative(dirPath, file.path);
        contents.push(`## ${relativePath}\n\n${content}`);
      }
    } catch (error) {
      logger.warn('Failed to parse file in directory', { 
        file: file.path, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  return contents.join('\n\n---\n\n');
}

/**
 * 批量 embedding
 */
async function batchEmbed(
  texts: string[],
  embedFn: (texts: string[]) => Promise<number[][]>
): Promise<number[][]> {
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await embedFn(batch);
    results.push(...embeddings);
  }
  
  return results;
}

// ==================== 向量搜索 ====================

export interface SearchResult {
  chunkId: number;
  kbId: string;
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * 在单个知识库中搜索
 * @param kbId 知识库 ID
 * @param queryVector 查询向量（维度需与该知识库一致）
 * @param topK 返回结果数量
 */
export function searchKnowledgeBase(
  kbId: string,
  queryVector: number[],
  topK: number = 10
): SearchResult[] {
  const knnResults = searchKbVectorsForKb(kbId, queryVector, topK);
  if (knnResults.length === 0) return [];

  const chunkIds = knnResults.map(r => r.chunkId);
  const chunks = getKbChunksByIds(chunkIds);
  const chunkMap = new Map(chunks.map((c) => [c.id, c] as const));

  return knnResults.map(r => {
    const chunk = chunkMap.get(r.chunkId);
    return {
      chunkId: r.chunkId,
      kbId,
      content: chunk?.content || '',
      score: Math.max(0, 1 - r.distance),
      metadata: chunk?.metadata ? JSON.parse(chunk.metadata) : undefined
    };
  });
}
