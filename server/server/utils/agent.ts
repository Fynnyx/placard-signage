import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

let cache: { mtime: number, version: string, sha256: string, body: string } | undefined

/** Version and checksum of the agent file the server hands out for self-update. */
export function getAgentInfo() {
  const file = resolve(useConfig().piDir, 'agent/placard_agent.py')
  try {
    const mtime = statSync(file).mtimeMs
    if (!cache || cache.mtime !== mtime) {
      const body = readFileSync(file, 'utf8')
      const version = /^AGENT_VERSION\s*=\s*["']([^"']+)["']/m.exec(body)?.[1] ?? '0'
      cache = { mtime, version, sha256: createHash('sha256').update(body).digest('hex'), body }
    }
    return cache
  }
  catch {
    return undefined
  }
}

export function readPiFile(rel: string) {
  return readFileSync(resolve(useConfig().piDir, rel), 'utf8')
}
