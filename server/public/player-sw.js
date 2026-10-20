/* Placard player service worker: keeps a screen playing while the server is unreachable.
 *
 * - /player pages:         network first, falling back to the cached copy
 * - /_nuxt/* assets:       cache first (file names are content hashed)
 * - /api/device/playlist:  network first; offline it returns the last playlist with x-placard-offline: 1
 * - /media/*:              cache first, including Range requests for video; files of the
 *                          current playlist are prefetched and old ones removed
 */
const SHELL = 'placard-shell-v1'
const MEDIA = 'placard-media-v1'
const API = 'placard-api-v1'
const NETWORK_TIMEOUT_MS = 5000

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, MEDIA, API])
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key)
    await self.clients.claim()
  })())
})

// The player sends what it loaded before this worker took control, so it can start offline next time.
self.addEventListener('message', (event) => {
  const msg = event.data || {}
  if (msg.type !== 'cache') return
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL)
    const paths = (msg.urls || []).map(u => new URL(u, self.location.origin).pathname)
    // Assets of older builds are no longer needed.
    for (const req of await shell.keys()) {
      const p = new URL(req.url).pathname
      if (p.startsWith('/_nuxt/') && !paths.includes(p)) await shell.delete(req)
    }
    for (const path of paths) {
      if (await shell.match(path)) continue
      try {
        const res = await fetch(path)
        if (res.ok) await shell.put(path, res)
      }
      catch { /* offline right now */ }
    }
    if (msg.playlist) {
      const api = await caches.open(API)
      await api.put('/api/device/playlist', new Response(JSON.stringify(msg.playlist), { headers: { 'Content-Type': 'application/json' } }))
      await syncMedia(msg.playlist)
    }
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate' && url.pathname.startsWith('/player')) {
    event.respondWith(networkFirst(req, SHELL, url.pathname))
  }
  else if (url.pathname.startsWith('/_nuxt/')) {
    event.respondWith(cacheFirst(req, SHELL))
  }
  else if (url.pathname === '/api/device/playlist') {
    event.respondWith(playlist(req))
  }
  else if (url.pathname.startsWith('/media/')) {
    event.respondWith(media(req))
  }
})

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
}

async function networkFirst(req, cacheName, key) {
  const cache = await caches.open(cacheName)
  try {
    const res = await withTimeout(fetch(req), NETWORK_TIMEOUT_MS)
    if (res.ok) await cache.put(key, res.clone())
    return res
  }
  catch (err) {
    const hit = await cache.match(key)
    if (hit) return hit
    throw err
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(new URL(req.url).pathname)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) await cache.put(new URL(req.url).pathname, res.clone())
  return res
}

async function playlist(req) {
  const cache = await caches.open(API)
  try {
    const res = await withTimeout(fetch(req), NETWORK_TIMEOUT_MS)
    if (res.status === 200) {
      await cache.put('/api/device/playlist', res.clone())
      res.clone().json().then(syncMedia).catch(() => {})
    }
    return res
  }
  catch {
    const hit = await cache.match('/api/device/playlist')
    if (!hit) return new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
    const headers = new Headers(hit.headers)
    headers.set('x-placard-offline', '1')
    headers.delete('etag')
    return new Response(await hit.blob(), { status: 200, headers })
  }
}

/** Prefetches the media of the current playlist and drops files no longer used. */
async function syncMedia(pl) {
  const wanted = new Set()
  for (const item of pl.items || []) {
    if (item.type === 'url') continue
    const u = new URL(item.src, self.location.origin)
    if (u.origin === self.location.origin && u.pathname.startsWith('/media/')) wanted.add(u.pathname)
  }
  const cache = await caches.open(MEDIA)
  for (const req of await cache.keys()) {
    if (!wanted.has(new URL(req.url).pathname)) await cache.delete(req)
  }
  for (const path of wanted) {
    if (await cache.match(path)) continue
    try {
      const res = await fetch(path)
      if (res.ok) await cache.put(path, res)
    }
    catch { /* try again with the next playlist poll */ }
  }
}

async function media(req) {
  const url = new URL(req.url)
  const cache = await caches.open(MEDIA)
  let full = await cache.match(url.pathname)
  if (!full) {
    const range = req.headers.get('range')
    if (range) {
      // Not cached yet: let the browser stream it directly, and cache the whole file in the background.
      fetch(url.pathname).then(res => res.ok && cache.put(url.pathname, res)).catch(() => {})
      return fetch(req)
    }
    const res = await fetch(req)
    if (res.ok) await cache.put(url.pathname, res.clone())
    return res
  }
  const range = req.headers.get('range')
  if (!range) return full
  return rangeResponse(full, range)
}

async function rangeResponse(full, range) {
  const blob = await full.blob()
  const m = /^bytes=(\d*)-(\d*)$/.exec(range)
  const size = blob.size
  let start = m && m[1] ? Number(m[1]) : 0
  let end = m && m[2] ? Number(m[2]) : size - 1
  if (m && !m[1] && m[2]) {
    start = size - Number(m[2])
    end = size - 1
  }
  start = Math.max(0, start)
  end = Math.min(end, size - 1)
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': full.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  })
}
