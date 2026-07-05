import { PlayerCore } from '../core/player-core'
import { AnalyticsEngine } from '../analytics/engine'
import type { Ad, VastTag, PlayerState } from '../core/types'

export interface AnalyticsPluginConfig {
  endpoint: string
  context?: Record<string, string>
  tag?: string
}

export class AnalyticsPlugin {
  private engine: AnalyticsEngine
  private core: PlayerCore
  private handlers: Array<{ event: string; cb: (...args: any[]) => void }> = []

  constructor(core: PlayerCore, config: AnalyticsPluginConfig) {
    this.core = core
    this.engine = new AnalyticsEngine({
      endpoint: config.endpoint,
      context: config.context,
      tag: config.tag,
    })
  }

  init(): void {
    this.handlers = [
      { event: 'adloaded', cb: (e: { ad: Ad; tag: VastTag }) => this.engine.track('adloaded', {
        duration: Math.round(e.ad.duration),
        mediaCount: e.ad.mediaFiles.length,
        tagUrl: e.tag.url,
      })},
      { event: 'adimpression', cb: () => this.engine.track('impression') },
      { event: 'adstart', cb: () => this.engine.track('start') },
      { event: 'quartile', cb: (e: { quartile: number }) => this.engine.track('quartile', {
        quartile: e.quartile,
        progress: `${e.quartile * 25}%`,
      })},
      { event: 'adcomplete', cb: () => this.engine.track('complete') },
      { event: 'aderror', cb: (e: { error: string }) => this.engine.track('error', {
        error: e.error,
      })},
    ]

    for (const { event, cb } of this.handlers) {
      this.core.on(event, cb)
    }
  }

  getEngine(): AnalyticsEngine {
    return this.engine
  }

  destroy(): void {
    for (const { event, cb } of this.handlers) {
      this.core.off(event, cb)
    }
    this.handlers = []
    this.engine.destroy()
  }
}
