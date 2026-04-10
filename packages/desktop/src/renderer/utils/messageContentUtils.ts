/**
 * 消息内容工具函数（renderer 适配层）
 * 真实的类型定义放在 shared 包中，这里仅做 API 适配，避免到处改 import。
 */

import { i18n } from '@/i18n'
import type { MessageContentPart } from '@shared'
export type { MessageContentPart } from '@shared'

export type QuoteData = {
  parts: MessageContentPart[]
  sourceMessageId?: string
}

/**
 * 只有图片时自动添加的默认文本提示
 */
export const AUTO_GENERATED_IMAGE_PROMPT = 'Please describe the image content.'

/**
 * 序列化消息内容为 JSON 字符串
 * @param content 消息内容数组
 * @returns JSON 字符串
 */
export function serializeMessageContent(content: MessageContentPart[] | null | undefined): string {
  return JSON.stringify(content ?? [])
}

/**
 * 解析消息内容 JSON 字符串
 * @param content JSON 字符串
 * @returns 消息内容数组
 * @throws 如果格式不正确会抛出错误
 */
export function parseMessageContent(content: string): MessageContentPart[] {
  try {
    const parsed = JSON.parse(content)
    return parsed as MessageContentPart[]
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(i18n.global.t('common.messageContentFormatErrorWithReason', { reason: error.message }))
    }
    throw new Error(i18n.global.t('common.messageContentFormatError'))
  }
}

/**
 * 从消息内容中提取最终回答文本（仅 text，用于复制、引用、导出、模型输入）
 * @param content 消息内容数组
 * @returns 纯文本字符串
 */
export function extractAnswerTextFromContent(content: MessageContentPart[] | null | undefined): string {
  const list = Array.isArray(content) ? content : []
  return list
    .filter((part): part is Extract<MessageContentPart, { type: 'text' }> => part.type === 'text')
    .map(part => part.text)
    .join('')
}

/**
 * 提取可用于引用的内容（仅保留文本和图片）
 * @param content 消息内容数组
 * @returns 可引用的内容数组
 */
export function extractQuotableParts(content: MessageContentPart[] | null | undefined): MessageContentPart[] {
  const list = Array.isArray(content) ? content : []
  return list.filter((part) => {
    if (part.type === 'text') return true
    if (part.type === 'file' && part.mediaType.startsWith('image/')) return true
    return false
  })
}

/**
 * 检查消息内容是否包含图片
 * @param content 消息内容数组
 * @returns 是否包含图片
 */
export function hasImages(content: MessageContentPart[] | null | undefined): boolean {
  if (!Array.isArray(content)) return false
  return content.some(part => part.type === 'file' && part.mediaType.startsWith('image/'))
}

/**
 * 从消息内容中提取图片
 * @param content 消息内容数组
 * @returns 图片数组
 */
export function extractImagesFromContent(content: MessageContentPart[] | null | undefined): string[] {
  const list = Array.isArray(content) ? content : []
  return list
    .filter((part): part is Extract<MessageContentPart, { type: 'file' }> => part.type === 'file' && part.mediaType.startsWith('image/'))
    .map(part => part.url)
}

export function extractFilePartsFromContent(
  content: MessageContentPart[] | null | undefined
): Array<Extract<MessageContentPart, { type: 'file' }>> {
  const list = Array.isArray(content) ? content : []
  return list.filter((part): part is Extract<MessageContentPart, { type: 'file' }> => part.type === 'file')
}

export function extractQuoteFromContent(content: MessageContentPart[] | null | undefined): QuoteData | null {
  const list = Array.isArray(content) ? content : []
  const part = list.find(
    (p): p is MessageContentPart & { type: 'data-quote'; data: QuoteData } =>
      p.type === 'data-quote' && !!(p as any).data && Array.isArray((p as any).data.parts)
  )
  if (!part) return null
  return part.data
}

export function upsertQuotePart(
  content: MessageContentPart[] | null | undefined,
  quote?: QuoteData | null
): MessageContentPart[] {
  const list = Array.isArray(content) ? content : []
  const withoutQuote = list.filter((p) => p.type !== 'data-quote')
  if (!quote) return withoutQuote
  return [{ type: 'data-quote', data: quote } as any, ...withoutQuote]
}

// ==================== 笔记上下文 ====================

export interface NoteContextSnapshot {
  noteId: string
  title: string
  contentMd: string
}

export interface NoteContextData {
  notes: NoteContextSnapshot[]
}

export function extractNoteContextFromContent(content: MessageContentPart[] | null | undefined): NoteContextData | null {
  const list = Array.isArray(content) ? content : []
  const part = list.find(
    (p): p is MessageContentPart & { type: 'data-note-context'; data: NoteContextData } =>
      p.type === 'data-note-context' && !!(p as any).data && Array.isArray((p as any).data.notes)
  )
  if (!part) return null
  return part.data
}

export function upsertNoteContextPart(
  content: MessageContentPart[] | null | undefined,
  noteContext?: NoteContextData | null
): MessageContentPart[] {
  const list = Array.isArray(content) ? content : []
  const without = list.filter((p) => p.type !== 'data-note-context')
  if (!noteContext || noteContext.notes.length === 0) return without
  return [{ type: 'data-note-context', data: noteContext } as any, ...without]
}

// ==================== 知识库列表（用于 user 消息展示，存 id+name） ====================

export interface KbItem { id: string; name: string }

export interface KbData {
  kbs: KbItem[]
}

export function extractKbFromContent(content: MessageContentPart[] | null | undefined): KbData | null {
  const list = Array.isArray(content) ? content : []
  const part = list.find(
    (p): p is MessageContentPart & { type: 'data-kb'; data: KbData } =>
      p.type === 'data-kb' && !!(p as any).data && Array.isArray((p as any).data.kbs)
  )
  if (!part) return null
  return part.data
}

export function upsertKbPart(
  content: MessageContentPart[] | null | undefined,
  data?: KbData | null
): MessageContentPart[] {
  const list = Array.isArray(content) ? content : []
  const without = list.filter((p) => p.type !== 'data-kb')
  if (!data || !data.kbs || data.kbs.length === 0) return without
  return [{ type: 'data-kb', data } as any, ...without]
}
