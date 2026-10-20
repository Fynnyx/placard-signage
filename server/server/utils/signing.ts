import { hmacSha256, safeEqual } from './crypto'

const DAY_MS = 86400_000
const STEP_MS = 6 * 3600_000

/**
 * Adds sx_screen, sx_exp and sx_sig to a URL. The signature is
 * HMAC-SHA256(secret, `${pathname}\n${screenId}\n${exp}`) in hex; exp is in Unix seconds.
 * The expiry is rounded up to a 6-hour step so the playlist (and its ETag) stays stable between polls.
 */
export function signUrl(url: string, screenId: number, secret: string, now = Date.now()) {
  const u = new URL(url)
  const exp = Math.floor((Math.ceil((now + DAY_MS) / STEP_MS) * STEP_MS) / 1000)
  u.searchParams.set('sx_screen', String(screenId))
  u.searchParams.set('sx_exp', String(exp))
  u.searchParams.set('sx_sig', hmacSha256(secret, `${u.pathname}\n${screenId}\n${exp}`))
  return u.toString()
}

export function verifySignedUrl(url: string, secret: string, now = Date.now()) {
  const u = new URL(url)
  const screen = u.searchParams.get('sx_screen')
  const exp = Number(u.searchParams.get('sx_exp'))
  const sig = u.searchParams.get('sx_sig') || ''
  if (!screen || !Number.isFinite(exp) || exp * 1000 < now) return false
  return safeEqual(sig, hmacSha256(secret, `${u.pathname}\n${screen}\n${exp}`))
}
