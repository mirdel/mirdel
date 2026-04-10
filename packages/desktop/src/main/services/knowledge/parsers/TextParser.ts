/**
 * 文本文件解析器
 * 
 * 支持：txt, md, json, csv 等纯文本格式
 */

import fs from 'node:fs';
import path from 'node:path';

/** 支持的纯文本文件扩展名 */
export const TEXT_EXTENSIONS = [
  '.txt', '.md', '.markdown',
  '.json', '.jsonl', '.ndjson',
  '.csv', '.tsv',
  '.xml', '.html', '.htm',
  '.yaml', '.yml',
  '.ini', '.conf', '.cfg',
  '.log',
  '.js', '.ts', '.jsx', '.tsx',
  '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.scala',
  '.c', '.cpp', '.h', '.hpp',
  '.cs', '.fs',
  '.sql',
  '.sh', '.bash', '.zsh',
  '.vue', '.svelte',
  '.css', '.scss', '.less', '.sass',
];

/**
 * 检查是否是支持的文本文件
 */
export function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.includes(ext);
}

/**
 * 解析文本文件
 * 
 * @param filePath 文件路径
 * @returns 文件内容
 */
export async function parseTextFile(filePath: string): Promise<string> {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return content;
}

/**
 * 获取文件类型
 */
export function getTextFileType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext.slice(1) || 'txt'; // 去掉点号
}
