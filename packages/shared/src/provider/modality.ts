import type { ModelModality } from './types'

const DEFAULT_INPUT_MODALITIES: ModelModality[] = ['text']

export function normalizeInputModalities(inputModalities?: ModelModality[]): ModelModality[] {
  if (!Array.isArray(inputModalities) || inputModalities.length === 0) {
    return [...DEFAULT_INPUT_MODALITIES]
  }

  return [...new Set(inputModalities)]
}

export function getInputModalityFromMediaType(mediaType?: string | null): ModelModality {
  const normalized = String(mediaType || '').toLowerCase()

  if (normalized.startsWith('image/')) return 'image'
  if (normalized.startsWith('audio/')) return 'audio'
  if (normalized.startsWith('video/')) return 'video'
  return 'file'
}

export function supportsInputModality(
  inputModalities: ModelModality[] | undefined,
  modality: ModelModality
): boolean {
  const normalized = normalizeInputModalities(inputModalities)
  return normalized.includes(modality)
}
