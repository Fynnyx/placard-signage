import { and, eq, isNull, or, lt, gt } from 'drizzle-orm'

defineRouteMeta({ openAPI: { tags: ['Device'], summary: 'Report status; the response lists pending commands' } })

const Body = z.object({
  source: z.enum(['agent', 'player']).default('agent'),
  browserVersion: z.string().max(200).optional(),
  agentVersion: z.string().max(50).optional(),
  resolution: z.string().max(50).optional(),
  displayOn: z.boolean().optional(),
  currentUrl: z.string().max(2000).optional(),
  currentItem: z.string().max(500).optional(),
  ip: z.string().max(100).optional(),
  uptimeS: z.number().optional(),
  cpuTempC: z.number().optional(),
  diskFreeMb: z.number().optional(),
  memFreeMb: z.number().optional(),
  hostname: z.string().max(200).optional(),
}).passthrough()

/** Commands not acknowledged within this time are delivered again. */
const REDELIVER_MS = 90_000

export default defineEventHandler(async (event) => {
  const screen = requireDevice(event)
  const body = await parseBody(event, Body)
  const db = useDb()
  const now = Date.now()
  const fromAgent = body.source === 'agent'

  const status = { ...(screen.status ?? {}) } as Record<string, unknown>
  for (const k of ['uptimeS', 'cpuTempC', 'diskFreeMb', 'memFreeMb', 'hostname', 'ip'] as const) {
    if (body[k] !== undefined) status[k] = body[k]
  }
  if (!fromAgent) status.playerSeenAt = now

  const wasOffline = screen.offlineNotified
  db.update(schema.screens).set({
    lastSeenAt: now,
    lastIp: getClientIp(event),
    offlineNotified: false,
    status,
    ...(fromAgent ? { agentSeenAt: now } : {}),
    // The agent's view of the browser wins over the player's own when both report.
    ...(body.browserVersion && (fromAgent || !hasActiveAgent(screen, now)) ? { browserVersion: body.browserVersion } : {}),
    ...(body.agentVersion ? { agentVersion: body.agentVersion } : {}),
    ...(body.resolution ? { resolution: body.resolution } : {}),
    ...(body.displayOn !== undefined ? { displayOn: body.displayOn } : {}),
    ...(body.currentUrl ? { currentUrl: body.currentUrl } : {}),
    ...(body.currentItem !== undefined ? { currentItem: body.currentItem } : {}),
  }).where(eq(schema.screens.id, screen.id)).run()
  if (wasOffline) logEvent(screen.id, 'info', `Screen "${screen.name}" is back online`)

  // Screens with an agent get commands through the agent; plain browsers get the ones they can run.
  const agentActive = fromAgent || hasActiveAgent(screen, now)
  let cmds: { id: number, type: CommandType }[] = []
  if (fromAgent || !agentActive) {
    const types = fromAgent ? [...COMMAND_TYPES] : ['reload'] as CommandType[]
    cmds = db.select({ id: schema.commands.id, type: schema.commands.type }).from(schema.commands)
      .where(and(
        eq(schema.commands.screenId, screen.id),
        isNull(schema.commands.ackedAt),
        gt(schema.commands.createdAt, now - 15 * 60_000),
        or(isNull(schema.commands.deliveredAt), lt(schema.commands.deliveredAt, now - REDELIVER_MS)),
      ))
      .all().filter(c => types.includes(c.type))
    for (const c of cmds) db.update(schema.commands).set({ deliveredAt: now }).where(eq(schema.commands.id, c.id)).run()
  }

  const response: Record<string, unknown> = {
    commands: cmds,
    heartbeatInterval: 30,
    screen: { id: screen.id, name: screen.name },
    nightlyReboot: screen.nightlyReboot,
    timezone: getSettings().timezone,
  }
  if (fromAgent) {
    const agent = getAgentInfo()
    if (agent) response.agent = { version: agent.version, url: `${useConfig().publicUrl}/agent/placard_agent.py`, sha256: agent.sha256 }
  }
  return response
})
