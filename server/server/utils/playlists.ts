import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

export const PlaylistItemInput = z.object({
  type: z.enum(ITEM_TYPES),
  title: z.string().max(200).default(''),
  source: z.string().trim().min(1).max(4000),
  durationS: z.number().int().min(0).max(86400).default(10),
  reloadEachTime: z.boolean().default(false),
  signUrl: z.boolean().default(false),
  enabled: z.boolean().default(true),
}).superRefine((item, ctx) => {
  if (item.type === 'url') {
    const raw = item.source.replace(/\{screen\.(id|name|group)\}/g, 'x')
    let ok = false
    try {
      ok = ['http:', 'https:'].includes(new URL(raw).protocol)
    }
    catch { /* not a URL */ }
    if (!ok) ctx.addIssue({ code: 'custom', path: ['source'], message: 'must be an http(s) URL' })
  }
  else if (!item.source.startsWith('/media/') && !/^https?:\/\//.test(item.source)) {
    ctx.addIssue({ code: 'custom', path: ['source'], message: 'must be an uploaded file or an http(s) URL' })
  }
  if (item.type !== 'video' && item.durationS < 1) {
    ctx.addIssue({ code: 'custom', path: ['durationS'], message: 'must be at least 1 second' })
  }
})
export type PlaylistItemInput = z.infer<typeof PlaylistItemInput>

export function replacePlaylistItems(playlistId: number, items: PlaylistItemInput[]) {
  const db = useDb()
  db.transaction((tx) => {
    tx.delete(schema.playlistItems).where(eq(schema.playlistItems.playlistId, playlistId)).run()
    items.forEach((item, position) => {
      tx.insert(schema.playlistItems).values({ ...item, playlistId, position }).run()
    })
  })
}

export function getPlaylistWithItems(id: number) {
  const db = useDb()
  const p = db.select().from(schema.playlists).where(eq(schema.playlists.id, id)).get()
  if (!p) return undefined
  const items = db.select().from(schema.playlistItems).where(eq(schema.playlistItems.playlistId, id))
    .orderBy(asc(schema.playlistItems.position), asc(schema.playlistItems.id)).all()
  return { ...p, isDefault: getSettings().defaultPlaylistId === id, items }
}

/** Fetches a page and reports headers that forbid framing it. */
export async function checkFraming(url: string) {
  const warnings: string[] = []
  const target = url.replace(/\{screen\.(id|name|group)\}/g, '1')
  let res: Response
  try {
    res = await fetch(target, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'PlacardSignage/1 (frame check)' } })
    res.body?.cancel().catch(() => {})
  }
  catch (err) {
    return { ok: false, reachable: false, status: null, warnings: [`Could not load the page: ${(err as Error).message}`] }
  }
  const publicOrigin = new URL(useConfig().publicUrl).origin
  const sameOrigin = new URL(res.url || target).origin === publicOrigin
  const xfo = res.headers.get('x-frame-options')?.toLowerCase()
  if (xfo && (xfo.includes('deny') || (xfo.includes('sameorigin') && !sameOrigin))) {
    warnings.push(`The page sends "X-Frame-Options: ${xfo}" and cannot be shown in the player.`)
  }
  const csp = res.headers.get('content-security-policy') || ''
  const fa = /frame-ancestors([^;]*)/i.exec(csp)?.[1]?.trim()
  if (fa !== undefined) {
    const sources = fa.split(/\s+/).filter(Boolean)
    const allowed = sources.some(s => s === '*' || s === publicOrigin || s === publicOrigin + '/'
      || (s.startsWith('https://*.') && new URL(publicOrigin).host.endsWith(s.slice(9)))
      || (s === "'self'" && sameOrigin))
    if (!allowed) warnings.push(`The page's Content-Security-Policy "frame-ancestors ${fa}" does not allow ${publicOrigin}.`)
  }
  if (!res.ok) warnings.push(`The page answered with HTTP ${res.status}.`)
  return { ok: warnings.length === 0, reachable: true, status: res.status, warnings }
}
