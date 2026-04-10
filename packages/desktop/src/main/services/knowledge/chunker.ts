/**
 * 智能文本分块器
 * 
 * 分块策略：
 * 1. 预切：按标题/段落分割
 * 2. 合并：把连续短段合并到目标窗口
 * 3. 兜底：对超长段落再做固定窗口切分
 * 4. 重叠：只在块与块之间做小重叠
 */

// ==================== 配置 ====================

export interface ChunkConfig {
  /** 目标块大小最小值（字符数） */
  targetMin: number;
  /** 目标块大小最大值（字符数） */
  targetMax: number;
  /** 超长段落阈值（字符数） */
  longParagraphThreshold: number;
  /** 超长段落切分时的窗口大小（字符数） */
  longParagraphWindow: number;
  /** 块与块之间的重叠（字符数） */
  overlap: number;
}

export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  targetMin: 600,
  targetMax: 1200,
  longParagraphThreshold: 1600,
  longParagraphWindow: 1000,
  overlap: 80
};

// ==================== 分块结果 ====================

export interface TextChunk {
  /** chunk 内容 */
  content: string;
  /** chunk 在原文中的索引 */
  index: number;
  /** 元数据 */
  metadata?: {
    /** 标题（如果有） */
    heading?: string;
  };
}

// ==================== 主函数 ====================

/**
 * 将文本分块
 * 
 * @param text 原始文本
 * @param config 分块配置
 * @returns 分块结果
 */
export function chunkText(text: string, config: ChunkConfig = DEFAULT_CHUNK_CONFIG): TextChunk[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Step 1: 预切（按标题/段落）
  const paragraphs = splitIntoParagraphs(text);
  
  // Step 2: 处理超长段落
  const processedParagraphs = paragraphs.flatMap(p => 
    splitLongParagraph(p, config.longParagraphThreshold, config.longParagraphWindow, config.overlap)
  );
  
  // Step 3: 合并短段落
  const mergedChunks = mergeParagraphs(processedParagraphs, config.targetMin, config.targetMax);
  
  // Step 4: 添加重叠
  const chunksWithOverlap = addOverlap(mergedChunks, config.overlap);
  
  // 构建最终结果
  return chunksWithOverlap.map((content, index) => {
    const heading = extractHeading(content);
    return {
      content: content.trim(),
      index,
      metadata: heading ? { heading } : undefined
    };
  }).filter(chunk => chunk.content.length > 0);
}

// ==================== Step 1: 预切 ====================

/**
 * 按段落分割文本
 * 保留标题行与其下方内容在同一块
 */
function splitIntoParagraphs(text: string): string[] {
  // 按空行分割
  const rawParagraphs = text.split(/\n\s*\n/);
  
  const result: string[] = [];
  let currentBlock = '';
  
  for (const para of rawParagraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    
    // 检查是否是标题行
    const isHeading = isHeadingLine(trimmed);
    
    if (isHeading) {
      // 如果当前块有内容，先保存
      if (currentBlock.trim()) {
        result.push(currentBlock.trim());
      }
      // 标题开始新块
      currentBlock = trimmed;
    } else {
      // 普通段落追加到当前块
      if (currentBlock) {
        currentBlock += '\n\n' + trimmed;
      } else {
        currentBlock = trimmed;
      }
    }
  }
  
  // 保存最后一个块
  if (currentBlock.trim()) {
    result.push(currentBlock.trim());
  }
  
  return result;
}

/**
 * 判断是否是标题行
 */
function isHeadingLine(line: string): boolean {
  const firstLine = line.split('\n')[0].trim();
  
  // Markdown 标题
  if (/^#{1,6}\s/.test(firstLine)) return true;
  
  // 数字编号标题（如 "1. 标题" 或 "1.2.3 标题"）
  if (/^\d+(\.\d+)*\.?\s/.test(firstLine) && firstLine.length < 100) return true;
  
  // 中文数字标题（如 "一、标题"）
  if (/^[一二三四五六七八九十]+[、.．]\s*/.test(firstLine) && firstLine.length < 100) return true;
  
  return false;
}

// ==================== Step 2: 处理超长段落 ====================

/**
 * 切分超长段落
 */
function splitLongParagraph(
  paragraph: string,
  threshold: number,
  windowSize: number,
  overlap: number
): string[] {
  if (paragraph.length <= threshold) {
    return [paragraph];
  }
  
  const chunks: string[] = [];
  let start = 0;
  
  while (start < paragraph.length) {
    let end = start + windowSize;
    
    // 尝试在句子边界切分
    if (end < paragraph.length) {
      const boundary = findSentenceBoundary(paragraph, end, windowSize / 4);
      if (boundary > start) {
        end = boundary;
      }
    } else {
      end = paragraph.length;
    }
    
    chunks.push(paragraph.slice(start, end));
    
    // 下一个起点要减去重叠
    start = end - overlap;
    if (start < 0) start = 0;
    
    // 避免无限循环
    if (start >= paragraph.length - overlap) break;
  }
  
  return chunks;
}

/**
 * 在指定位置附近寻找句子边界
 */
function findSentenceBoundary(text: string, position: number, searchRange: number): number {
  const start = Math.max(0, position - searchRange);
  const end = Math.min(text.length, position + searchRange);
  const searchText = text.slice(start, end);
  
  // 句子结束符
  const sentenceEnds = /[。！？.!?\n]/g;
  let lastMatch = -1;
  let match;
  
  while ((match = sentenceEnds.exec(searchText)) !== null) {
    const absolutePos = start + match.index + 1;
    if (absolutePos <= position) {
      lastMatch = absolutePos;
    } else if (lastMatch === -1) {
      // 找到 position 之后最近的边界
      lastMatch = absolutePos;
      break;
    }
  }
  
  return lastMatch > 0 ? lastMatch : position;
}

// ==================== Step 3: 合并短段落 ====================

/**
 * 合并短段落到目标窗口大小
 */
function mergeParagraphs(paragraphs: string[], targetMin: number, targetMax: number): string[] {
  if (paragraphs.length === 0) return [];
  
  const result: string[] = [];
  let current = '';
  
  for (const para of paragraphs) {
    const combined = current ? current + '\n\n' + para : para;
    
    if (combined.length > targetMax) {
      // 超过最大值，保存当前块，开始新块
      if (current) {
        result.push(current);
      }
      // 如果单个段落就超过最大值，直接加入
      if (para.length > targetMax) {
        result.push(para);
        current = '';
      } else {
        current = para;
      }
    } else {
      // 累加
      current = combined;
    }
  }
  
  // 保存最后一个块
  if (current) {
    // 如果最后一个块太短，尝试合并到前一个
    if (current.length < targetMin && result.length > 0) {
      const last = result[result.length - 1];
      if (last.length + current.length + 2 <= targetMax * 1.2) {
        result[result.length - 1] = last + '\n\n' + current;
      } else {
        result.push(current);
      }
    } else {
      result.push(current);
    }
  }
  
  return result;
}

// ==================== Step 4: 添加重叠 ====================

/**
 * 在块与块之间添加重叠
 */
function addOverlap(chunks: string[], overlapSize: number): string[] {
  if (chunks.length <= 1 || overlapSize <= 0) {
    return chunks;
  }
  
  const result: string[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];
    
    // 从前一个块取尾部作为当前块的前缀
    if (i > 0) {
      const prevChunk = chunks[i - 1];
      const overlapText = prevChunk.slice(-overlapSize);
      
      // 找到一个好的切分点（避免切断单词/句子）
      const breakPoint = findWordBoundary(overlapText, 0);
      if (breakPoint > 0 && breakPoint < overlapText.length) {
        const prefix = overlapText.slice(breakPoint);
        if (prefix.length > 10) { // 只有足够长的重叠才有意义
          chunk = prefix + '\n' + chunk;
        }
      }
    }
    
    result.push(chunk);
  }
  
  return result;
}

/**
 * 找到单词/句子边界
 */
function findWordBoundary(text: string, startFrom: number): number {
  // 查找空格、标点等边界
  const boundaries = /[\s。！？.!?,，;；]/g;
  boundaries.lastIndex = startFrom;
  
  const match = boundaries.exec(text);
  return match ? match.index + 1 : startFrom;
}

// ==================== 辅助函数 ====================

/**
 * 从块中提取标题
 */
function extractHeading(chunk: string): string | undefined {
  const firstLine = chunk.split('\n')[0].trim();
  
  // Markdown 标题
  const mdMatch = firstLine.match(/^(#{1,6})\s+(.+)$/);
  if (mdMatch) {
    return mdMatch[2];
  }
  
  // 数字编号标题
  const numMatch = firstLine.match(/^(\d+(?:\.\d+)*\.?)\s+(.+)$/);
  if (numMatch && firstLine.length < 100) {
    return numMatch[2];
  }
  
  // 中文数字标题
  const cnMatch = firstLine.match(/^([一二三四五六七八九十]+[、.．])\s*(.+)$/);
  if (cnMatch && firstLine.length < 100) {
    return cnMatch[2];
  }
  
  return undefined;
}
