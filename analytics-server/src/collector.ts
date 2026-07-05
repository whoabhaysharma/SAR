import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { AnalyticsEvent } from './types.js'
import type { ClickHouseBatcher } from './batcher.js'

const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

const KNOWN_FIELDS = new Set(['event', 'publisher', 'slot', 'ts', 'tag', 'error', 'quartile', 'duration', 'mediaCount', 'tagUrl', 'progress'])

interface CollectorOpts {
  batcher: ClickHouseBatcher
  clickHouse?: import('@clickhouse/client').ClickHouseClient
  database?: string
}

export async function collectorPlugin(app: FastifyInstance, opts: CollectorOpts): Promise<void> {
  app.get('/collect', {
    logLevel: 'error',
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

    const jsonPayload: Record<string, string> = {}
    for (const [k, v] of Object.entries(q)) {
      if (!KNOWN_FIELDS.has(k)) jsonPayload[k] = v
    }

    const event: AnalyticsEvent = {
      event: q.event || 'unknown',
      publisher: q.publisher || '',
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
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
      referer: req.headers['referer'] || '',
      json: Object.keys(jsonPayload).length ? JSON.stringify(jsonPayload) : '',
    }

    opts.batcher.push(event)

    return reply
      .type('image/gif')
      .header('Cache-Control', 'no-store, no-cache, must-revalidate')
      .header('Access-Control-Allow-Origin', '*')
      .header('Expires', '0')
      .header('Pragma', 'no-cache')
      .send(PIXEL_GIF)
  })

  app.get('/health', {
    logLevel: 'error',
  }, async (_req: FastifyRequest, _reply: FastifyReply) => {
    return { ok: true, uptime: process.uptime() }
  })

  app.get('/recent', {
    logLevel: 'error',
  }, async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!opts.clickHouse) {
      return reply.send([])
    }
    try {
      const table = opts.database ? `\`${opts.database}\`.ad_events` : 'ad_events'
      const result = await opts.clickHouse.query({
        query: `SELECT event, publisher, slot, time FROM ${table} ORDER BY time DESC LIMIT 50`,
        format: 'JSONEachRow',
      })
      const rows = await result.json()
      return reply.send(rows)
    } catch {
      return reply.send([])
    }
  })
}
