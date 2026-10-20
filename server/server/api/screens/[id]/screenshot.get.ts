import { createReadStream, existsSync } from 'node:fs'
import { resolve } from 'node:path'

defineRouteMeta({ openAPI: { tags: ['Screens'], summary: 'Latest screenshot as PNG' } })

export default defineEventHandler((event) => {
  requireRole(event, 'viewer')
  const id = idParam(event)
  const file = resolve(useConfig().dataDir, 'screenshots', `${id}.png`)
  if (!existsSync(file)) notFound('No screenshot yet')
  setHeader(event, 'Content-Type', 'image/png')
  setHeader(event, 'Cache-Control', 'private, no-cache')
  return sendStream(event, createReadStream(file))
})
