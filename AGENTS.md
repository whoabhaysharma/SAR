# AdBunny — Agent Instructions

## Structure

| Directory | What | Stack |
|-----------|------|-------|
| `analytics-server-go/` | Production event ingestion (port 8080) | Go 1.22, fasthttp, NATS JetStream, ClickHouse |
| `platform/` | Management dashboard | Node/Express backend (4000) + React/Vite frontend (5174) |
| `adbunny-sdk/` | AdBunny SDK (ESM+UMD, main class `BunnyTag`) | TypeScript, Vite lib mode, zero runtime deps |

## Commands

```bash
# Go server — dev build & run
go build -o server . && ./server

# Platform backend — auto-restart on change
npm run dev                           # node --watch src/index.js

# Platform frontend — Vite dev server (proxies /api -> localhost:4000)
npm run dev                           # vite on port 5174

# AdBunny SDK — dev demo or library build
npm run dev                           # vite demo page
npm run build                         # vite build (ESM + UMD in dist/)
```

## Endpoints

### analytics-server-go

| Path | Method | Auth | Description |
|------|--------|------|-------------|
| `/collect` | GET | No | Query‑string event ingestion, returns 1×1 GIF. Short param keys: `e`, `p`, `s`, `t`, `q`, `d`, `m`. Hosted at `go.adbunny.in` |
| `/health` | GET | `?token=admin-secret-token` | JSON stats |
| `/recent` | GET | Same token | Last 50 events from ClickHouse |
| `/events` | GET | Same token | Alias for `/recent` |

### Platform backend (`api.adbunny.in`)

| Path | Method | Auth | Description |
|------|--------|------|-------------|
| `/api/config/:publisherTag` | GET | No | Returns campaign config JSON (public, Bunny origin-pull). Sets `Cache-Control: max-age=86400` |
| `/api/campaigns` | CRUD | JWT | Campaign management |
| `/api/analytics/campaign/:tag` | GET | JWT | ClickHouse query by tag |

All config via env vars. NATS subject: `analytics.events`.

## Config Flow (origin-pull via CDN)

```
Publisher page
  → cdn.adbunny.in/adbunny.js
  → fetches cdn.adbunny.in/config/{publisherTag}.json
    → Bunny cache miss → origin api.adbunny.in/api/config/{publisherTag}
    → Bunny cache hit → served from edge
```

SDK constructs config URL as: `{data-api}/config/{data-publisher}.json`. Analytics events go to `go.adbunny.in/collect`.

## No Tests

None of the three components have tests. Do not search for test commands.

## Deployment

```bash
# Production (in analytics-server-go/)
docker compose up -d --build

# Platform backend needs the analytics network running first:
docker compose -f ../docker-compose.yml up -d
docker compose up -d
```

Root `docker-compose.yml` just `include`s analytics-server-go's compose. Platform compose depends on external network `analytics-server-go_default`.

## Domains

| Domain | Purpose |
|--------|---------|
| `cdn.adbunny.in` | Bunny CDN — serves `adbunny.js`, cached configs (origin-pull from `api.adbunny.in`) |
| `api.adbunny.in` | Platform backend — config, campaigns, analytics queries (port 4000) |
| `go.adbunny.in` | Go analytics server — `/collect`, `/health`, `/recent` (port 8080) |
| `app.adbunny.in` | React dashboard |

## Production Servers

| Region | Host | PEM | Extra |
|--------|------|-----|-------|
| US East | `ec2-54-146-241-204.compute-1.amazonaws.com` | `~/Downloads/SAR-PROD.pem` | ClickHouse :8123/:9000 |
| India | `ec2-13-232-25-92.ap-south-1.compute.amazonaws.com` | `~/Downloads/SAR-PROD-INDIA.pem` | Also NATS :4222 |

```bash
ssh -i ~/Downloads/SAR-PROD.pem ec2-user@<host>
docker ps --format '{{.Names}}\t{{.Status}}'
curl -s 'http://localhost:8080/health?token=admin-secret-token'
curl -s -u analytics:analytics123 'http://localhost:8123/' -d "SELECT count(*) FROM analytics.ad_events"
```

## Security

- `.pem`, `.key`, `.env` files are gitignored — never commit them
- ClickHouse: `analytics` / `analytics123` (internal only)
- Admin token: `admin-secret-token`
- Platform `.env` defaults: `JWT_SECRET=change-me-in-production`

## Throughput (reference)

| Method | Rate | Notes |
|--------|------|-------|
| HTTP (new conn) | ~1,200 evt/s | TCP handshake per event |
| HTTP keep-alive | ~3,700 evt/s | Persistent connection |
| **NATS** | **~394,000 evt/s** | Single persistent TCP, multiplexed |

Docker defaults: `BATCH_MAX_SIZE=5000`, `BATCH_INTERVAL_MS=250`, `FLUSH_WORKERS=1`.
