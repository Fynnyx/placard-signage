const PUBLIC = ['/login', '/setup']

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path.startsWith('/player')) return
  const me = useMe()
  if (!me.value || import.meta.server) await refreshMe()
  const m = me.value!
  if (m.setupRequired) return to.path === '/setup' ? undefined : navigateTo('/setup')
  if (to.path === '/setup') return navigateTo('/')
  if (PUBLIC.includes(to.path) || to.path.startsWith('/invite/')) return
  if (!m.user) return navigateTo({ path: '/login', query: to.fullPath !== '/' ? { next: to.fullPath } : {} })
  const min = to.meta.role as 'admin' | 'editor' | 'viewer' | undefined
  if (min && !useRole().can(min)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Your role does not allow this page.', fatal: true })
  }
})
