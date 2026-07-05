import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AnalyticsEvent } from './types.js'
import type { ClickHouseBatcher } from './batcher.js'

// 35-byte transparent 1x1 GIF
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export function createCollector(batcher: ClickHouseBatcher) {
  function parseQuery(url: string): Record<string, string> {
    const idx = url.indexOf('?')
    if (idx === -1) return {}

    const params: Record<string, string> = {}
    for (const part of url.slice(idx + 1).split('&')) {
      const eq = part.indexOf('=')
      if (eq === -1) continue
      params[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1))
    }
    return params
  }

  return function handler(req: IncomingMessage, res: ServerResponse): void {
    if (req.url?.startsWith('/collect')) {
      const q = parseQuery(req.url)
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

      const event: AnalyticsEvent = {
        event: q.event || 'unknown',
        publisher: q.publisher || q.context || '',
        slot: q.slot || '',
        ts: Number(q.ts) || Date.now(),
        time: now,
        tag: q.tag || '',
        error: q.error || '',
        quartile: Number(q.quartile) || 0,
        duration: Number(q.duration) || 0,
        mediaCount: Number(q.mediaCount) || 0,
        tagUrl: q.tagUrl || '',
        progress: q.progress || '',
        ip: req.socket.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
        referer: req.headers['referer'] || '',
      }

      batcher.push(event)

      res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'Expires': '0',
        'Pragma': 'no-cache',
      })
      res.end(PIXEL_GIF)
      return
    }

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    res.writeHead(404)
    res.end()
  }
}
