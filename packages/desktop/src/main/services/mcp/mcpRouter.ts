import { generateText, type ModelMessage } from 'ai'
import { loggerServiceMain, type McpServerConfig } from '@shared'
import { getDefaultModelByType } from '../settings/settingsData'
import { resolveModelInvocation } from '../providers/modelInvocation'

const logger = loggerServiceMain.withContext('mcpRouter')

const ROUTER_TIMEOUT_MS = 15_000
const MAX_SELECTED_SERVERS = 6

export async function routeMcpServerIds(input: {
  contextForRouter: string
  candidates: McpServerConfig[]
  skillId?: string | null
}): Promise<string[]> {
  const candidates = input.candidates || []
  if (candidates.length === 0) {
    return []
  }

  const modelRef = getDefaultModelByType('fast') ?? getDefaultModelByType('general')
  if (!modelRef?.providerId || !modelRef?.modelId) {
    logger.info('mcpRouter: no fast/general model configured, skip routing')
    return []
  }

  let client: ReturnType<typeof resolveModelInvocation>["client"]
  try {
    client = resolveModelInvocation({
      providerId: modelRef.providerId,
      modelId: modelRef.modelId,
    }).client
  } catch (error) {
    logger.info('mcpRouter: router model unavailable, skip routing', {
      providerId: modelRef.providerId,
      modelId: modelRef.modelId,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }

  const candidateText = candidates
    .map((s) => {
      const useCases = s.useCases?.length ? s.useCases.join('; ') : '(none)'
      const desc = (s.description ?? '').trim() || '(none)'
      return `- id: ${s.id}\n  name: ${s.name}\n  description: ${desc}\n  useCases: ${useCases}`
    })
    .join('\n')

  // Internal routing prompt: keep in English to stabilize structured output.
  const systemPrompt = `You are an MCP router.
Choose 0 or more relevant server ids from the candidate MCP server list based on the user's request.

Rules:
- Select only from the candidate list, up to ${MAX_SELECTED_SERVERS} ids.
- If MCP is not needed or there is no clear match, output exactly: NONE
- If MCP is needed, output a JSON array string, for example: ["server/a","server/b"]
- Output no explanation and no markdown.`

  const userContent = `Skill Context:\n${input.skillId ? `Selected skill: ${input.skillId}` : 'No skill selected'}\n\nConversation Context:\n${(input.contextForRouter ?? '').trim().slice(0, 2500)}\n\nCandidate MCP Servers:\n${candidateText}`

  const messages: ModelMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ]

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), ROUTER_TIMEOUT_MS)

  try {
    const { text } = await generateText({
      model: client(modelRef.modelId) as any,
      messages,
      temperature: 0,
      maxOutputTokens: 256,
      abortSignal: abort.signal
    })
    clearTimeout(timer)

    const raw = (text ?? '').trim()
    if (!raw || raw.toUpperCase() === 'NONE') {
      return []
    }

    const validIds = new Set(candidates.map((s) => s.id))
    const parseJsonArray = (value: string): string[] | null => {
      try {
        const parsed = JSON.parse(value)
        if (!Array.isArray(parsed)) return null
        return parsed.filter((v) => typeof v === 'string') as string[]
      } catch {
        return null
      }
    }

    let selected = parseJsonArray(raw)
    if (!selected) {
      const match = raw.match(/\[[\s\S]*\]/)
      if (match) {
        selected = parseJsonArray(match[0])
      }
    }
    if (!selected) {
      logger.info('mcpRouter: output not parseable, ignore', { raw })
      return []
    }

    const uniq = Array.from(new Set(selected))
      .filter((id) => validIds.has(id))
      .slice(0, MAX_SELECTED_SERVERS)

    logger.info('mcpRouter: selected servers', { selected: uniq })
    return uniq
  } catch (error) {
    clearTimeout(timer)
    logger.warn('mcpRouter: routing failed', { error: String(error) })
    return []
  }
}
