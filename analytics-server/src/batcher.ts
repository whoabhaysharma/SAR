import type { AnalyticsEvent, ClickHouseConfig } from './types.js'

const MAX_CONCURRENT_FLUSHES = 4
const MAX_QUEUE_SIZE = 500_000

export class ClickHouseBatcher {
  private client: import('@clickhouse/client').ClickHouseClient
  private queue: AnalyticsEvent[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private config: { maxSize: number; maxIntervalMs: number; database: string }
  private activeFlushes = 0
  private droppedEvents = 0

  constructor(
    client: import('@clickhouse/client').ClickHouseClient,
    config: { maxSize: number; maxIntervalMs: number; database: string }
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
    await this.drain()
  }

  push(event: AnalyticsEvent): void {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.droppedEvents++
      if (this.droppedEvents % 1000 === 1) {
        console.warn(`[batcher] queue full, dropped ${this.droppedEvents} events total`)
      }
      return
    }

    this.queue.push(event)

    if (this.queue.length >= this.config.maxSize) {
      this.flush()
    }
  }

  getStats(): { queueSize: number; activeFlushes: number; droppedEvents: number } {
    return {
      queueSize: this.queue.length,
      activeFlushes: this.activeFlushes,
      droppedEvents: this.droppedEvents,
    }
  }

  private flush(): void {
    if (this.activeFlushes >= MAX_CONCURRENT_FLUSHES || this.queue.length === 0) return
    this.activeFlushes++

    const batch = this.queue.splice(0, this.config.maxSize)

    this.client.insert({
      table: `\`${this.config.database}\`.ad_events`,
      values: batch,
      format: 'JSONEachRow',
    }).catch(err => {
      console.error(`[batcher] insert failed (${batch.length} events), re-queuing`, (err as Error).message)
      if (this.queue.length + batch.length <= MAX_QUEUE_SIZE) {
        this.queue.unshift(...batch)
      } else {
        this.droppedEvents += batch.length
      }
    }).finally(() => {
      this.activeFlushes--
    })
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0 || this.activeFlushes > 0) {
      if (this.queue.length > 0 && this.activeFlushes < MAX_CONCURRENT_FLUSHES) {
        this.flush()
      }
      await new Promise(r => setTimeout(r, 50))
    }
  }
}
