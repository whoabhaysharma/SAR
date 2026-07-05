import type { PlayerState } from './types'

export interface PlayerCoreConfig {
  container: string | HTMLElement
  shadowDom?: boolean
  muted?: boolean
}

type EventCallback = (...args: any[]) => void

const PLAYER_STYLES = `.vast-player{position:relative;width:100%;height:100%;background:#000;overflow:hidden}.vast-player__video{width:100%;height:100%;display:block;object-fit:contain}.vast-player__overlay{position:absolute;inset:0;pointer-events:none}`

export class PlayerCore {
  private containerEl: HTMLElement
  private shadowRoot: ShadowRoot | null = null
  private videoEl: HTMLVideoElement | null = null
  private overlayEl: HTMLElement | null = null
  private _state: PlayerState = 'IDLE'
  private listeners = new Map<string, Set<EventCallback>>()
  private _destroyed = false

  get state(): PlayerState {
    return this._state
  }

  get container(): HTMLElement {
    return this.containerEl
  }

  get destroyed(): boolean {
    return this._destroyed
  }

  get video(): HTMLVideoElement | null {
    return this.videoEl
  }

  constructor(config: PlayerCoreConfig) {
    const el = typeof config.container === 'string'
      ? document.querySelector<HTMLElement>(config.container)
      : config.container
    if (!el) throw new Error(`Container not found`)
    this.containerEl = el
    this.render(config.shadowDom !== false, config.muted ?? false)
  }

  private render(shadowDom: boolean, muted: boolean): void {
    if (shadowDom) {
      this.shadowRoot = this.containerEl.shadowRoot ?? this.containerEl.attachShadow({ mode: 'open' })
      this.shadowRoot.innerHTML = ''
      const style = document.createElement('style')
      style.textContent = PLAYER_STYLES
      this.shadowRoot.appendChild(style)
      const root = document.createElement('div')
      root.className = 'vast-player'
      root.innerHTML = `
        <div class="vast-player__overlay"></div>
        <video class="vast-player__video" playsinline ${muted ? 'muted' : ''}></video>
      `
      this.shadowRoot.appendChild(root)
      this.videoEl = root.querySelector<HTMLVideoElement>('.vast-player__video')!
      this.overlayEl = root.querySelector<HTMLElement>('.vast-player__overlay')!
    } else {
      this.shadowRoot = null
      this.containerEl.innerHTML = `
        <div class="vast-player">
          <div class="vast-player__overlay"></div>
          <video class="vast-player__video" playsinline ${muted ? 'muted' : ''}></video>
        </div>
      `
      this.videoEl = this.containerEl.querySelector<HTMLVideoElement>('.vast-player__video')!
      this.overlayEl = this.containerEl.querySelector<HTMLElement>('.vast-player__overlay')!
    }
  }

  on(event: string, cb: EventCallback): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(cb)
  }

  off(event: string, cb: EventCallback): void {
    this.listeners.get(event)?.delete(cb)
  }

  emit(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach(cb => cb(...args))
  }

  setState(s: PlayerState): void {
    this._state = s
    this.emit('statechange', { state: s })
  }

  play(): void {
    this.videoEl?.play()
  }

  pause(): void {
    this.videoEl?.pause()
  }

  destroy(): void {
    this._destroyed = true
    if (this.videoEl) {
      this.videoEl.pause()
      this.videoEl.src = ''
      this.videoEl.load()
    }
    if (this.shadowRoot) {
      this.shadowRoot.innerHTML = ''
    } else {
      this.containerEl.innerHTML = ''
    }
    this.shadowRoot = null
    this.videoEl = null
    this.overlayEl = null
    this.listeners.clear()
    this.setState('IDLE')
  }
}
