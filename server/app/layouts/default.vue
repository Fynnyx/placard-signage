<script setup lang="ts">
import { LOCALES } from '~/composables/useI18n'

const me = useMe()
const { can } = useRole()
const { t, locale, setLocale } = useI18n()
const route = useRoute()
const menuOpen = ref(false)
const locales = LOCALES

const nav = computed(() => [
  { to: '/', label: t('nav.screens'), show: true },
  { to: '/playlists', label: t('nav.playlists'), show: true },
  { to: '/schedule', label: t('nav.schedule'), show: true },
  { to: '/media', label: t('nav.media'), show: true },
  { to: '/events', label: t('nav.events'), show: true },
  { to: '/users', label: t('nav.users'), show: can('admin') },
  { to: '/settings', label: t('nav.settings'), show: true },
].filter(n => n.show))

const isActive = (to: string) => to === '/' ? (route.path === '/' || route.path.startsWith('/screens')) : route.path.startsWith(to)

watch(() => route.fullPath, () => { menuOpen.value = false })

async function logout() {
  await api('/api/auth/logout', { method: 'POST' })
  await refreshMe()
  await navigateTo('/login')
}
</script>

<template>
  <div class="shell">
    <header class="top">
      <NuxtLink to="/" class="brand">
        <img v-if="me?.branding.logoUrl" :src="me.branding.logoUrl" alt="">
        <span>{{ me?.branding.name }}</span>
      </NuxtLink>
      <button class="btn ghost menu-btn" :aria-label="t('nav.menu')" @click="menuOpen = !menuOpen">☰</button>
      <nav :class="{ open: menuOpen }">
        <NuxtLink v-for="n in nav" :key="n.to" :to="n.to" :class="{ active: isActive(n.to) }">{{ n.label }}</NuxtLink>
      </nav>
      <div class="user" :class="{ open: menuOpen }">
        <select :value="locale" :aria-label="t('nav.language')" @change="setLocale(($event.target as HTMLSelectElement).value)">
          <option v-for="l in locales" :key="l.code" :value="l.code">{{ l.name }}</option>
        </select>
        <NuxtLink to="/account" class="small">{{ me?.user?.name || me?.user?.email }}</NuxtLink>
        <span class="badge">{{ t(`role.${me?.user?.role}`) }}</span>
        <button class="btn small" @click="logout">{{ t('nav.logout') }}</button>
      </div>
    </header>
    <main>
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; }
.top {
  display: flex; align-items: center; gap: 1.25rem; padding: .6rem 1.25rem;
  background: var(--surface); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10;
}
.brand { display: flex; align-items: center; gap: .5rem; font-weight: 700; color: var(--text); white-space: nowrap; }
.brand img { height: 28px; max-width: 120px; object-fit: contain; }
nav { display: flex; gap: .2rem; flex: 1; flex-wrap: wrap; }
nav a { padding: .35rem .7rem; border-radius: 6px; color: var(--muted); font-size: .92rem; }
nav a:hover { background: var(--surface-2); text-decoration: none; color: var(--text); }
nav a.active { color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); font-weight: 600; }
.user { display: flex; align-items: center; gap: .6rem; }
.user select { padding: .2rem .4rem; font-size: .85rem; }
.menu-btn { display: none; margin-left: auto; font-size: 1.2rem; }
main { padding: 1.5rem 1.25rem; max-width: 1400px; margin: 0 auto; }
@media (max-width: 900px) {
  .top { flex-wrap: wrap; }
  .menu-btn { display: inline-flex; }
  nav, .user { display: none; width: 100%; }
  nav.open { display: flex; flex-direction: column; }
  .user.open { display: flex; flex-wrap: wrap; }
}
</style>
