import { and, desc, eq, inArray, lt, type SQL } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Events'], summary: 'Event log, newest first', parameters: [
  { in: 'query', name: 'screenId', schema: { type: 'integer' } },
  { in: 'query', name: 'level', schema: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] }, description: 'Minimum level' },
  { in: 'query', name: 'before', schema: { type: 'integer' }, description: 'Return events with a smaller id (paging)' },
  { in: 'query', name: 'limit', schema: { type: 'integer', maximum: 500 } },
] } })

const LEVELS = ['debug', 'info', 'warn', 'error'] as const

export default defineEventHandler((event) => {
  requireRole(event, 'viewer')
  const q = getQuery(event)
  const conds: SQL[] = []
  if (q.screenId) conds.push(eq(schema.events.screenId, Number(q.screenId)))
  const lvl = LEVELS.indexOf(q.level as any)
  if (lvl > 0) conds.push(inArray(schema.events.level, LEVELS.slice(lvl) as any))
  if (q.before) conds.push(lt(schema.events.id, Number(q.before)))
  const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500)
  return useDb().select({
    id: schema.events.id, screenId: schema.events.screenId, screenName: schema.screens.name,
    at: schema.events.at, level: schema.events.level, source: schema.events.source, message: schema.events.message,
  }).from(schema.events)
    .leftJoin(schema.screens, eq(schema.screens.id, schema.events.screenId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.events.id)).limit(limit).all()
})
