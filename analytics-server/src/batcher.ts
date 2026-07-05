import type { AnalyticsEvent, ClickHouseConfig } from './types.js'

interface QueuedEvent {
  event: AnalyticsEvent
  resolve: () => void
}

export class ClickHouseBatcher {
  private client: import('@clickhouse/client').ClickHouseClient
  private queue: QueuedEvent[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private config: { maxSize: number; maxIntervalMs: number }
  private flushing = false

  constructor(
    client: import('@clickhouse/client').ClickHouseClient,
    config: { maxSize: number; maxIntervalMs: number }
  ) {
    this.client = client
    this.config = config
  }

  start(): void {
    if (this.flushTimer) return
    this.flushTimer = setInterval(() => this.flush(), this.config.maxIntervalMs)
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    await this.flush()
  }

  push(event: AnalyticsEvent): void {
    this.queue.push({
      event,
      resolve: () => {},
    })

    if (this.queue.length >= this.config.maxSize) {
      this.flush()
    }
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return
    this.flushing = true

    const batch = this.queue.splice(0, this.config.maxSize)
    const rows = batch.map(q => q.event)

    try {
      await this.client.insert({
        table: 'ad_events',
        values: rows,
        format: 'JSONEachRow',
      })
    } catch (err) {
      console.error('[batcher] insert failed, re-queuing', (err as Error).message)
      this.queue.unshift(...batch)
    } finally {
      this.flushing = false
    }
  }
}
