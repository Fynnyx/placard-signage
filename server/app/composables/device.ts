/** Shared helpers for the player pages (/player, /player/pair). */
export const TOKEN_KEY = 'placard_token'
export const PLAYLIST_KEY = 'placard_playlist'

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  }
  catch {
    return null
  }
}

export function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  }
  catch { /* storage unavailable */ }
}

/** Moves a token from the URL fragment (#t=…) into localStorage and removes it from the URL. */
export function takeTokenFromHash() {
  const m = /(?:^#|&)t=([^&]+)/.exec(location.hash)
  if (!m) return
  writeToken(decodeURIComponent(m[1]!))
  history.replaceState(null, '', location.pathname + location.search)
}

/** Full browser version; Chromium only exposes it through User-Agent Client Hints. */
export async function browserVersionFull() {
  const uad = (navigator as any).userAgentData
  if (uad?.getHighEntropyValues) {
    try {
      const { fullVersionList } = await uad.getHighEntropyValues(['fullVersionList'])
      const brand = (fullVersionList as { brand: string, version: string }[] | undefined)
        ?.find(b => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand))
      if (brand) return `${brand.brand.replace('Google ', '')} ${brand.version}`
    }
    catch { /* fall back to the user agent */ }
  }
  return browserVersion()
}

export function browserVersion() {
  const ua = navigator.userAgent
  const m = /(Chromium|Chrome|Firefox|Edg)\/([\d.]+)/.exec(ua) || /Version\/([\d.]+).*Safari/.exec(ua)
  if (!m) return ua.slice(0, 100)
  return m.length === 3 ? `${m[1] === 'Edg' ? 'Edge' : m[1]} ${m[2]}` : `Safari ${m[1]}`
}
