/**
 * URL 解析器
 * 
 * 复用现有的 PageFetcher 抓取网页内容
 */

import { fetchPageContent } from '../../web-search/PageFetcher';

/** 默认超时时间（毫秒） */
const DEFAULT_TIMEOUT = 30000;

/**
 * 解析 URL 内容
 * 
 * @param url 网页 URL
 * @param timeout 超时时间（毫秒）
 * @returns 网页文本内容
 */
export async function parseUrl(url: string, timeout: number = DEFAULT_TIMEOUT): Promise<{
  title: string;
  content: string;
  realUrl?: string;
}> {
  const result = await fetchPageContent(url, timeout);
  
  return {
    title: result.title,
    content: result.content,
    realUrl: result.realUrl
  };
}

/**
 * 验证 URL 格式
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
