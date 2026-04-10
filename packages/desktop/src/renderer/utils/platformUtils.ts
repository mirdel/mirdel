/**
 * 平台检测工具函数
 */

/**
 * 检测是否为 Mac 平台
 * @returns 是否为 Mac 平台
 */
export function isMac(): boolean {
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}
