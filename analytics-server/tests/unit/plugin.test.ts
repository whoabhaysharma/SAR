import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AnalyticsPlugin } from '../../../vast-ad-player/src/plugins/analytics.ts'

describe('AnalyticsPlugin', () => {
  let core: any
  let capturedUrl: string
  const OrigImage = (globalThis as any).Image

  beforeEach(() => {
    capturedUrl = ''
    ;(globalThis as any).Image = class MockImage {
      set src(url: string) { capturedUrl = url }
    } as any

    const listeners = new Map<string, Set<Function>>()
    core = {
      on: vi.fn((event: string, cb: Function) => {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)!.add(cb)
      }),
      off: vi.fn((event: string, cb: Function) => {
        listeners.get(event)?.delete(cb)
      }),
      dispatchEvent: vi.fn((event: string, data: any) => {
        listeners.get(event)?.forEach(cb => cb(data))
      }),
      state: 'PLAYING',
      container: {},
      play: vi.fn(),
      pause: vi.fn(),
    }
  })

  afterEach(() => {
    ;(globalThis as any).Image = OrigImage
  })

  it('subscribes to core events on init', () => {
    const plugin = new AnalyticsPlugin(core, { endpoint: 'https://test.com' })
    plugin.init()

    const subscribed = core.on.mock.calls.map((c: any[]) => c[0])
    expect(subscribed).toContain('adloaded')
    expect(subscribed).toContain('adimpression')
    expect(subscribed).toContain('quartile')
    expect(subscribed).toContain('adcomplete')
    expect(subscribed).toContain('aderror')
  })

  it('forwards start event to engine', () => {
    const plugin = new AnalyticsPlugin(core, { endpoint: 'https://test.com' })
    plugin.init()

    core.dispatchEvent('adstart', {})

    expect(capturedUrl).toContain('event=start')
  })

  it('forwards quartile event with data', () => {
    const plugin = new AnalyticsPlugin(core, { endpoint: 'https://test.com' })
    plugin.init()

    core.dispatchEvent('quartile', { quartile: 2 })

    expect(capturedUrl).toContain('event=quartile')
    expect(capturedUrl).toContain('quartile=2')
    expect(capturedUrl).toContain('progress=50%25')
  })

  it('forwards error event with message', () => {
    const plugin = new AnalyticsPlugin(core, { endpoint: 'https://test.com' })
    plugin.init()

    core.dispatchEvent('aderror', { error: 'No fill' })

    expect(capturedUrl).toContain('event=error')
    expect(capturedUrl).toContain('error=No%20fill')
  })

  it('forwards adloaded event with metadata', () => {
    const plugin = new AnalyticsPlugin(core, { endpoint: 'https://test.com' })
    plugin.init()

    core.dispatchEvent('adloaded', {
      ad: { duration: 30, mediaFiles: [{}] },
      tag: { url: 'https://ads.com/vast.xml' },
    })

    expect(capturedUrl).toContain('event=adloaded')
    expect(capturedUrl).toContain('duration=30')
    expect(capturedUrl).toContain('mediaCount=1')
  })

  it('unsubscribes on destroy', () => {
    const plugin = new AnalyticsPlugin(core, { endpoint: 'https://test.com' })
    plugin.init()
    plugin.destroy()

    expect(core.off).toHaveBeenCalled()
    expect(core.off.mock.calls.length).toBeGreaterThan(0)
  })

  it('exposes engine via getEngine()', () => {
    const plugin = new AnalyticsPlugin(core, { endpoint: 'https://test.com' })
    plugin.init()

    const engine = plugin.getEngine()
    expect(engine).toBeDefined()
    expect(typeof engine.track).toBe('function')
  })
})
