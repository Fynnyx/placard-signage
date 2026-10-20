import { eq } from 'drizzle-orm'
import { z } from 'zod'

export const AssignmentInput = z.object({
  screenId: z.number().int().positive().nullable().default(null),
  groupId: z.number().int().positive().nullable().default(null),
  playlistId: z.number().int().positive(),
  weekdays: z.number().int().min(1).max(127).default(127),
  timeFrom: hhmm.nullable().default(null),
  timeTo: hhmm.nullable().default(null),
  priority: z.number().int().min(-1000).max(1000).default(0),
}).refine(a => (a.screenId === null) !== (a.groupId === null), { message: 'set either screenId or groupId', path: ['screenId'] })

export function checkAssignmentRefs(a: z.infer<typeof AssignmentInput>) {
  const db = useDb()
  if (!db.select().from(schema.playlists).where(eq(schema.playlists.id, a.playlistId)).get()) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown playlist' })
  }
  if (a.screenId && !db.select().from(schema.screens).where(eq(schema.screens.id, a.screenId)).get()) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown screen' })
  }
  if (a.groupId && !db.select().from(schema.screenGroups).where(eq(schema.screenGroups.id, a.groupId)).get()) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown group' })
  }
}
