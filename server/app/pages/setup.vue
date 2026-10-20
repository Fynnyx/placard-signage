<script setup lang="ts">
definePageMeta({ layout: 'bare' })
const { t } = useI18n()
useHead({ title: t('setup.title') })

const form = reactive({
  name: '', email: '', password: '', password2: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
})
const error = ref('')
const busy = ref(false)

async function submit() {
  error.value = ''
  if (form.password !== form.password2) {
    error.value = t('account.mismatch')
    return
  }
  busy.value = true
  try {
    await api('/api/setup', { method: 'POST', body: { name: form.name, email: form.email, password: form.password, timezone: form.timezone } })
    await refreshMe()
    await navigateTo('/')
  }
  catch (err) {
    error.value = errorMessage(err)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="stack">
    <h1>{{ t('setup.title') }}</h1>
    <p class="muted" style="margin:0">{{ t('setup.intro') }}</p>
    <div v-if="error" class="alert error">{{ error }}</div>
    <form class="form" @submit.prevent="submit">
      <label>{{ t('field.name') }}<input v-model="form.name" autocomplete="name"></label>
      <label>{{ t('field.email') }}<input v-model="form.email" type="email" autocomplete="username" required></label>
      <label>{{ t('field.password') }}<input v-model="form.password" type="password" autocomplete="new-password" minlength="10" required></label>
      <label>{{ t('account.repeat') }}<input v-model="form.password2" type="password" autocomplete="new-password" required></label>
      <label>{{ t('settings.timezone') }}<input v-model="form.timezone" required></label>
      <p class="muted small" style="margin:0">{{ t('account.passwordHint') }}</p>
      <button class="btn primary" :disabled="busy">{{ t('setup.submit') }}</button>
    </form>
  </div>
</template>
