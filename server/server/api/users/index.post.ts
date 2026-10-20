import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Users'], summary: 'Invite a user (admin)', description: 'Returns an invitation link. With SMTP configured it is also sent by e-mail. OIDC users can log in with the same e-mail without accepting the invitation.' } })

const Body = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(200).default(''),
  role: z.enum(ROLES).default('viewer'),
})

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')
  const body = await parseBody(event, Body)
  const db = useDb()
  if (db.select().from(schema.users).where(eq(schema.users.email, body.email)).get()) {
    throw createError({ statusCode: 409, statusMessage: 'A user with this e-mail already exists' })
  }
  const user = db.insert(schema.users).values(body).returning().get()
  const inviteUrl = createInvite(user.id)
  if (mailEnabled()) {
    await sendMail([user.email], `You are invited to ${getSettings().brandName}`,
      `Hello${user.name ? ' ' + user.name : ''},\n\nyou have been invited to manage the screens at ${useConfig().publicUrl}.\nSet your password here (valid for 7 days):\n\n${inviteUrl}\n`)
  }
  return { user: publicUser(user), inviteUrl }
})
