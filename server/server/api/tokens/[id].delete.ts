import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Settings'], summary: 'Revoke an API token (admin)' } })

export default defineEventHandler((event) => {
  requireRole(event, 'admin')
  if (!useDb().delete(schema.apiTokens).where(eq(schema.apiTokens.id, idParam(event))).returning().get()) notFound('Token not found')
  return { ok: true }
})
