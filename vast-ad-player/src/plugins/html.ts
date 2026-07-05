import { PlayerCore } from '../core/player-core'

export interface HtmlAdConfig {
  html: string
}

export class HtmlRenderer {
  private core: PlayerCore
  private config: HtmlAdConfig

  constructor(core: PlayerCore, config: HtmlAdConfig) {
    this.core = core
    this.config = config
  }

  init(): void {
    const el = this.core.container
    const shadow = el.shadowRoot || el
    const root = shadow.querySelector('.vast-player') || shadow.querySelector('div') || shadow
    const frame = document.createElement('iframe')
    frame.style.width = '100%'
    frame.style.height = '100%'
    frame.style.border = 'none'
    frame.srcdoc = this.config.html
    root.appendChild(frame)
    this.core.setState('PLAYING')
  }

  destroy(): void {
    // iframe is removed when container is cleared
  }
}
