defineRouteMeta({ openAPI: { tags: ['Groups'], summary: 'Create a screen group' } })

const Body = z.object({ name: z.string().trim().min(1).max(200) })

export default defineEventHandler(async (event) => {
  requireRole(event, 'editor')
  const body = await parseBody(event, Body)
  return useDb().insert(schema.screenGroups).values(body).returning().get()
})
