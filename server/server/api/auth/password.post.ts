import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Auth'], summary: 'Change your own password' } })

const Body = z.object({ current: z.string().max(512).default(''), password: z.string() })

export default defineEventHandler(async (event) => {
  const auth = requireRole(event, 'viewer')
  if (auth.kind !== 'session' || !auth.user.id) throw createError({ statusCode: 400, statusMessage: 'Only for logged-in users' })
  const body = await parseBody(event, Body)
  const db = useDb()
  const user = db.select().from(schema.users).where(eq(schema.users.id, auth.user.id)).get()!
  if (user.passwordHash && !(await verifyPassword(user.passwordHash, body.current))) {
    throw createError({ statusCode: 400, statusMessage: 'Current password is wrong' })
  }
  const passwordHash = await hashPassword(validatePassword(body.password))
  db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, user.id)).run()
  return { ok: true }
})
