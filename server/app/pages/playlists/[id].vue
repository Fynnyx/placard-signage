<script setup lang="ts">
const { t } = useI18n()
const { can } = useRole()
const route = useRoute()
const id = Number(route.params.id)

interface Item {
  uid: number
  type: 'url' | 'image' | 'video'
  title: string
  source: string
  durationS: number
  reloadEachTime: boolean
  signUrl: boolean
  enabled: boolean
  warnings?: string[]
}

const { data: playlist } = await useAsyncData(`playlist-${id}`, () => api<any>(`/api/playlists/${id}`))
if (!playlist.value) throw createError({ statusCode: 404, statusMessage: 'Playlist not found', fatal: true })
useHead({ title: () => playlist.value?.name ?? '' })

let uid = 1
const name = ref<string>(playlist.value.name)
const items = ref<Item[]>(playlist.value.items.map((i: any) => ({ ...i, uid: uid++ })))
const dirty = ref(false)
const saving = ref(false)
watch([items, name], () => { dirty.value = true }, { deep: true })

const newUrl = ref('')
const checking = ref(false)
const pickerOpen = ref(false)
const previewOpen = ref(false)
const editable = computed(() => can('editor'))

async function save() {
  saving.value = true
  try {
    const body = {
      name: name.value,
      items: items.value.map(({ uid: _u, warnings: _w, ...i }) => ({
        type: i.type, title: i.title, source: i.source, durationS: Number(i.durationS) || 0,
        reloadEachTime: i.reloadEachTime, signUrl: i.signUrl, enabled: i.enabled,
      })),
    }
    await api(`/api/playlists/${id}`, { method: 'PUT', body })
    await nextTick()
    dirty.value = false
    toast(t('common.saved'))
  }
  catch (err) {
    toastError(err)
  }
  finally {
    saving.value = false
  }
}

async function remove() {
  if (!confirm(t('playlists.confirmDelete', { name: name.value }))) return
  try {
    await api(`/api/playlists/${id}`, { method: 'DELETE' })
    await navigateTo('/playlists')
  }
  catch (err) {
    toastError(err)
  }
}

async function addUrl() {
  let url = newUrl.value.trim()
  if (!url) return
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  const item: Item = { uid: uid++, type: 'url', title: '', source: url, durationS: 30, reloadEachTime: false, signUrl: false, enabled: true }
  items.value.push(item)
  newUrl.value = ''
  await checkItem(items.value[items.value.length - 1]!)
}

async function checkItem(item: Item) {
  checking.value = true
  try {
    const res = await api<{ ok: boolean, warnings: string[] }>('/api/playlists/check-url', { method: 'POST', body: { url: item.source } })
    item.warnings = res.warnings
  }
  catch (err) {
    item.warnings = [errorMessage(err)]
  }
  finally {
    checking.value = false
  }
}

function addMedia(files: any[]) {
  for (const f of files) {
    items.value.push({
      uid: uid++, type: f.kind, title: f.originalName, source: f.url, durationS: f.kind === 'video' ? 0 : 10,
      reloadEachTime: false, signUrl: false, enabled: true,
    })
  }
  pickerOpen.value = false
}

// Drag and drop reordering.
const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)
function onDrop(target: number) {
  const from = dragIndex.value
  dragIndex.value = overIndex.value = null
  if (from === null || from === target) return
  const list = [...items.value]
  const [moved] = list.splice(from, 1)
  list.splice(target > from ? target - 1 : target, 0, moved!)
  items.value = list
}
function move(i: number, delta: number) {
  const j = i + delta
  if (j < 0 || j >= items.value.length) return
  const list = [...items.value]
  ;[list[i], list[j]] = [list[j]!, list[i]!]
  items.value = list
}

const previewItems = computed(() => items.value.filter(i => i.enabled).map(i => ({
  id: i.uid,
  type: i.type,
  src: i.type === 'url' ? i.source.replace(/\{screen\.id\}/g, '1').replace(/\{screen\.name\}/g, 'Preview').replace(/\{screen\.group\}/g, '') : i.source,
  duration: Number(i.durationS) || 0,
  reloadEachTime: i.reloadEachTime,
})))
const totalSeconds = computed(() => items.value.filter(i => i.enabled).reduce((s, i) => s + (Number(i.durationS) || 0), 0))

onBeforeRouteLeave(() => {
  if (dirty.value && !confirm(t('playlists.unsaved'))) return false
})
</script>

<template>
  <div v-if="playlist">
    <div class="page-head">
      <div class="row grow">
        <NuxtLink to="/playlists" class="muted">← {{ t('nav.playlists') }}</NuxtLink>
        <input v-if="editable" v-model="name" class="title-input" :aria-label="t('field.name')">
        <h1 v-else>{{ name }}</h1>
      </div>
      <div class="row">
        <button class="btn" :disabled="!previewItems.length" @click="previewOpen = true">{{ t('playlists.preview') }}</button>
        <button v-if="editable" class="btn danger" @click="remove">{{ t('common.delete') }}</button>
        <button v-if="editable" class="btn primary" :disabled="!dirty || saving" @click="save">{{ dirty ? t('common.save') : t('common.saved') }}</button>
      </div>
    </div>

    <div class="card">
      <div v-if="!items.length" class="empty">{{ t('playlists.noItems') }}</div>
      <ol class="items">
        <li
          v-for="(item, i) in items"
          :key="item.uid"
          class="item"
          :class="{ disabled: !item.enabled, over: overIndex === i && dragIndex !== null && dragIndex !== i }"
          :draggable="editable"
          @dragstart="dragIndex = i"
          @dragend="dragIndex = overIndex = null"
          @dragover.prevent="overIndex = i"
          @drop.prevent="onDrop(i)"
        >
          <span v-if="editable" class="handle" :title="t('playlists.drag')">⋮⋮</span>
          <div class="thumb">
            <img v-if="item.type === 'image'" :src="item.source" alt="">
            <video v-else-if="item.type === 'video'" :src="`${item.source}#t=0.5`" muted preload="metadata" />
            <span v-else class="badge">URL</span>
          </div>
          <div class="grow stack" style="gap:.35rem">
            <div class="row" style="gap:.5rem">
              <input v-model="item.title" class="grow" :placeholder="t('playlists.titlePlaceholder')" :disabled="!editable">
            </div>
            <input v-if="item.type === 'url'" v-model="item.source" class="mono small" :disabled="!editable" @change="checkItem(item)">
            <div v-else class="muted small ellipsis">{{ item.source }}</div>
            <div v-for="w in item.warnings" :key="w" class="alert warn small">{{ w }}</div>
            <div class="row small" style="gap:1rem">
              <label class="check">
                <input v-model.number="item.durationS" type="number" min="0" max="86400" class="dur" :disabled="!editable">
                {{ item.type === 'video' ? t('playlists.secondsVideo') : t('playlists.seconds') }}
              </label>
              <label v-if="item.type !== 'video'" class="check" :title="t('playlists.reloadHint')">
                <input v-model="item.reloadEachTime" type="checkbox" :disabled="!editable"> {{ t('playlists.reload') }}
              </label>
              <label v-if="item.type === 'url'" class="check" :title="t('playlists.signHint')">
                <input v-model="item.signUrl" type="checkbox" :disabled="!editable"> {{ t('playlists.sign') }}
              </label>
              <label class="check"><input v-model="item.enabled" type="checkbox" :disabled="!editable"> {{ t('playlists.enabled') }}</label>
            </div>
          </div>
          <div v-if="editable" class="stack" style="gap:.25rem">
            <button class="btn small ghost" :aria-label="t('playlists.up')" :disabled="i === 0" @click="move(i, -1)">↑</button>
            <button class="btn small ghost" :aria-label="t('playlists.down')" :disabled="i === items.length - 1" @click="move(i, 1)">↓</button>
            <button class="btn small ghost danger" :aria-label="t('common.delete')" @click="items.splice(i, 1)">✕</button>
          </div>
        </li>
      </ol>
      <p v-if="items.length" class="muted small">{{ t('playlists.total', { count: items.filter(i => i.enabled).length, seconds: totalSeconds }) }}</p>
    </div>

    <div v-if="editable" class="card">
      <h2>{{ t('playlists.add') }}</h2>
      <form class="row" @submit.prevent="addUrl">
        <input v-model="newUrl" class="grow" type="text" placeholder="https://example.org/dashboard?screen={screen.id}">
        <button class="btn" :disabled="checking">{{ t('playlists.addUrl') }}</button>
        <button class="btn" type="button" @click="pickerOpen = true">{{ t('playlists.addMedia') }}</button>
        <MediaUpload @uploaded="addMedia" />
      </form>
      <p class="muted small">{{ t('playlists.placeholders') }} <code>{screen.id}</code> <code>{screen.name}</code> <code>{screen.group}</code></p>
    </div>

    <MediaPicker v-if="pickerOpen" @close="pickerOpen = false" @pick="addMedia" />

    <div v-if="previewOpen" class="preview-backdrop" @click.self="previewOpen = false">
      <div class="preview">
        <div class="row between" style="margin-bottom:.5rem">
          <strong>{{ t('playlists.preview') }}</strong>
          <button class="btn small" @click="previewOpen = false">{{ t('common.close') }}</button>
        </div>
        <div class="preview-stage"><PlayerStage :items="previewItems" /></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title-input { font-size: 1.3rem; font-weight: 700; flex: 1; max-width: 480px; }
.items { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .5rem; }
.item { display: flex; gap: .75rem; align-items: flex-start; padding: .6rem; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); }
.item.disabled { opacity: .55; }
.item.over { border-color: var(--accent); box-shadow: 0 -3px 0 var(--accent); }
.handle { cursor: grab; color: var(--muted); user-select: none; padding-top: .4rem; letter-spacing: -.2em; }
.thumb { width: 96px; aspect-ratio: 16 / 9; background: #000; border-radius: 4px; overflow: hidden; display: grid; place-items: center; flex-shrink: 0; }
.thumb img, .thumb video { width: 100%; height: 100%; object-fit: contain; }
.dur { width: 5.5rem; }
.preview-backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / .6); display: grid; place-items: center; z-index: 50; padding: 1rem; }
.preview { background: var(--surface); padding: 1rem; border-radius: 10px; width: min(1100px, 100%); }
.preview-stage { position: relative; aspect-ratio: 16 / 9; background: #000; overflow: hidden; border-radius: 4px; }
</style>
