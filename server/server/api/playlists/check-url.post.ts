defineRouteMeta({ openAPI: { tags: ['Playlists'], summary: 'Check whether a page allows being shown in an iframe' } })

const Body = z.object({ url: z.string().url() })

export default defineEventHandler(async (event) => {
  requireRole(event, 'editor')
  enforceRateLimit(event, 'check-url', 60, 60_000)
  const { url } = await parseBody(event, Body)
  return checkFraming(url)
})
