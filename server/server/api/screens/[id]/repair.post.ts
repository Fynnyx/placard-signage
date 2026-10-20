import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Screens'], summary: 'Move an existing screen to a new device: claims a pairing code for it and revokes the old token (admin)' } })

const Body = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'expected 6 digits') })

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')
  const id = idParam(event)
  const { code } = await parseBody(event, Body)
  const db = useDb()
  const screen = db.select().from(schema.screens).where(eq(schema.screens.id, id)).get() ?? notFound('Screen not found')
  const row = db.select().from(schema.pairingCodes).where(eq(schema.pairingCodes.code, code)).get()
  if (!row || row.expiresAt < Date.now() || row.claimedScreenId) {
    throw createError({ statusCode: 404, statusMessage: 'Code not found or expired' })
  }
  const token = randomToken(32)
  db.transaction((tx) => {
    tx.update(schema.screens).set({ tokenHash: sha256(token), agentSeenAt: null }).where(eq(schema.screens.id, id)).run()
    tx.update(schema.pairingCodes).set({ claimedScreenId: id, pendingToken: token }).where(eq(schema.pairingCodes.code, code)).run()
  })
  logEvent(id, 'info', `Screen "${screen.name}" re-paired; the old token is revoked`)
  return { ok: true }
})
