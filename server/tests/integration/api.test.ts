import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client, device, startServer } from './server'

let server: Awaited<ReturnType<typeof startServer>>
let admin: Client

beforeAll(async () => {
  server = await startServer({ URL_SIGNING_SECRET: 'integration-secret' })
  admin = new Client(server.base)
})
afterAll(async () => {
  await server?.stop()
})

async function pairScreen(name: string, groupId: number | null = null) {
  const start = await fetch(`${server.base}/api/device/pair`, { method: 'POST' }).then(r => r.json())
  expect(start.code).toMatch(/^\d{6}$/)
  const claim = await admin.post('/api/screens/pair', { code: start.code, name, groupId })
  expect(claim.status).toBe(200)
  const res = await fetch(`${server.base}/api/device/pair/${start.secret}`).then(r => r.json())
  expect(res.status).toBe('paired')
  return { id: claim.body.id as number, token: res.token as string }
}

describe('phase 1: setup, roles, CSRF', () => {
  it('requires setup on a fresh server', async () => {
    const me = await admin.refreshCsrf()
    expect(me.setupRequired).toBe(true)
    expect(me.user).toBeNull()
    expect((await admin.get('/api/screens')).status).toBe(401)
  })

  it('creates the first admin through the wizard, only once', async () => {
    const short = await admin.post('/api/setup', { email: 'admin@example.org', name: 'Ada', password: 'short' })
    expect(short.status).toBe(400)
    const ok = await admin.post('/api/setup', { email: 'Admin@Example.org', name: 'Ada', password: 'correct horse battery', timezone: 'Europe/Berlin' })
    expect(ok.status).toBe(200)
    const me = await admin.refreshCsrf()
    expect(me.setupRequired).toBe(false)
    expect(me.user).toMatchObject({ email: 'admin@example.org', role: 'admin' })
    const again = await new Client(server.base).post('/api/setup', { email: 'x@example.org', password: 'correct horse battery' })
    expect(again.status).toBe(409)
  })

  it('rejects writes without the CSRF token or from another origin', async () => {
    const csrf = admin.csrf
    admin.csrf = ''
    expect((await admin.post('/api/groups', { name: 'x' })).status).toBe(403)
    admin.csrf = 'not-the-token'
    expect((await admin.post('/api/groups', { name: 'x' })).status).toBe(403)
    admin.csrf = csrf
    const crossSite = await admin.req('POST', '/api/groups', { name: 'x' }, { origin: 'https://evil.example' })
    expect(crossSite.status).toBe(403)
  })

  it('logs in and out with local accounts', async () => {
    const c = new Client(server.base)
    expect((await c.post('/api/auth/login', { email: 'admin@example.org', password: 'wrong password!' })).status).toBe(401)
    expect((await c.post('/api/auth/login', { email: 'ADMIN@example.org', password: 'correct horse battery' })).status).toBe(200)
    expect((await c.refreshCsrf()).user.email).toBe('admin@example.org')
    await c.post('/api/auth/logout')
    expect((await c.refreshCsrf()).user).toBeNull()
  })

  it('invites an editor who cannot manage users', async () => {
    const inv = await admin.post('/api/users', { email: 'ed@example.org', name: 'Ed', role: 'editor' })
    expect(inv.status).toBe(200)
    const token = inv.body.inviteUrl.split('/invite/')[1]
    const editor = new Client(server.base)
    expect((await editor.get(`/api/auth/invite/${token}`)).body.email).toBe('ed@example.org')
    expect((await editor.post(`/api/auth/invite/${token}`, { password: 'editor password 1' })).status).toBe(200)
    await editor.refreshCsrf()
    expect((await editor.get('/api/users')).status).toBe(403)
    expect((await editor.get('/api/screens')).status).toBe(200)
    expect((await editor.post('/api/groups', { name: 'Editors group' })).status).toBe(200)
    expect((await editor.patch('/api/settings', { brandName: 'Nope' })).status).toBe(403)
    // The invitation is single use.
    expect((await editor.get(`/api/auth/invite/${token}`)).status).toBe(404)
  })

  it('keeps at least one admin', async () => {
    const users = (await admin.get('/api/users')).body
    const me = users.find((u: any) => u.email === 'admin@example.org')
    expect((await admin.patch(`/api/users/${me.id}`, { role: 'viewer' })).status).toBe(400)
  })

  it('serves the editor-forbidden Users page as 403 in the UI', async () => {
    const editor = new Client(server.base)
    await editor.post('/api/auth/login', { email: 'ed@example.org', password: 'editor password 1' })
    const page = await editor.get('/users')
    expect(page.status).toBe(403)
    const adminPage = await admin.get('/users')
    expect(adminPage.status).toBe(200)
  })
})

describe('phase 2: pairing, playlist, heartbeat', () => {
  let screen: { id: number, token: string }
  let playlistId: number

  it('pairs a device with a code and hands out the token once', async () => {
    const start = await fetch(`${server.base}/api/device/pair`, { method: 'POST' }).then(r => r.json())
    const pending = await fetch(`${server.base}/api/device/pair/${start.secret}`).then(r => r.json())
    expect(pending.status).toBe('pending')
    expect((await admin.post('/api/screens/pair', { code: '000000', name: 'x' })).status).toBe(404)
    const claim = await admin.post('/api/screens/pair', { code: start.code, name: 'Entrance' })
    expect(claim.status).toBe(200)
    const done = await fetch(`${server.base}/api/device/pair/${start.secret}`).then(r => r.json())
    expect(done.status).toBe('paired')
    expect(done.token.length).toBeGreaterThan(40)
    expect((await fetch(`${server.base}/api/device/pair/${start.secret}`)).status).toBe(404)
    screen = { id: claim.body.id, token: done.token }
  })

  it('rejects unknown device tokens', async () => {
    expect((await device(server.base, 'nope').playlist()).status).toBe(401)
  })

  it('returns an empty playlist until something is assigned', async () => {
    const res = await device(server.base, screen.token).playlist()
    expect(res.status).toBe(200)
    expect((await res.json()).items).toEqual([])
  })

  it('serves the default playlist with an ETag', async () => {
    const created = await admin.post('/api/playlists', {
      name: 'Lobby',
      items: [
        { type: 'url', source: 'https://example.org/a?screen={screen.id}&n={screen.name}', durationS: 10 },
        { type: 'url', source: 'https://example.org/b', durationS: 15, reloadEachTime: true },
        { type: 'url', source: 'https://example.org/off', enabled: false },
      ],
    })
    expect(created.status).toBe(200)
    playlistId = created.body.id
    expect(created.body.isDefault).toBe(true) // first playlist becomes the default

    const d = device(server.base, screen.token)
    const res = await d.playlist()
    const etag = res.headers.get('etag')!
    const body = await res.json()
    expect(body.source).toBe('default')
    expect(body.items.map((i: any) => i.src)).toEqual([`https://example.org/a?screen=${screen.id}&n=Entrance`, 'https://example.org/b'])
    expect(body.items[1]).toMatchObject({ duration: 15, reloadEachTime: true })

    expect((await d.playlist(etag)).status).toBe(304)
    await admin.put(`/api/playlists/${playlistId}`, { items: [{ type: 'url', source: 'https://example.org/c', durationS: 5 }] })
    const changed = await d.playlist(etag)
    expect(changed.status).toBe(200)
    expect(changed.headers.get('etag')).not.toBe(etag)
  })

  it('validates playlist items', async () => {
    const bad = await admin.put(`/api/playlists/${playlistId}`, { items: [{ type: 'url', source: 'javascript:alert(1)' }] })
    expect(bad.status).toBe(400)
    const bad2 = await admin.put(`/api/playlists/${playlistId}`, { items: [{ type: 'image', source: '/etc/passwd' }] })
    expect(bad2.status).toBe(400)
  })

  it('records heartbeats and delivers commands to the agent', async () => {
    const d = device(server.base, screen.token)
    const hb = await d.heartbeat({ source: 'agent', agentVersion: '1.0.0', browserVersion: 'Chromium 140', ip: '10.0.0.5', uptimeS: 100 })
    expect(hb.commands).toEqual([])
    const list = (await admin.get('/api/screens')).body
    expect(list[0]).toMatchObject({ name: 'Entrance', online: true, hasAgent: true, browserVersion: 'Chromium 140' })

    const cmd = await admin.post(`/api/screens/${screen.id}/commands`, { type: 'reload' })
    expect(cmd.status).toBe(200)
    // The player does not get commands while an agent is active.
    expect((await d.heartbeat({ source: 'player' })).commands).toEqual([])
    const hb2 = await d.heartbeat({ source: 'agent' })
    expect(hb2.commands).toEqual([{ id: cmd.body.id, type: 'reload' }])
    // Not delivered twice in a row.
    expect((await d.heartbeat({ source: 'agent' })).commands).toEqual([])
    expect((await d.ack(cmd.body.id, { success: true, result: 'ok' })).status).toBe(200)
    const detail = (await admin.get(`/api/screens/${screen.id}`)).body
    expect(detail.commands[0]).toMatchObject({ type: 'reload', success: true })
  })

  it('lets only admins reboot', async () => {
    const editor = new Client(server.base)
    await editor.post('/api/auth/login', { email: 'ed@example.org', password: 'editor password 1' })
    await editor.refreshCsrf()
    expect((await editor.post(`/api/screens/${screen.id}/commands`, { type: 'reboot' })).status).toBe(403)
    expect((await admin.post(`/api/screens/${screen.id}/commands`, { type: 'reboot' })).status).toBe(200)
  })

  it('stores device errors as the last error', async () => {
    const d = device(server.base, screen.token)
    expect((await d.event({ level: 'error', message: 'TypeError: x is undefined' })).status).toBe(200)
    const s = (await admin.get(`/api/screens/${screen.id}`)).body
    expect(s.lastError).toBe('TypeError: x is undefined')
    const events = (await admin.get(`/api/events?screenId=${screen.id}&level=error`)).body
    expect(events.some((e: any) => e.message.includes('TypeError'))).toBe(true)
  })

  it('revokes the token when the screen is deleted', async () => {
    const tmp = await pairScreen('Temporary')
    expect((await device(server.base, tmp.token).playlist()).status).toBe(200)
    expect((await admin.del(`/api/screens/${tmp.id}`)).status).toBe(200)
    expect((await device(server.base, tmp.token).playlist()).status).toBe(401)
  })
})

describe('phase 4: groups, schedule, placeholders', () => {
  it('plays a group assignment only inside its time window', async () => {
    const group = (await admin.post('/api/groups', { name: 'Floor 2' })).body
    const s = await pairScreen('Kitchen', group.id)
    const special = (await admin.post('/api/playlists', { name: 'Lunch', items: [{ type: 'url', source: 'https://example.org/{screen.group}', durationS: 10 }] })).body

    // A window around the current time in the server's time zone (Europe/Berlin from setup).
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
    const [h, m] = parts.split(':').map(Number) as [number, number]
    const fmt = (min: number) => `${String(Math.floor(((min + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((min + 1440) % 1440) % 60).padStart(2, '0')}`
    const now = h * 60 + m
    const inside = (await admin.post('/api/assignments', { groupId: group.id, playlistId: special.id, timeFrom: fmt(now - 30), timeTo: fmt(now + 30) })).body
    let pl = await device(server.base, s.token).playlist().then(r => r.json())
    expect(pl).toMatchObject({ source: 'assignment', name: 'Lunch' })
    expect(pl.items[0].src).toBe('https://example.org/Floor%202')

    await admin.put(`/api/assignments/${inside.id}`, { groupId: group.id, playlistId: special.id, timeFrom: fmt(now + 60), timeTo: fmt(now + 120) })
    pl = await device(server.base, s.token).playlist().then(r => r.json())
    expect(pl.source).toBe('default')
  })

  it('rejects assignments with both or no target', async () => {
    expect((await admin.post('/api/assignments', { playlistId: 1 })).status).toBe(400)
    expect((await admin.post('/api/assignments', { playlistId: 1, screenId: 1, groupId: 1 })).status).toBe(400)
  })

  it('signs URLs for items marked sign_url', async () => {
    const s = await pairScreen('Signed')
    const p = (await admin.post('/api/playlists', { name: 'Signed', items: [{ type: 'url', source: 'https://intranet.example.org/menu', signUrl: true }] })).body
    await admin.post('/api/assignments', { screenId: s.id, playlistId: p.id })
    const pl = await device(server.base, s.token).playlist().then(r => r.json())
    const u = new URL(pl.items[0].src)
    const exp = u.searchParams.get('sx_exp')
    expect(u.searchParams.get('sx_screen')).toBe(String(s.id))
    expect(u.searchParams.get('sx_sig')).toBe(createHmac('sha256', 'integration-secret').update(`/menu\n${s.id}\n${exp}`).digest('hex'))
  })

  it('verifies with the Python and Node snippets from docs/', async () => {
    const s = await pairScreen('Snippets')
    const p = (await admin.post('/api/playlists', { name: 'Snippets', items: [{ type: 'url', source: 'https://intranet.example.org/a/b?x=1', signUrl: true }] })).body
    await admin.post('/api/assignments', { screenId: s.id, playlistId: p.id })
    const url = (await device(server.base, s.token).playlist().then(r => r.json())).items[0].src
    const examples = resolve(__dirname, '../../../docs/examples')
    expect(execFileSync('python3', [`${examples}/verify_signed_url.py`, url, 'integration-secret']).toString()).toContain(`valid for screen ${s.id}`)
    expect(execFileSync(process.execPath, [`${examples}/verify-signed-url.mjs`, url, 'integration-secret']).toString()).toContain(`valid for screen ${s.id}`)
    expect(() => execFileSync('python3', [`${examples}/verify_signed_url.py`, url, 'wrong-secret'], { stdio: 'pipe' })).toThrow()
    expect(() => execFileSync(process.execPath, [`${examples}/verify-signed-url.mjs`, url.replace('/a/b', '/a/c'), 'integration-secret'], { stdio: 'pipe' })).toThrow()
  })
})

describe('media', () => {
  it('uploads an image and serves it with range support', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')
    const fd = new FormData()
    fd.append('file', new Blob([png], { type: 'image/png' }), 'dot.png')
    const up = await admin.req('POST', '/api/media', fd)
    expect(up.status).toBe(200)
    expect(up.body[0]).toMatchObject({ originalName: 'dot.png', mime: 'image/png', kind: 'image', size: png.length })
    const file = await fetch(server.base + up.body[0].url)
    expect(Buffer.from(await file.arrayBuffer())).toEqual(png)
    const part = await fetch(server.base + up.body[0].url, { headers: { range: 'bytes=0-3' } })
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe(`bytes 0-3/${png.length}`)
    expect(Buffer.from(await part.arrayBuffer())).toEqual(png.subarray(0, 4))
  })

  it('rejects unsupported file types', async () => {
    const fd = new FormData()
    fd.append('file', new Blob(['#!/bin/sh'], { type: 'application/x-sh' }), 'evil.sh')
    expect((await admin.req('POST', '/api/media', fd)).status).toBe(415)
  })
})

describe('operations', () => {
  it('serves install.sh with the server URL', async () => {
    const res = await fetch(`${server.base}/install.sh`)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain(server.base)
    expect(text).not.toContain('__PLACARD_SERVER_URL__')
  })

  it('serves the agent with its version', async () => {
    const v = await fetch(`${server.base}/agent/version`).then(r => r.json())
    expect(v.version).toMatch(/^\d+\.\d+\.\d+$/)
    const hb = await device(server.base, (await pairScreen('Agent check')).token).heartbeat({ source: 'agent', agentVersion: '0.0.1' })
    expect(hb.agent).toMatchObject({ version: v.version, sha256: v.sha256 })
  })

  it('accepts API tokens without CSRF', async () => {
    const tok = (await admin.post('/api/tokens', { name: 'script', role: 'editor' })).body.token
    const res = await fetch(`${server.base}/api/playlists`, {
      method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'From script' }),
    })
    expect(res.status).toBe(200)
    const users = await fetch(`${server.base}/api/users`, { headers: { authorization: `Bearer ${tok}` } })
    expect(users.status).toBe(403)
  })

  it('downloads a backup archive', async () => {
    const res = await admin.req('GET', '/api/admin/backup')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/gzip')
  })

  it('publishes the OpenAPI document', async () => {
    const spec = await fetch(`${server.base}/api/openapi.json`).then(r => r.json())
    expect(spec.paths['/api/device/heartbeat']).toBeDefined()
    expect(spec.paths['/api/playlists/{id}']).toBeDefined()
  })

  it('rate-limits pairing requests per IP', async () => {
    let limited = false
    for (let i = 0; i < 15; i++) {
      const r = await fetch(`${server.base}/api/device/pair`, { method: 'POST' })
      if (r.status === 429) limited = true
    }
    expect(limited).toBe(true)
  })
})
