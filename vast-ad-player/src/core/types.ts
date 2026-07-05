export interface VastTag {
  url: string
  weight?: number
  label?: string
}

export type SelectionStrategy = 'first-response' | 'first-valid-media'

export interface ViewportConfig {
  threshold?: number | number[]
  rootMargin?: string
  pauseWhenHidden?: boolean
  resumeWhenVisible?: boolean
}

export interface VastConfig {
  container: string
  tags?: VastTag[]
  configUrl?: string
  strategy?: SelectionStrategy
  timeout?: number
  maxWrapperDepth?: number
  muted?: boolean
  autoplay?: boolean
  shadowDom?: boolean
  viewport?: ViewportConfig
}

export interface MediaFile {
  url: string
  mimeType: string
  width?: number
  height?: number
}

export interface TrackingEvent {
  event: string
  url: string
}

export interface Ad {
  id?: string
  system?: string
  title?: string
  description?: string
  impressionUrls: string[]
  mediaFiles: MediaFile[]
  trackingEvents: TrackingEvent[]
  duration: number
}

export interface FetchResult {
  tag: VastTag
  xml: string | null
  error: string | null
  responseTime: number
}

export type PlayerState =
  | 'IDLE'
  | 'FETCHING_CONFIG'
  | 'FETCHING'
  | 'PARSING'
  | 'SELECTING'
  | 'PLAYING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ERROR'
  | 'NO_ADS'

export interface AdLoadedEvent {
  ad: Ad
  tag: VastTag
}

export interface AdErrorEvent {
  error: string
}

export interface QuartileEvent {
  quartile: 1 | 2 | 3 | 4
}

export interface StateChangeEvent {
  state: PlayerState
}

export interface AdImpressionEvent {
  urls: string[]
}
