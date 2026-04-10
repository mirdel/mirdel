/**
 * 预估文本的 token 数量（用于输入框等场景的近似展示）
 * 基于 UTF-8 字节 + 字符分类修正，比简单的 字符数/2.5 更准确
 */
export function estimateTokens(text: string): number {
  if (!text) return 0

  const bytes = new TextEncoder().encode(text).length

  let cjk = 0
  let punct = 0
  let spaces = 0
  let emoji = 0
  let codeLike = 0

  const isEmoji = (cp: number) =>
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x2600 && cp <= 0x27bf) ||
    cp === 0xfe0f

  const isCJK = (cp: number) =>
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0xac00 && cp <= 0xd7af)

  const isCodeChar = (ch: string) => /[\\/_<>{}\[\]();=:+*\-|&^%$#@~`]/.test(ch)

  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0

    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') {
      spaces++
      continue
    }

    if (isEmoji(cp)) {
      emoji++
      continue
    }

    if (isCJK(cp)) {
      cjk++
      continue
    }

    if (/[.,!?;:'"\u2018\u2019\u201C\u201D、。，？！；：（）()【】\[\]《》\-—…]/.test(ch)) {
      punct++
      continue
    }

    if (isCodeChar(ch)) {
      codeLike++
      continue
    }
  }

  // 4.0 ≈ 英文 4 bytes/token 的业界基准，中文由 cjk 修正项补偿
  let t =
    bytes / 4 +
    cjk * 0.12 +
    codeLike * 0.12 +
    punct * 0.05 +
    spaces * 0.02

  t += emoji * 0.9
  t -= Math.min(emoji * 0.8, bytes / 10)

  if (!Number.isFinite(t)) t = 0
  t = Math.max(0, t)

  return Math.ceil(t)
}
