import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Settings'], summary: 'Change settings (admin)' } })

const Body = z.object({
  timezone: z.string().refine(isValidTimezone, 'unknown time zone').optional(),
  defaultPlaylistId: z.number().int().positive().nullable().optional(),
  brandName: z.string().trim().min(1).max(100).optional(),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i, 'expected #rrggbb').optional(),
  logoUrl: z.string().regex(/^\/media\/[\w-]+\.\w+$/).nullable().optional(),
})

export default defineEventHandler(async (event) => {
  // Editors may only change the default playlist.
  const auth = requireRole(event, 'editor')
  const body = await parseBody(event, Body)
  const keys = Object.keys(body)
  if (!hasRole(auth.user.role, 'admin') && keys.some(k => k !== 'defaultPlaylistId')) {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can change these settings' })
  }
  if (body.defaultPlaylistId && !useDb().select().from(schema.playlists).where(eq(schema.playlists.id, body.defaultPlaylistId)).get()) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown playlist' })
  }
  updateSettings(body)
  return { ok: true }
})
