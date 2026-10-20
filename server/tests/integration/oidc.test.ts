import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OAuth2Server } from 'oauth2-mock-server'
import { Client, startServer } from './server'

let idp: OAuth2Server
let server: Awaited<ReturnType<typeof startServer>>
let nextClaims: Record<string, unknown> = {}

beforeAll(async () => {
  idp = new OAuth2Server()
  await idp.issuer.keys.generate('RS256')
  await idp.start(0, '127.0.0.1')
  idp.service.on('beforeTokenSigning', (token) => {
    Object.assign(token.payload, nextClaims)
  })
  idp.service.on('beforeUserinfo', (res) => {
    res.body = { sub: nextClaims.sub, email: nextClaims.email, email_verified: true }
  })
  server = await startServer({
    OIDC_ISSUER: idp.issuer.url!,
    OIDC_CLIENT_ID: 'placard',
    OIDC_CLIENT_SECRET: 'secret',
    OIDC_ROLE_CLAIM: 'realm_access.roles',
    OIDC_ROLE_MAP: 'signage-admin=admin,signage-editor=editor',
    LOCAL_LOGIN: 'false',
    ADMIN_EMAIL: 'boss@example.org',
  })
})
afterAll(async () => {
  await server?.stop()
  await idp?.stop()
})

/** Runs the browser side of the authorization code flow. */
async function oidcLogin(claims: Record<string, unknown>) {
  nextClaims = claims
  const c = new Client(server.base)
  const start = await fetch(`${server.base}/api/auth/oidc/login?next=/playlists`, { redirect: 'manual' })
  expect(start.status).toBe(302)
  const oidcCookie = start.headers.getSetCookie().find(s => s.startsWith('placard_oidc='))!.split(';')[0]!
  const authorize = new URL(start.headers.get('location')!)
  expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
  const atIdp = await fetch(authorize, { redirect: 'manual' })
  const callback = new URL(atIdp.headers.get('location')!)
  expect(callback.pathname).toBe('/api/auth/oidc/callback')
  const done = await fetch(callback, { redirect: 'manual', headers: { cookie: oidcCookie } })
  const session = done.headers.getSetCookie().find(s => s.startsWith('placard_session='))
  if (session) c.cookie = session.split(';')[0]!
  return { client: c, location: done.headers.get('location') }
}

describe('OIDC login', () => {
  it('does not offer the local setup wizard when OIDC is the only login', async () => {
    const me = await new Client(server.base).refreshCsrf()
    expect(me.setupRequired).toBe(false)
    expect(me.localLogin).toBe(false)
    expect(me.oidc).toEqual({ name: 'Single sign-on' })
    expect((await new Client(server.base).post('/api/auth/login', { email: 'a@b.c', password: 'xxxxxxxxxxxx' })).status).toBe(403)
  })

  it('makes ADMIN_EMAIL the first admin', async () => {
    const { client, location } = await oidcLogin({ sub: 'u-boss', email: 'boss@example.org', email_verified: true })
    expect(location).toBe('/playlists')
    const me = await client.refreshCsrf()
    expect(me.user).toMatchObject({ email: 'boss@example.org', role: 'admin' })
  })

  it('maps roles from a nested claim', async () => {
    const { client } = await oidcLogin({ sub: 'u-ed', email: 'ed@example.org', realm_access: { roles: ['offline_access', 'signage-editor'] } })
    expect((await client.refreshCsrf()).user).toMatchObject({ email: 'ed@example.org', role: 'editor' })
  })

  it('updates the role on the next login', async () => {
    const { client } = await oidcLogin({ sub: 'u-ed', email: 'ed@example.org', realm_access: { roles: ['signage-admin', 'signage-editor'] } })
    expect((await client.refreshCsrf()).user.role).toBe('admin')
  })

  it('gives unmapped new users the default viewer role', async () => {
    const { client } = await oidcLogin({ sub: 'u-v', email: 'v@example.org', realm_access: { roles: ['other'] } })
    expect((await client.refreshCsrf()).user.role).toBe('viewer')
  })

  it('rejects a tampered state', async () => {
    nextClaims = { sub: 'u-x', email: 'x@example.org' }
    const start = await fetch(`${server.base}/api/auth/oidc/login`, { redirect: 'manual' })
    const cookie = start.headers.getSetCookie().find(s => s.startsWith('placard_oidc='))!.split(';')[0]!
    const authorize = new URL(start.headers.get('location')!)
    authorize.searchParams.set('state', 'forged')
    const atIdp = await fetch(authorize, { redirect: 'manual' })
    const done = await fetch(atIdp.headers.get('location')!, { redirect: 'manual', headers: { cookie } })
    expect(done.headers.get('location')).toMatch(/^\/login\?error=/)
    expect(done.headers.getSetCookie().some(s => s.startsWith('placard_session='))).toBe(false)
  })
})
