import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

/**
 * Uploaded files. Names are random, so they are public like the player itself;
 * Range requests are supported for video seeking.
 */
export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'path') || ''
  if (!/^[\w-]+\.[a-z0-9]+$/i.test(name)) notFound()
  const file = resolve(useConfig().mediaDir, name)
  const st = await stat(file).catch(() => null)
  if (!st?.isFile()) notFound()
  const type = EXT_TYPES[extname(name).toLowerCase()] || 'application/octet-stream'
  setHeader(event, 'Content-Type', type)
  setHeader(event, 'Accept-Ranges', 'bytes')
  setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  setHeader(event, 'Last-Modified', st.mtime.toUTCString())
  if (type === 'image/svg+xml') setHeader(event, 'Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:")

  const range = getHeader(event, 'range')
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : st.size - Number(m[2])
    let end = m[1] && m[2] ? Number(m[2]) : st.size - 1
    start = Math.max(0, start)
    end = Math.min(end, st.size - 1)
    if (start > end) {
      setResponseStatus(event, 416)
      setHeader(event, 'Content-Range', `bytes */${st.size}`)
      return ''
    }
    setResponseStatus(event, 206)
    setHeader(event, 'Content-Range', `bytes ${start}-${end}/${st.size}`)
    setHeader(event, 'Content-Length', end - start + 1)
    if (event.method === 'HEAD') return ''
    return sendStream(event, createReadStream(file, { start, end }))
  }
  setHeader(event, 'Content-Length', st.size)
  if (event.method === 'HEAD') return ''
  return sendStream(event, createReadStream(file))
})
