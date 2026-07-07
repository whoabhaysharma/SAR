import { BunnyTag, ViewportPlugin, AnalyticsPlugin } from './index'
import type { PlayerState } from './core/types'
import '../style.css'

const DEFAULT_TAGS = [
  'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unpositioned_start=1&env=vp&impl=s&correlator=',
  'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=728x90&gdfp_req=1&output=vast&unpositioned_start=1&env=vp&impl=s&correlator=',
]

const statusEl = document.getElementById('status')!
const logEl = document.getElementById('log')!
const tagsEl = document.getElementById('vast-tags') as HTMLTextAreaElement
const strategyEl = document.getElementById('strategy') as HTMLSelectElement
const mutedEl = document.getElementById('muted') as HTMLInputElement
const autoplayEl = document.getElementById('autoplay') as HTMLInputElement
const viewportEl = document.getElementById('viewport') as HTMLInputElement

let player: BunnyTag | null = null
let viewportPlugin: ViewportPlugin | null = null
let analyticsPlugin: AnalyticsPlugin | null = null

function getTags() {
  return tagsEl.value.split('\n').map(s => s.trim()).filter(Boolean)
}

function writeLog(msg: string) {
  const entry = document.createElement('div')
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`
  logEl.appendChild(entry)
  logEl.scrollTop = logEl.scrollHeight
}

function clearLog() {
  logEl.innerHTML = ''
}

function loadPlayer() {
  if (player) {
    viewportPlugin?.destroy()
    viewportPlugin = null
    player.destroy()
    player = null
  }

  const tags = getTags().map(url => ({ url }))
  if (tags.length === 0) {
    writeLog('No VAST tags provided')
    return
  }

  player = new BunnyTag({
    container: '#ad-container',
    tags,
    strategy: strategyEl.value as any,
    muted: mutedEl.checked,
    autoplay: autoplayEl.checked,
    timeout: 5000,
  })

  player.on('statechange', ({ state }: { state: PlayerState }) => {
    statusEl.textContent = `State: ${state}`
    writeLog(`State → ${state}`)
  })

  player.on('adloaded', ({ ad, tag }: any) => {
    writeLog(`Ad loaded — duration=${ad.duration}s, media=${ad.mediaFiles.length} files, tag=${tag.url.slice(0, 60)}…`)
  })

  player.on('adimpression', ({ urls }: any) => writeLog(`Impression (${urls.length} pixels)`))
  player.on('adstart', () => writeLog('Ad started'))
  player.on('quartile', ({ quartile }: any) => writeLog(`Quartile ${quartile}/4`))
  player.on('adcomplete', () => writeLog('Ad complete'))
  player.on('aderror', ({ error }: any) => writeLog(`Error: ${error}`))

  analyticsPlugin = new AnalyticsPlugin(player.playerCore, {
    endpoint: 'https://go.adbunny.in',
    context: { publisher: 'adbunny-demo', slot: 'main-demo', tag: 'dev-testing' },
  })
  analyticsPlugin.init()
  writeLog('📊 Analytics active → go.adbunny.in')

  if (viewportEl.checked) {
    viewportPlugin = new ViewportPlugin(player.playerCore, {
      threshold: 0,
      pauseWhenHidden: true,
      resumeWhenVisible: true,
    })
    viewportPlugin.init()
    writeLog('Viewport tracking active')
  }

  player.init()
}

tagsEl.value = DEFAULT_TAGS.join('\n')
clearLog()
writeLog('Demo ready — click "Load & Play" to start')

document.getElementById('load-btn')!.addEventListener('click', loadPlayer)
document.getElementById('play-btn')!.addEventListener('click', () => player?.play())
document.getElementById('pause-btn')!.addEventListener('click', () => player?.pause())
document.getElementById('destroy-btn')!.addEventListener('click', () => {
  viewportPlugin?.destroy()
  viewportPlugin = null
  analyticsPlugin?.destroy()
  analyticsPlugin = null
  player?.destroy()
  player = null
  statusEl.textContent = 'State: IDLE'
  writeLog('Player destroyed')
})
