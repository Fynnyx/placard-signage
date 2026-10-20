<script setup lang="ts">
const me = useMe()
const { locale } = useI18n()
const toasts = useToasts()

function contrast(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff'
}

useHead(() => ({
  htmlAttrs: { lang: locale.value },
  titleTemplate: (title?: string) => title ? `${title} · ${me.value?.branding.name ?? 'Placard'}` : (me.value?.branding.name ?? 'Placard'),
  style: me.value?.branding.accentColor
    ? [{ key: 'accent', innerHTML: `:root{--accent:${me.value.branding.accentColor};--accent-contrast:${contrast(me.value.branding.accentColor)}}` }]
    : [],
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <div class="toasts" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind">{{ t.text }}</div>
  </div>
</template>
