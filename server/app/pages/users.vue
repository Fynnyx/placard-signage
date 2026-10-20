<script setup lang="ts">
definePageMeta({ role: 'admin' })
const { t } = useI18n()
const me = useMe()
const { relative } = useFormat()
useHead({ title: t('nav.users') })
const { data: users, refresh } = await useAsyncData('users', () => api<any[]>('/api/users'), { default: () => [] })

const form = reactive({ email: '', name: '', role: 'editor' })
const inviteLink = ref('')

async function invite() {
  try {
    const res = await api<{ inviteUrl: string }>('/api/users', { method: 'POST', body: form })
    inviteLink.value = res.inviteUrl
    form.email = form.name = ''
    refresh()
  }
  catch (err) {
    toastError(err)
  }
}

async function update(u: any, patch: Record<string, unknown>) {
  try {
    await api(`/api/users/${u.id}`, { method: 'PATCH', body: patch })
    refresh()
  }
  catch (err) {
    toastError(err)
    refresh()
  }
}

async function newLink(u: any) {
  try {
    const res = await api<{ inviteUrl: string }>(`/api/users/${u.id}/invite`, { method: 'POST' })
    inviteLink.value = res.inviteUrl
    refresh()
  }
  catch (err) {
    toastError(err)
  }
}

async function remove(u: any) {
  if (!confirm(t('users.confirmDelete', { email: u.email }))) return
  try {
    await api(`/api/users/${u.id}`, { method: 'DELETE' })
    refresh()
  }
  catch (err) {
    toastError(err)
  }
}

async function copy() {
  await navigator.clipboard?.writeText(inviteLink.value)
  toast(t('common.copied'))
}
</script>

<template>
  <div>
    <h1>{{ t('nav.users') }}</h1>
    <div class="card">
      <h2>{{ t('users.invite') }}</h2>
      <form class="row" @submit.prevent="invite">
        <input v-model="form.email" type="email" :placeholder="t('field.email')" required>
        <input v-model="form.name" :placeholder="t('field.name')">
        <select v-model="form.role">
          <option v-for="r in ['viewer', 'editor', 'admin']" :key="r" :value="r">{{ t(`role.${r}`) }}</option>
        </select>
        <button class="btn primary">{{ t('users.inviteSubmit') }}</button>
      </form>
      <div v-if="inviteLink" class="alert ok" style="margin-top:.8rem">
        <div>{{ me?.mail ? t('users.linkMailed') : t('users.linkCopy') }}</div>
        <div class="row" style="margin-top:.4rem">
          <code class="grow" style="word-break:break-all">{{ inviteLink }}</code>
          <button class="btn small" @click="copy">{{ t('common.copy') }}</button>
        </div>
      </div>
      <p class="muted small">{{ t('users.rolesHint') }}</p>
    </div>
    <div class="card table-wrap">
      <table>
        <thead><tr><th>{{ t('field.email') }}</th><th>{{ t('field.name') }}</th><th>{{ t('users.role') }}</th><th>{{ t('users.login') }}</th><th>{{ t('users.lastLogin') }}</th><th /></tr></thead>
        <tbody>
          <tr v-for="u in users" :key="u.id" :style="u.disabled ? 'opacity:.55' : ''">
            <td>{{ u.email }}</td>
            <td>{{ u.name }}</td>
            <td>
              <select :value="u.role" :disabled="u.id === me?.user?.id" @change="update(u, { role: ($event.target as HTMLSelectElement).value })">
                <option v-for="r in ['viewer', 'editor', 'admin']" :key="r" :value="r">{{ t(`role.${r}`) }}</option>
              </select>
            </td>
            <td class="small">
              <span v-if="u.oidc" class="badge">SSO</span>
              <span v-if="u.hasPassword" class="badge">{{ t('users.password') }}</span>
              <span v-if="u.invitePending" class="badge warn">{{ t('users.pending') }}</span>
              <span v-if="u.disabled" class="badge error">{{ t('users.disabled') }}</span>
            </td>
            <td class="muted small">{{ relative(u.lastLoginAt) }}</td>
            <td class="right nowrap">
              <template v-if="u.id !== me?.user?.id">
                <button class="btn small" @click="newLink(u)">{{ u.hasPassword ? t('users.resetLink') : t('users.newLink') }}</button>
                <button class="btn small" @click="update(u, { disabled: !u.disabled })">{{ u.disabled ? t('users.enable') : t('users.disable') }}</button>
                <button class="btn small danger" @click="remove(u)">{{ t('common.delete') }}</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
