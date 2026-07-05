import Fastify from 'fastify'
import staticFiles from '@fastify/static'
import { createClient } from '@clickhouse/client'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ClickHouseBatcher } from './batcher.js'
import { collectorPlugin } from './collector.js'
import { CREATE_TABLE } from './schema.js'
import type { ServerConfig } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const config: ServerConfig = {
  port: Number(process.env.PORT) || 8080,
  clickHouse: {
    host: process.env.CLICKHOUSE_HOST || 'http://localhost:8123',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    database: process.env.CLICKHOUSE_DB || 'analytics',
  },
  batchMaxSize: Number(process.env.BATCH_MAX_SIZE) || 1000,
  batchMaxIntervalMs: Number(process.env.BATCH_INTERVAL_MS) || 5000,
}

async function main(): Promise<void> {
  const clickHouse = createClient({
    url: config.clickHouse.host,
    username: config.clickHouse.username,
    password: config.clickHouse.password,
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 0,
    },
  })

  await clickHouse.command({ query: `CREATE DATABASE IF NOT EXISTS ${config.clickHouse.database}` })
  await clickHouse.command({
    query: `CREATE TABLE IF NOT EXISTS ${config.clickHouse.database}.ad_events (
      event String, publisher String, slot String, ts UInt64, time DateTime,
      tag String DEFAULT '', error String DEFAULT '', quartile UInt8 DEFAULT 0,
      duration UInt32 DEFAULT 0, mediaCount UInt8 DEFAULT 0, tagUrl String DEFAULT '',
      progress String DEFAULT '', ip String DEFAULT '', userAgent String DEFAULT '',
      referer String DEFAULT ''
    ) ENGINE = MergeTree ORDER BY (publisher, time) TTL time + INTERVAL 90 DAY DELETE`,
  })
  await clickHouse.exec({ query: `USE ${config.clickHouse.database}` })

  const batcher = new ClickHouseBatcher(clickHouse, {
    maxSize: config.batchMaxSize,
    maxIntervalMs: config.batchMaxIntervalMs,
    database: config.clickHouse.database,
  })
  batcher.start()

  const app = Fastify({
    logger: {
      level: 'warn',
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
    },
  })

  await app.register(staticFiles, {
    root: join(__dirname, '../public'),
    prefix: '/',
    wildcard: false,
  })

  await app.register(collectorPlugin, { batcher, clickHouse, database: config.clickHouse.database })

  await app.listen({ port: config.port, host: '0.0.0.0' })
  console.log(`[analytics] listening on :${config.port}`)
  console.log(`[analytics] collecting at /collect`)
  console.log(`[analytics] health at /health`)
  console.log(`[analytics] batch size: ${config.batchMaxSize} / interval: ${config.batchMaxIntervalMs}ms`)

  const shutdown = async () => {
    console.log('[analytics] shutting down...')
    await batcher.stop()
    await clickHouse.close()
    await app.close()
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch(err => {
  console.error('[analytics] fatal:', err)
  process.exit(1)
})
