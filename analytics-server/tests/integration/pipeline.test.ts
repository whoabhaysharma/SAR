import { describe, it, expect, onTestFinished } from 'vitest'
import Fastify from 'fastify'
import { createClient } from '@clickhouse/client'
import { ClickHouseBatcher } from '../../src/batcher.js'
import { collectorPlugin } from '../../src/collector.js'
import { CREATE_TABLE } from '../../src/schema.js'

const CLICKHOUSE_URL = process.env.CLICKHOUSE_HOST || 'http://localhost:8123'
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER || 'analytics'
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD || 'analytics123'
const CLICKHOUSE_DB = 'test_analytics'

interface EventRow {
  event: string
  publisher: string
  slot: string
  ts: string
  time: string
}

describe('Pipeline integration', () => {
  let client: import('@clickhouse/client').ClickHouseClient
  let app: ReturnType<typeof Fastify>
  let batcher: ClickHouseBatcher

  beforeAll(async () => {
    try {
      const check = createClient({ url: CLICKHOUSE_URL, username: CLICKHOUSE_USER, password: CLICKHOUSE_PASSWORD })
      await check.query({ query: 'SELECT 1' })
      await check.close()
    } catch {
      console.warn('ClickHouse not reachable — skipping integration tests')
      return
    }

    client = createClient({ url: CLICKHOUSE_URL, username: CLICKHOUSE_USER, password: CLICKHOUSE_PASSWORD })
    await client.command({ query: `CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_DB}` })
    await client.command({ query: `DROP TABLE IF EXISTS ${CLICKHOUSE_DB}.ad_events` })
    await client.command({ query: CREATE_TABLE.replace('ad_events', `${CLICKHOUSE_DB}.ad_events`) })

    batcher = new ClickHouseBatcher(client, { maxSize: 50, maxIntervalMs: 2000, database: CLICKHOUSE_DB })
    batcher.start()

    app = Fastify({ logger: false })
    await app.register(collectorPlugin, { batcher })

    onTestFinished(async () => {
      await batcher.stop()
      await client.close()
      await app.close()
      await client.command({ query: `DROP TABLE IF EXISTS ${CLICKHOUSE_DB}.ad_events` })
      await client.command({ query: `DROP DATABASE IF EXISTS ${CLICKHOUSE_DB}` })
    })
  })

  it('stores a pixel event in ClickHouse', async () => {
    if (!client) return

    const res = await app.inject({ method: 'GET', url: '/collect?event=start&publisher=p1&slot=s1&ts=1000' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/gif')

    await new Promise(r => setTimeout(r, 3000))

    const result = await client.query({
      query: `SELECT event, publisher, slot FROM ${CLICKHOUSE_DB}.ad_events WHERE event = 'start' LIMIT 5`,
      format: 'JSONEachRow',
    })
    const rows = await result.json() as EventRow[]
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0].publisher).toBe('p1')
  })

  it('handles multiple concurrent events', async () => {
    if (!client) return

    const events = Array.from({ length: 20 }, (_, i) => ({
      event: i % 2 === 0 ? 'start' : 'complete',
      publisher: `pub-${i % 3}`,
      slot: 'leaderboard',
      ts: Date.now() + i,
    }))

    await Promise.all(events.map(e =>
      app.inject({ method: 'GET', url: `/collect?event=${e.event}&publisher=${e.publisher}&slot=${e.slot}&ts=${e.ts}` })
    ))

    await new Promise(r => setTimeout(r, 3000))

    const result = await client.query({
      query: `SELECT count(*) AS cnt FROM ${CLICKHOUSE_DB}.ad_events`,
      format: 'JSONEachRow',
    })
    const rows = await result.json() as any[]
    expect(rows[0].cnt).toBeGreaterThanOrEqual(20)
  })

  it('tracks quartile events with progress', async () => {
    if (!client) return

    await app.inject({ method: 'GET', url: '/collect?event=quartile&publisher=p2&slot=s2&quartile=2&progress=50%25' })
    await new Promise(r => setTimeout(r, 3000))

    const result = await client.query({
      query: `SELECT quartile, progress FROM ${CLICKHOUSE_DB}.ad_events WHERE event = 'quartile' LIMIT 1`,
      format: 'JSONEachRow',
    })
    const rows = await result.json() as any[]
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0].quartile).toBe('2')
  })

  it('tracks errors with error message', async () => {
    if (!client) return

    await app.inject({ method: 'GET', url: '/collect?event=error&publisher=p3&slot=s3&error=No+fill' })
    await new Promise(r => setTimeout(r, 3000))

    const result = await client.query({
      query: `SELECT error FROM ${CLICKHOUSE_DB}.ad_events WHERE event = 'error' LIMIT 1`,
      format: 'JSONEachRow',
    })
    const rows = await result.json() as any[]
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0].error).toBe('No fill')
  })
})
