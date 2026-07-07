import type {
  VastConfig, VastTag, Ad, PlayerState,
  StateChangeEvent, AdLoadedEvent, AdErrorEvent, QuartileEvent, AdImpressionEvent,
} from '../core/types'
import { PlayerCore } from '../core/player-core'
import type { PlayerCoreConfig } from '../core/player-core'
import { VastVideoRenderer } from '../vast/renderer'
import type { VastVideoConfig } from '../vast/renderer'
import { ViewportPlugin } from '../plugins/viewport'
import type { ViewportPluginConfig } from '../plugins/viewport'

export class BunnyTag {
  private core: PlayerCore
  private renderer: VastVideoRenderer
  private viewportPlugin: ViewportPlugin | null = null

  get state(): PlayerState {
    return this.core.state
  }

  get container(): HTMLElement {
    return this.core.container
  }

  get playerCore(): PlayerCore {
    return this.core
  }

  constructor(config: VastConfig) {
    const coreConfig: PlayerCoreConfig = {
      container: config.container,
      shadowDom: config.shadowDom !== false,
      muted: config.muted ?? false,
    }
    this.core = new PlayerCore(coreConfig)

    const rendererConfig: VastVideoConfig = {
      tags: config.tags ?? [],
      configUrl: config.configUrl,
      strategy: config.strategy,
      timeout: config.timeout,
      maxWrapperDepth: config.maxWrapperDepth,
      autoplay: config.autoplay,
    }
    this.renderer = new VastVideoRenderer(this.core, rendererConfig)

    if (config.viewport) {
      this.viewportPlugin = new ViewportPlugin(this.core, config.viewport)
      this.viewportPlugin.init()
    }
  }

  on(event: 'statechange', cb: (e: StateChangeEvent) => void): void
  on(event: 'adloaded', cb: (e: AdLoadedEvent) => void): void
  on(event: 'adstart', cb: (e: { ad: Ad }) => void): void
  on(event: 'adimpression', cb: (e: AdImpressionEvent) => void): void
  on(event: 'aderror', cb: (e: AdErrorEvent) => void): void
  on(event: 'adcomplete', cb: () => void): void
  on(event: 'quartile', cb: (e: QuartileEvent) => void): void
  on(event: string, cb: (...args: any[]) => void): void {
    this.core.on(event, cb)
  }

  off(event: string, cb: (...args: any[]) => void): void {
    this.core.off(event, cb)
  }

  async init(): Promise<void> {
    await this.renderer.init()
  }

  play(): void {
    this.core.play()
  }

  pause(): void {
    this.core.pause()
  }

  destroy(): void {
    this.viewportPlugin?.destroy()
    this.renderer.destroy()
    this.core.destroy()
  }
}
