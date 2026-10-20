<script setup lang="ts">
import type { StageItem } from '~/components/PlayerStage.vue'

definePageMeta({ layout: false })
useHead({ title: 'Player', bodyAttrs: { class: 'player-body' } })
const { t } = useI18n()
const route = useRoute()
const debug = route.query.debug === '1'

interface Playlist { playlistId: number | null, name: string | null, items: StageItem[] }

const token = ref<string | null>(null)
const items = ref<StageItem[]>([])
const playlistName = ref<string | null>(null)
const currentItem = ref<StageItem | null>(null)
const lastPoll = ref<{ at: number, status: string } | null>(null)
const errors = ref<{ at: number, message: string }[]>([])
const unpaired = ref(false)
const offline = ref(false)
let etag: string | null = null
let lastTick = Date.now()
let expected = 60
let lastErrorSent = 0
const timers: ReturnType<typeof setInterval>[] = []

function authHeaders(): Record<string, string> {
  return token.value ? { Authorization: `Bearer ${token.value}` } : {}
}

function applyPlaylist(p: Playlist) {
  playlistName.value = p.name
  // Only replace the list when it changed, so the stage keeps its position.
  if (JSON.stringify(p.items) !== JSON.stringify(items.value)) items.value = p.items
}

async function poll() {
  if (!token.value) return
  try {
    const res = await fetch('/api/device/playlist', {
      headers: { ...authHeaders(), ...(etag ? { 'If-None-Match': etag } : {}) },
      cache: 'no-store',
    })
    offline.value = res.headers.get('x-placard-offline') === '1'
    lastPoll.value = { at: Date.now(), status: offline.value ? 'offline (cached)' : String(res.status) }
    if (res.status === 401) {
      unpaired.value = true
      writeToken(null)
      return
    }
    if (res.status === 304) return
    if (!res.ok) throw new Error(`playlist: HTTP ${res.status}`)
    etag = res.headers.get('etag')
    const p = await res.json() as Playlist
    lastPlaylist = p
    applyPlaylist(p)
    try {
      localStorage.setItem(PLAYLIST_KEY, JSON.stringify(p))
    }
    catch { /* storage full */ }
  }
  catch (err) {
    offline.value = true
    lastPoll.value = { at: Date.now(), status: `error: ${(err as Error).message}` }
    if (!items.value.length) {
      try {
        const cached = localStorage.getItem(PLAYLIST_KEY)
        if (cached) applyPlaylist(JSON.parse(cached))
      }
      catch { /* nothing cached */ }
    }
  }
}

function describe(item: StageItem | null) {
  if (!item) return ''
  if (item.title) return item.title
  const src = item.src.replace(/[?&]sx_(screen|exp|sig)=[^&]*/g, '')
  return `${item.type}: ${src}`
}

async function heartbeat() {
  if (!token.value) return
  try {
    const res = await fetch('/api/device/heartbeat', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'player',
        browserVersion: await browserVersionFull(),
        resolution: `${window.screen.width}x${window.screen.height}`,
        currentItem: describe(currentItem.value),
      }),
    })
    if (!res.ok) return
    const body = await res.json() as { commands: { id: number, type: string }[] }
    for (const cmd of body.commands ?? []) {
      if (cmd.type === 'reload') {
        await fetch(`/api/device/commands/${cmd.id}/ack`, {
          method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, result: 'reloaded by player' }),
        }).catch(() => {})
        location.reload()
        return
      }
    }
  }
  catch { /* offline; try again later */ }
}

/** Sends errors to the server, at most one every 10 seconds. */
function reportError(message: string) {
  errors.value = [{ at: Date.now(), message }, ...errors.value].slice(0, 8)
  if (!token.value || Date.now() - lastErrorSent < 10_000) return
  lastErrorSent = Date.now()
  fetch('/api/device/events', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ level: 'error', source: 'player', message: message.slice(0, 2000) }),
  }).catch(() => {})
}

let lastPlaylist: Playlist | null = null

function registerServiceWorker() {
  navigator.serviceWorker.register('/player-sw.js', { scope: '/player' })
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      // Files loaded before the worker took control are not cached yet; hand them over.
      const urls = [location.pathname, ...performance.getEntriesByType('resource').map(e => e.name)
        .filter(u => u.startsWith(`${location.origin}/_nuxt/`))]
      reg.active?.postMessage({ type: 'cache', urls, playlist: lastPlaylist })
    })
    .catch(err => reportError(`Service worker: ${err.message}`))
}

let reportedFirstItem = false
function onCurrent(item: StageItem | null) {
  currentItem.value = item
  // Report what is showing right away the first time, then with the regular heartbeat.
  if (item && !reportedFirstItem) {
    reportedFirstItem = true
    void heartbeat()
  }
}

function onTick(seconds: number) {
  lastTick = Date.now()
  expected = seconds
}

onMounted(() => {
  takeTokenFromHash()
  token.value = readToken()
  if (!token.value) {
    unpaired.value = true
    return
  }
  window.addEventListener('error', e => reportError(`${e.message} at ${e.filename}:${e.lineno}`))
  window.addEventListener('unhandledrejection', e => reportError(`Unhandled rejection: ${e.reason?.message ?? e.reason}`))
  void poll().then(() => {
    if ('serviceWorker' in navigator) registerServiceWorker()
  })
  void heartbeat()
  // Every 60 s; every 15 s while there is nothing to show, so new content appears quickly.
  let sincePoll = 0
  timers.push(setInterval(() => {
    sincePoll += 15
    if (sincePoll >= 60 || !items.value.length) {
      sincePoll = 0
      void poll()
    }
  }, 15_000))
  timers.push(setInterval(heartbeat, 30_000))
  // Watchdog: reload when the rotation has not advanced for 3× the current item's duration.
  timers.push(setInterval(() => {
    if (Date.now() - lastTick > Math.max(expected, 10) * 3000) {
      reportError(`Watchdog: rotation stalled for ${Math.round((Date.now() - lastTick) / 1000)} s, reloading`)
      setTimeout(() => location.reload(), 500)
    }
  }, 5000))
})

onBeforeUnmount(() => timers.forEach(clearInterval))
</script>

<template>
  <div class="player">
    <div v-if="unpaired" class="notice">
      <h1>{{ t('player.notPaired') }}</h1>
      <p>{{ t('player.notPairedText') }}</p>
      <a href="/player/pair">{{ t('player.pairNow') }}</a>
    </div>
    <template v-else>
      <PlayerStage :items="items" @current="onCurrent" @tick="onTick" @error="reportError" />
      <div v-if="!items.length && lastPoll" class="notice dim">
        <p>{{ t('player.nothing') }}</p>
      </div>
    </template>
    <div v-if="debug" class="debug">
      <div><b>token</b> {{ token ? `…${token.slice(-4)}` : 'none' }} · <b>playlist</b> {{ playlistName ?? '–' }} ({{ items.length }})</div>
      <div><b>current</b> {{ describe(currentItem) || '–' }}</div>
      <div><b>last poll</b> {{ lastPoll ? `${new Date(lastPoll.at).toLocaleTimeString()} ${lastPoll.status}` : '–' }} · <b>offline</b> {{ offline }}</div>
      <div><b>browser</b> {{ browserVersion() }}</div>
      <div v-for="e in errors" :key="e.at" class="err">{{ new Date(e.at).toLocaleTimeString() }} {{ e.message }}</div>
    </div>
  </div>
</template>

<style>
body.player-body { margin: 0; background: #000; overflow: hidden; cursor: none; }
</style>

<style scoped>
.player { position: fixed; inset: 0; background: #000; color: #fff; font-family: system-ui, sans-serif; }
.notice { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 2rem; z-index: 1000000; }
.notice h1 { font-size: 3vw; margin: 0 0 1rem; }
.notice p { font-size: 1.6vw; opacity: .8; margin: 0 0 1rem; }
.notice a { color: #8ab4ff; font-size: 1.4vw; }
.notice.dim { pointer-events: none; }
.debug {
  position: absolute; left: 1rem; bottom: 1rem; z-index: 1000001; max-width: 70vw;
  background: rgb(0 0 0 / .8); color: #0f0; font: 13px/1.4 ui-monospace, monospace; padding: .6rem .8rem; border-radius: 6px;
}
.debug .err { color: #f88; }
</style>
