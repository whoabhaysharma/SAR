import { PlayerCore } from '../core/player-core'

export interface ViewportPluginConfig {
  threshold?: number | number[]
  rootMargin?: string
  pauseWhenHidden?: boolean
  resumeWhenVisible?: boolean
}

export class ViewportPlugin {
  private core: PlayerCore
  private config: Required<ViewportPluginConfig>
  private observer: IntersectionObserver | null = null

  constructor(core: PlayerCore, config?: ViewportPluginConfig) {
    this.core = core
    this.config = {
      threshold: config?.threshold ?? 0,
      rootMargin: config?.rootMargin ?? '0px',
      pauseWhenHidden: config?.pauseWhenHidden ?? true,
      resumeWhenVisible: config?.resumeWhenVisible ?? true,
    }
  }

  init(): void {
    this.destroy()

    this.observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.onVisible()
          } else {
            this.onHidden()
          }
        }
      },
      {
        threshold: this.config.threshold,
        rootMargin: this.config.rootMargin,
      }
    )

    this.observer.observe(this.core.container)
  }

  private onVisible(): void {
    if (!this.config.resumeWhenVisible) return
    if (this.core.state === 'PAUSED') {
      this.core.play()
    }
  }

  private onHidden(): void {
    if (!this.config.pauseWhenHidden) return
    if (this.core.state === 'PLAYING') {
      this.core.pause()
    }
  }

  destroy(): void {
    this.observer?.disconnect()
    this.observer = null
  }
}
