#!/usr/bin/env bash
# Load test: simulate real publisher traffic
# Usage: ./scripts/load-test.sh [url] [events] [concurrency]

BASE="${1:-http://localhost:8080}"
TOTAL="${2:-100}"
CONCURRENCY="${3:-5}"

echo "=== Load Test ==="
echo "Target: $BASE/collect"
echo "Events: $TOTAL"
echo "Concurrency: $CONCURRENCY"
echo ""

EVENTS=("start" "quartile" "complete" "error")
PUBLISHERS=("pub-alpha" "pub-beta" "pub-gamma" "pub-delta" "pub-omega")
SLOTS=("leaderboard" "sidebar" "inread" "skyscraper" "mobile-banner")

send_event() {
  local pub="${PUBLISHERS[$RANDOM % ${#PUBLISHERS[@]}]}"
  local slot="${SLOTS[$RANDOM % ${#SLOTS[@]}]}"
  local event="${EVENTS[$RANDOM % ${#EVENTS[@]}]}"
  local ts=$(date +%s%N)

  if [ "$event" = "quartile" ]; then
    local q=$((RANDOM % 4 + 1))
    local pct=$((q * 25))
    curl -s -o /dev/null \
      "$BASE/collect?event=$event&publisher=$pub&slot=$slot&ts=$ts&quartile=$q&progress=${pct}%25"
  elif [ "$event" = "error" ]; then
    local errors=("No+fill" "Timeout" "Parse+error" "Invalid+XML")
    local err="${errors[$RANDOM % ${#errors[@]}]}"
    curl -s -o /dev/null \
      "$BASE/collect?event=$event&publisher=$pub&slot=$slot&ts=$ts&error=$err"
  else
    curl -s -o /dev/null \
      "$BASE/collect?event=$event&publisher=$pub&slot=$slot&ts=$ts"
  fi
}

export -f send_event
export BASE
export PUBLISHERS SLOTS EVENTS

echo "Sending..."
START=$(date +%s)

seq 1 "$TOTAL" | xargs -P "$CONCURRENCY" -I {} bash -c 'send_event' 2>/dev/null

END=$(date +%s)
ELAPSED=$((END - START))
RPS=$((TOTAL / ELAPSED))

echo ""
echo "=== Results ==="
echo "Sent: $TOTAL events"
echo "Time: ${ELAPSED}s"
echo "Rate: ${RPS} events/sec"
echo ""
echo "Wait for batch flush, then query:"
echo "  curl -u analytics:analytics123 'http://localhost:8123/' -d \"SELECT event, count(*) FROM analytics.ad_events WHERE time >= now() - INTERVAL 5 MINUTE GROUP BY event\""
