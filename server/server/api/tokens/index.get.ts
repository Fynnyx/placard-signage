import { desc } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Settings'], summary: 'List API tokens (admin)' } })

export default defineEventHandler((event) => {
  requireRole(event, 'admin')
  return useDb().select({
    id: schema.apiTokens.id, name: schema.apiTokens.name, role: schema.apiTokens.role,
    createdAt: schema.apiTokens.createdAt, lastUsedAt: schema.apiTokens.lastUsedAt,
  }).from(schema.apiTokens).orderBy(desc(schema.apiTokens.id)).all()
})
