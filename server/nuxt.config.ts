// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  future: { compatibilityVersion: 4 },
  devtools: { enabled: false },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    },
  },
  routeRules: {
    // The player runs fully client-side so the service worker can cache one static shell.
    '/player': { ssr: false },
    '/player/**': { ssr: false },
  },
  nitro: {
    experimental: { openAPI: true },
    openAPI: {
      route: '/api/openapi.json',
      meta: { title: 'Placard Signage API', version: '1' },
      ui: { scalar: { route: '/api/docs' }, swagger: false },
      production: 'runtime',
    },
  },
  typescript: { strict: true },
})
