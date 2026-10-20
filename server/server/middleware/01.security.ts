const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF protection for the admin API: writes made with the session cookie must carry the
 * per-session token in `x-csrf-token`, and cross-site Origin headers are rejected.
 * Device routes and API-token requests use bearer tokens and are exempt.
 */
export default defineEventHandler((event) => {
  const path = event.path
  const start = Date.now()
  event.node.res.once('finish', () => {
    if (path.startsWith('/_nuxt') || path.startsWith('/media/')) return
    log('info', 'request', {
      method: event.method, path: path.split('?')[0], status: event.node.res.statusCode, ms: Date.now() - start,
    })
  })

  if (!path.startsWith('/api/') || SAFE.has(event.method) || path.startsWith('/api/device/')) return

  const origin = getHeader(event, 'origin')
  if (origin) {
    const host = getRequestHost(event, { xForwardedHost: true })
    let originHost = ''
    try {
      originHost = new URL(origin).host
    }
    catch { /* invalid origin */ }
    if (originHost !== host && originHost !== new URL(useConfig().publicUrl).host) {
      throw createError({ statusCode: 403, statusMessage: 'Cross-site request blocked' })
    }
  }

  const auth = getAuth(event)
  if (auth?.kind === 'session' && getHeader(event, 'x-csrf-token') !== auth.csrfToken) {
    throw createError({ statusCode: 403, statusMessage: 'Missing or invalid CSRF token' })
  }
})
