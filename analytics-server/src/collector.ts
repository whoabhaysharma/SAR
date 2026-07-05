import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { AnalyticsEvent } from './types.js'
import type { ClickHouseBatcher } from './batcher.js'

const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function collectorPlugin(app: FastifyInstance, opts: { batcher: ClickHouseBatcher }): Promise<void> {
  app.get('/collect', {
    logLevel: 'error',
    schema: {
      querystring: {
        type: 'object',
        properties: {
          event: { type: 'string' },
          publisher: { type: 'string' },
          slot: { type: 'string' },
          ts: { type: 'string' },
          tag: { type: 'string' },
          error: { type: 'string' },
          quartile: { type: 'string' },
          duration: { type: 'string' },
          mediaCount: { type: 'string' },
          tagUrl: { type: 'string' },
          progress: { type: 'string' },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

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
}
