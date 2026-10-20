<script setup lang="ts">
const { t } = useI18n()
const me = useMe()
useHead({ title: t('account.title') })

const current = ref('')
const password = ref('')
const password2 = ref('')

async function submit() {
  if (password.value !== password2.value) return toast(t('account.mismatch'), 'error')
  try {
    await api('/api/auth/password', { method: 'POST', body: { current: current.value, password: password.value } })
    current.value = password.value = password2.value = ''
    toast(t('account.changed'))
  }
  catch (err) {
    toastError(err)
  }
}
</script>

<template>
  <div>
    <h1>{{ t('account.title') }}</h1>
    <div class="card">
      <p style="margin-top:0"><strong>{{ me?.user?.name }}</strong> · {{ me?.user?.email }} · {{ t(`role.${me?.user?.role}`) }}</p>
      <h2>{{ t('account.changePassword') }}</h2>
      <form class="form" @submit.prevent="submit">
        <label>{{ t('account.current') }}<input v-model="current" type="password" autocomplete="current-password"></label>
        <label>{{ t('account.new') }}<input v-model="password" type="password" autocomplete="new-password" minlength="10" required></label>
        <label>{{ t('account.repeat') }}<input v-model="password2" type="password" autocomplete="new-password" required></label>
        <p class="muted small" style="margin:0">{{ t('account.passwordHint') }}</p>
        <div><button class="btn primary">{{ t('common.save') }}</button></div>
      </form>
    </div>
  </div>
</template>
