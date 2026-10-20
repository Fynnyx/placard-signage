import { desc } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Schedule'], summary: 'List schedule entries (assignments)' } })

export default defineEventHandler((event) => {
  requireRole(event, 'viewer')
  return useDb().select().from(schema.assignments).orderBy(desc(schema.assignments.priority), desc(schema.assignments.id)).all()
})
