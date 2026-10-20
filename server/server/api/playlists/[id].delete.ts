import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Playlists'], summary: 'Delete a playlist and its schedule entries' } })

export default defineEventHandler((event) => {
  requireRole(event, 'editor')
  const id = idParam(event)
  if (!useDb().delete(schema.playlists).where(eq(schema.playlists.id, id)).returning().get()) notFound('Playlist not found')
  if (getSettings().defaultPlaylistId === id) updateSettings({ defaultPlaylistId: null })
  return { ok: true }
})
