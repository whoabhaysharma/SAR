export interface AnalyticsHandler {
  track(event: string, data?: Record<string, string | number | boolean | null | undefined>): void
  destroy(): void
}
