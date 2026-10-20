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

export function browserVersion() {
  const ua = navigator.userAgent
  const m = /(Chromium|Chrome|Firefox|Edg)\/([\d.]+)/.exec(ua) || /Version\/([\d.]+).*Safari/.exec(ua)
  if (!m) return ua.slice(0, 100)
  return m.length === 3 ? `${m[1] === 'Edg' ? 'Edge' : m[1]} ${m[2]}` : `Safari ${m[1]}`
}
