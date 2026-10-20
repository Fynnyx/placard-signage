import { asc, count, eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Groups'], summary: 'List screen groups' } })

export default defineEventHandler((event) => {
  requireRole(event, 'viewer')
  const db = useDb()
  return db.select({ id: schema.screenGroups.id, name: schema.screenGroups.name, screens: count(schema.screens.id) })
    .from(schema.screenGroups)
    .leftJoin(schema.screens, eq(schema.screens.groupId, schema.screenGroups.id))
    .groupBy(schema.screenGroups.id)
    .orderBy(asc(schema.screenGroups.name)).all()
})
