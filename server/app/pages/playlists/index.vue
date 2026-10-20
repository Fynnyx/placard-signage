<script setup lang="ts">
const { t } = useI18n()
const { can } = useRole()
const { relative } = useFormat()
useHead({ title: t('nav.playlists') })
const { data: playlists, refresh } = await useAsyncData('playlists', () => api<any[]>('/api/playlists'), { default: () => [] })
const name = ref('')

async function create() {
  try {
    const p = await api<any>('/api/playlists', { method: 'POST', body: { name: name.value } })
    await navigateTo(`/playlists/${p.id}`)
  }
  catch (err) {
    toastError(err)
  }
}

async function makeDefault(p: any) {
  try {
    await api('/api/settings', { method: 'PATCH', body: { defaultPlaylistId: p.id } })
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
      <h1>{{ t('nav.playlists') }}</h1>
      <form v-if="can('editor')" class="row" @submit.prevent="create">
        <input v-model="name" :placeholder="t('playlists.newPlaceholder')" required>
        <button class="btn primary">{{ t('playlists.create') }}</button>
      </form>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>{{ t('field.name') }}</th><th>{{ t('playlists.items') }}</th><th>{{ t('playlists.updated') }}</th><th /></tr></thead>
        <tbody>
          <tr v-if="!playlists.length"><td colspan="4" class="muted">{{ t('playlists.empty') }}</td></tr>
          <tr v-for="p in playlists" :key="p.id">
            <td>
              <NuxtLink :to="`/playlists/${p.id}`"><strong>{{ p.name }}</strong></NuxtLink>
              <span v-if="p.isDefault" class="badge" style="margin-left:.5rem">{{ t('playlists.default') }}</span>
            </td>
            <td>{{ p.items }}</td>
            <td class="muted">{{ relative(p.updatedAt) }}</td>
            <td class="right">
              <button v-if="can('editor') && !p.isDefault" class="btn small" @click="makeDefault(p)">{{ t('playlists.makeDefault') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted small">{{ t('playlists.defaultHint') }}</p>
  </div>
</template>
