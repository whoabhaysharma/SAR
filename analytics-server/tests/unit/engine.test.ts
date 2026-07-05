import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AnalyticsEngine } from '../../../vast-ad-player/src/analytics/engine.ts'

describe('AnalyticsEngine', () => {
  let capturedUrl: string
  const OrigImage = (globalThis as any).Image

  beforeEach(() => {
    capturedUrl = ''
    ;(globalThis as any).Image = class MockImage {
      set src(url: string) { capturedUrl = url }
    } as any
  })

  afterEach(() => {
    ;(globalThis as any).Image = OrigImage
  })

  it('fires Image with correct URL', () => {
    const engine = new AnalyticsEngine({ endpoint: 'https://test.com', context: { pub: 'p1' } })
    engine.track('start')
    expect(capturedUrl).toContain('https://test.com/collect')
    expect(capturedUrl).toContain('event=start')
    expect(capturedUrl).toContain('pub=p1')
  })

  it('includes event name in URL', () => {
    const engine = new AnalyticsEngine({ endpoint: 'https://test.com' })
    engine.track('test-event')
    const params = new URLSearchParams(capturedUrl.split('?')[1])
    expect(params.get('event')).toBe('test-event')
  })

  it('includes timestamp', () => {
    const engine = new AnalyticsEngine({ endpoint: 'https://test.com' })
    const before = Date.now()
    engine.track('start')
    const ts = Number(new URLSearchParams(capturedUrl.split('?')[1]).get('ts'))
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(Date.now())
  })

  it('includes tag if provided', () => {
    const engine = new AnalyticsEngine({ endpoint: 'https://test.com', tag: 'test-run-1' })
    engine.track('start')
    expect(capturedUrl).toContain('tag=test-run-1')
  })

  it('includes extra data params', () => {
    const engine = new AnalyticsEngine({ endpoint: 'https://test.com' })
    engine.track('quartile', { quartile: 2, progress: '50%' })
    expect(capturedUrl).toContain('quartile=2')
    expect(capturedUrl).toContain('progress=50%25')
  })

  it('strips trailing slash from endpoint', () => {
    const engine = new AnalyticsEngine({ endpoint: 'https://test.com/' })
    engine.track('start')
    expect(capturedUrl).toMatch(/^https:\/\/test\.com\/collect\?/)
  })

  it('does not fire after destroy', () => {
    const engine = new AnalyticsEngine({ endpoint: 'https://test.com' })
    engine.destroy()
    engine.track('start')
    expect(capturedUrl).toBe('')
  })

  it('handles null/undefined extra data', () => {
    const engine = new AnalyticsEngine({ endpoint: 'https://test.com' })
    engine.track('test', { a: 1, b: null, c: undefined, d: 'x' })
    expect(capturedUrl).toContain('a=1')
    expect(capturedUrl).toContain('d=x')
    expect(capturedUrl).not.toContain('b=')
    expect(capturedUrl).not.toContain('c=')
  })

  it('properly URL-encodes params', () => {
    const engine = new AnalyticsEngine({ endpoint: 'https://test.com' })
    engine.track('start', { error: 'something broke & needs fix' })
    expect(capturedUrl).toContain('error=something%20broke%20%26%20needs%20fix')
  })

  it('supports publishing multiple events', () => {
    const engine = new AnalyticsEngine({ endpoint: 'https://test.com' })
    engine.track('start')
    engine.track('quartile')
    engine.track('complete')
    expect(capturedUrl).toContain('event=complete')
  })
})
