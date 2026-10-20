import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Device'], summary: 'Start pairing: returns a 6-digit code and a device secret' } })

const CODE_TTL_MS = 10 * 60_000

export default defineEventHandler((event) => {
  enforceRateLimit(event, 'pair', 10, 10 * 60_000)
  const db = useDb()
  const secret = randomToken(32)
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomDigits(6)
    const existing = db.select().from(schema.pairingCodes).where(eq(schema.pairingCodes.code, code)).get()
    if (existing && existing.expiresAt > Date.now() - 3600_000) continue
    if (existing) db.delete(schema.pairingCodes).where(eq(schema.pairingCodes.code, code)).run()
    const expiresAt = Date.now() + CODE_TTL_MS
    db.insert(schema.pairingCodes).values({ code, deviceSecretHash: sha256(secret), expiresAt, ip: getClientIp(event) }).run()
    return { code, secret, expiresAt, pollInterval: 3 }
  }
  throw createError({ statusCode: 503, statusMessage: 'No free pairing code, try again' })
})
