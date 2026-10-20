import { desc, eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Screens'], summary: 'One screen with status and recent commands' } })

export default defineEventHandler((event) => {
  requireRole(event, 'viewer')
  const id = idParam(event)
  const db = useDb()
  const s = db.select().from(schema.screens).where(eq(schema.screens.id, id)).get() ?? notFound('Screen not found')
  const group = s.groupId ? db.select().from(schema.screenGroups).where(eq(schema.screenGroups.id, s.groupId)).get() : undefined
  const commands = db.select().from(schema.commands).where(eq(schema.commands.screenId, id))
    .orderBy(desc(schema.commands.id)).limit(20).all()
  return { ...screenDto(s, group?.name ?? null, resolvePlaylistForScreen(s)), commands }
})
