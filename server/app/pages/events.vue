<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
useHead({ title: t('nav.events') })

const screenId = ref(String(route.query.screenId || ''))
const level = ref(String(route.query.level || ''))
const { data: screens } = await useAsyncData('screens', () => api<any[]>('/api/screens'), { default: () => [] })
const query = computed(() => ({ screenId: screenId.value || undefined, level: level.value || undefined, limit: 200 }))
const { data: events, refresh } = await useAsyncData('events', () => api<any[]>('/api/events', { query: query.value }), { default: () => [], watch: [query] })
const more = ref(true)

watch(query, q => navigateTo({ query: { screenId: q.screenId, level: q.level } }, { replace: true }))

async function loadMore() {
  const last = events.value[events.value.length - 1]
  if (!last) return
  const next = await api<any[]>('/api/events', { query: { ...query.value, before: last.id } })
  events.value = [...events.value, ...next]
  more.value = next.length === 200
}
</script>

<template>
  <div>
    <div class="page-head">
      <h1>{{ t('nav.events') }}</h1>
      <div class="row">
        <select v-model="screenId" :aria-label="t('events.screen')">
          <option value="">{{ t('events.allScreens') }}</option>
          <option v-for="s in screens" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
        </select>
        <select v-model="level" :aria-label="t('events.level')">
          <option value="">{{ t('events.allLevels') }}</option>
          <option value="info">{{ t('events.minInfo') }}</option>
          <option value="warn">{{ t('events.minWarn') }}</option>
          <option value="error">{{ t('events.onlyErrors') }}</option>
        </select>
        <button class="btn" @click="refresh()">{{ t('common.refresh') }}</button>
      </div>
    </div>
    <div class="card">
      <EventTable :events="events" />
      <div v-if="events.length >= 200 && more" style="margin-top:.75rem"><button class="btn small" @click="loadMore">{{ t('common.loadMore') }}</button></div>
    </div>
    <p class="muted small">{{ t('events.retention') }}</p>
  </div>
</template>
