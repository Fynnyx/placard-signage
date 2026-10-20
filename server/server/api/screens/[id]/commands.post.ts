import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Screens'], summary: 'Queue a remote command; it is delivered with the next heartbeat' } })

const Body = z.object({ type: z.enum(COMMAND_TYPES) })

export default defineEventHandler(async (event) => {
  const auth = requireRole(event, 'editor')
  const id = idParam(event)
  const { type } = await parseBody(event, Body)
  if (type === 'reboot' && !hasRole(auth.user.role, 'admin')) {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can reboot screens' })
  }
  const db = useDb()
  const screen = db.select().from(schema.screens).where(eq(schema.screens.id, id)).get() ?? notFound('Screen not found')
  if (type !== 'reload' && !hasActiveAgent(screen)) {
    throw createError({ statusCode: 409, statusMessage: 'This screen has no running agent; only reload is possible' })
  }
  const cmd = db.insert(schema.commands).values({ screenId: id, type, createdBy: auth.user.id }).returning().get()
  logEvent(id, 'info', `${auth.user.email || auth.user.name} sent ${type}`, 'command')
  return cmd
})
