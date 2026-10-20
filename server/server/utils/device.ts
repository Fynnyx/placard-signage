import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'

export type Screen = typeof schema.screens.$inferSelect

/** Authenticates a screen by its bearer token. */
export function requireDevice(event: H3Event): Screen {
  const header = getHeader(event, 'authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Missing device token' })
  const screen = useDb().select().from(schema.screens).where(eq(schema.screens.tokenHash, sha256(token))).get()
  if (!screen) throw createError({ statusCode: 401, statusMessage: 'Unknown device token' })
  return screen
}

export function isOnline(screen: Pick<Screen, 'lastSeenAt'>, now = Date.now()) {
  return !!screen.lastSeenAt && now - screen.lastSeenAt < useConfig().offlineAfterS * 1000
}

/** A screen has an agent when the agent sent a heartbeat recently; it then receives the commands. */
export function hasActiveAgent(screen: Pick<Screen, 'agentSeenAt'>, now = Date.now()) {
  return !!screen.agentSeenAt && now - screen.agentSeenAt < Math.max(useConfig().offlineAfterS, 90) * 1000
}

export function screenDto(s: Screen, groupName: string | null, resolved?: ResolvedPlaylist) {
  return {
    id: s.id,
    name: s.name,
    location: s.location,
    groupId: s.groupId,
    groupName,
    online: isOnline(s),
    hasAgent: hasActiveAgent(s),
    lastSeenAt: s.lastSeenAt,
    lastIp: s.lastIp,
    browserVersion: s.browserVersion,
    agentVersion: s.agentVersion,
    resolution: s.resolution,
    displayOn: s.displayOn,
    lastError: s.lastError,
    lastErrorAt: s.lastErrorAt,
    currentUrl: s.currentUrl,
    currentItem: s.currentItem,
    status: s.status ?? {},
    screenshotAt: s.screenshotAt,
    nightlyReboot: s.nightlyReboot,
    createdAt: s.createdAt,
    playlist: resolved ? { id: resolved.playlistId, name: resolved.name, source: resolved.source } : undefined,
  }
}
