import Fastify from 'fastify'
import staticFiles from '@fastify/static'
import { createClient } from '@clickhouse/client'
import cluster from 'node:cluster'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { availableParallelism } from 'node:os'
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
  const tableName = `${config.clickHouse.database}.ad_events`
  await clickHouse.command({ query: CREATE_TABLE.replace('ad_events', tableName) })
  await clickHouse.exec({ query: `USE ${config.clickHouse.database}` })

  const batcher = new ClickHouseBatcher(clickHouse, {
    maxSize: config.batchMaxSize,
    maxIntervalMs: config.batchMaxIntervalMs,
    database: config.clickHouse.database,
  })
  batcher.start()

  const isDev = process.env.NODE_ENV !== 'production'
  const app = Fastify({
    logger: isDev
      ? { level: 'warn', transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
      : { level: 'warn' },
  })

  await app.register(staticFiles, {
    root: join(__dirname, '../public'),
    prefix: '/',
    wildcard: false,
  })

  const adminToken = process.env.ADMIN_TOKEN || ''

  await app.register(collectorPlugin, { batcher, clickHouse, database: config.clickHouse.database, adminToken })

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

if (cluster.isPrimary && process.env.NO_CLUSTER !== '1') {
  const cpus = availableParallelism()
  console.log(`[analytics] primary ${process.pid} forking ${cpus} workers`)
  for (let i = 0; i < cpus; i++) {
    cluster.fork()
  }
  cluster.on('exit', (worker, code) => {
    console.error(`[analytics] worker ${worker.process.pid} died (code ${code}), restarting`)
    cluster.fork()
  })
} else {
  main().catch(err => {
    console.error('[analytics] fatal:', err)
    process.exit(1)
  })
}
