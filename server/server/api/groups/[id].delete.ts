import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Groups'], summary: 'Delete a screen group (its screens stay, without group)' } })

export default defineEventHandler((event) => {
  requireRole(event, 'editor')
  const id = idParam(event)
  if (!useDb().delete(schema.screenGroups).where(eq(schema.screenGroups.id, id)).returning().get()) notFound('Group not found')
  return { ok: true }
})
