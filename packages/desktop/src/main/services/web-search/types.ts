/**
 * Web Search Service - Types
 */

/**
 * 单个搜索结果（基础，仅包含标题、URL）
 */
export interface SearchResultItem {
  title: string;
  url: string;
  /** 搜索引擎返回的摘要/片段，不是抓取后的正文 */
  snippet?: string;
}

/**
 * 单个搜索结果（带正文内容）
 */
export interface SearchResultWithContent {
  title: string;
  url: string;
  /** 跳转后的真实 URL（可能与 url 不同，如搜索结果重定向链接） */
  realUrl?: string;
  /** 正文内容（可能被截断） */
  content: string;
  /** 内容是否被截断 */
  truncated: boolean;
  /** 作者信息 */
  byline?: string;
  /** 网站名称 */
  siteName?: string;
  /** 发布日期（YYYY-MM-DD 格式，从 meta 标签提取） */
  publishedDate?: string;
  /** 抓取是否成功 */
  fetchSuccess: boolean;
  /** 抓取失败原因 */
  fetchError?: string;
  /** 抓取耗时（毫秒） */
  fetchDuration?: number;
}

/**
 * 搜索成功结果（基础版）
 */
export interface SearchSuccessResult {
  success: true;
  /** 搜索来源（内置为 'searxng'，第三方为服务名称） */
  source: string;
  results: SearchResultItem[];
}

/**
 * RAG 处理统计信息
 */
export interface RagStats {
  /** 处理模式 */
  mode: 'rag';
  /** 搜索返回的 URL 数量 */
  searchResultCount: number;
  /** 成功抓取的网页数量 */
  fetchSuccessCount: number;
  /** 失败抓取的网页数量 */
  fetchFailedCount: number;
  /** 总分片数 */
  totalChunks: number;
  /** 召回的分片数 */
  retrievedChunks: number;
  /** 召回的 chunks 来自多少个 URL */
  retrievedUrlCount: number;
  /** RAG 处理耗时（毫秒） */
  ragDuration: number;
}

/**
 * 搜索成功结果（带内容版）
 */
export interface SearchWithContentSuccessResult {
  success: true;
  /** 搜索来源（内置为 'searxng'，第三方为服务名称） */
  source: string;
  results: SearchResultWithContent[];
  /** 搜索阶段耗时（毫秒） */
  searchDuration: number;
  /** 总耗时（毫秒） */
  duration: number;
  /** 处理模式 */
  processMode: 'rag' | 'truncate';
  /** RAG 统计信息（仅 RAG 模式下存在） */
  ragStats?: RagStats;
}

/**
 * 搜索失败结果
 */
export interface SearchErrorResult {
  success: false;
  error: string;
}

/**
 * 搜索结果（成功或失败）
 */
export type SearchResult = SearchSuccessResult | SearchErrorResult;

/**
 * 搜索结果带内容（成功或失败）
 */
export type SearchWithContentResult = SearchWithContentSuccessResult | SearchErrorResult;

/**
 * 网页内容获取成功结果
 */
export interface FetchPageSuccessResult {
  success: true;
  url: string;
  title: string;
  content: string;
  wordCount: number;
  /** 作者信息 */
  byline?: string;
  /** 网站名称 */
  siteName?: string;
}

/**
 * 网页内容获取失败结果
 */
export interface FetchPageErrorResult {
  success: false;
  url: string;
  error: string;
}

/**
 * 网页内容获取结果
 */
export type FetchPageResult = FetchPageSuccessResult | FetchPageErrorResult;

/**
 * 搜索引擎接口
 */
export interface SearchEngine {
  name: string;
  search(query: string, limit: number): Promise<SearchResultItem[]>;
}

// ==================== 第三方搜索服务相关类型 ====================

/**
 * 可配置参数定义（用于预设服务生成 UI 表单）
 */
export interface ConfigurableParam {
  /** 参数 key（对应 API 参数名） */
  key: string;
  /** UI 显示标签 */
  label: string;
  /** 参数类型 */
  type: 'number' | 'boolean' | 'select' | 'string';
  /** 默认值 */
  default: any;
  /** select 类型的选项 */
  options?: Array<{ label: string; value: string }>;
  /** number 类型的最小值 */
  min?: number;
  /** number 类型的最大值 */
  max?: number;
  /** 参数描述 */
  description?: string;
}

/**
 * 响应字段映射配置
 */
export interface ResponseMapping {
  /** 结果数组路径，如 "results" 或 "data.items" */
  resultsPath: string;
  /** 标题字段 */
  titleField: string;
  /** URL 字段 */
  urlField: string;
  /** 完整内容字段（可选，如果 API 直接返回内容） */
  contentField?: string;
}

/**
 * 自定义搜索配置（底层通用结构）
 */
export interface CustomSearchConfig {
  /** 名称 */
  name: string;
  /** 请求方法 */
  method: 'GET' | 'POST';
  /** 请求 URL（支持 {{query}} 占位符） */
  url: string;
  /** 请求头 */
  headers?: Record<string, string>;
  /** 参数映射 */
  parameterMapping: {
    /** 关键词字段名 */
    queryField: string;
  };
  /** 额外参数（直接传给 API） */
  extraParams?: Record<string, any>;
  /** 响应映射 */
  responseMapping: ResponseMapping;
}

/**
 * 预设服务模板（内置，只读）
 */
export interface PresetTemplate extends Omit<CustomSearchConfig, 'extraParams'> {
  /** 预设 ID */
  id: string;
  /** 描述 */
  description: string;
  /** 官网 */
  website?: string;
  /** 固定参数（不可配置，始终发送） */
  fixedParams?: Record<string, any>;
  /** 可配置参数定义（用于生成 UI 表单） */
  configurableParams: ConfigurableParam[];
}

/**
 * 用户保存的搜索服务配置
 */
export interface SearchProvider {
  /** 唯一 ID */
  id: string;
  /** 类型：内置免费 / 预设服务 / 完全自定义 */
  type: 'builtin' | 'preset' | 'custom';
  /** 显示名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  
  // ===== preset 类型使用 =====
  /** 预设 ID */
  presetId?: string;
  /** API Key */
  apiKey?: string;
  /** 用户配置的参数值 */
  params?: Record<string, any>;
  
  // ===== custom 类型使用 =====
  /** 完整的自定义配置 */
  customConfig?: CustomSearchConfig;
}
