defineRouteMeta({ openAPI: { tags: ['Schedule'], summary: 'Assign a playlist to a screen or group' } })

export default defineEventHandler(async (event) => {
  requireRole(event, 'editor')
  const body = await parseBody(event, AssignmentInput)
  checkAssignmentRefs(body)
  return useDb().insert(schema.assignments).values(body).returning().get()
})
