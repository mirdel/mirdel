/**
 * 解析器统一导出
 */

export * from './TextParser';
export * from './OfficeParser';
export * from './UrlParser';

import path from 'node:path';
import { tMain } from '../../../i18n';
import { isTextFile, parseTextFile, getTextFileType } from './TextParser';
import { isOfficeFile, parseOfficeFile, getOfficeFileType } from './OfficeParser';

/**
 * 检查文件是否支持解析
 */
export function isSupportedFile(filePath: string): boolean {
  return isTextFile(filePath) || isOfficeFile(filePath);
}

/**
 * 解析文件内容
 * 
 * @param filePath 文件路径
 * @returns 提取的文本内容
 */
export async function parseFile(filePath: string): Promise<string> {
  if (isTextFile(filePath)) {
    return parseTextFile(filePath);
  }
  
  if (isOfficeFile(filePath)) {
    return parseOfficeFile(filePath);
  }
  
  throw new Error(tMain('knowledge.unsupportedFileTypeWithExt', { ext: path.extname(filePath) }));
}

/**
 * 获取文件类型
 */
export function getFileType(filePath: string): string {
  if (isTextFile(filePath)) {
    return getTextFileType(filePath);
  }
  
  if (isOfficeFile(filePath)) {
    return getOfficeFileType(filePath);
  }
  
  const ext = path.extname(filePath).toLowerCase();
  return ext.slice(1) || 'unknown';
}
