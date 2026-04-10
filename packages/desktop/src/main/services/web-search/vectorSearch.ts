/**
 * 内存向量搜索模块
 * 
 * 简单的基于余弦相似度的向量搜索，适用于小规模临时数据
 * 无需外部向量数据库依赖
 */

// ==================== 配置常量 ====================

/** 初步召回数量 */
export const RETRIEVAL_TOP_K = 30

/** 每个 URL 最多保留的 chunks 数量（去重/限制同源） */
export const MAX_CHUNKS_PER_URL = 3

/** 每批 embedding 的最大数量（兼容远程 API 限制，如阿里云限制 10 条/批） */
export const EMBED_BATCH_SIZE = 10

// ==================== 类型定义 ====================

export interface VectorChunk {
  /** 来源 URL */
  url: string
  /** 页面标题 */
  title?: string
  /** chunk 文本内容 */
  text: string
  /** chunk 在原文中的索引 */
  chunkIndex: number
  /** embedding 向量 */
  vector: number[]
}

export interface SearchResult {
  /** chunk 信息 */
  chunk: VectorChunk
  /** 相似度分数（0-1，越大越相似） */
  score: number
}

// ==================== 向量搜索类 ====================

/**
 * 内存向量存储和搜索
 * 
 * 使用场景：每次搜索创建新实例，搜索完成后丢弃
 */
export class MemoryVectorStore {
  private chunks: VectorChunk[] = []

  /**
   * 添加单个向量
   */
  add(chunk: VectorChunk): void {
    this.chunks.push(chunk)
  }

  /**
   * 批量添加向量
   */
  addMany(chunks: VectorChunk[]): void {
    this.chunks.push(...chunks)
  }

  /**
   * 获取存储的向量数量
   */
  size(): number {
    return this.chunks.length
  }

  /**
   * 清空存储
   */
  clear(): void {
    this.chunks = []
  }

  /**
   * 搜索最相似的 chunks
   * 
   * @param queryVector 查询向量
   * @param topK 返回数量
   * @returns 按相似度降序排列的结果
   */
  search(queryVector: number[], topK: number = RETRIEVAL_TOP_K): SearchResult[] {
    if (this.chunks.length === 0) {
      return []
    }

    // 计算所有 chunks 与 query 的余弦相似度
    const results: SearchResult[] = this.chunks.map(chunk => ({
      chunk,
      score: cosineSimilarity(queryVector, chunk.vector)
    }))

    // 按相似度降序排序
    results.sort((a, b) => b.score - a.score)

    // 返回 topK
    return results.slice(0, topK)
  }

  /**
   * 搜索并限制每个 URL 的结果数量
   * 
   * @param queryVector 查询向量
   * @param topK 初步召回数量
   * @param maxPerUrl 每个 URL 最多保留的数量
   * @param topN 最终返回数量
   * @returns 按相似度降序排列的结果
   */
  searchWithDiversity(
    queryVector: number[],
    topK: number = RETRIEVAL_TOP_K,
    maxPerUrl: number = MAX_CHUNKS_PER_URL,
    topN: number = 8
  ): SearchResult[] {
    // 先获取 topK 结果
    const allResults = this.search(queryVector, topK)

    // 按 URL 分组计数，限制每个 URL 的数量
    const urlCounts: Record<string, number> = {}
    const diverseResults: SearchResult[] = []

    for (const result of allResults) {
      const url = result.chunk.url
      const count = urlCounts[url] || 0

      if (count < maxPerUrl) {
        diverseResults.push(result)
        urlCounts[url] = count + 1

        // 已收集足够数量
        if (diverseResults.length >= topN) {
          break
        }
      }
    }

    return diverseResults
  }
}

// ==================== 工具函数 ====================

/**
 * 计算两个向量的余弦相似度
 * 
 * @param a 向量 a
 * @param b 向量 b
 * @returns 相似度（-1 到 1，通常 embedding 结果为 0 到 1）
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions mismatch: ${a.length} vs ${b.length}`)
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)

  if (magnitude === 0) {
    return 0
  }

  return dotProduct / magnitude
}

/**
 * 将数组分批处理
 * 
 * @param array 原数组
 * @param batchSize 每批大小
 * @returns 分批后的二维数组
 */
export function batchArray<T>(array: T[], batchSize: number = EMBED_BATCH_SIZE): T[][] {
  const batches: T[][] = []
  
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize))
  }
  
  return batches
}

/**
 * 对文本数组进行批量 embedding
 * 
 * @param texts 文本数组
 * @param embedFn embedding 函数
 * @param batchSize 每批大小
 * @returns embedding 向量数组
 */
export async function batchEmbed(
  texts: string[],
  embedFn: (texts: string[]) => Promise<number[][]>,
  batchSize: number = EMBED_BATCH_SIZE
): Promise<number[][]> {
  const batches = batchArray(texts, batchSize)
  const results: number[][] = []

  for (const batch of batches) {
    const embeddings = await embedFn(batch)
    results.push(...embeddings)
  }

  return results
}
