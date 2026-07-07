# AdBunny SDK

A lightweight, configurable ad SDK that fetches a config from your CDN and renders the right creative (VAST video, HTML, or script). Built for publishers — they paste one snippet, you control everything server-side.

**Zero KB of publisher JavaScript.** All configuration (tags, strategy, viewport behavior) comes from your CDN-hosted config.

---

## Quick Start

```sh
cd adbunny-sdk
npm install
npm run dev
# → http://localhost:5173
```

---

## Publisher Integration

Publishers paste one `<script>` tag. The SDK auto-initializes, fetches its config, and renders the ad.

```html
<script src="https://cdn.adbunny.in/adbunny.js"
  data-api="https://cdn.adbunny.in"
  data-publisher="acme-summer-sale-a1b2c3d4"
  data-target="#ad-container"
  data-slot="leaderboard">
</script>
```

### Script tag attributes

| Attribute | Required | Description |
|-----------|----------|-------------|
| `data-publisher` | yes | Publisher tag — links to your campaign config |
| `data-api` | yes | CDN base URL for config lookup |
| `data-target` | yes | CSS selector for the container element |
| `data-slot` | no | Slot name sent with analytics events (default: `"default"`) |

The SDK fetches config from `{data-api}/config/{data-publisher}.json`. If the target element doesn't exist, it auto-creates one.

---

## Config File

Your platform generates this when a campaign is created. Hosted on your CDN at `/config/{publisherTag}.json`.

### Schema

```json
{
  "tags": [
    { "url": "https://ads.example.com/vast1.xml" },
    { "url": "https://ads.example.com/vast2.xml" }
  ],
  "renderer": { "type": "vast-video" },
  "analytics": {
    "endpoint": "https://go.adbunny.in"
  },
  "tag": "acme-summer-sale-a1b2c3d4",
  "viewport": { "threshold": 0.5 },
  "autoplay": true,
  "muted": true
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `tags` | `{ url: string }[]` | — | VAST tag URLs. Fetched in parallel, first valid ad plays |
| `renderer.type` | `"vast-video"` / `"html"` / `"script"` | `"vast-video"` | Which renderer to use |
| `analytics.endpoint` | string | — | Base URL for analytics events (`/collect` endpoint) |
| `tag` | string | — | Attached to every analytics event for dashboard filtering |
| `viewport` | object | `undefined` | Auto-pause/resume via IntersectionObserver |
| `autoplay` | boolean | `true` | Auto-play when ad loads |
| `muted` | boolean | `false` | Start video muted |

---

## Programmatic API

```ts
import { BunnyTag, ViewportPlugin, AnalyticsPlugin } from '@adbunny/sdk'

const player = new BunnyTag({
  container: '#ad-slot',
  tags: [{ url: 'https://ads.example.com/vast.xml' }],
  strategy: 'first-valid-media',
  timeout: 5000,
  autoplay: true,
  muted: false,
})

player.on('statechange', ({ state }) => console.log('State:', state))
player.on('adloaded', ({ ad, tag }) => console.log(`Ad loaded: ${ad.duration}s`))
player.on('adimpression', () => console.log('Impression'))
player.on('adstart', () => console.log('Started'))
player.on('quartile', ({ quartile }) => console.log(`Quartile ${quartile}/4`))
player.on('adcomplete', () => console.log('Complete'))
player.on('aderror', ({ error }) => console.error(error))

await player.init()
player.play()
player.pause()
player.destroy()
```

---

## Build

```sh
npm run build     # dist/adbunny.js (ESM) + dist/adbunny.umd.cjs (UMD)
```

Upload `dist/adbunny.js` to `cdn.adbunny.in`.

---

## License

MIT
