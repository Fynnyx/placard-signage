import { desc } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Media'], summary: 'List uploaded images and videos' } })

export default defineEventHandler((event) => {
  requireRole(event, 'viewer')
  return useDb().select().from(schema.media).orderBy(desc(schema.media.id)).all().map(mediaDto)
})
