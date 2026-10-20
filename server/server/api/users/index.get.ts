import { asc } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Users'], summary: 'List users (admin)' } })

export default defineEventHandler((event) => {
  requireRole(event, 'admin')
  return useDb().select().from(schema.users).orderBy(asc(schema.users.email)).all().map(publicUser)
})
