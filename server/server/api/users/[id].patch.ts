import { and, eq, ne } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Users'], summary: 'Change a user\'s name, role or disabled state (admin)' } })

const Body = z.object({
  name: z.string().trim().max(200).optional(),
  role: z.enum(ROLES).optional(),
  disabled: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const auth = requireRole(event, 'admin')
  const id = idParam(event)
  const body = await parseBody(event, Body)
  const db = useDb()
  const user = db.select().from(schema.users).where(eq(schema.users.id, id)).get() ?? notFound('User not found')
  if ((body.role && body.role !== 'admin') || body.disabled) {
    if (user.role === 'admin') ensureAnotherAdmin(id)
  }
  if (id === auth.user.id && body.disabled) throw createError({ statusCode: 400, statusMessage: 'You cannot disable yourself' })
  const updated = db.update(schema.users).set(body).where(eq(schema.users.id, id)).returning().get()
  if (body.disabled || body.role) db.delete(schema.sessions).where(and(eq(schema.sessions.userId, id), ne(schema.sessions.id, auth.sessionId ?? ''))).run()
  return publicUser(updated)
})
