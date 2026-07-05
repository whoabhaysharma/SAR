import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { AnalyticsEvent } from './types.js'
import type { ClickHouseBatcher } from './batcher.js'

const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

const KNOWN_FIELDS = new Set(['event', 'publisher', 'slot', 'ts', 'tag', 'error', 'quartile', 'duration', 'mediaCount', 'tagUrl', 'progress'])

let cachedTime = ''
let cachedTimeSec = 0

function getNow(): string {
  const sec = Math.floor(Date.now() / 1000)
  if (sec === cachedTimeSec) return cachedTime

  const d = new Date()
  const pad = (n: number) => n < 10 ? '0' + n : '' + n
  cachedTime = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  cachedTimeSec = sec
  return cachedTime
}

interface CollectorOpts {
  batcher: ClickHouseBatcher
  clickHouse?: import('@clickhouse/client').ClickHouseClient
  database?: string
  adminToken?: string
}

function requireToken(opts: CollectorOpts) {
  return async function (req: FastifyRequest, reply: FastifyReply) {
    const token = (req.query as Record<string, string>).token || req.headers['x-api-key'] as string
    if (opts.adminToken && token === opts.adminToken) return
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}

export async function collectorPlugin(app: FastifyInstance, opts: CollectorOpts): Promise<void> {
  app.get('/collect', {
    logLevel: 'error',
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>
    const now = getNow()

    let hasJson = false
    const jsonPayload: Record<string, string> = {}
    for (const [k, v] of Object.entries(q)) {
      if (!KNOWN_FIELDS.has(k)) {
        jsonPayload[k] = v
        hasJson = true
      }
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
      json: hasJson ? JSON.stringify(jsonPayload) : '',
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
    preHandler: requireToken(opts),
  }, async (_req: FastifyRequest, _reply: FastifyReply) => {
    const stats = opts.batcher.getStats()
    return { ok: true, uptime: process.uptime(), queue: stats.queueSize, flushes: stats.activeFlushes, dropped: stats.droppedEvents }
  })

  app.get('/recent', {
    logLevel: 'error',
    preHandler: requireToken(opts),
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
