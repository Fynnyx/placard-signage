import { eq } from 'drizzle-orm'

export interface AppSettings {
  timezone: string
  defaultPlaylistId: number | null
  brandName: string
  accentColor: string
  logoUrl: string | null
  setupDone: boolean
}

const DEFAULTS: AppSettings = {
  timezone: process.env.TZ || 'UTC',
  defaultPlaylistId: null,
  brandName: 'Placard Signage',
  accentColor: '#2563eb',
  logoUrl: null,
  setupDone: false,
}

export function getSetting(key: string): string | undefined {
  const row = useDb().select().from(schema.settings).where(eq(schema.settings.key, key)).get()
  return row?.value
}

export function setSetting(key: string, value: string | null) {
  const db = useDb()
  if (value === null) {
    db.delete(schema.settings).where(eq(schema.settings.key, key)).run()
    return
  }
  db.insert(schema.settings).values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } }).run()
}

export function getSettings(): AppSettings {
  const rows = useDb().select().from(schema.settings).all()
  const out: AppSettings = { ...DEFAULTS }
  for (const { key, value } of rows) {
    if (!(key in DEFAULTS)) continue
    try {
      (out as any)[key] = JSON.parse(value)
    }
    catch { /* ignore malformed values */ }
  }
  return out
}

export function updateSettings(patch: Partial<AppSettings>) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULTS) || value === undefined) continue
    setSetting(key, JSON.stringify(value))
  }
}

/** URL_SIGNING_SECRET from the environment, or a generated one kept in the database. */
export function getSigningSecret(): string {
  const fromEnv = useConfig().urlSigningSecret
  if (fromEnv) return fromEnv
  let secret = getSetting('url_signing_secret')
  if (!secret) {
    secret = randomToken(32)
    setSetting('url_signing_secret', secret)
  }
  return secret
}
