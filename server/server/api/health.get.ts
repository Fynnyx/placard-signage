import { sql } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Ops'], summary: 'Health check for uptime monitors' } })

export default defineEventHandler(() => {
  useDb().get(sql`select 1`)
  return { status: 'ok', time: new Date().toISOString() }
})
