import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { collectorPlugin } from '../../src/collector.ts'

function createApp(batcher?: { push: ReturnType<typeof vi.fn> }) {
  const b = batcher || { push: vi.fn() }
  const app = Fastify({ logger: false })
  app.register(collectorPlugin, { batcher: b as any })
  return { app, batcher: b }
}

describe('collectorPlugin', () => {
  it('returns 200 with GIF content type', async () => {
    const { app } = createApp()
    const res = await app.inject({ method: 'GET', url: '/collect?event=start' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/gif')
    await app.close()
  })

  it('pushes parsed event to batcher', async () => {
    const { app, batcher } = createApp()
    await app.inject({ method: 'GET', url: '/collect?event=start&publisher=p1&slot=leaderboard&ts=1234' })
    expect(batcher.push).toHaveBeenCalledOnce()
    const event = batcher.push.mock.calls[0][0]
    expect(event.publisher).toBe('p1')
    expect(event.slot).toBe('leaderboard')
    expect(event.ts).toBe(1234)
    expect(event.event).toBe('start')
    await app.close()
  })

  it('handles missing optional params gracefully', async () => {
    const { app, batcher } = createApp()
    await app.inject({ method: 'GET', url: '/collect?event=end' })
    const event = batcher.push.mock.calls[0][0]
    expect(event.event).toBe('end')
    expect(event.publisher).toBe('')
    expect(event.slot).toBe('')
    expect(event.ts).toBeGreaterThan(0)
    await app.close()
  })

  it('captures user-agent and referer', async () => {
    const { app, batcher } = createApp()
    await app.inject({
      method: 'GET',
      url: '/collect?event=start&publisher=p1&slot=s1',
      headers: { 'user-agent': 'TestBot/1.0', 'referer': 'https://publisher.com' },
    })
    const event = batcher.push.mock.calls[0][0]
    expect(event.userAgent).toBe('TestBot/1.0')
    expect(event.referer).toBe('https://publisher.com')
    await app.close()
  })

  it('returns health check', async () => {
    const { app } = createApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
    await app.close()
  })

  it('sends CORS header', async () => {
    const { app } = createApp()
    const res = await app.inject({ method: 'GET', url: '/collect?event=start' })
    expect(res.headers['access-control-allow-origin']).toBe('*')
    await app.close()
  })

  it('sets no-cache headers', async () => {
    const { app } = createApp()
    const res = await app.inject({ method: 'GET', url: '/collect?event=start' })
    expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate')
    await app.close()
  })
})
