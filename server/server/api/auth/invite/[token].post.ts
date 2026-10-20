import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Auth'], summary: 'Accept an invitation by setting a password' } })

const Body = z.object({ name: z.string().trim().max(200).optional(), password: z.string() })

export default defineEventHandler(async (event) => {
  enforceRateLimit(event, 'invite', 30, 15 * 60_000)
  const user = findInvite(getRouterParam(event, 'token') || '')
  const body = await parseBody(event, Body)
  const passwordHash = await hashPassword(validatePassword(body.password))
  useDb().update(schema.users).set({
    passwordHash, inviteTokenHash: null, inviteExpiresAt: null, ...(body.name ? { name: body.name } : {}),
  }).where(eq(schema.users.id, user.id)).run()
  createUserSession(event, user.id)
  return { ok: true }
})
