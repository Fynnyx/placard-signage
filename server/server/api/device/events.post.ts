import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Device'], summary: 'Report errors and status messages from the screen' } })

const Event = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('error'),
  message: z.string().min(1).max(4000),
  source: z.enum(['player', 'agent']).default('player'),
})
const Body = z.union([Event, z.object({ events: z.array(Event).max(20) })])

export default defineEventHandler(async (event) => {
  const screen = requireDevice(event)
  if (!rateLimit(`device-events:${screen.id}`, 60, 60_000)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many events' })
  }
  const body = await parseBody(event, Body)
  const list = 'events' in body ? body.events : [body]
  for (const e of list) {
    logEvent(screen.id, e.level, e.message, e.source)
    if (e.level === 'error') {
      useDb().update(schema.screens).set({ lastError: e.message.slice(0, 1000), lastErrorAt: Date.now() })
        .where(eq(schema.screens.id, screen.id)).run()
    }
  }
  return { ok: true }
})
