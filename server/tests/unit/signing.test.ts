import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { signUrl, verifySignedUrl } from '../../server/utils/signing'

const SECRET = 'test-secret'
const NOW = Date.parse('2026-10-20T10:00:00Z')

describe('signed URLs', () => {
  it('adds the three parameters and keeps existing ones', () => {
    const u = new URL(signUrl('https://intranet.example.org/menu/today?lang=de', 12, SECRET, NOW))
    expect(u.searchParams.get('lang')).toBe('de')
    expect(u.searchParams.get('sx_screen')).toBe('12')
    const exp = Number(u.searchParams.get('sx_exp'))
    expect(exp * 1000).toBeGreaterThanOrEqual(NOW + 24 * 3600_000)
    expect(exp * 1000).toBeLessThan(NOW + 30 * 3600_000)
    const expected = createHmac('sha256', SECRET).update(`/menu/today\n12\n${exp}`).digest('hex')
    expect(u.searchParams.get('sx_sig')).toBe(expected)
  })

  it('is stable within a 6-hour step', () => {
    expect(signUrl('https://a.org/', 1, SECRET, NOW)).toBe(signUrl('https://a.org/', 1, SECRET, NOW + 3600_000))
  })

  it('verifies, and rejects tampering and expiry', () => {
    const url = signUrl('https://a.org/x', 3, SECRET, NOW)
    expect(verifySignedUrl(url, SECRET, NOW)).toBe(true)
    expect(verifySignedUrl(url.replace('sx_screen=3', 'sx_screen=4'), SECRET, NOW)).toBe(false)
    expect(verifySignedUrl(url.replace('/x', '/y'), SECRET, NOW)).toBe(false)
    expect(verifySignedUrl(url, 'other', NOW)).toBe(false)
    expect(verifySignedUrl(url, SECRET, NOW + 2 * 86400_000)).toBe(false)
  })
})
