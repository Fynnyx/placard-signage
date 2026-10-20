import { asc, eq, inArray, or } from 'drizzle-orm'
import type { ItemType } from '../db/schema'

export interface ScheduleAssignment {
  id: number
  screenId: number | null
  groupId: number | null
  playlistId: number
  weekdays: number
  timeFrom: string | null
  timeTo: string | null
  priority: number
}

export interface LocalTime {
  /** 0 = Monday … 6 = Sunday */
  weekday: number
  /** Minutes since local midnight. */
  minutes: number
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

/** Weekday and time of day of `date` in an IANA time zone. */
export function localTime(date: Date, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return { weekday: WEEKDAY_INDEX[get('weekday')] ?? 0, minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

export function parseHHMM(v: string | null | undefined): number | null {
  if (!v) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null
  return h * 60 + min
}

const hasDay = (mask: number, weekday: number) => (mask & (1 << weekday)) !== 0

/**
 * Whether an assignment's weekly window contains `t`.
 * A window whose end is before its start runs overnight; its weekdays refer to the day it starts.
 */
export function windowMatches(a: Pick<ScheduleAssignment, 'weekdays' | 'timeFrom' | 'timeTo'>, t: LocalTime) {
  const from = parseHHMM(a.timeFrom) ?? 0
  const to = parseHHMM(a.timeTo) ?? 24 * 60
  if (from === to) return hasDay(a.weekdays, t.weekday) // whole day
  if (from < to) return hasDay(a.weekdays, t.weekday) && t.minutes >= from && t.minutes < to
  const yesterday = (t.weekday + 6) % 7
  return (hasDay(a.weekdays, t.weekday) && t.minutes >= from) || (hasDay(a.weekdays, yesterday) && t.minutes < to)
}

/**
 * Picks the assignment for a screen: among matching ones the highest priority wins;
 * on equal priority a screen assignment beats a group assignment, then the newest one wins.
 */
export function pickAssignment<T extends ScheduleAssignment>(
  list: T[], screen: { id: number, groupId: number | null }, t: LocalTime,
): T | undefined {
  return list
    .filter(a => (a.screenId !== null && a.screenId === screen.id) || (a.groupId !== null && a.groupId === screen.groupId))
    .filter(a => windowMatches(a, t))
    .sort((a, b) => (b.priority - a.priority) || ((b.screenId ? 1 : 0) - (a.screenId ? 1 : 0)) || (b.id - a.id))[0]
}

/** Replaces {screen.id}, {screen.name} and {screen.group} (URL-encoded) in a URL. */
export function fillPlaceholders(url: string, screen: { id: number, name: string, groupName: string | null }) {
  return url
    .replaceAll('{screen.id}', encodeURIComponent(String(screen.id)))
    .replaceAll('{screen.name}', encodeURIComponent(screen.name))
    .replaceAll('{screen.group}', encodeURIComponent(screen.groupName ?? ''))
}

export interface ResolvedItem {
  id: number
  type: ItemType
  title: string
  src: string
  duration: number
  reloadEachTime: boolean
}

export interface ResolvedPlaylist {
  playlistId: number | null
  name: string | null
  source: 'assignment' | 'default' | 'none'
  assignmentId: number | null
  items: ResolvedItem[]
}

/** The playlist a screen should show at `now`, with URLs filled in and signed. */
export function resolvePlaylistForScreen(screen: { id: number, name: string, groupId: number | null }, now = new Date()): ResolvedPlaylist {
  const db = useDb()
  const s = getSettings()
  const conds = [eq(schema.assignments.screenId, screen.id)]
  if (screen.groupId) conds.push(eq(schema.assignments.groupId, screen.groupId))
  const list = db.select().from(schema.assignments).where(or(...conds)).all()
  const picked = pickAssignment(list, screen, localTime(now, s.timezone))

  let playlistId: number | null = picked?.playlistId ?? null
  let source: ResolvedPlaylist['source'] = picked ? 'assignment' : 'none'
  if (!playlistId && s.defaultPlaylistId) {
    playlistId = s.defaultPlaylistId
    source = 'default'
  }
  const playlist = playlistId
    ? db.select().from(schema.playlists).where(eq(schema.playlists.id, playlistId)).get()
    : undefined
  if (!playlist) return { playlistId: null, name: null, source: 'none', assignmentId: null, items: [] }

  const groupName = screen.groupId
    ? db.select({ name: schema.screenGroups.name }).from(schema.screenGroups).where(eq(schema.screenGroups.id, screen.groupId)).get()?.name ?? null
    : null
  const rows = db.select().from(schema.playlistItems)
    .where(eq(schema.playlistItems.playlistId, playlist.id))
    .orderBy(asc(schema.playlistItems.position), asc(schema.playlistItems.id)).all()

  let secret: string | undefined
  const items: ResolvedItem[] = []
  for (const r of rows) {
    if (!r.enabled) continue
    let src = r.source
    if (r.type === 'url') {
      src = fillPlaceholders(src, { id: screen.id, name: screen.name, groupName })
      if (r.signUrl) {
        try {
          secret ??= getSigningSecret()
          src = signUrl(src, screen.id, secret, now.getTime())
        }
        catch { /* invalid URL: leave unsigned */ }
      }
    }
    items.push({ id: r.id, type: r.type, title: r.title, src, duration: r.durationS, reloadEachTime: r.reloadEachTime })
  }
  return { playlistId: playlist.id, name: playlist.name, source, assignmentId: picked?.id ?? null, items }
}

/** Which playlist each screen currently resolves to (for the admin screens list). */
export function playlistNames(ids: number[]) {
  if (!ids.length) return new Map<number, string>()
  const rows = useDb().select({ id: schema.playlists.id, name: schema.playlists.name })
    .from(schema.playlists).where(inArray(schema.playlists.id, ids)).all()
  return new Map(rows.map(r => [r.id, r.name]))
}
