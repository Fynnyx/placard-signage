<script setup lang="ts">
const { t } = useI18n()
const { can } = useRole()
const { relative } = useFormat()
useHead({ title: t('nav.settings') })

const { data: settings, refresh } = await useAsyncData('settings', () => api<any>('/api/settings'))
const { data: playlists } = await useAsyncData('playlists', () => api<any[]>('/api/playlists'), { default: () => [] })
const { data: tokens, refresh: refreshTokens } = await useAsyncData('tokens', () => can('admin') ? api<any[]>('/api/tokens') : Promise.resolve([]), { default: () => [] })

const form = reactive({
  brandName: settings.value?.brandName ?? '',
  accentColor: settings.value?.accentColor ?? '#2563eb',
  logoUrl: settings.value?.logoUrl ?? null as string | null,
  timezone: settings.value?.timezone ?? 'UTC',
  defaultPlaylistId: settings.value?.defaultPlaylistId ?? null as number | null,
})
const timezones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
const newToken = reactive({ name: '', role: 'editor' })
const createdToken = ref('')

async function save() {
  try {
    const body = can('admin') ? { ...form } : { defaultPlaylistId: form.defaultPlaylistId }
    await api('/api/settings', { method: 'PATCH', body })
    await refreshMe()
    refresh()
    toast(t('common.saved'))
  }
  catch (err) {
    toastError(err)
  }
}

function logoUploaded(files: any[]) {
  const img = files.find(f => f.kind === 'image')
  if (img) form.logoUrl = img.url
}

async function createToken() {
  try {
    const res = await api<{ token: string }>('/api/tokens', { method: 'POST', body: newToken })
    createdToken.value = res.token
    newToken.name = ''
    refreshTokens()
  }
  catch (err) {
    toastError(err)
  }
}

async function revoke(tk: any) {
  if (!confirm(t('settings.confirmRevoke', { name: tk.name }))) return
  await api(`/api/tokens/${tk.id}`, { method: 'DELETE' }).catch(toastError)
  refreshTokens()
}
</script>

<template>
  <div v-if="settings">
    <h1>{{ t('nav.settings') }}</h1>
    <div class="card">
      <form class="form" @submit.prevent="save">
        <template v-if="can('admin')">
          <h2>{{ t('settings.branding') }}</h2>
          <label>{{ t('settings.brandName') }}<input v-model="form.brandName" required maxlength="100"></label>
          <div class="row">
            <label>{{ t('settings.accent') }}<input v-model="form.accentColor" type="color"></label>
            <div class="stack grow" style="gap:.3rem">
              <span class="muted small">{{ t('settings.logo') }}</span>
              <div class="row">
                <img v-if="form.logoUrl" :src="form.logoUrl" alt="" style="height:36px;max-width:160px;object-fit:contain">
                <MediaUpload @uploaded="logoUploaded" />
                <button v-if="form.logoUrl" type="button" class="btn small" @click="form.logoUrl = null">{{ t('common.remove') }}</button>
              </div>
            </div>
          </div>
          <h2 style="margin-top:1rem">{{ t('settings.playback') }}</h2>
          <label>{{ t('settings.timezone') }}
            <select v-if="timezones.length" v-model="form.timezone">
              <option v-for="tz in timezones" :key="tz" :value="tz">{{ tz }}</option>
            </select>
            <input v-else v-model="form.timezone">
            <span class="small">{{ t('settings.timezoneHint') }}</span>
          </label>
        </template>
        <label>{{ t('settings.defaultPlaylist') }}
          <select v-model="form.defaultPlaylistId" :disabled="!can('editor')">
            <option :value="null">{{ t('settings.none') }}</option>
            <option v-for="p in playlists" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <span class="small">{{ t('playlists.defaultHint') }}</span>
        </label>
        <div v-if="can('editor')"><button class="btn primary">{{ t('common.save') }}</button></div>
      </form>
    </div>

    <div v-if="can('admin')" class="card">
      <h2>{{ t('settings.apiTokens') }}</h2>
      <p class="muted small">{{ t('settings.apiHint') }} <a href="/api/docs" target="_blank">{{ t('settings.apiDocs') }}</a></p>
      <form class="row" @submit.prevent="createToken">
        <input v-model="newToken.name" :placeholder="t('settings.tokenName')" required>
        <select v-model="newToken.role">
          <option v-for="r in ['viewer', 'editor', 'admin']" :key="r" :value="r">{{ t(`role.${r}`) }}</option>
        </select>
        <button class="btn">{{ t('settings.createToken') }}</button>
      </form>
      <div v-if="createdToken" class="alert ok" style="margin-top:.8rem">
        {{ t('settings.tokenOnce') }}<br><code style="word-break:break-all">{{ createdToken }}</code>
      </div>
      <table v-if="tokens.length" class="small" style="margin-top:.8rem">
        <tbody>
          <tr v-for="tk in tokens" :key="tk.id">
            <td>{{ tk.name }}</td>
            <td>{{ t(`role.${tk.role}`) }}</td>
            <td class="muted">{{ t('settings.lastUsed') }}: {{ relative(tk.lastUsedAt) }}</td>
            <td class="right"><button class="btn small danger" @click="revoke(tk)">{{ t('settings.revoke') }}</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="can('admin')" class="card">
      <h2>{{ t('settings.backup') }}</h2>
      <p class="muted small">{{ t('settings.backupHint') }}</p>
      <a class="btn" href="/api/admin/backup">{{ t('settings.downloadBackup') }}</a>
    </div>

    <div class="card">
      <h2>{{ t('settings.server') }}</h2>
      <table class="small">
        <tbody>
          <tr><th>PUBLIC_URL</th><td>{{ settings.info.publicUrl }}</td></tr>
          <tr><th>{{ t('settings.login') }}</th><td>{{ [settings.info.localLogin ? t('settings.local') : null, settings.info.oidc ? 'OIDC' : null].filter(Boolean).join(' + ') }}</td></tr>
          <tr><th>{{ t('settings.mail') }}</th><td>{{ settings.info.mail ? t('common.yes') : t('settings.mailOff') }}</td></tr>
          <tr><th>OFFLINE_AFTER_S</th><td>{{ settings.info.offlineAfterS }}</td></tr>
          <tr><th>{{ t('settings.agentVersion') }}</th><td>{{ settings.info.agentVersion ?? '–' }}</td></tr>
          <tr><th>{{ t('settings.signing') }}</th><td>{{ settings.info.signingSecretFromEnv ? 'URL_SIGNING_SECRET' : t('settings.signingGenerated') }}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
