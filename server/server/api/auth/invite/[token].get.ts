defineRouteMeta({ openAPI: { tags: ['Auth'], summary: 'Look up an invitation' } })

export default defineEventHandler((event) => {
  enforceRateLimit(event, 'invite', 30, 15 * 60_000)
  const user = findInvite(getRouterParam(event, 'token') || '')
  return { email: user.email, name: user.name }
})
