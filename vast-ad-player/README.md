# VAST Ad Player

A lightweight, configurable video ad player that fetches multiple VAST tags in parallel and plays the first valid ad. Built for publishers — they paste one snippet, you control everything server-side.

**Zero KB of publisher JavaScript.** All configuration (tags, strategy, viewport behavior) comes from your API.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Publisher Integration](#publisher-integration)
- [Server API Contract](#server-api-contract)
- [Programmatic API](#programmatic-api)
- [Viewport Plugin](#viewport-plugin)
- [Architecture & Build Outputs](#architecture--build-outputs)
- [Development](#development)
- [FAQ](#faq)

---

## Quick Start

```sh
cd vast-ad-player
npm install
npm run dev
# → http://localhost:5173
```

---

## Publisher Integration

Two modes — both require **zero JavaScript** from the publisher. All configuration comes from your server.

### Mode A: Script-only (SDK creates the slot)

The SDK automatically creates the container div as a sibling of the script tag:

```html
<script src="https://your-cdn.com/vast-ad-player.umd.cjs"
        data-publisher="PUB123"
        data-api="https://ads.your-platform.com"
        data-target="#leaderboard"
        data-slot="leaderboard"></script>
```

### Mode B: Pre-existing container

The publisher creates their own div and the SDK mounts inside it:

```html
<div id="leaderboard" style="width:728px;height:90px"></div>

<script src="https://your-cdn.com/vast-ad-player.umd.cjs"
        data-publisher="PUB123"
        data-api="https://ads.your-platform.com"
        data-target="#leaderboard"
        data-slot="leaderboard"></script>
```

### Script tag attributes

| Attribute | Required | Description |
|---|---|---|
| `data-publisher` | yes | Publisher ID sent to your API |
| `data-api` | yes | Base URL of your config API |
| `data-target` | yes | CSS selector for the container element |
| `data-slot` | no | Slot name sent to your API. Falls back to the element's `id` if omitted |

### How the SDK finds the container

```
data-target="#leaderboard"
     ↓
document.querySelector('#leaderboard')
     ↓
Player mounts inside that element
```

If `data-target` points to an element that doesn't exist when the script runs, the SDK logs a warning and skips that slot.

---

## Server API Contract

### Endpoint

```
GET {data-api}/v1/config?p={publisher}&slot={slot}
```

Query parameters:
| Parameter | Source | Description |
|---|---|---|
| `p` | `data-publisher` | Publisher identifier |
| `slot` | `data-slot` or element `id` | Ad slot name |

### Response schema

```json
{
  "tags": [
    { "url": "https://ads.example.com/vast1.xml" },
    { "url": "https://ads.example.com/vast2.xml" }
  ],
  "strategy": "first-valid-media",
  "timeout": 5000,
  "maxWrapperDepth": 5,
  "muted": false,
  "autoplay": true,
  "shadowDom": true,
  "viewport": {
    "threshold": 0.5,
    "rootMargin": "0px",
    "pauseWhenHidden": true,
    "resumeWhenVisible": true
  }
}
```

### Field reference

| Field | Type | Default | Description |
|---|---|---|---|
| `tags` | `{ url: string }[]` | — | VAST tag URLs. Fetched in parallel, first valid ad plays |
| `strategy` | `"first-valid-media"` / `"first-response"` | `"first-valid-media"` | How to pick the winning ad |
| `timeout` | number | `5000` | Per-tag fetch timeout in ms |
| `maxWrapperDepth` | number | `5` | Max VAST wrapper redirects to follow |
| `muted` | boolean | `false` | Start video muted |
| `autoplay` | boolean | `true` | Auto-play when ad loads |
| `shadowDom` | boolean | `true` | Style isolation via Shadow DOM |
| `viewport` | object | `undefined` | Auto-pause/resume based on visibility |

### Viewport field reference

| Field | Type | Default | Description |
|---|---|---|---|
| `threshold` | number / number[] | `0` | `IntersectionObserver` threshold |
| `rootMargin` | string | `"0px"` | `IntersectionObserver` rootMargin |
| `pauseWhenHidden` | boolean | `true` | Pause when scrolled out of view |
| `resumeWhenVisible` | boolean | `true` | Resume when scrolled back in |

### Why all fields are optional

Your API only needs to return what differs from defaults. If viewport behavior isn't needed, omit the `viewport` field entirely. The SDK applies its built-in defaults for every missing field.

---

## Programmatic API

For custom integrations where you want full control over the player lifecycle.

### Import

```ts
// Main (includes auto-init for script-tag loading)
import { VastAdPlayer, ViewportPlugin } from 'vast-ad-player'

// Or import only what you need:
import { parseVast } from 'vast-ad-player/core/parser'
import { fetchAll } from 'vast-ad-player/core/fetcher'
import { VastAdPlayer } from 'vast-ad-player/player'
import { ViewportPlugin } from 'vast-ad-player/viewport'
import type { Ad, VastConfig, PlayerState } from 'vast-ad-player/core/types'
```

### Constructor

```ts
const player = new VastAdPlayer({
  // Required
  container: '#ad-slot',       // CSS selector or HTMLElement

  // Tags — provide inline or via configUrl (see below)
  tags: [{ url: 'https://...' }],

  // OR fetch everything from your server:
  configUrl: 'https://your-api.com/v1/config?p=PUB123&slot=leaderboard',

  // Optional overrides (any of these can come from configUrl instead)
  strategy: 'first-valid-media',
  timeout: 5000,
  maxWrapperDepth: 5,
  muted: false,
  autoplay: true,
  shadowDom: true,
  viewport: { threshold: 0.5, pauseWhenHidden: true, resumeWhenVisible: true },
})
```

### Methods

```ts
await player.init()      // Start fetching → parse → select → play
player.play()            // Resume if paused
player.pause()           // Pause if playing
player.destroy()         // Full cleanup (video + observers + listeners)
```

### Properties

```ts
player.state             // Current PlayerState
player.container         // The HTMLElement the player is mounted in
```

### Events

```ts
player.on('statechange', ({ state }: StateChangeEvent) => {
  console.log('State:', state)
})

player.on('adloaded', ({ ad, tag }: AdLoadedEvent) => {
  console.log(`Ad loaded: ${ad.duration}s from ${tag.url}`)
})

player.on('adstart', ({ ad }: { ad: Ad }) => {
  console.log('Ad started')
})

player.on('adimpression', ({ urls }: AdImpressionEvent) => {
  console.log(`Impression fired (${urls.length} pixels)`)
})

player.on('quartile', ({ quartile }: QuartileEvent) => {
  console.log(`Quartile ${quartile}/4`)
})

player.on('adcomplete', () => {
  console.log('Ad finished')
})

player.on('aderror', ({ error }: AdErrorEvent) => {
  console.error('Ad error:', error)
})
```

### State machine

```
IDLE
  │
  ▼
FETCHING_CONFIG  ──(fetch fails)──▶ ERROR
  │
  ▼
FETCHING         ──(error)────────▶ ERROR
  │
  ▼
PARSING
  │
  ▼
SELECTING        ──(no ads)───────▶ NO_ADS
  │
  ▼
PLAYING ──(pause)──▶ PAUSED ──(play)──▶ PLAYING
  │
  ▼
COMPLETED

Any state → ERROR (on fatal error)
Any state → IDLE (on destroy())
```

### Config resolution order

1. Constructor options (highest priority)
2. Remote config fetched from `configUrl` (overrides constructor for matching keys)
3. Built-in defaults (lowest priority)

This means you can hard-code `shadowDom: false` in the constructor and the remote config won't override it — unless you omit it from the constructor, in which case the remote config wins.

---

## Viewport Plugin

Auto-pause when the ad scrolls out of view, auto-resume when it comes back.

### Via server config (recommended for publishers)

Add `viewport` to your API response:

```json
{
  "viewport": {
    "threshold": 0.5,
    "rootMargin": "0px",
    "pauseWhenHidden": true,
    "resumeWhenVisible": true
  }
}
```

No publisher code needed. The player auto-creates the plugin internally.

### Via programmatic API (for custom integrations)

```ts
import { VastAdPlayer, ViewportPlugin } from 'vast-ad-player'

const player = new VastAdPlayer({ container: '#ad-slot', configUrl: '...' })

const viewport = new ViewportPlugin(player, {
  threshold: 0.5,
  rootMargin: '0px',
  pauseWhenHidden: true,
  resumeWhenVisible: true,
})

viewport.init()
player.init()
```

### Via UMD script tag

```html
<script src="vast-ad-player.umd.cjs"></script>
<script>
  var player = new VastAdPlayer({ container: '#ad-slot', configUrl: '...' });

  var vp = new VastAdPlayer.ViewportPlugin(player, { threshold: 0.5 });
  vp.init();

  player.init();
</script>
```

---

## Architecture & Build Outputs

### File structure

```
vast-ad-player/
├── index.html                  # Demo page
├── style.css                   # Demo styles
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── embed.ts                # Library entry (auto-init when loaded as script tag)
    ├── index.ts                # Barrel (re-exports everything)
    ├── main.ts                 # Demo script
    ├── core/
    │   ├── types.ts            # All TypeScript interfaces
    │   ├── config.ts           # Config defaults + merge
    │   ├── fetcher.ts          # Parallel VAST fetch with timeout
    │   └── parser.ts           # VAST XML parser (handles wrappers)
    ├── player/
    │   ├── index.ts            # Player barrel
    │   ├── ad-player.ts        # VastAdPlayer class
    │   └── selector.ts         # Ad selection strategies
    └── plugins/
        ├── index.ts            # Plugins barrel
        └── viewport.ts         # ViewportPlugin (IntersectionObserver)
```

### Build outputs

```
dist/
├── vast-ad-player.js          # ESM (12 KB, tree-shakeable)
└── vast-ad-player.umd.cjs     # UMD (9.4 KB, ~3.3 KB gzipped)
```

| Format | File | Use case |
|---|---|---|
| ESM | `vast-ad-player.js` | `import` in bundler projects |
| UMD | `vast-ad-player.umd.cjs` | `<script>` tag in publisher pages |

### Sub-path imports

All internal modules are accessible for tree-shaking:

```ts
// Import only what you need
import { parseVast }   from 'vast-ad-player/core/parser'
import { fetchAll }    from 'vast-ad-player/core/fetcher'
import { VastAdPlayer } from 'vast-ad-player/player'
import { ViewportPlugin } from 'vast-ad-player/viewport'
import type { Ad, VastConfig, PlayerState } from 'vast-ad-player/core/types'
```

---

## Development

```sh
npm run dev       # Start Vite dev server with hot-reload
npm run build     # Build library → dist/
npm run preview   # Preview production build
```

### Adding a new plugin

1. Create `src/plugins/my-plugin.ts`
2. Implement the plugin class (receives `VastAdPlayer` instance)
3. Export from `src/plugins/index.ts`
4. Add to `src/embed.ts` barrel exports
5. (Optional) Add a config interface and auto-init in the player

---

## FAQ

### How do I add more VAST tags for a publisher?

Update the `tags` array in your server's API response for that publisher + slot. Publishers pick up the change on their next page load — no page changes needed.

### How do I change the ad selection strategy?

Set `"strategy": "first-response"` in your API response. `first-response` plays the fastest-responding VAST tag; `first-valid-media` checks that the browser can play the media type before selecting.

### Can publishers control the ad container size?

Yes — if they provide their own container div (Mode B), they set `style` on it. In Mode A (SDK creates the slot), you control sizing from your server config. We recommend always using Mode B for predictable layout.

### What if all VAST tags fail?

The player emits `aderror` and transitions to `NO_ADS` or `ERROR` state. You can listen for this event and show fallback content.

### Does the viewport plugin work with Shadow DOM?

Yes. The plugin observes the publisher's container element (outside the shadow root), so it works regardless of the `shadowDom` setting.

### Browser support?

- Modern browsers with `IntersectionObserver`, `Shadow DOM`, `fetch`, and `AbortController`
- Chrome 55+, Firefox 52+, Safari 12.1+, Edge 16+

### How do I host the SDK?

Upload `dist/vast-ad-player.umd.cjs` to your CDN. The publisher snippet references it as the `src` of the script tag.

---

## License

MIT
