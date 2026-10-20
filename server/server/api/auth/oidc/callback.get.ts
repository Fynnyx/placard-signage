defineRouteMeta({ openAPI: { tags: ['Auth'], summary: 'OIDC redirect target' } })

const COOKIE = 'placard_oidc'

export default defineEventHandler(async (event) => {
  const fail = (msg: string) => sendRedirect(event, `/login?error=${encodeURIComponent(msg)}`)
  let stored: { verifier: string, state: string, nonce: string, next: string }
  try {
    stored = JSON.parse(getCookie(event, COOKIE) || '')
  }
  catch {
    return fail('The login took too long or cookies are blocked. Please try again.')
  }
  deleteCookie(event, COOKIE, { path: '/api/auth/oidc' })
  const query = getQuery(event)
  if (query.error) return fail(String(query.error_description || query.error))
  try {
    const config = await oidcConfig()
    const currentUrl = new URL(event.path, useConfig().publicUrl)
    const tokens = await oidcClient.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: stored.verifier,
      expectedState: stored.state,
      expectedNonce: stored.nonce,
      idTokenExpected: true,
    })
    const identity = await identityFromTokens(config, tokens)
    const user = upsertOidcUser(identity)
    createUserSession(event, user.id)
    log('info', 'OIDC login', { email: user.email, role: user.role })
    return sendRedirect(event, stored.next || '/')
  }
  catch (err: any) {
    log('warn', 'OIDC login failed', { error: String(err?.statusMessage || err?.message || err) })
    return fail(err?.statusMessage || 'Login with the identity provider failed')
  }
})
