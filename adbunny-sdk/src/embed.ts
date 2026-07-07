import { PlayerCore } from './core/player-core'
import { VastVideoRenderer } from './vast/renderer'
import { HtmlRenderer } from './plugins/html'
import { ScriptRenderer } from './plugins/script'
import { ViewportPlugin } from './plugins/viewport'
import { AnalyticsPlugin } from './plugins/analytics'

export { PlayerCore } from './core/player-core'
export { VastVideoRenderer } from './vast/renderer'
export { HtmlRenderer } from './plugins/html'
export { ScriptRenderer } from './plugins/script'
export { ViewportPlugin } from './plugins/viewport'
export { AnalyticsPlugin } from './plugins/analytics'
export { BunnyTag } from './player/ad-player'

export type * from './core/types'
export type { VastVideoConfig } from './vast/renderer'
export type { ViewportPluginConfig } from './plugins/viewport'
export type { HtmlAdConfig } from './plugins/html'
export type { ScriptAdConfig } from './plugins/script'
export type { AnalyticsPluginConfig } from './plugins/analytics'

/* ── auto-init ── */

type RendererType = 'vast-video' | 'html' | 'script'

function initEmbed(): void {
  const script = document.currentScript as HTMLScriptElement | null
  if (!script) return

  const apiBase = script.getAttribute('data-api') || ''
  const publisher = script.getAttribute('data-publisher')
  if (!publisher) {
    console.warn('[AdBunny] missing data-publisher on script tag')
    return
  }

  const targetSel = script.getAttribute('data-target')
  if (!targetSel) {
    console.warn('[AdBunny] missing data-target on script tag')
    return
  }

  const slot = script.getAttribute('data-slot') || 'default'

  const configUrl = apiBase ? `${apiBase}/config/${publisher}.json` : `./config/${publisher}.json`

  const fallback = script.getAttribute('data-fallback') || 'create'

  let el = document.querySelector<HTMLElement>(targetSel)

  if (!el) {
    if (fallback === 'warn') {
      console.warn(`[vast-ad-player] target not found: ${targetSel}`)
      return
    }
    el = document.createElement('div')
    el.id = targetSel.replace(/^#/, '')
    el.style.cssText = script.getAttribute('style') || 'width:640px;height:360px'
    script.after(el)
  }

  el.id = el.id || `vap-${(Math.random() * 1e9 | 0).toString(36)}`

  const core = new PlayerCore({
    container: el,
    shadowDom: true,
  })

  // Fetch config and dispatch to the right renderer
  fetch(configUrl)
    .then(r => r.json())
    .then((cfg: any) => {
      if (core.destroyed) return

      if (cfg.viewport) {
        const vp = new ViewportPlugin(core, cfg.viewport)
        vp.init()
      }

      if (cfg.analytics) {
        const analytics = new AnalyticsPlugin(core, {
          endpoint: cfg.analytics.endpoint,
          context: { publisher, slot },
          tag: cfg.tag,
        })
        analytics.init()
      }

      const rendererType: RendererType = cfg.renderer?.type || 'vast-video'

      if (rendererType === 'html') {
        const renderer = new HtmlRenderer(core, { html: cfg.renderer?.html || '' })
        renderer.init()
      } else if (rendererType === 'script') {
        const renderer = new ScriptRenderer(core, {
          src: cfg.renderer?.src,
          code: cfg.renderer?.code,
        })
        renderer.init()
      } else {
        const renderer = new VastVideoRenderer(core, {
          tags: cfg.tags ?? [],
          strategy: cfg.strategy,
          timeout: cfg.timeout,
          maxWrapperDepth: cfg.maxWrapperDepth,
          autoplay: cfg.autoplay !== false,
        })
        renderer.init()
      }
    })
    .catch(() => {
      core.setState('ERROR')
      core.emit('aderror', { error: 'Failed to fetch config' })
    })
}

const isScriptTag =
  typeof document !== 'undefined' &&
  document.currentScript !== null &&
  document.currentScript?.getAttribute('type') !== 'module'

if (isScriptTag) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmbed)
  } else {
    initEmbed()
  }
}
