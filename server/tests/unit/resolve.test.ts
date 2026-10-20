import { describe, expect, it } from 'vitest'
import { fillPlaceholders, localTime, parseHHMM, pickAssignment, windowMatches, type ScheduleAssignment } from '../../server/utils/resolve'

const MON = 1, TUE = 2, WED = 4, SAT = 32, SUN = 64, ALL = 127

function a(p: Partial<ScheduleAssignment> & { id: number }): ScheduleAssignment {
  return { screenId: null, groupId: null, playlistId: p.id * 10, weekdays: ALL, timeFrom: null, timeTo: null, priority: 0, ...p }
}

describe('localTime', () => {
  it('converts to the configured time zone', () => {
    // 2026-10-20 is a Tuesday. 23:30 UTC is already Wednesday 01:30 in Berlin (CEST, UTC+2).
    const d = new Date('2026-10-20T23:30:00Z')
    expect(localTime(d, 'UTC')).toEqual({ weekday: 1, minutes: 23 * 60 + 30 })
    expect(localTime(d, 'Europe/Berlin')).toEqual({ weekday: 2, minutes: 90 })
    expect(localTime(d, 'America/New_York')).toEqual({ weekday: 1, minutes: 19 * 60 + 30 })
  })

  it('handles the DST switch', () => {
    // Europe/Berlin leaves summer time on 2026-10-25 at 03:00 CEST -> 02:00 CET.
    expect(localTime(new Date('2026-10-25T00:30:00Z'), 'Europe/Berlin').minutes).toBe(2 * 60 + 30)
    expect(localTime(new Date('2026-10-25T01:30:00Z'), 'Europe/Berlin').minutes).toBe(2 * 60 + 30)
    expect(localTime(new Date('2026-10-25T02:30:00Z'), 'Europe/Berlin').minutes).toBe(3 * 60 + 30)
  })
})

describe('parseHHMM', () => {
  it('parses valid times', () => {
    expect(parseHHMM('00:00')).toBe(0)
    expect(parseHHMM('7:05')).toBe(425)
    expect(parseHHMM('24:00')).toBe(1440)
    expect(parseHHMM(null)).toBeNull()
    expect(parseHHMM('25:00')).toBeNull()
    expect(parseHHMM('12:60')).toBeNull()
  })
})

describe('windowMatches', () => {
  const tue = (h: number, m = 0) => ({ weekday: 1, minutes: h * 60 + m })
  it('matches whole days', () => {
    expect(windowMatches({ weekdays: TUE, timeFrom: null, timeTo: null }, tue(0))).toBe(true)
    expect(windowMatches({ weekdays: MON, timeFrom: null, timeTo: null }, tue(12))).toBe(false)
  })
  it('includes the start and excludes the end', () => {
    const w = { weekdays: ALL, timeFrom: '08:00', timeTo: '12:00' }
    expect(windowMatches(w, tue(7, 59))).toBe(false)
    expect(windowMatches(w, tue(8))).toBe(true)
    expect(windowMatches(w, tue(11, 59))).toBe(true)
    expect(windowMatches(w, tue(12))).toBe(false)
  })
  it('treats an open end as end of day', () => {
    expect(windowMatches({ weekdays: ALL, timeFrom: '18:00', timeTo: null }, tue(23, 59))).toBe(true)
    expect(windowMatches({ weekdays: ALL, timeFrom: null, timeTo: '06:00' }, tue(5))).toBe(true)
  })
  it('runs overnight windows into the next day', () => {
    // Monday 22:00 – 06:00: matches Monday night and Tuesday morning, not Tuesday night.
    const w = { weekdays: MON, timeFrom: '22:00', timeTo: '06:00' }
    expect(windowMatches(w, { weekday: 0, minutes: 23 * 60 })).toBe(true)
    expect(windowMatches(w, tue(5))).toBe(true)
    expect(windowMatches(w, tue(6))).toBe(false)
    expect(windowMatches(w, tue(23))).toBe(false)
  })
  it('wraps Sunday night into Monday', () => {
    const w = { weekdays: SUN, timeFrom: '20:00', timeTo: '02:00' }
    expect(windowMatches(w, { weekday: 0, minutes: 60 })).toBe(true)
  })
})

describe('pickAssignment', () => {
  const screen = { id: 1, groupId: 7 }
  const now = { weekday: 1, minutes: 10 * 60 } // Tuesday 10:00

  it('ignores other screens and groups', () => {
    expect(pickAssignment([a({ id: 1, screenId: 2 }), a({ id: 2, groupId: 8 })], screen, now)).toBeUndefined()
  })

  it('prefers the highest priority, even from a group', () => {
    const list = [a({ id: 1, screenId: 1, priority: 0 }), a({ id: 2, groupId: 7, priority: 5 })]
    expect(pickAssignment(list, screen, now)?.id).toBe(2)
  })

  it('prefers the screen over the group on equal priority', () => {
    const list = [a({ id: 1, groupId: 7 }), a({ id: 2, screenId: 1 }), a({ id: 3, groupId: 7 })]
    expect(pickAssignment(list, screen, now)?.id).toBe(2)
  })

  it('uses the newest entry as last tie-breaker', () => {
    expect(pickAssignment([a({ id: 4, groupId: 7 }), a({ id: 9, groupId: 7 })], screen, now)?.id).toBe(9)
  })

  it('only considers matching time windows', () => {
    const list = [
      a({ id: 1, groupId: 7, priority: 10, timeFrom: '18:00', timeTo: '22:00' }),
      a({ id: 2, groupId: 7, weekdays: SAT }),
      a({ id: 3, groupId: 7, weekdays: TUE | WED, timeFrom: '09:00', timeTo: '11:00' }),
    ]
    expect(pickAssignment(list, screen, now)?.id).toBe(3)
    expect(pickAssignment(list, screen, { weekday: 1, minutes: 19 * 60 })?.id).toBe(1)
    expect(pickAssignment(list, screen, { weekday: 1, minutes: 12 * 60 })).toBeUndefined()
  })

  it('handles screens without a group', () => {
    expect(pickAssignment([a({ id: 1, groupId: 7 })], { id: 1, groupId: null }, now)).toBeUndefined()
  })
})

describe('fillPlaceholders', () => {
  it('replaces and encodes screen values', () => {
    expect(fillPlaceholders('https://x.org/{screen.id}?n={screen.name}&g={screen.group}', { id: 5, name: 'Foyer & Bar', groupName: null }))
      .toBe('https://x.org/5?n=Foyer%20%26%20Bar&g=')
  })
})
