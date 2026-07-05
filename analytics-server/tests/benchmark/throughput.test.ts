import { describe, it, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import { ClickHouseBatcher } from '../../src/batcher.js'
import { collectorPlugin } from '../../src/collector.js'

function createMemoryStore() {
  const store: any[] = []
  const client = {
    insert: async ({ values }: any) => { store.push(...values) },
  }
  return { client, store, close: async () => {} }
}

interface BenchmarkResult {
  name: string
  events: number
  concurrency: number
  totalMs: number
  rps: number
  sent: number
  errors: number
}

async function sendBurst(app: ReturnType<typeof Fastify>, count: number, concurrency: number): Promise<{ sent: number; errors: number }> {
  const publishers = ['pub-a', 'pub-b', 'pub-c', 'pub-d', 'pub-e']
  const slots = ['leaderboard', 'sidebar', 'inread']
  const events = ['start', 'quartile', 'complete', 'error', 'impression']

  const urls: string[] = []
  for (let i = 0; i < count; i++) {
    const pub = publishers[i % publishers.length]
    const slot = slots[i % slots.length]
    const event = events[i % events.length]
    const ts = Date.now() + i
    const q = i % 4 === 1 ? `&quartile=${(i % 4) + 1}&progress=${((i % 4) + 1) * 25}%25` : ''
    const err = event === 'error' ? '&error=No+fill' : ''
    urls.push(`/collect?event=${event}&publisher=${pub}&slot=${slot}&ts=${ts}${q}${err}`)
  }

  let sent = 0
  let errors = 0

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)
    const results = await Promise.allSettled(batch.map(url => app.inject({ method: 'GET', url })))
    sent += batch.length
    for (const r of results) {
      if (r.status === 'rejected') errors++
      else if (r.value.statusCode !== 200) errors++
    }
  }

  return { sent, errors }
}

describe('Throughput benchmark', () => {
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    const memStore = createMemoryStore()
    const batcher = new ClickHouseBatcher(memStore.client as any, {
      maxSize: 10000, maxIntervalMs: 60000, database: 'bench',
    })
    batcher.start()

    app = Fastify({ logger: false })
    await app.register(collectorPlugin, { batcher })
  })

  afterAll(async () => {
    await app.close()
  })

  const SCENARIOS = [
    { name: 'low-concurrency (10)', events: 1000, concurrency: 10 },
    { name: 'medium-concurrency (50)', events: 2000, concurrency: 50 },
    { name: 'high-concurrency (200)', events: 5000, concurrency: 200 },
    { name: 'burst (500)', events: 5000, concurrency: 500 },
  ]

  for (const scenario of SCENARIOS) {
    it(`${scenario.name}: ${scenario.events} events`, { timeout: 30000 }, async () => {
      const start = performance.now()
      const result = await sendBurst(app, scenario.events, scenario.concurrency)
      const totalMs = performance.now() - start
      const rps = Math.round((result.sent / totalMs) * 1000)

      const bench: BenchmarkResult = {
        name: scenario.name,
        events: scenario.events,
        concurrency: scenario.concurrency,
        totalMs: Math.round(totalMs),
        rps,
        sent: result.sent,
        errors: result.errors,
      }

      console.log(`\n  BENCHMARK: ${JSON.stringify(bench)}`)
      console.log(`  Throughput: ${bench.rps.toLocaleString()} req/sec`)

      expect(result.errors).toBe(0)
      expect(result.sent).toBe(scenario.events)
    })
  }
})
