/**
 * Web Search - 工具函数
 * 参考 web-search-mcp 的实现
 */
import { getDefaultResponseLocale, getLocaleAcceptLanguage } from "../language/responseLocale";

/**
 * 清理文本内容
 */
export function cleanText(text: string, maxLength: number = 50000): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  return text
    .replace(/\s+/g, ' ')           // 多个空白字符替换为单个空格
    .replace(/\n\s*\n/g, '\n')      // 多个换行替换为单个换行
    .trim()
    .substring(0, maxLength);
}

/**
 * 获取字数统计
 */
export function getWordCount(text: string): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * 获取内容预览
 */
export function getContentPreview(text: string, maxLength: number = 500): string {
  const cleaned = cleanText(text, maxLength);
  return cleaned.length === maxLength ? cleaned + '...' : cleaned;
}

/**
 * 生成时间戳
 */
export function generateTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 验证 URL 格式
 */
export function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 清理查询字符串（限制长度，移除危险字符）
 */
export function sanitizeQuery(query: string): string {
  if (!query || typeof query !== 'string') {
    return '';
  }
  return query.trim().substring(0, 1000);
}

/**
 * 检测是否是 PDF URL
 */
export function isPdfUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return url.toLowerCase().endsWith('.pdf');
  }
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 生成 Bing 会话 ID（cvid）
 * 模拟真实浏览器请求
 */
export function generateConversationId(): string {
  const chars = '0123456789ABCDEF';
  let cvid = '';
  for (let i = 0; i < 32; i++) {
    cvid += chars[Math.floor(Math.random() * chars.length)];
  }
  return cvid;
}

/**
 * 随机 User-Agent 列表
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0',
];

/**
 * 获取随机 User-Agent
 */
export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * 获取完整的随机请求头
 */
export function getRandomHeaders(): Record<string, string> {
  const locale = getDefaultResponseLocale();
  const browsers = [
    {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      'sec-ch-ua-platform': '"Windows"',
    },
    {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      'sec-ch-ua-platform': '"macOS"',
    },
    {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      'sec-ch-ua-platform': '"Linux"',
    }
  ];

  const browser = browsers[Math.floor(Math.random() * browsers.length)];
  
  return {
    ...browser,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': getLocaleAcceptLanguage(locale),
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
    'sec-ch-ua-mobile': '?0',
  };
}

/**
 * 检测页面是否被 bot 检测拦截
 */
export function isBotDetected(pageTitle: string): boolean {
  const blockedIndicators = [
    'Access Denied',
    'blocked',
    'captcha',
    'Forbidden',
    'Robot',
    'Bot detected',
  ];
  
  return blockedIndicators.some(indicator => 
    pageTitle.toLowerCase().includes(indicator.toLowerCase())
  );
}


/**
 * 清理 Bing URL
 */
export function cleanBingUrl(url: string): string {
  if (url.startsWith('//')) {
    return 'https:' + url;
  }
  
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  return url;
}

/**
 * 验证搜索结果 URL 是否有效
 */
export function isValidSearchUrl(url: string): boolean {
  return url.startsWith('http://') || 
         url.startsWith('https://') ||
         url.startsWith('//') ||
         url.length > 10;
}
