/**
 * 计算文本的显示宽度单位
 * 中文字符（包括全角符号）占 2 个单位
 * 英文字符（包括数字、半角符号）占 1 个单位
 */
export function calculateTextUnits(text: string): number {
  let units = 0
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const code = char.charCodeAt(0)
    
    // 判断是否为中文字符或全角字符
    // 中文字符范围：0x4E00-0x9FFF (CJK统一表意文字)
    // 全角字符范围：0xFF00-0xFFEF
    // 其他常见中文符号：0x3000-0x303F
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||  // 中文
      (code >= 0xFF00 && code <= 0xFFEF) ||  // 全角
      (code >= 0x3000 && code <= 0x303F)     // 中文标点
    ) {
      units += 2
    } else {
      units += 1
    }
  }
  
  return units
}

/**
 * 截断文本到指定的单位长度
 * @param text 原始文本
 * @param maxUnits 最大单位数
 * @returns 截断后的文本
 */
export function truncateTextByUnits(text: string, maxUnits: number): string {
  let units = 0
  let result = ''
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const code = char.charCodeAt(0)
    
    const charUnits = (
      (code >= 0x4E00 && code <= 0x9FFF) ||
      (code >= 0xFF00 && code <= 0xFFEF) ||
      (code >= 0x3000 && code <= 0x303F)
    ) ? 2 : 1
    
    if (units + charUnits > maxUnits) {
      break
    }
    
    units += charUnits
    result += char
  }
  
  return result
}

/**
 * 验证文本是否超过最大单位限制
 * @param text 待验证文本
 * @param maxUnits 最大单位数
 * @returns 是否有效
 */
export function validateTextLength(text: string, maxUnits: number): boolean {
  return calculateTextUnits(text) <= maxUnits
}

