import type { H3Event } from 'h3'

const buckets = new Map<string, { start: number, count: number }>()

/** Fixed-window rate limit kept in memory (the server is a single process). */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now - b.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 })
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (now - v.start >= windowMs) buckets.delete(k)
    }
    return true
  }
  b.count++
  return b.count <= limit
}

export function enforceRateLimit(event: H3Event, name: string, limit: number, windowMs: number) {
  const ip = getClientIp(event)
  if (!rateLimit(`${name}:${ip}`, limit, windowMs)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many requests, try again later' })
  }
}

export function getClientIp(event: H3Event) {
  return getRequestIP(event, { xForwardedFor: true }) || 'unknown'
}

export function resetRateLimits() {
  buckets.clear()
}
