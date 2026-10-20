import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(__dirname, '../..')

function freePort(): Promise<number> {
  return new Promise((res) => {
    const s = createServer().listen(0, () => {
      const port = (s.address() as { port: number }).port
      s.close(() => res(port))
    })
  })
}

/** Starts the built server (.output) on a free port with an empty data directory. */
export async function startServer(env: Record<string, string> = {}) {
  const entry = join(root, '.output/server/index.mjs')
  if (!existsSync(entry)) throw new Error('Run `pnpm build` before the integration tests')
  const port = await freePort()
  const dataDir = mkdtempSync(join(tmpdir(), 'placard-test-'))
  const base = `http://127.0.0.1:${port}`
  const proc: ChildProcess = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      PUBLIC_URL: base,
      MIGRATIONS_DIR: join(root, 'server/db/migrations'),
      PI_DIR: resolve(root, '../pi'),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  proc.stdout!.on('data', (d) => { output += d })
  proc.stderr!.on('data', (d) => { output += d })
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/api/health`)
      if (r.ok) break
    }
    catch { /* not up yet */ }
    if (proc.exitCode !== null) throw new Error(`Server exited:\n${output}`)
    await new Promise(r => setTimeout(r, 100))
  }
  return {
    base,
    dataDir,
    output: () => output,
    async stop() {
      proc.kill()
      await new Promise(r => proc.once('exit', r))
      rmSync(dataDir, { recursive: true, force: true })
    },
  }
}

/** A tiny cookie-keeping client for the admin API. */
export class Client {
  cookie = ''
  csrf = ''
  constructor(public base: string) {}

  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { ...headers }
    if (this.cookie) h.cookie = this.cookie
    if (this.csrf && method !== 'GET') h['x-csrf-token'] = this.csrf
    if (body !== undefined && !(body instanceof FormData)) h['content-type'] = 'application/json'
    const res = await fetch(this.base + path, {
      method,
      headers: h,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      redirect: 'manual',
    })
    const setCookie = res.headers.getSetCookie()
    for (const c of setCookie) {
      const [pair] = c.split(';')
      if (pair!.startsWith('placard_session=')) this.cookie = pair!
    }
    const text = await res.text()
    let json: any
    try {
      json = JSON.parse(text)
    }
    catch {
      json = text
    }
    return { status: res.status, body: json, headers: res.headers }
  }

  async refreshCsrf() {
    const me = await this.req('GET', '/api/auth/me')
    this.csrf = me.body.csrfToken ?? ''
    return me.body
  }

  get = (p: string) => this.req('GET', p)
  post = (p: string, b?: unknown) => this.req('POST', p, b ?? {})
  put = (p: string, b?: unknown) => this.req('PUT', p, b ?? {})
  patch = (p: string, b?: unknown) => this.req('PATCH', p, b ?? {})
  del = (p: string) => this.req('DELETE', p)
}

export function device(base: string, token: string) {
  const auth = { authorization: `Bearer ${token}` }
  return {
    playlist: (etag?: string) => fetch(`${base}/api/device/playlist`, { headers: { ...auth, ...(etag ? { 'if-none-match': etag } : {}) } }),
    heartbeat: (body: Record<string, unknown>) => fetch(`${base}/api/device/heartbeat`, {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }).then(r => r.json()),
    ack: (id: number, body: Record<string, unknown>) => fetch(`${base}/api/device/commands/${id}/ack`, {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    event: (body: Record<string, unknown>) => fetch(`${base}/api/device/events`, {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
  }
}
