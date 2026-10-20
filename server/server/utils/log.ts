type Level = 'debug' | 'info' | 'warn' | 'error'

/** Structured logs: one JSON object per line on stdout. */
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (process.env.VITEST && !process.env.LOG_IN_TESTS) return
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields })
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n')
  else process.stdout.write(line + '\n')
}
