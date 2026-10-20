import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Schedule'], summary: 'Replace a schedule entry' } })

export default defineEventHandler(async (event) => {
  requireRole(event, 'editor')
  const id = idParam(event)
  const body = await parseBody(event, AssignmentInput)
  checkAssignmentRefs(body)
  return useDb().update(schema.assignments).set(body).where(eq(schema.assignments.id, id)).returning().get() ?? notFound('Schedule entry not found')
})
