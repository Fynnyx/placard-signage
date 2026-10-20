import * as client from 'openid-client'
import { eq } from 'drizzle-orm'
import type { Role } from '../db/schema'

const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 }

let configPromise: Promise<client.Configuration> | undefined

/** Discovers the provider once; retried on the next login if it failed. */
export function oidcConfig() {
  const oidc = useConfig().oidc
  if (!oidc) throw createError({ statusCode: 404, statusMessage: 'OIDC login is not configured' })
  configPromise ??= client.discovery(
    new URL(oidc.issuer),
    oidc.clientId,
    oidc.clientSecret,
    undefined,
    // Plain http issuers are only for local testing.
    oidc.issuer.startsWith('http://') ? { execute: [client.allowInsecureRequests] } : undefined,
  ).catch((err) => {
    configPromise = undefined
    throw err
  })
  return configPromise
}

export function oidcRedirectUri() {
  return `${useConfig().publicUrl}/api/auth/oidc/callback`
}

/** Reads a claim by dotted path, e.g. "realm_access.roles" (Keycloak) or "groups" (Authentik). */
export function claimAt(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

/** Maps provider role names to the highest app role, or null when none matches. */
export function mapRoles(values: unknown, roleMap: Record<string, string>): Role | null {
  const list = Array.isArray(values) ? values : typeof values === 'string' ? values.split(/[\s,]+/) : []
  let best: Role | null = null
  for (const v of list) {
    const mapped = roleMap[String(v)] as Role | undefined
    if (mapped && mapped in RANK && (!best || RANK[mapped] > RANK[best])) best = mapped
  }
  return best
}

function decodeJwtPayload(token: string | undefined): Record<string, unknown> | undefined {
  if (!token || token.split('.').length !== 3) return undefined
  try {
    return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'))
  }
  catch {
    return undefined
  }
}

export interface OidcIdentity {
  sub: string
  email?: string
  emailVerified?: boolean
  name?: string
  role: Role | null
}

/**
 * Collects the identity from the ID token and userinfo. The role claim is looked up in the ID token,
 * then userinfo, then the access token (Keycloak puts realm roles there by default).
 */
export async function identityFromTokens(config: client.Configuration, tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers): Promise<OidcIdentity> {
  const oidc = useConfig().oidc!
  const claims = tokens.claims() ?? {} as Record<string, unknown>
  let userinfo: Record<string, unknown> = {}
  try {
    userinfo = await client.fetchUserInfo(config, tokens.access_token, String(claims.sub))
  }
  catch (err) {
    log('warn', 'OIDC userinfo failed', { error: String(err) })
  }
  const sources = [claims, userinfo, decodeJwtPayload(tokens.access_token) ?? {}]
  const pick = (k: string) => sources.map(s => claimAt(s, k)).find(v => v !== undefined && v !== null)
  const roleValues = sources.map(s => claimAt(s, oidc.roleClaim)).find(v => v !== undefined)
  return {
    sub: String(claims.sub),
    email: typeof pick('email') === 'string' ? String(pick('email')).toLowerCase() : undefined,
    emailVerified: pick('email_verified') === undefined ? undefined : pick('email_verified') === true || pick('email_verified') === 'true',
    name: (pick('name') ?? pick('preferred_username')) as string | undefined,
    role: mapRoles(roleValues, oidc.roleMap),
  }
}

/** Finds or creates the user for an OIDC identity and applies the mapped role. */
export function upsertOidcUser(id: OidcIdentity) {
  const db = useDb()
  const defaultRole = (process.env.OIDC_DEFAULT_ROLE || 'viewer') as Role | 'none'
  let user = db.select().from(schema.users).where(eq(schema.users.oidcSub, id.sub)).get()
  if (!user && id.email && id.emailVerified !== false) {
    // Link an invited or existing local account with the same e-mail.
    user = db.select().from(schema.users).where(eq(schema.users.email, id.email)).get()
    if (user?.oidcSub && user.oidcSub !== id.sub) user = undefined
    if (user) db.update(schema.users).set({ oidcSub: id.sub }).where(eq(schema.users.id, user.id)).run()
  }
  // With OIDC as the only login, ADMIN_EMAIL marks the first admin.
  const cfg = useConfig()
  const bootstrapAdmin = !!cfg.adminEmail && id.email === cfg.adminEmail.toLowerCase() && id.emailVerified !== false
    && !db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, 'admin')).get()
  if (!user) {
    const role = bootstrapAdmin ? 'admin' : id.role ?? (defaultRole === 'none' ? null : defaultRole)
    if (!role) throw createError({ statusCode: 403, statusMessage: 'Your account has no access to this dashboard. Ask an admin to invite you.' })
    if (!id.email) throw createError({ statusCode: 400, statusMessage: 'The identity provider did not send an e-mail address' })
    if (db.select().from(schema.users).where(eq(schema.users.email, id.email)).get()) {
      throw createError({ statusCode: 409, statusMessage: 'A different account already uses this e-mail address' })
    }
    user = db.insert(schema.users).values({ email: id.email, name: id.name ?? '', role, oidcSub: id.sub }).returning().get()
    log('info', 'Created user from OIDC login', { email: id.email, role })
    updateSettings({ setupDone: true })
    return user
  }
  if (user.disabled) throw createError({ statusCode: 403, statusMessage: 'This account is disabled' })
  const patch: Partial<typeof schema.users.$inferInsert> = {}
  if (bootstrapAdmin) patch.role = 'admin'
  else if (id.role && id.role !== user.role) {
    if (user.role === 'admin' && id.role !== 'admin') ensureAnotherAdmin(user.id)
    patch.role = id.role
  }
  if (id.name && !user.name) patch.name = id.name
  if (Object.keys(patch).length) user = db.update(schema.users).set(patch).where(eq(schema.users.id, user.id)).returning().get()
  return user
}

export { client as oidcClient }
