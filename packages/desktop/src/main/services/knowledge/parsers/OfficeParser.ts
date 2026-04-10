/**
 * Office 文件解析器
 * 
 * 使用 officeparser 库解析：
 * - docx, pptx, xlsx
 * - odt, odp, ods
 * - pdf
 * - rtf
 */

import path from 'node:path';
import { tMain } from '../../../i18n';

// officeparser v6+ 类型声明（返回 AST，有 toText 方法）
interface OfficeParserModule {
  parseOffice: (filePath: string, options?: object) => Promise<{ toText: () => string }>;
}

let officeparser: OfficeParserModule | null = null;

/** 支持的 Office 文件扩展名 */
export const OFFICE_EXTENSIONS = [
  '.docx', '.doc',
  '.pptx', '.ppt',
  '.xlsx', '.xls',
  '.odt', '.odp', '.ods',
  '.pdf',
  '.rtf'
];

/**
 * 检查是否是支持的 Office 文件
 */
export function isOfficeFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return OFFICE_EXTENSIONS.includes(ext);
}

/**
 * 获取 officeparser 模块（懒加载）
 */
async function getOfficeParser(): Promise<OfficeParserModule> {
  if (!officeparser) {
    try {
      officeparser = await import('officeparser');
    } catch (error) {
      throw new Error(tMain('knowledge.officeParserMissing'));
    }
  }
  return officeparser;
}

/**
 * 解析 Office 文件
 * 
 * officeparser v6+ 返回 AST 对象，需调用 toText() 获取纯文本
 * 
 * @param filePath 文件路径
 * @returns 提取的文本内容
 */
export async function parseOfficeFile(filePath: string): Promise<string> {
  const parser = await getOfficeParser();
  
  try {
    const ast = await parser.parseOffice(filePath);
    // v6+ 返回 AST，调用 toText() 获取纯文本
    return typeof ast.toText === 'function' ? ast.toText() : String(ast || '');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(tMain('knowledge.officeParseFailed', { message }));
  }
}

/**
 * 获取文件类型
 */
export function getOfficeFileType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext.slice(1) || 'unknown';
}
