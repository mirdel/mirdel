/**
 * 预设第三方搜索服务模板
 * 
 * 这些模板定义了常见第三方搜索服务的配置结构，
 * 用户只需填写 API Key 和可选参数即可使用。
 */

import type { PresetTemplate } from './types';
import { tMain } from '../../i18n';

function buildPresetTemplates(): Record<string, PresetTemplate> {
  return {
    tavily: {
      id: 'tavily',
      name: 'Tavily',
      description: tMain('search.preset.tavily.description'),
      website: 'https://tavily.com',
      method: 'POST',
      url: 'https://api.tavily.com/search',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer {{apiKey}}',
      },
      parameterMapping: {
        queryField: 'query',
      },
      responseMapping: {
        resultsPath: 'results',
        titleField: 'title',
        urlField: 'url',
        contentField: 'raw_content',
      },
      fixedParams: {
        include_raw_content: true,
      },
      configurableParams: [
        {
          key: 'max_results',
          label: tMain('search.preset.label.resultCount'),
          type: 'number',
          default: 10,
          min: 1,
          max: 20,
          description: tMain('search.preset.desc.resultCount'),
        },
        {
          key: 'search_depth',
          label: tMain('search.preset.label.searchDepth'),
          type: 'select',
          default: 'basic',
          options: [
            { label: tMain('search.preset.option.basic'), value: 'basic' },
            { label: tMain('search.preset.option.advanced'), value: 'advanced' },
          ],
          description: tMain('search.preset.desc.searchDepth'),
        },
        {
          key: 'topic',
          label: tMain('search.preset.label.topic'),
          type: 'select',
          default: 'general',
          options: [
            { label: tMain('search.preset.option.general'), value: 'general' },
            { label: tMain('search.preset.option.news'), value: 'news' },
          ],
          description: tMain('search.preset.desc.topic'),
        },
      ],
    },
    exa: {
      id: 'exa',
      name: 'Exa',
      description: tMain('search.preset.exa.description'),
      website: 'https://exa.ai',
      method: 'POST',
      url: 'https://api.exa.ai/search',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer {{apiKey}}',
      },
      parameterMapping: {
        queryField: 'query',
      },
      responseMapping: {
        resultsPath: 'results',
        titleField: 'title',
        urlField: 'url',
        contentField: 'text',
      },
      fixedParams: {
        contents: { text: true },
      },
      configurableParams: [
        {
          key: 'numResults',
          label: tMain('search.preset.label.resultCount'),
          type: 'number',
          default: 10,
          min: 1,
          max: 100,
          description: tMain('search.preset.desc.resultCount'),
        },
        {
          key: 'type',
          label: tMain('search.preset.label.searchType'),
          type: 'select',
          default: 'auto',
          options: [
            { label: tMain('search.preset.option.auto'), value: 'auto' },
            { label: tMain('search.preset.option.neural'), value: 'neural' },
            { label: tMain('search.preset.option.keyword'), value: 'keyword' },
          ],
          description: tMain('search.preset.desc.searchType'),
        },
        {
          key: 'useAutoprompt',
          label: tMain('search.preset.label.autoOptimizeQuery'),
          type: 'boolean',
          default: true,
          description: tMain('search.preset.desc.autoOptimizeQuery'),
        },
      ],
    },
    bocha: {
      id: 'bocha',
      name: 'Bocha',
      description: tMain('search.preset.bocha.description'),
      website: 'https://bochaai.com',
      method: 'POST',
      url: 'https://api.bochaai.com/v1/web-search',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer {{apiKey}}',
      },
      parameterMapping: {
        queryField: 'query',
      },
      responseMapping: {
        resultsPath: 'data.webPages.value',
        titleField: 'name',
        urlField: 'url',
      },
      configurableParams: [
        {
          key: 'count',
          label: tMain('search.preset.label.resultCount'),
          type: 'number',
          default: 10,
          min: 1,
          max: 50,
          description: tMain('search.preset.desc.resultCount'),
        },
        {
          key: 'freshness',
          label: tMain('search.preset.label.timeRange'),
          type: 'select',
          default: 'noLimit',
          options: [
            { label: tMain('search.preset.option.noLimit'), value: 'noLimit' },
            { label: tMain('search.preset.option.oneDay'), value: 'oneDay' },
            { label: tMain('search.preset.option.oneWeek'), value: 'oneWeek' },
            { label: tMain('search.preset.option.oneMonth'), value: 'oneMonth' },
          ],
          description: tMain('search.preset.desc.timeRange'),
        },
      ],
    },
    zhipu: {
      id: 'zhipu',
      name: 'Zhipu',
      description: tMain('search.preset.zhipu.description'),
      website: 'https://open.bigmodel.cn',
      method: 'POST',
      url: 'https://open.bigmodel.cn/api/paas/v4/tools',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer {{apiKey}}',
      },
      parameterMapping: {
        queryField: 'search_query',
      },
      responseMapping: {
        resultsPath: 'search_result',
        titleField: 'title',
        urlField: 'link',
      },
      configurableParams: [
        {
          key: 'search_result_count',
          label: tMain('search.preset.label.resultCount'),
          type: 'number',
          default: 10,
          min: 1,
          max: 10,
          description: tMain('search.preset.desc.zhipuResultCount'),
        },
      ],
    },
  };
}

/**
 * 所有预设服务模板
 */
export const PRESET_TEMPLATES: Record<string, PresetTemplate> = buildPresetTemplates();

/**
 * 获取所有预设服务模板列表
 */
export function listPresetTemplates(): PresetTemplate[] {
  return Object.values(buildPresetTemplates());
}

/**
 * 根据 ID 获取预设服务模板
 */
export function getPresetTemplate(id: string): PresetTemplate | undefined {
  return buildPresetTemplates()[id];
}
