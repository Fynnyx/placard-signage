<script setup lang="ts">
const { t } = useI18n()
const { can } = useRole()
const { relative, dateTime } = useFormat()
const route = useRoute()
const id = Number(route.params.id)

const { data: screen, refresh } = await useAsyncData(`screen-${id}`, () => api<any>(`/api/screens/${id}`))
if (!screen.value) throw createError({ statusCode: 404, statusMessage: 'Screen not found', fatal: true })
const { data: groups } = await useAsyncData('groups', () => api<any[]>('/api/groups'), { default: () => [] })
const { data: events, refresh: refreshEvents } = await useAsyncData(`screen-events-${id}`, () => api<any[]>(`/api/events?screenId=${id}&limit=30`), { default: () => [] })
useHead({ title: () => screen.value?.name ?? '' })

const form = reactive({
  name: screen.value.name as string,
  location: screen.value.location as string,
  groupId: (screen.value.groupId ?? null) as number | null,
  nightlyReboot: (screen.value.nightlyReboot ?? '') as string,
})
const repairCode = ref('')

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    refresh()
    refreshEvents()
  }, 5000)
})
onBeforeUnmount(() => clearInterval(timer))

async function save() {
  try {
    const body: Record<string, unknown> = { name: form.name, location: form.location, groupId: form.groupId }
    if (can('admin')) body.nightlyReboot = form.nightlyReboot || null
    await api(`/api/screens/${id}`, { method: 'PATCH', body })
    toast(t('common.saved'))
    refresh()
  }
  catch (err) {
    toastError(err)
  }
}

async function remove() {
  if (!confirm(t('screens.confirmDelete', { name: screen.value.name }))) return
  try {
    await api(`/api/screens/${id}`, { method: 'DELETE' })
    await navigateTo('/')
  }
  catch (err) {
    toastError(err)
  }
}

async function repair() {
  try {
    await api(`/api/screens/${id}/repair`, { method: 'POST', body: { code: repairCode.value } })
    repairCode.value = ''
    toast(t('screens.repaired'))
  }
  catch (err) {
    toastError(err)
  }
}

const statusRows = computed(() => {
  const s = screen.value
  const st = s.status || {}
  return [
    [t('screens.lastSeen'), s.lastSeenAt ? `${relative(s.lastSeenAt)} (${dateTime(s.lastSeenAt)})` : '–'],
    [t('field.playlist'), s.playlist?.name ? `${s.playlist.name}${s.playlist.source === 'default' ? ` (${t('screens.default')})` : ''}` : '–'],
    [t('screens.current'), s.currentItem || '–'],
    [t('screens.url'), s.currentUrl || '–'],
    [t('screens.browser'), s.browserVersion || '–'],
    [t('screens.agent'), s.agentVersion ? `${s.agentVersion}${s.hasAgent ? '' : ` (${t('screens.agentInactive')})`}` : t('screens.noAgent')],
    [t('screens.resolution'), s.resolution || '–'],
    [t('screens.ip'), [st.ip, s.lastIp && s.lastIp !== st.ip ? `${t('screens.publicIp')} ${s.lastIp}` : null].filter(Boolean).join(' · ') || '–'],
    [t('screens.hostname'), st.hostname || '–'],
    [t('screens.uptime'), st.uptimeS ? `${Math.floor(st.uptimeS / 86400)}d ${Math.floor((st.uptimeS % 86400) / 3600)}h ${Math.floor((st.uptimeS % 3600) / 60)}m` : '–'],
    [t('screens.cpuTemp'), st.cpuTempC != null ? `${Number(st.cpuTempC).toFixed(1)} °C` : '–'],
    [t('screens.diskFree'), st.diskFreeMb != null ? `${Math.round(st.diskFreeMb)} MB` : '–'],
    [t('screens.paired'), dateTime(s.createdAt)],
  ]
})
</script>

<template>
  <div v-if="screen">
    <div class="page-head">
      <h1>{{ screen.name }}</h1>
      <div class="row">
        <OnlineBadge :online="screen.online" :display-on="screen.displayOn" />
        <ScreenActions :screen="screen" @sent="refresh()" />
      </div>
    </div>

    <div class="cols">
      <div>
        <div class="card">
          <div class="shot">
            <img v-if="screen.screenshotAt" :src="`/api/screens/${id}/screenshot?t=${screen.screenshotAt}`" :alt="t('screens.screenshotOf', { name: screen.name })">
            <span v-else class="muted small">{{ t('screens.noScreenshot') }}</span>
          </div>
          <p v-if="screen.screenshotAt" class="muted small" style="margin:.4rem 0 0">{{ t('screens.screenshotTaken', { when: relative(screen.screenshotAt) }) }}</p>
        </div>
        <div v-if="screen.lastError" class="card">
          <h3>{{ t('screens.lastError') }} <span class="muted small">{{ relative(screen.lastErrorAt) }}</span></h3>
          <pre class="mono small err">{{ screen.lastError }}</pre>
        </div>
        <div class="card">
          <h2>{{ t('screens.recentEvents') }}</h2>
          <EventTable :events="events" :show-screen="false" />
          <NuxtLink :to="`/events?screenId=${id}`" class="small">{{ t('screens.allEvents') }}</NuxtLink>
        </div>
      </div>
      <div>
        <div class="card">
          <h2>{{ t('screens.status') }}</h2>
          <table class="small">
            <tbody>
              <tr v-for="[k, v] in statusRows" :key="k"><th style="width:40%">{{ k }}</th><td style="word-break:break-all">{{ v }}</td></tr>
            </tbody>
          </table>
        </div>
        <div v-if="can('editor')" class="card">
          <h2>{{ t('screens.settings') }}</h2>
          <form class="form" @submit.prevent="save">
            <label>{{ t('field.name') }}<input v-model="form.name" required></label>
            <label>{{ t('field.location') }}<input v-model="form.location"></label>
            <label>{{ t('field.group') }}
              <select v-model="form.groupId">
                <option :value="null">{{ t('screens.noGroup') }}</option>
                <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
              </select>
            </label>
            <label v-if="can('admin')">{{ t('screens.nightlyReboot') }}
              <input v-model="form.nightlyReboot" type="time">
              <span class="small">{{ t('screens.nightlyRebootHint') }}</span>
            </label>
            <div><button class="btn primary">{{ t('common.save') }}</button></div>
          </form>
        </div>
        <div v-if="screen.commands?.length" class="card">
          <h2>{{ t('screens.commands') }}</h2>
          <table class="small">
            <tbody>
              <tr v-for="c in screen.commands" :key="c.id">
                <td>{{ t(`command.${c.type}`) }}</td>
                <td class="muted nowrap">{{ relative(c.createdAt) }}</td>
                <td>
                  <span v-if="c.ackedAt" class="badge" :class="c.success ? 'ok' : 'error'" :title="c.result || ''">{{ c.success ? t('screens.cmdDone') : t('screens.cmdFailed') }}</span>
                  <span v-else-if="c.deliveredAt" class="badge warn">{{ t('screens.cmdDelivered') }}</span>
                  <span v-else class="badge">{{ t('screens.cmdPending') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="can('admin')" class="card">
          <h2>{{ t('screens.danger') }}</h2>
          <form class="row" @submit.prevent="repair">
            <input v-model="repairCode" inputmode="numeric" pattern="\d{6}" maxlength="6" :placeholder="t('pair.code')" style="width:9rem" required>
            <button class="btn">{{ t('screens.repair') }}</button>
          </form>
          <p class="muted small">{{ t('screens.repairHint') }}</p>
          <button class="btn danger" @click="remove">{{ t('screens.delete') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cols { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 1rem; align-items: start; }
.cols > div > .card { margin: 0 0 1rem; }
@media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } }
.shot { aspect-ratio: 16 / 9; background: #000; border-radius: 6px; display: grid; place-items: center; overflow: hidden; }
.shot img { width: 100%; height: 100%; object-fit: contain; }
.err { white-space: pre-wrap; margin: 0; color: var(--danger); }
</style>
