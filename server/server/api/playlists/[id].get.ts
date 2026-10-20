defineRouteMeta({ openAPI: { tags: ['Playlists'], summary: 'A playlist with its items' } })

export default defineEventHandler((event) => {
  requireRole(event, 'viewer')
  return getPlaylistWithItems(idParam(event)) ?? notFound('Playlist not found')
})
