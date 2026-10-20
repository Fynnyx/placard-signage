import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Users'], summary: 'Create a new invitation / password reset link (admin)' } })

export default defineEventHandler((event) => {
  requireRole(event, 'admin')
  const id = idParam(event)
  const user = useDb().select().from(schema.users).where(eq(schema.users.id, id)).get() ?? notFound('User not found')
  return { inviteUrl: createInvite(user.id) }
})
