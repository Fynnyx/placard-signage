<script setup lang="ts">
definePageMeta({ layout: 'bare' })
const { t } = useI18n()
const me = useMe()
const route = useRoute()
useHead({ title: t('login.title') })

const email = ref('')
const password = ref('')
const error = ref(route.query.error ? String(route.query.error) : '')
const busy = ref(false)
const next = computed(() => {
  const n = String(route.query.next || '/')
  return n.startsWith('/') && !n.startsWith('//') ? n : '/'
})

if (me.value?.user) await navigateTo(next.value)

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await api('/api/auth/login', { method: 'POST', body: { email: email.value, password: password.value } })
    await refreshMe()
    await navigateTo(next.value)
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
    <h1>{{ t('login.title') }}</h1>
    <div v-if="error" class="alert error">{{ error }}</div>
    <a v-if="me?.oidc" class="btn primary" :href="`/api/auth/oidc/login?next=${encodeURIComponent(next)}`">
      {{ t('login.oidc', { name: me.oidc.name }) }}
    </a>
    <p v-if="me?.oidc && me.localLogin" class="muted small" style="text-align:center;margin:0">{{ t('login.or') }}</p>
    <form v-if="me?.localLogin" class="form" @submit.prevent="submit">
      <label>{{ t('field.email') }}<input v-model="email" type="email" autocomplete="username" required autofocus></label>
      <label>{{ t('field.password') }}<input v-model="password" type="password" autocomplete="current-password" required></label>
      <button class="btn" :class="{ primary: !me?.oidc }" :disabled="busy">{{ t('login.submit') }}</button>
    </form>
  </div>
</template>
