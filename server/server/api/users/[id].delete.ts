import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Users'], summary: 'Delete a user (admin)' } })

export default defineEventHandler((event) => {
  const auth = requireRole(event, 'admin')
  const id = idParam(event)
  if (id === auth.user.id) throw createError({ statusCode: 400, statusMessage: 'You cannot delete yourself' })
  const db = useDb()
  const user = db.select().from(schema.users).where(eq(schema.users.id, id)).get() ?? notFound('User not found')
  if (user.role === 'admin') ensureAnotherAdmin(id)
  db.delete(schema.users).where(eq(schema.users.id, id)).run()
  return { ok: true }
})
