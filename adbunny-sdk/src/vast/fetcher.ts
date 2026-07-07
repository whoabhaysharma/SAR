import type { FetchResult, VastTag } from '../core/types'

export async function fetchAll(tags: VastTag[], timeout: number): Promise<FetchResult[]> {
  const settled = await Promise.allSettled(
    tags.map(tag => fetchOne(tag, timeout))
  )
  return settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    return {
      tag: tags[i],
      xml: null,
      error: r.reason?.message ?? 'Unknown error',
      responseTime: 0,
    }
  })
}

export async function fetchUrl(url: string, timeout: number): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

async function fetchOne(tag: VastTag, timeout: number): Promise<FetchResult> {
  const start = performance.now()
  try {
    const xml = await fetchUrl(tag.url, timeout)
    return { tag, xml, error: null, responseTime: performance.now() - start }
  } catch (err) {
    return {
      tag,
      xml: null,
      error: (err as Error).message,
      responseTime: performance.now() - start,
    }
  }
}
