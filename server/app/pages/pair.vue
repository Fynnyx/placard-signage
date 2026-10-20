<script setup lang="ts">
definePageMeta({ role: 'admin' })
const { t } = useI18n()
const me = useMe()
useHead({ title: t('screens.pair') })
const { data: groups } = await useAsyncData('groups', () => api<any[]>('/api/groups'), { default: () => [] })

const form = reactive({ code: '', name: '', location: '', groupId: null as number | null })
const busy = ref(false)

async function submit() {
  busy.value = true
  try {
    const s = await api<{ id: number }>('/api/screens/pair', { method: 'POST', body: { ...form, code: form.code.replace(/\s/g, '') } })
    toast(t('pair.done', { name: form.name }))
    await navigateTo(`/screens/${s.id}`)
  }
  catch (err) {
    toastError(err)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <h1>{{ t('screens.pair') }}</h1>
    <div class="cols">
      <div class="card">
        <form class="form" @submit.prevent="submit">
          <label>{{ t('pair.code') }}
            <input v-model="form.code" class="code" inputmode="numeric" autocomplete="off" pattern="\s*(\d\s*){6}" maxlength="7" placeholder="123456" required autofocus>
          </label>
          <label>{{ t('field.name') }}<input v-model="form.name" :placeholder="t('pair.namePlaceholder')" required></label>
          <label>{{ t('field.location') }}<input v-model="form.location"></label>
          <label>{{ t('field.group') }}
            <select v-model="form.groupId">
              <option :value="null">{{ t('screens.noGroup') }}</option>
              <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </label>
          <div><button class="btn primary" :disabled="busy">{{ t('pair.submit') }}</button></div>
        </form>
      </div>
      <div class="card">
        <h2>{{ t('pair.howTitle') }}</h2>
        <h3>{{ t('pair.piTitle') }}</h3>
        <p class="small">{{ t('pair.piText') }}</p>
        <pre class="mono small cmd">curl -fsSL {{ me?.publicUrl }}/install.sh | sudo bash</pre>
        <h3>{{ t('pair.browserTitle') }}</h3>
        <p class="small">{{ t('pair.browserText') }}</p>
        <pre class="mono small cmd">{{ me?.publicUrl }}/player/pair</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; align-items: start; }
.cols .card { margin: 0; }
@media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }
.code { font-size: 1.6rem; letter-spacing: .3em; font-family: ui-monospace, monospace; width: 12rem; }
.cmd { background: var(--surface-2); padding: .6rem .8rem; border-radius: 6px; overflow-x: auto; user-select: all; }
</style>
