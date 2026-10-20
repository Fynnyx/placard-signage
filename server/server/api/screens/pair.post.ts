import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Screens'], summary: 'Claim a pairing code shown on a new screen (admin)' } })

const Body = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'expected 6 digits'),
  name: z.string().trim().min(1).max(200),
  location: z.string().trim().max(200).default(''),
  groupId: z.number().int().positive().nullable().default(null),
})

export default defineEventHandler(async (event) => {
  const auth = requireRole(event, 'admin')
  enforceRateLimit(event, 'claim', 20, 10 * 60_000)
  const body = await parseBody(event, Body)
  const db = useDb()
  const row = db.select().from(schema.pairingCodes).where(eq(schema.pairingCodes.code, body.code)).get()
  if (!row || row.expiresAt < Date.now() || row.claimedScreenId) {
    throw createError({ statusCode: 404, statusMessage: 'Code not found or expired. Check the code on the screen.' })
  }
  const token = randomToken(32)
  const screen = db.transaction((tx) => {
    const s = tx.insert(schema.screens).values({
      name: body.name, location: body.location, groupId: body.groupId, tokenHash: sha256(token),
    }).returning().get()
    tx.update(schema.pairingCodes).set({ claimedScreenId: s.id, pendingToken: token }).where(eq(schema.pairingCodes.code, body.code)).run()
    return s
  })
  logEvent(screen.id, 'info', `Screen "${screen.name}" paired by ${auth.user.email}`)
  return { id: screen.id, name: screen.name }
})
