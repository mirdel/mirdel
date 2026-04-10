/**
 * 格式化时间戳
 * @param timestamp 时间戳（毫秒）
 * @returns 格式化后的时间字符串
 */
import { i18n } from '@/i18n'

export function formatMessageTime(timestamp: number | undefined): string {
  if (!timestamp) return ''
  
  const date = new Date(timestamp)
  const now = new Date()
  
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const currentDate = now.getDate()
  
  const isToday = year === currentYear && 
                  date.getMonth() === currentMonth && 
                  date.getDate() === currentDate
  
  const isThisYear = year === currentYear
  
  if (isToday) {
    // 今天：HH:mm
    return `${hours}:${minutes}`
  } else if (isThisYear) {
    // 今年：MM/DD HH:mm
    return `${month}/${day} ${hours}:${minutes}`
  } else {
    // 其他：YYYY/MM/DD HH:mm
    return `${year}/${month}/${day} ${hours}:${minutes}`
  }
}

/**
 * 列表项时间格式（会话列表/笔记列表）:
 * - 今天: HH:mm
 * - 昨天: 昨天
 * - 今年: MM/DD
 * - 往年: YYYY
 */
export function formatListUpdatedAt(timestamp: number | undefined): string {
  return formatListUpdatedAtInternal(timestamp, false)
}

export function formatCompactListUpdatedAt(timestamp: number | undefined): string {
  return formatListUpdatedAtInternal(timestamp, true)
}

function formatListUpdatedAtInternal(timestamp: number | undefined, compact: boolean): string {
  if (!timestamp || typeof timestamp !== "number" || Number.isNaN(timestamp)) return "";

  const now = new Date();
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

  const pad2 = (n: number) => String(n).padStart(2, "0");

  if (timestamp >= startOfToday.getTime()) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  if (timestamp >= startOfYesterday.getTime() && timestamp < startOfToday.getTime()) {
    return i18n.global.t(compact ? "common.yesterdayShort" : "common.yesterday");
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
  }

  return String(date.getFullYear());
}

/**
 * 格式化完整时间（用于 tooltip）
 * @param timestamp 时间戳（毫秒）
 * @returns 格式化后的完整时间字符串 YYYY/MM/DD HH:mm:ss.ms
 */
export function formatFullTime(timestamp: number | undefined): string {
  if (!timestamp) return ''
  
  const date = new Date(timestamp)
  
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
}
