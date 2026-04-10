/**
 * 文件工具函数
 */
import { i18n } from '@/i18n'

/**
 * 将 File 对象转换为 base64 字符串
 * @param file 文件对象
 * @returns Promise<string> base64 字符串（包含 data URL 前缀）
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error(i18n.global.t('common.readFileFailed')))
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
