import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Schedule'], summary: 'Delete a schedule entry' } })

export default defineEventHandler((event) => {
  requireRole(event, 'editor')
  const id = idParam(event)
  if (!useDb().delete(schema.assignments).where(eq(schema.assignments.id, id)).returning().get()) notFound('Schedule entry not found')
  return { ok: true }
})
