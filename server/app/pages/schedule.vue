<script setup lang="ts">
const { t, locale } = useI18n()
const { can } = useRole()
useHead({ title: t('nav.schedule') })

const [{ data: assignments, refresh }, { data: screens }, { data: groups }, { data: playlists }, { data: settings }] = await Promise.all([
  useAsyncData('assignments', () => api<any[]>('/api/assignments'), { default: () => [] }),
  useAsyncData('screens', () => api<any[]>('/api/screens'), { default: () => [] }),
  useAsyncData('groups', () => api<any[]>('/api/groups'), { default: () => [] }),
  useAsyncData('playlists', () => api<any[]>('/api/playlists'), { default: () => [] }),
  useAsyncData('settings', () => api<any>('/api/settings')),
])

// Monday = bit 0 … Sunday = bit 6
const dayNames = computed(() => Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat(locale.value, { weekday: 'short' }).format(new Date(Date.UTC(2024, 0, 1 + i)))))

const empty = () => ({ id: null as number | null, target: '', playlistId: null as number | null, weekdays: 127, timeFrom: '', timeTo: '', priority: 0 })
const form = ref(empty())
const editing = computed(() => form.value.id !== null)

function targetName(a: any) {
  if (a.screenId) return `${t('schedule.screen')}: ${screens.value.find(s => s.id === a.screenId)?.name ?? `#${a.screenId}`}`
  return `${t('schedule.group')}: ${groups.value.find(g => g.id === a.groupId)?.name ?? `#${a.groupId}`}`
}
const playlistName = (id: number) => playlists.value.find(p => p.id === id)?.name ?? `#${id}`
function daysLabel(mask: number) {
  if (mask === 127) return t('schedule.everyDay')
  if (mask === 31) return t('schedule.weekdays')
  if (mask === 96) return t('schedule.weekend')
  return dayNames.value.filter((_, i) => mask & (1 << i)).join(', ')
}
function timeLabel(a: any) {
  if (!a.timeFrom && !a.timeTo) return t('schedule.allDay')
  return `${a.timeFrom || '00:00'} – ${a.timeTo || '24:00'}`
}
function toggleDay(i: number) {
  form.value.weekdays ^= 1 << i
}

function edit(a: any) {
  form.value = {
    id: a.id,
    target: a.screenId ? `s:${a.screenId}` : `g:${a.groupId}`,
    playlistId: a.playlistId,
    weekdays: a.weekdays,
    timeFrom: a.timeFrom ?? '',
    timeTo: a.timeTo ?? '',
    priority: a.priority,
  }
}

async function submit() {
  const f = form.value
  const [kind, idStr] = f.target.split(':')
  const body = {
    screenId: kind === 's' ? Number(idStr) : null,
    groupId: kind === 'g' ? Number(idStr) : null,
    playlistId: f.playlistId,
    weekdays: f.weekdays,
    timeFrom: f.timeFrom || null,
    timeTo: f.timeTo || null,
    priority: Number(f.priority) || 0,
  }
  try {
    if (f.id) await api(`/api/assignments/${f.id}`, { method: 'PUT', body })
    else await api('/api/assignments', { method: 'POST', body })
    form.value = empty()
    toast(t('common.saved'))
    refresh()
  }
  catch (err) {
    toastError(err)
  }
}

async function remove(a: any) {
  if (!confirm(t('schedule.confirmDelete'))) return
  try {
    await api(`/api/assignments/${a.id}`, { method: 'DELETE' })
    refresh()
  }
  catch (err) {
    toastError(err)
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <h1>{{ t('nav.schedule') }}</h1>
      <span class="muted small">{{ t('schedule.timezone', { tz: settings?.timezone ?? '' }) }}</span>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t('schedule.target') }}</th><th>{{ t('field.playlist') }}</th><th>{{ t('schedule.days') }}</th>
              <th>{{ t('schedule.time') }}</th><th>{{ t('schedule.priority') }}</th><th />
            </tr>
          </thead>
          <tbody>
            <tr v-if="!assignments.length"><td colspan="6" class="muted">{{ t('schedule.empty') }}</td></tr>
            <tr v-for="a in assignments" :key="a.id" :class="{ editing: form.id === a.id }">
              <td>{{ targetName(a) }}</td>
              <td><NuxtLink :to="`/playlists/${a.playlistId}`">{{ playlistName(a.playlistId) }}</NuxtLink></td>
              <td>{{ daysLabel(a.weekdays) }}</td>
              <td class="nowrap">{{ timeLabel(a) }}</td>
              <td>{{ a.priority }}</td>
              <td class="right nowrap">
                <template v-if="can('editor')">
                  <button class="btn small" @click="edit(a)">{{ t('common.edit') }}</button>
                  <button class="btn small danger" @click="remove(a)">{{ t('common.delete') }}</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted small">{{ t('schedule.rules') }}</p>
    </div>

    <div v-if="can('editor')" class="card">
      <h2>{{ editing ? t('schedule.edit') : t('schedule.add') }}</h2>
      <form class="form" style="max-width:720px" @submit.prevent="submit">
        <div class="form-row">
          <label>{{ t('schedule.target') }}
            <select v-model="form.target" required>
              <option value="" disabled>{{ t('schedule.choose') }}</option>
              <optgroup :label="t('nav.groups')">
                <option v-for="g in groups" :key="`g${g.id}`" :value="`g:${g.id}`">{{ g.name }}</option>
              </optgroup>
              <optgroup :label="t('nav.screens')">
                <option v-for="s in screens" :key="`s${s.id}`" :value="`s:${s.id}`">{{ s.name }}</option>
              </optgroup>
            </select>
          </label>
          <label>{{ t('field.playlist') }}
            <select v-model="form.playlistId" required>
              <option :value="null" disabled>{{ t('schedule.choose') }}</option>
              <option v-for="p in playlists" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
        </div>
        <div>
          <div class="muted small" style="margin-bottom:.3rem">{{ t('schedule.days') }}</div>
          <div class="row" style="gap:.3rem">
            <button v-for="(d, i) in dayNames" :key="i" type="button" class="btn small" :class="{ primary: form.weekdays & (1 << i) }" @click="toggleDay(i)">{{ d }}</button>
          </div>
        </div>
        <div class="form-row">
          <label>{{ t('schedule.from') }}<input v-model="form.timeFrom" type="time"></label>
          <label>{{ t('schedule.to') }}<input v-model="form.timeTo" type="time"></label>
          <label>{{ t('schedule.priority') }}<input v-model.number="form.priority" type="number" min="-1000" max="1000"></label>
        </div>
        <p class="muted small" style="margin:0">{{ t('schedule.timeHint') }}</p>
        <div class="row">
          <button class="btn primary" :disabled="!form.weekdays">{{ editing ? t('common.save') : t('common.add') }}</button>
          <button v-if="editing" type="button" class="btn" @click="form = empty()">{{ t('common.cancel') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
tr.editing td { background: color-mix(in srgb, var(--accent) 8%, transparent); }
</style>
