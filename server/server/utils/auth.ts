import type { H3Event } from 'h3'
import { and, eq, gt } from 'drizzle-orm'
import { hash, verify } from '@node-rs/argon2'
import type { Role } from '../db/schema'

export const SESSION_COOKIE = 'placard_session'
const SESSION_TTL_MS = 14 * 86400_000
export const API_TOKEN_PREFIX = 'plc_'

const RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 }

export interface AuthContext {
  kind: 'session' | 'token'
  user: { id: number | null, email: string, name: string, role: Role }
  csrfToken?: string
  sessionId?: string
}

declare module 'h3' {
  interface H3EventContext {
    auth?: AuthContext | null
  }
}

export function hashPassword(password: string) {
  // @node-rs/argon2 defaults to argon2id.
  return hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 })
}

export function verifyPassword(hashed: string, password: string) {
  return verify(hashed, password).catch(() => false)
}

export function validatePassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 10) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 10 characters' })
  }
  if (password.length > 512) throw createError({ statusCode: 400, statusMessage: 'Password too long' })
  return password
}

export function createUserSession(event: H3Event, userId: number) {
  const token = randomToken(32)
  const csrfToken = randomToken(24)
  const db = useDb()
  db.insert(schema.sessions).values({
    id: sha256(token), userId, csrfToken, expiresAt: Date.now() + SESSION_TTL_MS,
  }).run()
  db.update(schema.users).set({ lastLoginAt: Date.now() }).where(eq(schema.users.id, userId)).run()
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: useConfig().secureCookies, path: '/', maxAge: SESSION_TTL_MS / 1000,
  })
}

export function destroyUserSession(event: H3Event) {
  const token = getCookie(event, SESSION_COOKIE)
  if (token) useDb().delete(schema.sessions).where(eq(schema.sessions.id, sha256(token))).run()
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

/** Resolves the admin user from the session cookie or an API token. Cached per request. */
export function getAuth(event: H3Event): AuthContext | null {
  if (event.context.auth !== undefined) return event.context.auth
  event.context.auth = loadAuth(event)
  return event.context.auth
}

function loadAuth(event: H3Event): AuthContext | null {
  const db = useDb()
  const header = getHeader(event, 'authorization')
  if (header?.startsWith(`Bearer ${API_TOKEN_PREFIX}`)) {
    const tokenHash = sha256(header.slice(7).trim())
    const tok = db.select().from(schema.apiTokens).where(eq(schema.apiTokens.tokenHash, tokenHash)).get()
    if (!tok) return null
    db.update(schema.apiTokens).set({ lastUsedAt: Date.now() }).where(eq(schema.apiTokens.id, tok.id)).run()
    return { kind: 'token', user: { id: null, email: '', name: `API token: ${tok.name}`, role: tok.role } }
  }
  const cookie = getCookie(event, SESSION_COOKIE)
  if (!cookie) return null
  const row = db.select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sha256(cookie)), gt(schema.sessions.expiresAt, Date.now())))
    .get()
  if (!row || row.user.disabled) return null
  if (row.user.oidcSub === null && row.user.passwordHash !== null && !useConfig().localLogin) return null
  return {
    kind: 'session',
    sessionId: row.session.id,
    csrfToken: row.session.csrfToken,
    user: { id: row.user.id, email: row.user.email, name: row.user.name, role: row.user.role },
  }
}

export function hasRole(role: Role, min: Role) {
  return RANK[role] >= RANK[min]
}

export function requireRole(event: H3Event, min: Role): AuthContext {
  const auth = getAuth(event)
  if (!auth) throw createError({ statusCode: 401, statusMessage: 'Not logged in' })
  if (!hasRole(auth.user.role, min)) throw createError({ statusCode: 403, statusMessage: 'Not allowed for your role' })
  return auth
}

/** The setup wizard is needed while no user exists and local accounts are enabled. */
export function setupRequired() {
  const cfg = useConfig()
  return !isSetupDone() && (cfg.localLogin || !cfg.oidc)
}

export function isSetupDone() {
  if (getSettings().setupDone) return true
  const anyUser = useDb().select({ id: schema.users.id }).from(schema.users).limit(1).get()
  return !!anyUser
}

const INVITE_TTL_MS = 7 * 86400_000

/** Creates a new invitation link for a user (also used for password resets by an admin). */
export function createInvite(userId: number) {
  const token = randomToken(24)
  useDb().update(schema.users).set({ inviteTokenHash: sha256(token), inviteExpiresAt: Date.now() + INVITE_TTL_MS })
    .where(eq(schema.users.id, userId)).run()
  return `${useConfig().publicUrl}/invite/${token}`
}

export function findInvite(token: string) {
  const user = token
    ? useDb().select().from(schema.users).where(eq(schema.users.inviteTokenHash, sha256(token))).get()
    : undefined
  if (!user || user.disabled || !user.inviteExpiresAt || user.inviteExpiresAt < Date.now()) {
    throw createError({ statusCode: 404, statusMessage: 'This invitation is invalid or has expired' })
  }
  return user
}

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  }
  catch {
    return false
  }
}

export function publicUser(u: typeof schema.users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    disabled: u.disabled,
    hasPassword: !!u.passwordHash,
    oidc: !!u.oidcSub,
    invitePending: !!u.inviteTokenHash && (u.inviteExpiresAt ?? 0) > Date.now(),
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  }
}

/** Refuses to remove the last active admin. */
export function ensureAnotherAdmin(exceptId: number) {
  const others = useDb().select({ id: schema.users.id }).from(schema.users)
    .where(and(eq(schema.users.role, 'admin'), eq(schema.users.disabled, false))).all()
    .filter(u => u.id !== exceptId)
  if (!others.length) throw createError({ statusCode: 400, statusMessage: 'There must be at least one active admin' })
}
