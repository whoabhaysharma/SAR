export interface AnalyticsEvent {
  event: string
  publisher: string
  slot: string
  ts: number
  time: string
  tag?: string
  error?: string
  quartile?: number
  duration?: number
  mediaCount?: number
  tagUrl?: string
  progress?: string
  ip?: string
  userAgent?: string
  referer?: string
}

export interface ClickHouseConfig {
  host: string
  port?: number
  username: string
  password: string
  database: string
}

export interface ServerConfig {
  port: number
  clickHouse: ClickHouseConfig
  batchMaxSize: number
  batchMaxIntervalMs: number
}
