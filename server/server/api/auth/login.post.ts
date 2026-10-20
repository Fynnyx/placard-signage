import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Auth'], summary: 'Log in with e-mail and password' } })

const Body = z.object({ email: z.string().trim().toLowerCase(), password: z.string().max(512) })

export default defineEventHandler(async (event) => {
  const cfg = useConfig()
  if (!cfg.localLogin && cfg.oidc) throw createError({ statusCode: 403, statusMessage: 'Local login is disabled' })
  enforceRateLimit(event, 'login', 10, 15 * 60_000)
  const { email, password } = await parseBody(event, Body)
  if (!rateLimit(`login-user:${email}`, 10, 15 * 60_000)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts, try again later' })
  }
  const user = useDb().select().from(schema.users).where(eq(schema.users.email, email)).get()
  const ok = user?.passwordHash && !user.disabled && await verifyPassword(user.passwordHash, password)
  if (!user || !ok) {
    log('warn', 'Failed login', { email, ip: getClientIp(event) })
    throw createError({ statusCode: 401, statusMessage: 'Wrong e-mail or password' })
  }
  createUserSession(event, user.id)
  return { ok: true }
})
