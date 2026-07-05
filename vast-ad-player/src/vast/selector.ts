import type { Ad, MediaFile, VastTag, SelectionStrategy, FetchResult } from '../core/types'

interface ParsedResult {
  tag: VastTag
  result: FetchResult
  ad: Ad | null
}

export function selectAd(
  results: ParsedResult[],
  strategy: SelectionStrategy
): { ad: Ad; tag: VastTag } | null {
  const valid = results.filter((r): r is ParsedResult & { ad: Ad } => r.ad !== null)
  if (valid.length === 0) return null

  if (strategy === 'first-response') {
    valid.sort((a, b) => a.result.responseTime - b.result.responseTime)
    return valid[0]
  }

  if (strategy === 'first-valid-media') {
    const pool = selectByMedia(valid)
    pool.sort((a, b) => a.result.responseTime - b.result.responseTime)
    return pool[0]
  }

  return valid[0]
}

function selectByMedia(results: Array<ParsedResult & { ad: Ad }>): Array<ParsedResult & { ad: Ad }> {
  const playable = results.filter(r => r.ad.mediaFiles.some(mf => canPlay(mf)))
  return playable.length > 0 ? playable : results
}

function canPlay(mf: MediaFile): boolean {
  const v = document.createElement('video')
  return v.canPlayType(mf.mimeType) !== ''
}
