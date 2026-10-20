// Verify a Placard Signage signed URL (Node.js 18+, no dependencies).
//
//   import { verify } from './verify-signed-url.mjs'
//   const screenId = verify(`https://${req.headers.host}${req.url}`, process.env.URL_SIGNING_SECRET)
//   if (!screenId) return res.status(403).end()
import { createHmac, timingSafeEqual } from 'node:crypto'

/** Returns the screen id when the signature is valid and not expired, else null. */
export function verify(url, secret, now = Date.now()) {
  const u = new URL(url)
  const screen = u.searchParams.get('sx_screen')
  const exp = Number(u.searchParams.get('sx_exp'))
  const sig = u.searchParams.get('sx_sig') || ''
  if (!screen || !Number.isInteger(exp) || exp * 1000 < now) return null
  const expected = createHmac('sha256', secret).update(`${u.pathname}\n${screen}\n${exp}`).digest('hex')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b) ? screen : null
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const screen = verify(process.argv[2], process.argv[3])
  console.log(screen ? `valid for screen ${screen}` : 'invalid')
  process.exit(screen ? 0 : 1)
}
