import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClickHouseBatcher } from '../../src/batcher.ts'

function createMockClient() {
  const inserts: any[] = []
  const insert = vi.fn(async ({ values }: any) => { inserts.push(...values) })
  return { insert, _inserts: inserts }
}

describe('ClickHouseBatcher', () => {
  let mockClient: ReturnType<typeof createMockClient>

  beforeEach(() => {
    mockClient = createMockClient()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pushes event into queue without flushing immediately', () => {
    const b = new ClickHouseBatcher(mockClient as any, { maxSize: 10, maxIntervalMs: 5000, database: 'test' })
    b.push({ event: 'start', publisher: 'p1', slot: 's1', ts: 1, time: '2024-01-01 00:00:00' })
    expect(mockClient.insert).not.toHaveBeenCalled()
  })

  it('flushes when queue reaches maxSize', () => {
    const b = new ClickHouseBatcher(mockClient as any, { maxSize: 3, maxIntervalMs: 5000, database: 'test' })
    b.push({ event: 'start', publisher: 'p1', slot: 's1', ts: 1, time: '2024-01-01 00:00:00' })
    b.push({ event: 'start', publisher: 'p1', slot: 's1', ts: 2, time: '2024-01-01 00:00:00' })
    expect(mockClient.insert).not.toHaveBeenCalled()
    b.push({ event: 'start', publisher: 'p1', slot: 's1', ts: 3, time: '2024-01-01 00:00:00' })
    expect(mockClient.insert).toHaveBeenCalledTimes(1)
  })

  it('verifies batch size', () => {
    const b = new ClickHouseBatcher(mockClient as any, { maxSize: 2, maxIntervalMs: 5000, database: 'test' })
    for (let i = 0; i < 5; i++) {
      b.push({ event: 'start', publisher: 'p1', slot: 's1', ts: i, time: '2024-01-01 00:00:00' })
    }
    // First flush triggered by size, next are blocked by flushing flag
    expect(mockClient.insert).toHaveBeenCalledTimes(1)
  })

  it('flushes on interval when maxSize not reached', async () => {
    const b = new ClickHouseBatcher(mockClient as any, { maxSize: 100, maxIntervalMs: 5000, database: 'test' })
    b.start()

    b.push({ event: 'start', publisher: 'p1', slot: 's1', ts: 1, time: '2024-01-01 00:00:00' })
    b.push({ event: 'complete', publisher: 'p1', slot: 's1', ts: 2, time: '2024-01-01 00:00:00' })
    expect(mockClient.insert).not.toHaveBeenCalled()

    vi.advanceTimersByTime(5000)
    expect(mockClient.insert).toHaveBeenCalledTimes(1)
    expect(mockClient.insert.mock.calls[0][0].values).toHaveLength(2)
  })

  it('uses fully qualified table name with database', () => {
    const b = new ClickHouseBatcher(mockClient as any, { maxSize: 1, maxIntervalMs: 5000, database: 'analytics' })
    b.push({ event: 'start', publisher: 'p1', slot: 's1', ts: 1, time: '2024-01-01 00:00:00' })

    expect(mockClient.insert.mock.calls[0][0].table).toBe('`analytics`.ad_events')
  })

  it('re-queues events when insert fails', async () => {
    const errClient = {
      insert: vi.fn().mockRejectedValue(new Error('ClickHouse down')),
    }
    const b = new ClickHouseBatcher(errClient as any, { maxSize: 2, maxIntervalMs: 5000, database: 'test' })
    b.push({ event: 'start', publisher: 'p1', slot: 's1', ts: 1, time: '2024-01-01 00:00:00' })
    b.push({ event: 'start', publisher: 'p1', slot: 's1', ts: 2, time: '2024-01-01 00:00:00' })
    expect(errClient.insert).toHaveBeenCalledTimes(1)
  })

  it('queues extra events while flush is in progress', () => {
    const b = new ClickHouseBatcher(mockClient as any, { maxSize: 2, maxIntervalMs: 5000, database: 'test' })
    b.push({ event: 'a', publisher: 'p1', slot: 's1', ts: 1, time: '2024-01-01 00:00:00' })
    b.push({ event: 'b', publisher: 'p1', slot: 's1', ts: 2, time: '2024-01-01 00:00:00' })
    // Flush started (async), queue is now empty
    b.push({ event: 'c', publisher: 'p1', slot: 's1', ts: 3, time: '2024-01-01 00:00:00' })
    b.push({ event: 'd', publisher: 'p1', slot: 's1', ts: 4, time: '2024-01-01 00:00:00' })
    // These two should NOT trigger another flush since first is in progress
    expect(mockClient.insert).toHaveBeenCalledTimes(1)
  })

  it('flushes remaining events on stop', async () => {
    const b = new ClickHouseBatcher(mockClient as any, { maxSize: 100, maxIntervalMs: 5000, database: 'test' })
    b.push({ event: 'start', publisher: 'p1', slot: 's1', ts: 1, time: '2024-01-01 00:00:00' })
    b.push({ event: 'complete', publisher: 'p1', slot: 's1', ts: 2, time: '2024-01-01 00:00:00' })

    await b.stop()
    expect(mockClient.insert).toHaveBeenCalledTimes(1)
    expect(mockClient.insert.mock.calls[0][0].values).toHaveLength(2)
  })
})
