<script setup lang="ts">
/**
 * Loops through playlist items with a 400 ms crossfade.
 * - url: iframe, preloaded hidden 10 s before its turn. Items without reload_each_time keep
 *   their iframe alive between rounds (up to POOL_SIZE), so they are not reloaded.
 * - image: <img>, object-fit contain on black.
 * - video: muted autoplay; ends at the video's end or after duration (whichever comes first).
 * A new item list takes effect when the current item ends.
 */
export interface StageItem {
  id: number
  type: 'url' | 'image' | 'video'
  src: string
  duration: number
  reloadEachTime: boolean
}

interface Layer {
  key: number
  item: StageItem
  visible: boolean
  z: number
  ready: boolean
  failed: boolean
  pooled: boolean
  waiters: (() => void)[]
}

const props = defineProps<{ items: StageItem[] }>()
const emit = defineEmits<{
  current: [item: StageItem | null]
  tick: [expectedSeconds: number]
  error: [message: string]
}>()

const FADE_MS = 400
const PRELOAD_URL_MS = 10_000
const PRELOAD_MEDIA_MS = 3_000
const READY_TIMEOUT_MS = 6_000
const POOL_SIZE = 6

const layers = ref<Layer[]>([])
const videoEls = new Map<number, HTMLVideoElement>()
let nextKey = 1
let zCounter = 1
let list: StageItem[] = []
let pending: StageItem[] | null = null
let index = -1
let current: Layer | null = null
let preloaded: Layer | null = null
let timers: ReturnType<typeof setTimeout>[] = []
let generation = 0
let stopped = false

const sameItem = (a: StageItem, b: StageItem) =>
  a.id === b.id && a.src === b.src && a.type === b.type && a.reloadEachTime === b.reloadEachTime

function later(fn: () => void, ms: number) {
  const t = setTimeout(fn, Math.max(0, ms))
  timers.push(t)
}

function clearTimers() {
  timers.forEach(clearTimeout)
  timers = []
}

function getLayer(key: number) {
  // Return the reactive proxy so that changes re-render.
  return layers.value.find(l => l.key === key)
}

function makeLayer(item: StageItem, fresh = false): Layer {
  const poolable = item.type === 'url' && !item.reloadEachTime
  if (poolable && !fresh) {
    const existing = layers.value.find(l => l.pooled && sameItem(l.item, item))
    if (existing) return existing
  }
  layers.value.push({ key: nextKey++, item, visible: false, z: 0, ready: false, failed: false, pooled: poolable && !fresh, waiters: [] })
  const layer = layers.value[layers.value.length - 1]!
  if (layer.pooled) trimPool()
  return layer
}

function trimPool() {
  const pooled = layers.value.filter(l => l.pooled && !l.visible && l !== preloaded)
  const excess = pooled.length - POOL_SIZE
  if (excess > 0) {
    const drop = new Set(pooled.slice(0, excess).map(l => l.key))
    layers.value = layers.value.filter(l => !drop.has(l.key))
  }
}

function removeLayer(layer: Layer) {
  if (layer.pooled && list.some(i => sameItem(i, layer.item))) return
  layers.value = layers.value.filter(l => l.key !== layer.key)
  videoEls.delete(layer.key)
}

function markReady(key: number, failed = false) {
  const l = getLayer(key)
  if (!l || l.ready) return
  l.ready = true
  l.failed = failed
  l.waiters.splice(0).forEach(fn => fn())
  if (failed) {
    emit('error', `Could not load ${l.item.type} ${l.item.src}`)
  }
}

function waitReady(layer: Layer) {
  if (layer.ready) return Promise.resolve()
  return new Promise<void>((resolve) => {
    layer.waiters.push(resolve)
    later(resolve, READY_TIMEOUT_MS)
  })
}

function playVideo(layer: Layer, loop: boolean) {
  const v = videoEls.get(layer.key)
  if (!v) return
  v.loop = loop
  v.muted = true
  try {
    v.currentTime = 0
  }
  catch { /* not seekable yet */ }
  v.play().catch(err => emit('error', `Video playback failed: ${err?.message ?? err}`))
}

async function show(layer: Layer, single: boolean) {
  const gen = ++generation
  await waitReady(layer)
  if (gen !== generation || stopped) return
  const item = layer.item
  layer.z = ++zCounter
  layer.visible = true
  if (item.type === 'video') playVideo(layer, single && item.duration === 0)
  emit('current', item)
  const prev = current
  current = layer
  if (prev && prev !== layer) {
    later(() => {
      if (current === prev) return
      prev.visible = false
      const v = videoEls.get(prev.key)
      v?.pause()
      removeLayer(prev)
    }, FADE_MS + 50)
  }
  schedule(layer, single)
}

function expectedSeconds(item: StageItem) {
  if (item.duration > 0) return item.duration
  return 300
}

function schedule(layer: Layer, single: boolean) {
  const item = layer.item
  const ms = item.duration * 1000
  emit('tick', expectedSeconds(item))

  if (single) {
    // One item: stay; reload only when asked to. Keep the watchdog fed.
    const period = Math.max(item.duration, 10) * 1000
    later(() => {
      if (pending) return advance()
      if (item.reloadEachTime && item.type !== 'video') {
        const fresh = makeLayer(item, true)
        void show(fresh, true)
      }
      else {
        schedule(layer, true)
      }
    }, period)
    return
  }

  if (layer.failed) {
    later(advance, 1000)
    return
  }
  if (item.type === 'video') {
    const v = videoEls.get(layer.key)
    if (v) v.onended = () => { if (current === layer) advance() }
    if (ms > 0) later(advance, ms)
    else later(advance, 3600_000) // safety net for streams without an end
  }
  else {
    later(advance, ms)
  }

  const next = list[(index + 1) % list.length]
  if (next && list.length > 1) {
    const lead = next.type === 'url' ? PRELOAD_URL_MS : PRELOAD_MEDIA_MS
    const at = item.type === 'video' && ms === 0 ? 0 : ms - lead
    later(() => {
      if (!pending) preloaded = makeLayer(next)
    }, at)
  }
}

function advance() {
  clearTimers()
  if (stopped) return
  if (pending) {
    const curId = current?.item.id
    const newList = pending
    pending = null
    const pos = curId !== undefined ? newList.findIndex(i => i.id === curId) : -1
    list = newList
    index = pos
    if (preloaded && preloaded !== current) {
      const p = preloaded
      preloaded = null
      removeLayer(p)
    }
    // Drop pooled iframes no longer in the playlist.
    layers.value = layers.value.filter(l => l === current || !l.pooled || list.some(i => sameItem(i, l.item)))
  }
  if (!list.length) {
    generation++
    current = null
    layers.value = []
    emit('current', null)
    emit('tick', 60)
    later(() => {
      if (pending) advance()
      else emit('tick', 60)
    }, 30_000)
    return
  }
  if (list.length === 1) {
    index = 0
    const only = list[0]!
    if (current && sameItem(current.item, only) && !only.reloadEachTime) {
      schedule(current, true)
      return
    }
    const v = current && current.item.type === 'video' && sameItem(current.item, only) ? current : null
    if (v) {
      schedule(v, true)
      return
    }
    void show(makeLayer(only, only.reloadEachTime), true)
    return
  }
  index = (index + 1) % list.length
  const item = list[index]!
  let layer: Layer
  if (preloaded && sameItem(preloaded.item, item)) layer = preloaded
  else if (current && sameItem(current.item, item) && item.type === 'url' && !item.reloadEachTime) layer = current
  else layer = makeLayer(item, item.reloadEachTime)
  preloaded = null
  if (layer === current) {
    schedule(layer, false)
    return
  }
  void show(layer, false)
}

watch(() => props.items, (items) => {
  const copy = items.map(i => ({ ...i }))
  if (!list.length && index === -1) {
    list = copy
    advance()
  }
  else {
    pending = copy
    // Nothing is playing (empty playlist): switch right away.
    if (!current) advance()
  }
}, { immediate: true, deep: true })

onBeforeUnmount(() => {
  stopped = true
  clearTimers()
})

function setVideoRef(key: number, el: unknown) {
  if (el instanceof HTMLVideoElement) videoEls.set(key, el)
}
</script>

<template>
  <div class="stage">
    <div
      v-for="l in layers"
      :key="l.key"
      class="layer"
      :class="{ visible: l.visible }"
      :style="{ zIndex: l.z }"
      :data-item="l.item.id"
    >
      <iframe
        v-if="l.item.type === 'url'"
        :src="l.item.src"
        allow="autoplay; fullscreen; encrypted-media; geolocation"
        referrerpolicy="strict-origin-when-cross-origin"
        :title="`item-${l.item.id}`"
        @load="markReady(l.key)"
      />
      <img
        v-else-if="l.item.type === 'image'"
        :src="l.item.src"
        alt=""
        @load="markReady(l.key)"
        @error="markReady(l.key, true)"
      >
      <video
        v-else
        :ref="el => setVideoRef(l.key, el)"
        :src="l.item.src"
        muted
        playsinline
        preload="auto"
        @canplay="markReady(l.key)"
        @error="markReady(l.key, true)"
      />
    </div>
  </div>
</template>

<style scoped>
.stage { position: absolute; inset: 0; background: #000; overflow: hidden; }
.layer {
  position: absolute; inset: 0; opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity 400ms ease, visibility 0s linear 400ms;
}
.layer.visible { opacity: 1; visibility: visible; pointer-events: auto; transition: opacity 400ms ease, visibility 0s; }
iframe { width: 100%; height: 100%; border: 0; background: #fff; display: block; }
img, video { width: 100%; height: 100%; object-fit: contain; display: block; background: #000; }
</style>
