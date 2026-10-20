import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { eq, like } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Media'], summary: 'Delete an uploaded file (refused while a playlist uses it)' } })

export default defineEventHandler(async (event) => {
  requireRole(event, 'editor')
  const id = idParam(event)
  const db = useDb()
  const m = db.select().from(schema.media).where(eq(schema.media.id, id)).get() ?? notFound('File not found')
  const used = db.select({ id: schema.playlistItems.id }).from(schema.playlistItems)
    .where(like(schema.playlistItems.source, `%/media/${m.filename}`)).limit(1).get()
  if (used) throw createError({ statusCode: 409, statusMessage: 'This file is still used in a playlist' })
  db.delete(schema.media).where(eq(schema.media.id, id)).run()
  await rm(resolve(useConfig().mediaDir, m.filename), { force: true })
  return { ok: true }
})
