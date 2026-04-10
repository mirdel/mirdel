/**
 * 文本切片（Chunking）模块
 * 
 * 将长文本切分为适合 embedding 的小块，支持重叠以保持上下文连贯性
 */

// ==================== 配置常量 ====================

/** 目标 chunk 大小（字符数） */
export const CHUNK_TARGET_CHARS = 1500

/** 最大 chunk 大小（字符数） */
export const CHUNK_MAX_CHARS = 2400

/** chunk 重叠大小（字符数） */
export const CHUNK_OVERLAP_CHARS = 300

/** 最小 chunk 大小（字符数），低于此值会尝试合并 */
export const CHUNK_MIN_CHARS = 300

/** 每个网页最多保留的 chunks 数量 */
export const MAX_CHUNKS_PER_PAGE = 30

// ==================== 类型定义 ====================

export interface TextChunk {
  /** chunk 文本内容 */
  text: string
  /** chunk 在原文中的起始位置 */
  startIndex: number
  /** chunk 在原文中的结束位置 */
  endIndex: number
  /** chunk 索引（从 0 开始） */
  index: number
}

export interface ChunkResult {
  /** 切片后的 chunks */
  chunks: TextChunk[]
  /** 原文总字符数 */
  originalLength: number
  /** 是否因达到上限而被截断 */
  truncated: boolean
}

// ==================== 切片函数 ====================

/**
 * 将文本切分为 chunks
 * 
 * 切分策略：
 * 1. 按段落边界（双换行 \n\n 或单换行 \n）分割
 * 2. 累积段落直到达到 targetChars
 * 3. 下一个 chunk 开头包含上一个 chunk 末尾的 overlapChars 内容
 * 4. 如果单个段落超过 maxChars，强制按字符拆分
 * 
 * @param text 原文本
 * @param options 可选配置，覆盖默认值
 * @returns 切片结果
 */
export function chunkText(
  text: string,
  options?: {
    targetChars?: number
    maxChars?: number
    overlapChars?: number
    minChars?: number
    maxChunks?: number
  }
): ChunkResult {
  const targetChars = options?.targetChars ?? CHUNK_TARGET_CHARS
  const maxChars = options?.maxChars ?? CHUNK_MAX_CHARS
  const overlapChars = options?.overlapChars ?? CHUNK_OVERLAP_CHARS
  const minChars = options?.minChars ?? CHUNK_MIN_CHARS
  const maxChunks = options?.maxChunks ?? MAX_CHUNKS_PER_PAGE

  // 空文本处理
  if (!text || text.trim().length === 0) {
    return {
      chunks: [],
      originalLength: 0,
      truncated: false
    }
  }

  const originalLength = text.length

  // 第一步：按段落分割（优先双换行，其次单换行）
  const paragraphs = splitIntoParagraphs(text)

  // 第二步：合并段落为 chunks
  const chunks: TextChunk[] = []
  let currentChunkText = ''
  let currentChunkStart = 0
  let position = 0

  for (const paragraph of paragraphs) {
    const paragraphLength = paragraph.length

    // 如果单个段落就超过 maxChars，需要强制拆分
    if (paragraphLength > maxChars) {
      // 先把当前累积的内容作为一个 chunk（如果有）
      if (currentChunkText.length >= minChars) {
        chunks.push({
          text: currentChunkText.trim(),
          startIndex: currentChunkStart,
          endIndex: position,
          index: chunks.length
        })
        
        if (chunks.length >= maxChunks) {
          return { chunks, originalLength, truncated: true }
        }

        // 计算重叠部分
        currentChunkText = getOverlapText(currentChunkText, overlapChars)
        currentChunkStart = position - currentChunkText.length
      }

      // 强制拆分超长段落
      const subChunks = forceSplitParagraph(paragraph, targetChars, maxChars)
      for (const subChunk of subChunks) {
        const chunkText = (currentChunkText + subChunk).trim()
        if (chunkText.length >= minChars) {
          chunks.push({
            text: chunkText,
            startIndex: currentChunkStart,
            endIndex: position + subChunk.length,
            index: chunks.length
          })

          if (chunks.length >= maxChunks) {
            return { chunks, originalLength, truncated: true }
          }

          currentChunkText = getOverlapText(subChunk, overlapChars)
          currentChunkStart = position + subChunk.length - currentChunkText.length
        } else {
          currentChunkText += subChunk
        }
        position += subChunk.length
      }
    } else {
      // 正常情况：累积段落
      const newLength = currentChunkText.length + paragraphLength

      if (newLength >= targetChars) {
        // 达到目标大小，结束当前 chunk
        currentChunkText += paragraph
        
        chunks.push({
          text: currentChunkText.trim(),
          startIndex: currentChunkStart,
          endIndex: position + paragraphLength,
          index: chunks.length
        })

        if (chunks.length >= maxChunks) {
          return { chunks, originalLength, truncated: true }
        }

        // 计算重叠部分作为下一个 chunk 的开头
        currentChunkText = getOverlapText(currentChunkText, overlapChars)
        currentChunkStart = position + paragraphLength - currentChunkText.length
      } else {
        // 未达到目标，继续累积
        currentChunkText += paragraph
      }

      position += paragraphLength
    }
  }

  // 处理最后剩余的内容
  if (currentChunkText.trim().length >= minChars) {
    chunks.push({
      text: currentChunkText.trim(),
      startIndex: currentChunkStart,
      endIndex: originalLength,
      index: chunks.length
    })
  } else if (currentChunkText.trim().length > 0 && chunks.length > 0) {
    // 如果最后一段太短，合并到上一个 chunk
    const lastChunk = chunks[chunks.length - 1]
    lastChunk.text = (lastChunk.text + ' ' + currentChunkText.trim()).trim()
    lastChunk.endIndex = originalLength
  } else if (currentChunkText.trim().length > 0) {
    // 如果是唯一的内容，即使很短也要保留
    chunks.push({
      text: currentChunkText.trim(),
      startIndex: currentChunkStart,
      endIndex: originalLength,
      index: 0
    })
  }

  return {
    chunks,
    originalLength,
    truncated: chunks.length >= maxChunks
  }
}

// ==================== 辅助函数 ====================

/**
 * 按段落分割文本
 * 保留分隔符（换行符）以便准确计算位置
 */
function splitIntoParagraphs(text: string): string[] {
  // 按双换行或单换行分割，保留分隔符
  const parts: string[] = []
  let current = ''
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    current += char
    
    // 检测段落边界
    if (char === '\n') {
      // 检查是否是双换行
      if (text[i + 1] === '\n') {
        current += text[i + 1]
        i++
        parts.push(current)
        current = ''
      } else {
        // 单换行也作为边界
        parts.push(current)
        current = ''
      }
    }
  }
  
  // 最后剩余的部分
  if (current.length > 0) {
    parts.push(current)
  }
  
  return parts
}

/**
 * 获取文本末尾的重叠部分
 */
function getOverlapText(text: string, overlapChars: number): string {
  if (text.length <= overlapChars) {
    return text
  }
  
  // 尝试在单词/句子边界截取
  const overlap = text.slice(-overlapChars)
  
  // 找到第一个空格或标点，避免截断单词
  const firstSpace = overlap.search(/[\s。！？.!?]/)
  if (firstSpace > 0 && firstSpace < overlapChars / 2) {
    return overlap.slice(firstSpace + 1)
  }
  
  return overlap
}

/**
 * 强制拆分超长段落
 */
function forceSplitParagraph(
  paragraph: string,
  targetChars: number,
  maxChars: number
): string[] {
  const chunks: string[] = []
  let remaining = paragraph
  
  while (remaining.length > maxChars) {
    // 在 targetChars 附近找一个好的断点
    let splitIndex = targetChars
    
    // 优先在句子边界拆分
    const sentenceEnd = remaining.slice(0, maxChars).search(/[。！？.!?\n]\s*/g)
    if (sentenceEnd > targetChars / 2) {
      splitIndex = sentenceEnd + 1
    } else {
      // 其次在空格处拆分
      const lastSpace = remaining.slice(0, maxChars).lastIndexOf(' ')
      if (lastSpace > targetChars / 2) {
        splitIndex = lastSpace + 1
      }
    }
    
    chunks.push(remaining.slice(0, splitIndex))
    remaining = remaining.slice(splitIndex)
  }
  
  if (remaining.length > 0) {
    chunks.push(remaining)
  }
  
  return chunks
}

/**
 * 批量切片多个文档
 */
export function chunkDocuments(
  documents: Array<{ url: string; content: string; title?: string }>,
  options?: Parameters<typeof chunkText>[1]
): Array<{
  url: string
  title?: string
  chunks: TextChunk[]
  originalLength: number
  truncated: boolean
}> {
  return documents.map(doc => {
    const result = chunkText(doc.content, options)
    return {
      url: doc.url,
      title: doc.title,
      ...result
    }
  })
}
