-- ══════════════════════════════════════════════════════════
-- Analytics Queries for Multi-Tenant Ad Platform
-- Run with: curl -u "analytics:analytics123" "http://localhost:8123/" -d @scripts/queries.sql
-- Or pipe a specific query: echo "SELECT ..." | curl ... -d @-
-- ══════════════════════════════════════════════════════════

-- ─────────── 1. Impressions per publisher (last 24h) ───────────
SELECT
  publisher,
  count(*) AS impressions
FROM analytics.ad_events
WHERE event = 'start'
  AND time >= now() - INTERVAL 1 DAY
GROUP BY publisher
ORDER BY impressions DESC
FORMAT PrettyCompact
;

-- ─────────── 2. Fill rate per publisher ───────────
SELECT
  publisher,
  countIf(event = 'start') AS plays,
  countIf(event = 'error') AS errors,
  round(plays / (plays + errors) * 100, 1) AS fill_rate_pct
FROM analytics.ad_events
WHERE event IN ('start', 'error')
  AND time >= now() - INTERVAL 1 DAY
GROUP BY publisher
ORDER BY fill_rate_pct ASC
FORMAT PrettyCompact
;

-- ─────────── 3. Quartile drop-off (how many watched 25%, 50%, 75%, 100%) ───────────
SELECT
  publisher,
  countIf(event = 'start') AS started,
  countIf(event = 'quartile' AND quartile = 1) AS q1,
  countIf(event = 'quartile' AND quartile = 2) AS q2,
  countIf(event = 'quartile' AND quartile = 3) AS q3,
  countIf(event = 'complete') AS completed,
  round(completed / started * 100, 1) AS completion_rate_pct
FROM analytics.ad_events
WHERE event IN ('start', 'quartile', 'complete')
  AND time >= now() - INTERVAL 1 DAY
GROUP BY publisher
FORMAT PrettyCompact
;

-- ─────────── 4. Error breakdown ───────────
SELECT
  error,
  count(*) AS occurrences
FROM analytics.ad_events
WHERE event = 'error'
  AND time >= now() - INTERVAL 7 DAY
GROUP BY error
ORDER BY occurrences DESC
FORMAT PrettyCompact
;

-- ─────────── 5. Slot performance ───────────
SELECT
  publisher,
  slot,
  countIf(event = 'start') AS plays,
  countIf(event = 'complete') AS completions,
  round(completions / plays * 100, 1) AS completion_rate_pct
FROM analytics.ad_events
WHERE event IN ('start', 'complete')
  AND time >= now() - INTERVAL 7 DAY
GROUP BY publisher, slot
ORDER BY plays DESC
FORMAT PrettyCompact
;

-- ─────────── 6. Hourly traffic (last 24h) ───────────
SELECT
  toStartOfHour(time) AS hour,
  event,
  count(*) AS events
FROM analytics.ad_events
WHERE time >= now() - INTERVAL 1 DAY
GROUP BY hour, event
ORDER BY hour ASC, event ASC
FORMAT PrettyCompact
;

-- ─────────── 7. Events over time (time series for charts) ───────────
SELECT
  toStartOfFiveMinutes(time) AS bucket,
  countIf(event = 'start') AS starts,
  countIf(event = 'error') AS errors,
  countIf(event = 'complete') AS completions
FROM analytics.ad_events
WHERE time >= now() - INTERVAL 1 HOUR
GROUP BY bucket
ORDER BY bucket ASC
FORMAT PrettyCompact
;

-- ─────────── 8. Publisher health summary (dashboard view) ───────────
SELECT
  publisher,
  count(*) AS total_events,
  count(DISTINCT slot) AS active_slots,
  min(time) AS first_event,
  max(time) AS last_event
FROM analytics.ad_events
WHERE time >= now() - INTERVAL 1 DAY
GROUP BY publisher
ORDER BY total_events DESC
FORMAT PrettyCompact
;

-- ─────────── 9. Average ad duration served ───────────
SELECT
  publisher,
  round(avg(duration), 1) AS avg_duration_sec,
  round(avg(mediaCount), 1) AS avg_media_files
FROM analytics.ad_events
WHERE event = 'adloaded'
  AND time >= now() - INTERVAL 7 DAY
GROUP BY publisher
FORMAT PrettyCompact
;

-- ─────────── 10. Raw log sample (latest 20 events) ───────────
SELECT
  time,
  event,
  publisher,
  slot,
  error,
  quartile,
  duration
FROM analytics.ad_events
ORDER BY time DESC
LIMIT 20
FORMAT PrettyCompact
;
