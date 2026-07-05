#!/usr/bin/env bash
# Test analytics pipeline by sending various events
# Usage: ./scripts/test-events.sh [url]

BASE="${1:-http://localhost:8080}"
PUBLISHER="test-pub-$(date +%s)"
SLOT="leaderboard"

echo "=== Sending events for publisher: $PUBLISHER ==="
echo ""

# 1. Publisher requests ad
curl -s -o /dev/null -w "ad_requested: %{http_code}\n" \
  "$BASE/collect?event=ad_requested&publisher=$PUBLISHER&slot=$SLOT&ts=1"

sleep 1

# 2. Ad loaded successfully (with latency data)
curl -s -o /dev/null -w "adloaded: %{http_code}\n" \
  "$BASE/collect?event=adloaded&publisher=$PUBLISHER&slot=$SLOT&ts=2&duration=30&mediaCount=3&tagUrl=https://ads.example.com/vast.xml"

sleep 1

# 3. Impression fired
curl -s -o /dev/null -w "impression: %{http_code}\n" \
  "$BASE/collect?event=impression&publisher=$PUBLISHER&slot=$SLOT&ts=3"

sleep 1

# 4. Ad started playing
curl -s -o /dev/null -w "start: %{http_code}\n" \
  "$BASE/collect?event=start&publisher=$PUBLISHER&slot=$SLOT&ts=4"

sleep 1

# 5. Quartile events (25%, 50%, 75%, complete)
for q in 1 2 3 4; do
  pct=$((q * 25))
  curl -s -o /dev/null -w "quartile_$q ($pct%%): %{http_code}\n" \
    "$BASE/collect?event=quartile&publisher=$PUBLISHER&slot=$SLOT&ts=$((4 + q))&quartile=$q&progress=${pct}%25"
  sleep 0.5
done

# 6. Send some error scenarios
curl -s -o /dev/null -w "error_no_ads: %{http_code}\n" \
  "$BASE/collect?event=error&publisher=$PUBLISHER&slot=$SLOT&ts=9&error=No+valid+ads+found"

sleep 1

curl -s -o /dev/null -w "error_timeout: %{http_code}\n" \
  "$BASE/collect?event=error&publisher=$PUBLISHER&slot=$SLOT&ts=10&error=VAST+fetch+timeout"

sleep 1

# 7. Another publisher with different slot
PUBLISHER2="test-pub-2"
curl -s -o /dev/null -w "pub2_start: %{http_code}\n" \
  "$BASE/collect?event=start&publisher=$PUBLISHER2&slot=sidebar&ts=11"

sleep 1

curl -s -o /dev/null -w "pub2_complete: %{http_code}\n" \
  "$BASE/collect?event=complete&publisher=$PUBLISHER2&slot=sidebar&ts=12"

echo ""
echo "=== Done. Wait 5s for batch flush, then query ClickHouse ==="
