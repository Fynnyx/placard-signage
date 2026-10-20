defineRouteMeta({ openAPI: { tags: ['Device'], summary: 'Resolved playlist for this screen right now (supports If-None-Match)' } })

export default defineEventHandler((event) => {
  const screen = requireDevice(event)
  const resolved = resolvePlaylistForScreen(screen)
  const body = JSON.stringify(resolved)
  const etag = `"${sha256(body).slice(0, 32)}"`
  setHeader(event, 'ETag', etag)
  setHeader(event, 'Cache-Control', 'no-cache')
  const inm = getHeader(event, 'if-none-match')
  if (inm && inm.split(',').map(s => s.trim().replace(/^W\//, '')).includes(etag)) {
    setResponseStatus(event, 304)
    return null
  }
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  return body
})
