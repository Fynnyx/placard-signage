defineRouteMeta({ openAPI: { tags: ['Auth'], summary: 'Start an OIDC login (redirects to the identity provider)' } })

const COOKIE = 'placard_oidc'

export default defineEventHandler(async (event) => {
  enforceRateLimit(event, 'oidc', 30, 60_000)
  let config
  try {
    config = await oidcConfig()
  }
  catch (err) {
    log('error', 'OIDC discovery failed', { error: String(err) })
    return sendRedirect(event, `/login?error=${encodeURIComponent('The identity provider is not reachable')}`)
  }
  const next = String(getQuery(event).next || '/')
  const verifier = oidcClient.randomPKCECodeVerifier()
  const state = oidcClient.randomState()
  const nonce = oidcClient.randomNonce()
  setCookie(event, COOKIE, JSON.stringify({ verifier, state, nonce, next: next.startsWith('/') && !next.startsWith('//') ? next : '/' }), {
    httpOnly: true, sameSite: 'lax', secure: useConfig().secureCookies, path: '/api/auth/oidc', maxAge: 600,
  })
  const url = oidcClient.buildAuthorizationUrl(config, {
    redirect_uri: oidcRedirectUri(),
    scope: process.env.OIDC_SCOPES || 'openid email profile',
    code_challenge: await oidcClient.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  })
  return sendRedirect(event, url.href)
})
