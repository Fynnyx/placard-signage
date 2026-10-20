<script setup lang="ts">
definePageMeta({ layout: 'bare' })
const { t } = useI18n()
const route = useRoute()
const token = String(route.params.token)
useHead({ title: t('invite.title') })

const { data: invite, error: loadError } = await useFetch<{ email: string, name: string }>(`/api/auth/invite/${token}`)
const name = ref(invite.value?.name ?? '')
const password = ref('')
const password2 = ref('')
const error = ref('')

async function submit() {
  error.value = ''
  if (password.value !== password2.value) {
    error.value = t('account.mismatch')
    return
  }
  try {
    await api(`/api/auth/invite/${token}`, { method: 'POST', body: { name: name.value, password: password.value } })
    await refreshMe()
    await navigateTo('/')
  }
  catch (err) {
    error.value = errorMessage(err)
  }
}
</script>

<template>
  <div class="stack">
    <h1>{{ t('invite.title') }}</h1>
    <div v-if="loadError" class="alert error">{{ t('invite.invalid') }}</div>
    <template v-else-if="invite">
      <p class="muted" style="margin:0">{{ t('invite.intro', { email: invite.email }) }}</p>
      <div v-if="error" class="alert error">{{ error }}</div>
      <form class="form" @submit.prevent="submit">
        <label>{{ t('field.name') }}<input v-model="name" autocomplete="name"></label>
        <label>{{ t('field.password') }}<input v-model="password" type="password" autocomplete="new-password" minlength="10" required></label>
        <label>{{ t('account.repeat') }}<input v-model="password2" type="password" autocomplete="new-password" required></label>
        <p class="muted small" style="margin:0">{{ t('account.passwordHint') }}</p>
        <button class="btn primary">{{ t('invite.submit') }}</button>
      </form>
    </template>
  </div>
</template>
