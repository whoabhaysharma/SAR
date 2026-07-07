import { PlayerCore } from '../core/player-core'
import { AnalyticsEngine } from '../analytics/engine'
import type { AnalyticsEngineConfig } from '../analytics/engine'
import type { AnalyticsHandler } from '../analytics/types'
import type { Ad, VastTag } from '../core/types'

export type AnalyticsPluginConfig = AnalyticsEngineConfig | AnalyticsHandler

export class AnalyticsPlugin {
  private handler: AnalyticsHandler
  private core: PlayerCore
  private subs: Array<{ event: string; cb: (...args: any[]) => void }> = []

  constructor(core: PlayerCore, config: AnalyticsPluginConfig) {
    this.core = core
    this.handler = isAnalyticsHandler(config) ? config : new AnalyticsEngine(config)
  }

  init(): void {
    this.subs = [
      {
        event: 'adloaded',
        cb: (e: { ad: Ad; tag: VastTag }) =>
          this.handler.track('adloaded', {
            duration: Math.round(e.ad.duration),
            mediaCount: e.ad.mediaFiles.length,
            tagUrl: e.tag.url,
          }),
      },
      { event: 'adimpression', cb: () => this.handler.track('impression') },
      { event: 'adstart', cb: () => this.handler.track('start') },
      {
        event: 'quartile',
        cb: (e: { quartile: number }) =>
          this.handler.track('quartile', {
            quartile: e.quartile,
            progress: `${e.quartile * 25}%`,
          }),
      },
      { event: 'adcomplete', cb: () => this.handler.track('complete') },
      {
        event: 'aderror',
        cb: (e: { error: string }) => this.handler.track('error', { error: e.error }),
      },
    ]

    for (const { event, cb } of this.subs) {
      this.core.on(event, cb)
    }
  }

  getHandler(): AnalyticsHandler {
    return this.handler
  }

  destroy(): void {
    for (const { event, cb } of this.subs) {
      this.core.off(event, cb)
    }
    this.subs = []
    this.handler.destroy()
  }
}

function isAnalyticsHandler(v: AnalyticsPluginConfig): v is AnalyticsHandler {
  return typeof v === 'object' && 'track' in v
}
