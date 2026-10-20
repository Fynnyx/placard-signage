defineRouteMeta({ openAPI: { tags: ['Auth'], summary: 'Create the first admin (only before any user exists)' } })

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(200).default(''),
  password: z.string(),
  timezone: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  if (!setupRequired()) throw createError({ statusCode: 409, statusMessage: 'Setup is already done' })
  enforceRateLimit(event, 'setup', 10, 15 * 60_000)
  const body = await parseBody(event, Body)
  const passwordHash = await hashPassword(validatePassword(body.password))
  const db = useDb()
  const user = db.transaction((tx) => {
    if (tx.select({ id: schema.users.id }).from(schema.users).limit(1).get()) {
      throw createError({ statusCode: 409, statusMessage: 'Setup is already done' })
    }
    return tx.insert(schema.users).values({ email: body.email, name: body.name, role: 'admin', passwordHash }).returning().get()
  })
  const patch: Partial<AppSettings> = { setupDone: true }
  if (body.timezone && isValidTimezone(body.timezone)) patch.timezone = body.timezone
  updateSettings(patch)
  createUserSession(event, user.id)
  log('info', 'Setup finished, first admin created', { email: body.email })
  return { ok: true }
})
