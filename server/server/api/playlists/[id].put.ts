import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Playlists'], summary: 'Save a playlist: name and the complete, ordered item list' } })

const Body = z.object({ name: z.string().trim().min(1).max(200).optional(), items: z.array(PlaylistItemInput).max(500).optional() })

export default defineEventHandler(async (event) => {
  requireRole(event, 'editor')
  const id = idParam(event)
  const body = await parseBody(event, Body)
  const db = useDb()
  if (!db.select().from(schema.playlists).where(eq(schema.playlists.id, id)).get()) notFound('Playlist not found')
  db.transaction(() => {
    if (body.name) db.update(schema.playlists).set({ name: body.name }).where(eq(schema.playlists.id, id)).run()
    if (body.items) replacePlaylistItems(id, body.items)
    db.update(schema.playlists).set({ updatedAt: Date.now() }).where(eq(schema.playlists.id, id)).run()
  })
  return getPlaylistWithItems(id)
})
