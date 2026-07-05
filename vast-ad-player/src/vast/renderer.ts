import type { VastTag, Ad } from '../core/types'
import { PlayerCore } from '../core/player-core'
import { fetchAll } from './fetcher'
import { parseVast } from './parser'
import { selectAd } from './selector'

export interface VastVideoConfig {
  tags: VastTag[]
  configUrl?: string
  strategy?: 'first-response' | 'first-valid-media'
  timeout?: number
  maxWrapperDepth?: number
  autoplay?: boolean
}

export class VastVideoRenderer {
  private core: PlayerCore
  private config: Required<VastVideoConfig>
  private currentAd: Ad | null = null
  private currentTag: VastTag | null = null
  private firedQuartiles = new Set<number>()

  constructor(core: PlayerCore, config: VastVideoConfig) {
    this.core = core
    this.config = {
      tags: config.tags,
      configUrl: config.configUrl ?? '',
      strategy: config.strategy ?? 'first-valid-media',
      timeout: config.timeout ?? 5000,
      maxWrapperDepth: config.maxWrapperDepth ?? 5,
      autoplay: config.autoplay ?? true,
    }
  }

  async init(): Promise<void> {
    let tags = this.config.tags

    if ((!tags || tags.length === 0) && this.config.configUrl) {
      this.core.setState('FETCHING_CONFIG')
      try {
        const res = await fetch(this.config.configUrl)
        const remote = await res.json()
        tags = remote.tags ?? []
        if (remote.strategy) this.config.strategy = remote.strategy
        if (remote.timeout) this.config.timeout = remote.timeout
      } catch {
        this.core.setState('ERROR')
        this.core.emit('aderror', { error: 'Failed to fetch remote config' })
        return
      }
    }

    if (!tags || tags.length === 0) {
      this.core.setState('NO_ADS')
      this.core.emit('aderror', { error: 'No VAST tags configured' })
      return
    }

    this.core.setState('FETCHING')
    const fetchResults = await fetchAll(tags, this.config.timeout)
    if (this.core.destroyed) return

    this.core.setState('PARSING')
    const parsed = await Promise.all(
      fetchResults.map(async r => ({
        tag: r.tag,
        result: r,
        ad: r.xml ? await parseVast(r.xml, 0, this.config.maxWrapperDepth, this.config.timeout) : null,
      }))
    )
    if (this.core.destroyed) return

    this.core.setState('SELECTING')
    const selected = selectAd(parsed, this.config.strategy)
    if (!selected) {
      this.core.setState('NO_ADS')
      this.core.emit('aderror', { error: 'No valid ads found' })
      return
    }

    this.currentAd = selected.ad
    this.currentTag = selected.tag
    this.core.emit('adloaded', { ad: selected.ad, tag: selected.tag })

    await this.loadAd(selected.ad)
  }

  private async loadAd(ad: Ad): Promise<void> {
    const video = this.core.video
    if (!video) {
      this.core.setState('ERROR')
      this.core.emit('aderror', { error: 'No video element' })
      return
    }

    const mf = ad.mediaFiles
      .sort((a, b) => {
        const score = (mf: { mimeType: string }) =>
          mf.mimeType.includes('mp4') ? 3 : mf.mimeType.includes('webm') ? 2 : 1
        return score(b) - score(a)
      })
      .find(mf => video.canPlayType(mf.mimeType) !== '')

    if (!mf) {
      this.core.setState('ERROR')
      this.core.emit('aderror', { error: 'No playable media file' })
      return
    }

    video.src = mf.url
    video.load()

    try {
      await new Promise<void>((resolve, reject) => {
        video.oncanplaythrough = () => resolve()
        video.onerror = () => reject(new Error('Video failed to load'))
      })
    } catch {
      this.core.setState('ERROR')
      this.core.emit('aderror', { error: 'Media load failed' })
      return
    }

    if (this.core.destroyed) return

    for (const url of ad.impressionUrls) {
      if (url) new Image().src = url
    }
    this.core.emit('adimpression', { urls: ad.impressionUrls })

    this.setupTracking(ad)

    if (this.config.autoplay) {
      try { await video.play() } catch { /* autoplay blocked */ }
    }

    this.core.setState('PLAYING')
    this.core.emit('adstart', { ad })
  }

  private setupTracking(ad: Ad): void {
    this.firedQuartiles.clear()

    const fire = (eventName: string) => {
      const urls = ad.trackingEvents.filter(e => e.event === eventName).map(e => e.url)
      for (const url of urls) if (url) new Image().src = url
    }

    const video = this.core.video
    if (!video) return

    video.ontimeupdate = () => {
      if (!this.currentAd || this.currentAd.duration <= 0) return
      const pct = video.currentTime / this.currentAd.duration

      if (pct >= 0.25 && !this.firedQuartiles.has(1)) { this.firedQuartiles.add(1); fire('firstQuartile'); this.core.emit('quartile', { quartile: 1 }) }
      if (pct >= 0.50 && !this.firedQuartiles.has(2)) { this.firedQuartiles.add(2); fire('midpoint'); this.core.emit('quartile', { quartile: 2 }) }
      if (pct >= 0.75 && !this.firedQuartiles.has(3)) { this.firedQuartiles.add(3); fire('thirdQuartile'); this.core.emit('quartile', { quartile: 3 }) }
    }

    video.onplay = () => {
      fire('resume')
      this.core.setState('PLAYING')
    }

    video.onpause = () => {
      if (video && !video.ended) this.core.setState('PAUSED')
    }

    video.onended = () => {
      fire('complete')
      this.core.emit('quartile', { quartile: 4 })
      this.core.emit('adcomplete', {})
      this.core.setState('COMPLETED')
    }

    fire('start')
  }

  destroy(): void {
    this.firedQuartiles.clear()
    this.currentAd = null
    this.currentTag = null
  }
}
