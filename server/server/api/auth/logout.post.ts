defineRouteMeta({ openAPI: { tags: ['Auth'], summary: 'Log out' } })

export default defineEventHandler((event) => {
  destroyUserSession(event)
  return { ok: true }
})
