import type { AnalyticsHandler } from './types'

export interface AnalyticsEngineConfig {
  endpoint: string
  context?: Record<string, string>
  tag?: string
}

export class AnalyticsEngine implements AnalyticsHandler {
  private config: Required<AnalyticsEngineConfig>
  private _destroyed = false

  get destroyed(): boolean {
    return this._destroyed
  }

  constructor(config: AnalyticsEngineConfig) {
    this.config = {
      endpoint: config.endpoint.replace(/\/$/, ''),
      context: config.context ?? {},
      tag: config.tag ?? '',
    }
  }

  track(event: string, data?: Record<string, string | number | boolean | null | undefined>): void {
    if (this._destroyed) return

    const params: Record<string, string> = {
      event,
      ts: String(Date.now()),
      ...this.config.context,
    }

    if (this.config.tag) params.tag = this.config.tag

    if (data) {
      for (const [k, v] of Object.entries(data)) {
        if (v !== null && v !== undefined) params[k] = String(v)
      }
    }

    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    new Image().src = `${this.config.endpoint}/collect?${qs}`
  }

  destroy(): void {
    this._destroyed = true
  }
}
