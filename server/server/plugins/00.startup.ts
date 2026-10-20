import { and, eq, isNotNull, lt } from 'drizzle-orm'

export default defineNitroPlugin(async (nitro) => {
  const cfg = useConfig()
  const db = useDb()
  log('info', 'Database ready', { file: cfg.dbFile })

  // First admin from the environment, so the setup wizard can be skipped.
  if (cfg.adminEmail && cfg.adminPassword && !isSetupDone()) {
    db.insert(schema.users).values({
      email: cfg.adminEmail.toLowerCase(),
      name: 'Admin',
      role: 'admin',
      passwordHash: await hashPassword(cfg.adminPassword),
    }).run()
    updateSettings({ setupDone: true })
    log('info', 'Created first admin from ADMIN_EMAIL', { email: cfg.adminEmail })
  }
  getSigningSecret()

  const timers: NodeJS.Timeout[] = []
  timers.push(setInterval(() => {
    try {
      checkOffline()
    }
    catch (err) {
      log('error', 'Offline check failed', { error: String(err) })
    }
  }, 15_000))
  const hourly = () => {
    try {
      pruneEvents(30)
      db.delete(schema.pairingCodes).where(lt(schema.pairingCodes.expiresAt, Date.now() - 3600_000)).run()
      db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, Date.now())).run()
      // Old commands are dropped after 30 days.
      db.delete(schema.commands).where(lt(schema.commands.createdAt, Date.now() - 30 * 86400_000)).run()
    }
    catch (err) {
      log('error', 'Cleanup failed', { error: String(err) })
    }
  }
  hourly()
  timers.push(setInterval(hourly, 3600_000))
  for (const t of timers) t.unref()
  nitro.hooks.hook('close', () => timers.forEach(clearInterval))
})

/** Logs screens that went offline or came back, and sends e-mail alerts when SMTP is configured. */
function checkOffline() {
  const db = useDb()
  const cutoff = Date.now() - useConfig().offlineAfterS * 1000
  const gone = db.select().from(schema.screens)
    .where(and(isNotNull(schema.screens.lastSeenAt), lt(schema.screens.lastSeenAt, cutoff), eq(schema.screens.offlineNotified, false)))
    .all()
  if (!gone.length) return
  for (const s of gone) {
    db.update(schema.screens).set({ offlineNotified: true }).where(eq(schema.screens.id, s.id)).run()
    logEvent(s.id, 'warn', `Screen "${s.name}" is offline`)
  }
  if (mailEnabled()) {
    const names = gone.map(s => `- ${s.name}${s.location ? ` (${s.location})` : ''}, last seen ${new Date(s.lastSeenAt!).toISOString()}`)
    void sendMail(adminEmails(), `[${getSettings().brandName}] ${gone.length} screen(s) offline`,
      `These screens stopped sending heartbeats:\n\n${names.join('\n')}\n\n${useConfig().publicUrl}/`)
  }
}
