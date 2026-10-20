import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function hmacSha256(key: string, value: string) {
  return createHmac('sha256', key).update(value).digest('hex')
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function randomDigits(n: number) {
  let s = ''
  for (let i = 0; i < n; i++) s += randomInt(10).toString()
  return s
}
