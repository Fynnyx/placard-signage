import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Groups'], summary: 'Rename a screen group' } })

const Body = z.object({ name: z.string().trim().min(1).max(200) })

export default defineEventHandler(async (event) => {
  requireRole(event, 'editor')
  const id = idParam(event)
  const body = await parseBody(event, Body)
  return useDb().update(schema.screenGroups).set(body).where(eq(schema.screenGroups.id, id)).returning().get() ?? notFound('Group not found')
})
