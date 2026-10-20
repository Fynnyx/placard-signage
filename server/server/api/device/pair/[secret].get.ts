import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Device'], summary: 'Poll pairing status; returns the device token once an admin claimed the code' } })

export default defineEventHandler((event) => {
  enforceRateLimit(event, 'pair-poll', 120, 60_000)
  const secret = getRouterParam(event, 'secret') || ''
  const db = useDb()
  const row = db.select().from(schema.pairingCodes).where(eq(schema.pairingCodes.deviceSecretHash, sha256(secret))).get()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Unknown pairing request' })
  if (row.claimedScreenId && row.pendingToken) {
    // Hand out the token exactly once.
    db.delete(schema.pairingCodes).where(eq(schema.pairingCodes.code, row.code)).run()
    const screen = db.select().from(schema.screens).where(eq(schema.screens.id, row.claimedScreenId)).get()
    return { status: 'paired', token: row.pendingToken, screen: { id: screen?.id, name: screen?.name } }
  }
  if (row.expiresAt < Date.now()) {
    db.delete(schema.pairingCodes).where(eq(schema.pairingCodes.code, row.code)).run()
    return { status: 'expired' }
  }
  return { status: 'pending', code: row.code, expiresAt: row.expiresAt }
})
