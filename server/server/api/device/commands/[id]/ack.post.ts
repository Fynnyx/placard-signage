import { and, eq } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Device'], summary: 'Acknowledge a command with its result' } })

const Body = z.object({ success: z.boolean().default(true), result: z.string().max(4000).default('') })

export default defineEventHandler(async (event) => {
  const screen = requireDevice(event)
  const id = idParam(event)
  const body = await parseBody(event, Body)
  const db = useDb()
  const cmd = db.select().from(schema.commands)
    .where(and(eq(schema.commands.id, id), eq(schema.commands.screenId, screen.id))).get() ?? notFound('Unknown command')
  if (cmd.ackedAt) return { ok: true }
  db.update(schema.commands).set({ ackedAt: Date.now(), success: body.success, result: body.result })
    .where(eq(schema.commands.id, id)).run()
  if (cmd.type === 'display_on' || cmd.type === 'display_off') {
    if (body.success) db.update(schema.screens).set({ displayOn: cmd.type === 'display_on' }).where(eq(schema.screens.id, screen.id)).run()
  }
  logEvent(screen.id, body.success ? 'info' : 'error',
    `Command ${cmd.type} ${body.success ? 'done' : 'failed'}${body.result ? `: ${body.result}` : ''}`, 'command')
  return { ok: true }
})
