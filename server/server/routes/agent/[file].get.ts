/** Files the Pi install script and agent self-update download. */
const FILES: Record<string, { path: string, type: string }> = {
  'placard_agent.py': { path: 'agent/placard_agent.py', type: 'text/x-python' },
  'placard-agent.service': { path: 'agent/placard-agent.service', type: 'text/plain' },
  'placard-kiosk': { path: 'kiosk.sh', type: 'text/x-shellscript' },
  'version': { path: '', type: 'application/json' },
}

export default defineEventHandler((event) => {
  const name = getRouterParam(event, 'file') || ''
  const f = FILES[name] ?? notFound()
  setHeader(event, 'Cache-Control', 'no-cache')
  if (name === 'version') {
    const info = getAgentInfo() ?? notFound()
    return { version: info.version, sha256: info.sha256 }
  }
  setHeader(event, 'Content-Type', `${f.type}; charset=utf-8`)
  try {
    return readPiFile(f.path)
  }
  catch {
    notFound()
  }
})
