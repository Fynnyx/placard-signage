/** Prometheus metrics, enabled with METRICS=true. */
export default defineEventHandler((event) => {
  if (!useConfig().metrics) notFound()
  const screens = useDb().select().from(schema.screens).all()
  const now = Date.now()
  const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')
  const lines = [
    '# HELP placard_screens Number of paired screens.',
    '# TYPE placard_screens gauge',
    `placard_screens ${screens.length}`,
    '# HELP placard_screens_online Screens that sent a heartbeat within OFFLINE_AFTER_S.',
    '# TYPE placard_screens_online gauge',
    `placard_screens_online ${screens.filter(s => isOnline(s, now)).length}`,
    '# HELP placard_heartbeat_lag_seconds Seconds since the last heartbeat of each screen.',
    '# TYPE placard_heartbeat_lag_seconds gauge',
    ...screens.filter(s => s.lastSeenAt).map(s =>
      `placard_heartbeat_lag_seconds{screen_id="${s.id}",screen="${esc(s.name)}"} ${((now - s.lastSeenAt!) / 1000).toFixed(1)}`),
  ]
  setHeader(event, 'Content-Type', 'text/plain; version=0.0.4')
  return lines.join('\n') + '\n'
})
