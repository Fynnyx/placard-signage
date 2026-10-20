<script setup lang="ts">
definePageMeta({ role: 'editor' })
const { t } = useI18n()
useHead({ title: t('nav.groups') })
const { data: groups, refresh } = await useAsyncData('groups', () => api<any[]>('/api/groups'), { default: () => [] })
const name = ref('')

async function add() {
  try {
    await api('/api/groups', { method: 'POST', body: { name: name.value } })
    name.value = ''
    refresh()
  }
  catch (err) {
    toastError(err)
  }
}

async function rename(g: any) {
  const n = prompt(t('groups.rename'), g.name)
  if (!n || n === g.name) return
  try {
    await api(`/api/groups/${g.id}`, { method: 'PATCH', body: { name: n } })
    refresh()
  }
  catch (err) {
    toastError(err)
  }
}

async function remove(g: any) {
  if (!confirm(t('groups.confirmDelete', { name: g.name }))) return
  try {
    await api(`/api/groups/${g.id}`, { method: 'DELETE' })
    refresh()
  }
  catch (err) {
    toastError(err)
  }
}
</script>

<template>
  <div>
    <h1>{{ t('nav.groups') }}</h1>
    <p class="muted">{{ t('groups.intro') }}</p>
    <div class="card">
      <form class="row" @submit.prevent="add">
        <input v-model="name" :placeholder="t('groups.newPlaceholder')" required>
        <button class="btn primary">{{ t('common.add') }}</button>
      </form>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>{{ t('field.name') }}</th><th>{{ t('nav.screens') }}</th><th /></tr></thead>
        <tbody>
          <tr v-if="!groups.length"><td colspan="3" class="muted">{{ t('groups.empty') }}</td></tr>
          <tr v-for="g in groups" :key="g.id">
            <td>{{ g.name }}</td>
            <td>{{ g.screens }}</td>
            <td class="right nowrap">
              <button class="btn small" @click="rename(g)">{{ t('common.rename') }}</button>
              <button class="btn small danger" @click="remove(g)">{{ t('common.delete') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
