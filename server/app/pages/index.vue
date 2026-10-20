<script setup lang="ts">
const { t } = useI18n()
const { can } = useRole()
const { relative } = useFormat()
useHead({ title: t('nav.screens') })

const { data: screens, refresh } = await useAsyncData('screens', () => api<any[]>('/api/screens'), { default: () => [] })
const { data: groups } = await useAsyncData('groups', () => api<any[]>('/api/groups'), { default: () => [] })
const groupFilter = ref<string>('')
const shown = computed(() => screens.value.filter(s => !groupFilter.value
  || (groupFilter.value === 'none' ? !s.groupId : String(s.groupId) === groupFilter.value)))
const onlineCount = computed(() => screens.value.filter(s => s.online).length)

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => refresh(), 10_000) })
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div>
    <div class="page-head">
      <h1>{{ t('nav.screens') }} <span class="muted small">{{ t('screens.onlineOf', { online: onlineCount, total: screens.length }) }}</span></h1>
      <div class="row">
        <select v-if="groups.length" v-model="groupFilter" :aria-label="t('field.group')">
          <option value="">{{ t('screens.allGroups') }}</option>
          <option v-for="g in groups" :key="g.id" :value="String(g.id)">{{ g.name }}</option>
          <option value="none">{{ t('screens.noGroup') }}</option>
        </select>
        <NuxtLink v-if="can('editor')" to="/groups" class="btn">{{ t('nav.groups') }}</NuxtLink>
        <NuxtLink v-if="can('admin')" to="/pair" class="btn primary">{{ t('screens.pair') }}</NuxtLink>
      </div>
    </div>

    <div v-if="!screens.length" class="card empty">
      <p>{{ t('screens.empty') }}</p>
      <NuxtLink v-if="can('admin')" to="/pair" class="btn primary">{{ t('screens.pair') }}</NuxtLink>
    </div>

    <div class="grid">
      <div v-for="s in shown" :key="s.id" class="card screen">
        <NuxtLink :to="`/screens/${s.id}`" class="shot">
          <img v-if="s.screenshotAt" :src="`/api/screens/${s.id}/screenshot?t=${s.screenshotAt}`" :alt="t('screens.screenshotOf', { name: s.name })" loading="lazy">
          <span v-else class="muted small">{{ t('screens.noScreenshot') }}</span>
        </NuxtLink>
        <div class="row between">
          <NuxtLink :to="`/screens/${s.id}`"><strong>{{ s.name }}</strong></NuxtLink>
          <OnlineBadge :online="s.online" :display-on="s.displayOn" />
        </div>
        <div class="muted small">
          {{ [s.location, s.groupName].filter(Boolean).join(' · ') || '–' }}
        </div>
        <dl class="small">
          <dt>{{ t('field.playlist') }}</dt>
          <dd>{{ s.playlist?.name || '–' }} <span v-if="s.playlist?.source === 'default'" class="muted">({{ t('screens.default') }})</span></dd>
          <dt>{{ t('screens.current') }}</dt>
          <dd class="ellipsis" :title="s.currentItem || ''">{{ s.currentItem || '–' }}</dd>
          <dt>{{ t('screens.lastSeen') }}</dt>
          <dd>{{ relative(s.lastSeenAt) }}</dd>
          <dt>{{ t('screens.browser') }}</dt>
          <dd class="ellipsis">{{ s.browserVersion || '–' }}</dd>
        </dl>
        <div v-if="s.lastError" class="alert error small ellipsis" :title="s.lastError">
          {{ relative(s.lastErrorAt) }}: {{ s.lastError }}
        </div>
        <ScreenActions :screen="s" @sent="refresh()" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen { display: flex; flex-direction: column; gap: .5rem; margin: 0 !important; }
.shot { aspect-ratio: 16 / 9; background: #000; border-radius: 6px; display: grid; place-items: center; overflow: hidden; }
.shot img { width: 100%; height: 100%; object-fit: contain; }
dl { display: grid; grid-template-columns: auto 1fr; gap: .15rem .75rem; margin: 0; }
dt { color: var(--muted); }
dd { margin: 0; min-width: 0; }
</style>
