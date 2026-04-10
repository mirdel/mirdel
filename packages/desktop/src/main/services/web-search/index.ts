/**
 * Web Search Service
 * 导出
 */

export * from './types';
export { webSearchService } from './WebSearchService';
export { bingEngine } from './engines/BingEngine';
export { searxngEngine } from './engines/SearxngEngine';
export { createCustomEngine } from './engines/CustomEngine';
export { fetchPageContent, getTestRawHtml, type PageContent } from './PageFetcher';
export { listPresetTemplates, getPresetTemplate, PRESET_TEMPLATES } from './presets';
export { getPagePool, destroyPagePool, resizePagePool, PagePool } from './PagePool';
export { searxngServerManager } from './SearxngServerManager';
