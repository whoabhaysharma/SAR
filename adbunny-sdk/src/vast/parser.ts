import type { Ad, MediaFile, TrackingEvent } from '../core/types'
import { fetchUrl } from './fetcher'

export async function parseVast(
  xml: string,
  depth: number,
  maxDepth: number,
  timeout: number
): Promise<Ad | null> {
  if (depth > maxDepth) return null

  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.querySelector('parsererror')) return null

  const ads = doc.querySelectorAll('Ad')
  for (const adEl of ads) {
    const inline = adEl.querySelector('InLine')
    if (inline) {
      return parseInline(adEl, inline)
    }

    const wrapper = adEl.querySelector('Wrapper')
    if (wrapper) {
      const uriEl = wrapper.querySelector('VASTAdTagURI')
      if (uriEl?.textContent) {
        try {
          const innerXml = await fetchUrl(uriEl.textContent.trim(), timeout)
          const innerAd = await parseVast(innerXml, depth + 1, maxDepth, timeout)
          if (innerAd) return innerAd
        } catch {
          // wrapper fetch failed — try next <Ad>
        }
      }
    }
  }

  return null
}

function parseInline(adEl: Element, inline: Element): Ad {
  const impressionUrls: string[] = []
  inline.querySelectorAll('Impression').forEach(el => {
    const url = el.textContent?.trim()
    if (url) impressionUrls.push(url)
  })

  const mediaFiles: MediaFile[] = []
  const trackingEvents: TrackingEvent[] = []
  let duration = 0

  const creatives = inline.querySelector('Creatives')
  if (creatives) {
    creatives.querySelectorAll('Creative').forEach(creative => {
      const linear = creative.querySelector('Linear')
      if (!linear) return

      const durStr = linear.querySelector('Duration')?.textContent?.trim()
      if (durStr) duration = parseDuration(durStr)

      linear.querySelectorAll('Tracking').forEach(el => {
        const event = el.getAttribute('event')
        const url = el.textContent?.trim()
        if (event && url) trackingEvents.push({ event, url })
      })

      linear.querySelectorAll('MediaFile').forEach(el => {
        const url = el.textContent?.trim()
        const mimeType = el.getAttribute('type') ?? ''
        if (url && mimeType) {
          mediaFiles.push({
            url,
            mimeType,
            width: el.getAttribute('width') ? Number(el.getAttribute('width')) : undefined,
            height: el.getAttribute('height') ? Number(el.getAttribute('height')) : undefined,
          })
        }
      })
    })
  }

  return {
    id: adEl.getAttribute('id') ?? undefined,
    system: inline.querySelector('AdSystem')?.textContent?.trim() ?? undefined,
    title: inline.querySelector('AdTitle')?.textContent?.trim() ?? undefined,
    impressionUrls,
    mediaFiles,
    trackingEvents,
    duration,
  }
}

function parseDuration(str: string): number {
  const parts = str.split(':')
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
  }
  return Number(str) || 0
}
