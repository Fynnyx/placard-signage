import { eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Screens'], summary: 'Rename a screen, move it to a group, set its nightly reboot' } })

const Body = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().max(200).optional(),
  groupId: z.number().int().positive().nullable().optional(),
  nightlyReboot: hhmm.nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const auth = requireRole(event, 'editor')
  const id = idParam(event)
  const body = await parseBody(event, Body)
  if (body.nightlyReboot !== undefined && !hasRole(auth.user.role, 'admin')) {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can schedule reboots' })
  }
  const db = useDb()
  if (body.groupId && !db.select().from(schema.screenGroups).where(eq(schema.screenGroups.id, body.groupId)).get()) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown group' })
  }
  const s = db.update(schema.screens).set(body).where(eq(schema.screens.id, id)).returning().get() ?? notFound('Screen not found')
  return { id: s.id }
})
