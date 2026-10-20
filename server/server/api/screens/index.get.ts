import { asc } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Screens'], summary: 'List screens with status' } })

export default defineEventHandler((event) => {
  requireRole(event, 'viewer')
  const db = useDb()
  const rows = db.select().from(schema.screens).orderBy(asc(schema.screens.name)).all()
  const groups = new Map(db.select().from(schema.screenGroups).all().map(g => [g.id, g.name]))
  const now = new Date()
  return rows.map((s) => {
    const resolved = resolvePlaylistForScreen(s, now)
    return screenDto(s, groups.get(s.groupId ?? 0) ?? null, resolved)
  })
})
