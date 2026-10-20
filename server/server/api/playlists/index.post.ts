defineRouteMeta({ openAPI: { tags: ['Playlists'], summary: 'Create a playlist, optionally with items' } })

const Body = z.object({ name: z.string().trim().min(1).max(200), items: z.array(PlaylistItemInput).max(500).optional() })

export default defineEventHandler(async (event) => {
  requireRole(event, 'editor')
  const body = await parseBody(event, Body)
  const db = useDb()
  const p = db.insert(schema.playlists).values({ name: body.name, updatedAt: Date.now() }).returning().get()
  if (body.items) replacePlaylistItems(p.id, body.items)
  if (!getSettings().defaultPlaylistId) updateSettings({ defaultPlaylistId: p.id })
  return getPlaylistWithItems(p.id)
})
