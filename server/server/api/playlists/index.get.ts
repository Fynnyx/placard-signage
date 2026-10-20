import { asc, count, eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Playlists'], summary: 'List playlists' } })

export default defineEventHandler((event) => {
  requireRole(event, 'viewer')
  const defaultId = getSettings().defaultPlaylistId
  return useDb().select({
    id: schema.playlists.id, name: schema.playlists.name, updatedAt: schema.playlists.updatedAt, items: count(schema.playlistItems.id),
  })
    .from(schema.playlists)
    .leftJoin(schema.playlistItems, eq(schema.playlistItems.playlistId, schema.playlists.id))
    .groupBy(schema.playlists.id)
    .orderBy(asc(schema.playlists.name)).all()
    .map(p => ({ ...p, isDefault: p.id === defaultId }))
})
