import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Device'], summary: 'Upload a PNG screenshot (raw body, Content-Type: image/png)' } })

const MAX_BYTES = 15 * 1024 * 1024
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47])

export default defineEventHandler(async (event) => {
  const screen = requireDevice(event)
  if (Number(getHeader(event, 'content-length') || 0) > MAX_BYTES) throw createError({ statusCode: 413, statusMessage: 'Screenshot too large' })
  const body = await readRawBody(event, false)
  if (!body || body.length > MAX_BYTES || !body.subarray(0, 4).equals(PNG_MAGIC)) {
    throw createError({ statusCode: 400, statusMessage: 'Expected a PNG body' })
  }
  const dir = resolve(useConfig().dataDir, 'screenshots')
  await mkdir(dir, { recursive: true })
  await writeFile(resolve(dir, `${screen.id}.png`), body)
  useDb().update(schema.screens).set({ screenshotAt: Date.now() }).where(eq(schema.screens.id, screen.id)).run()
  return { ok: true }
})
