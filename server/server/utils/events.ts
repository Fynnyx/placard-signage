import { lt } from 'drizzle-orm'

type Level = 'debug' | 'info' | 'warn' | 'error'

export function logEvent(screenId: number | null, level: Level, message: string, source = 'server') {
  useDb().insert(schema.events).values({ screenId, level, message: message.slice(0, 2000), source, at: Date.now() }).run()
  log(level, message, { screenId, source })
}

export function pruneEvents(days = 30) {
  useDb().delete(schema.events).where(lt(schema.events.at, Date.now() - days * 86400_000)).run()
}
