import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Screens'], summary: 'Delete a screen and revoke its token (admin)' } })

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')
  const id = idParam(event)
  const s = useDb().delete(schema.screens).where(eq(schema.screens.id, id)).returning().get() ?? notFound('Screen not found')
  await rm(resolve(useConfig().dataDir, 'screenshots', `${id}.png`), { force: true })
  logEvent(null, 'info', `Screen "${s.name}" deleted`)
  return { ok: true }
})
