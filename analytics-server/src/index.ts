import { createServer } from 'node:http'
import { createClient } from '@clickhouse/client'
import { ClickHouseBatcher } from './batcher.js'
import { createCollector } from './collector.js'
import { CREATE_TABLE } from './schema.js'
import type { ServerConfig } from './types.js'

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
  const client = createClient({
    host: config.clickHouse.host,
    username: config.clickHouse.username,
    password: config.clickHouse.password,
    database: config.clickHouse.database,
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 0,
    },
  })

  await client.command({ query: `CREATE DATABASE IF NOT EXISTS ${config.clickHouse.database}` })
  await client.command({ query: CREATE_TABLE })

  const batcher = new ClickHouseBatcher(client, {
    maxSize: config.batchMaxSize,
    maxIntervalMs: config.batchMaxIntervalMs,
  })

  batcher.start()

  const handler = createCollector(batcher)
  const server = createServer(handler)

  server.listen(config.port, () => {
    console.log(`[analytics] listening on :${config.port}`)
    console.log(`[analytics] collecting at /collect`)
    console.log(`[analytics] health at /health`)
    console.log(`[analytics] batch size: ${config.batchMaxSize} / interval: ${config.batchMaxIntervalMs}ms`)
  })

  process.on('SIGTERM', async () => {
    console.log('[analytics] shutting down...')
    await batcher.stop()
    await client.close()
    server.close()
  })

  process.on('SIGINT', async () => {
    console.log('[analytics] shutting down...')
    await batcher.stop()
    await client.close()
    server.close()
  })
}

main().catch(err => {
  console.error('[analytics] fatal:', err)
  process.exit(1)
})
