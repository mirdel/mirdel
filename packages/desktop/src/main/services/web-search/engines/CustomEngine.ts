/**
 * 自定义搜索引擎
 * 
 * 支持预设服务和完全自定义服务的统一执行逻辑
 */

import type { 
  SearchResultItem, 
  CustomSearchConfig, 
  SearchProvider,
  PresetTemplate 
} from '../types';
import { getPresetTemplate } from '../presets';
import { loggerServiceMain } from '@shared';
import { tMain } from '../../../i18n';

const logger = loggerServiceMain.withContext('CustomEngine');

/**
 * 根据路径从对象中获取值
 * 支持 "data.results" 或 "results" 格式
 */
function getValueByPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }
  
  return current;
}

/**
 * 构建请求配置
 */
function buildRequestConfig(
  config: CustomSearchConfig,
  query: string,
  apiKey?: string,
  userParams?: Record<string, any>
): { url: string; init: RequestInit } {
  const { method, url, headers, parameterMapping, extraParams } = config;
  
  // 合并参数
  const params: Record<string, any> = {
    [parameterMapping.queryField]: query,
    ...extraParams,
    ...userParams,
  };
  
  let requestUrl = url;
  let body: string | undefined;
  const requestHeaders: Record<string, string> = { ...headers };
  
  // 处理 Authorization header 中的 {{apiKey}} 占位符
  if (apiKey && requestHeaders) {
    for (const [key, value] of Object.entries(requestHeaders)) {
      if (typeof value === 'string' && value.includes('{{apiKey}}')) {
        requestHeaders[key] = value.replace('{{apiKey}}', apiKey);
      }
    }
  }
  
  if (method === 'GET') {
    // GET 请求：参数拼接到 URL
    const urlParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        urlParams.append(key, String(value));
      }
    }
    const queryString = urlParams.toString();
    requestUrl = queryString ? `${url}?${queryString}` : url;
  } else {
    // POST 请求：参数放在 body
    body = JSON.stringify(params);
  }
  
  return {
    url: requestUrl,
    init: {
      method,
      headers: requestHeaders,
      body,
    },
  };
}

/**
 * 解析响应
 */
function parseResponse(
  data: any,
  responseMapping: CustomSearchConfig['responseMapping']
): SearchResultItem[] {
  const { resultsPath, titleField, urlField } = responseMapping;
  
  // 获取结果数组
  const results = getValueByPath(data, resultsPath);
  
  if (!Array.isArray(results)) {
    logger.warn('Response results is not an array', { resultsPath, data });
    return [];
  }
  
  // 映射结果
  return results.map((item: any) => ({
    title: getValueByPath(item, titleField) || '',
    url: getValueByPath(item, urlField) || '',
  })).filter(item => item.url);
}

/**
 * 自定义搜索结果（带内容，用于 CustomEngine 内部）
 */
export interface CustomSearchResultItem extends SearchResultItem {
  content?: string;
}

function parseResponseWithContent(
  data: any,
  responseMapping: CustomSearchConfig['responseMapping']
): CustomSearchResultItem[] {
  const { resultsPath, titleField, urlField, contentField } = responseMapping;
  
  // 获取结果数组
  const results = getValueByPath(data, resultsPath);
  
  if (!Array.isArray(results)) {
    logger.warn('Response results is not an array', { resultsPath, data });
    return [];
  }
  
  // 映射结果
  return results.map((item: any) => {
    const result: CustomSearchResultItem = {
      title: getValueByPath(item, titleField) || '',
      url: getValueByPath(item, urlField) || '',
    };
    
    if (contentField) {
      result.content = getValueByPath(item, contentField);
    }
    
    return result;
  }).filter(item => item.url);
}

/**
 * 合并预设模板和用户配置
 */
function mergePresetConfig(
  template: PresetTemplate,
  apiKey: string,
  userParams?: Record<string, any>
): { config: CustomSearchConfig; apiKey: string; params: Record<string, any> } {
  // 构建默认参数
  const defaultParams: Record<string, any> = {};
  for (const param of template.configurableParams) {
    defaultParams[param.key] = param.default;
  }
  
  // 合并参数：固定参数 + 默认参数 + 用户参数
  // 优先级：fixedParams（最高，不可覆盖） > userParams > defaultParams
  const mergedParams = { 
    ...defaultParams, 
    ...userParams,
    ...template.fixedParams,  // fixedParams 优先级最高，不可被用户覆盖
  };
  
  return {
    config: {
      name: template.name,
      method: template.method,
      url: template.url,
      headers: template.headers,
      parameterMapping: template.parameterMapping,
      responseMapping: template.responseMapping,
    },
    apiKey,
    params: mergedParams,
  };
}

/**
 * 自定义搜索引擎类
 */
export class CustomEngine {
  private provider: SearchProvider;
  private config: CustomSearchConfig;
  private apiKey?: string;
  private userParams?: Record<string, any>;
  
  constructor(provider: SearchProvider) {
    this.provider = provider;
    
    if (provider.type === 'preset') {
      // 预设服务：从模板获取配置
      const template = getPresetTemplate(provider.presetId!);
      if (!template) {
        throw new Error(tMain("search.presetNotFound", { presetId: provider.presetId! }));
      }
      
      const merged = mergePresetConfig(template, provider.apiKey || '', provider.params);
      this.config = merged.config;
      this.apiKey = merged.apiKey;
      this.userParams = merged.params;
    } else if (provider.type === 'custom') {
      // 完全自定义服务
      if (!provider.customConfig) {
        throw new Error(tMain("search.customConfigMissing"));
      }
      this.config = provider.customConfig;
      this.apiKey = provider.apiKey;
      this.userParams = provider.customConfig.extraParams;
    } else {
      throw new Error(tMain("search.unsupportedProviderType", { providerType: provider.type }));
    }
  }
  
  /**
   * 获取服务名称
   */
  get name(): string {
    return this.provider.name;
  }
  
  /**
   * 是否支持直接返回内容（根据 responseMapping.contentField 判断）
   */
  get supportsContent(): boolean {
    return !!this.config.responseMapping.contentField;
  }
  
  /**
   * 执行搜索
   */
  async search(query: string): Promise<SearchResultItem[]> {
    const results = await this.searchWithContent(query);
    return results.map(({ title, url }) => ({ title, url }));
  }
  
  /**
   * 执行搜索（带内容）
   * @param query 搜索关键词
   * @param timeout 超时时间（毫秒），可选
   */
  async searchWithContent(query: string, timeout?: number, abortSignal?: AbortSignal): Promise<CustomSearchResultItem[]> {
    const startTime = Date.now();
    
    // 构建请求参数（直接使用用户配置的参数，不再被全局 limit 覆盖）
    const params = { ...this.userParams };
    
    const { url, init } = buildRequestConfig(this.config, query, this.apiKey, params);
    
    logger.info('CustomEngine search', {
      provider: this.provider.id,
      query,
      url: url.replace(/api_key=[^&]+/, 'api_key=***'),
      timeout,
    });
    
    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const onAbort = () => controller.abort();
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    
    if (timeout && timeout > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeout);
    }
    
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(tMain("search.apiRequestFailed", {
          status: response.status,
          statusText: response.statusText,
          errorText,
        }));
      }
      
      const data = await response.json();
      const results = parseResponseWithContent(data, this.config.responseMapping);
      
      logger.info('CustomEngine search completed', {
        provider: this.provider.id,
        resultCount: results.length,
        duration: Date.now() - startTime,
      });
      
      return results;
    } catch (error) {
      // 处理超时错误
      if (error instanceof Error && error.name === 'AbortError') {
        if (!timedOut && abortSignal?.aborted) {
          throw new Error(tMain("common.cancelled"));
        }
        logger.error('CustomEngine search timeout', {
          provider: this.provider.id,
          timeout,
          duration: Date.now() - startTime,
        });
        throw new Error(tMain("search.apiRequestTimeout", { timeout: timeout ?? 0 }));
      }
      
      logger.error('CustomEngine search failed', {
        provider: this.provider.id,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      });
      throw error;
    } finally {
      abortSignal?.removeEventListener('abort', onAbort);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}

/**
 * 创建自定义搜索引擎实例
 */
export function createCustomEngine(provider: SearchProvider): CustomEngine {
  return new CustomEngine(provider);
}
