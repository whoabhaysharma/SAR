import { PlayerCore } from '../core/player-core'

export interface ScriptAdConfig {
  src?: string
  code?: string
}

export class ScriptRenderer {
  private core: PlayerCore
  private config: ScriptAdConfig

  constructor(core: PlayerCore, config: ScriptAdConfig) {
    this.core = core
    this.config = config
  }

  init(): void {
    const el = this.core.container
    const shadow = el.shadowRoot || el
    const root = shadow.querySelector('.vast-player') || shadow.querySelector('div') || shadow

    if (this.config.src) {
      const script = document.createElement('script')
      script.src = this.config.src
      root.appendChild(script)
    }

    if (this.config.code) {
      const script = document.createElement('script')
      script.textContent = this.config.code
      root.appendChild(script)
    }

    this.core.setState('PLAYING')
  }

  destroy(): void {
    // scripts are removed when container is cleared
  }
}
