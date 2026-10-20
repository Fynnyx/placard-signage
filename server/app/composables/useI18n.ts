import en from '~/locales/en'
import de from '~/locales/de'

/**
 * Minimal i18n: flat message keys, `{name}` placeholders, English as fallback.
 * To add a language, add a file in app/locales and register it here.
 */
export const MESSAGES: Record<string, Record<string, string>> = { en, de }
export const LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
]

export function detectLocale(acceptLanguage?: string | null) {
  for (const part of (acceptLanguage || '').split(',')) {
    const code = part.split(';')[0]!.trim().slice(0, 2).toLowerCase()
    if (MESSAGES[code]) return code
  }
  return 'en'
}

export function translate(locale: string, key: string, params?: Record<string, string | number>) {
  let msg = MESSAGES[locale]?.[key] ?? MESSAGES.en![key] ?? key
  if (params) for (const [k, v] of Object.entries(params)) msg = msg.replaceAll(`{${k}}`, String(v))
  return msg
}

export function useI18n() {
  const cookie = useCookie<string | null>('placard_locale', { maxAge: 365 * 86400, sameSite: 'lax' })
  const locale = useState<string>('locale', () => {
    if (cookie.value && MESSAGES[cookie.value]) return cookie.value
    if (import.meta.server) return detectLocale(useRequestHeaders(['accept-language'])['accept-language'])
    return detectLocale(navigator.languages?.join(','))
  })
  const setLocale = (code: string) => {
    locale.value = code
    cookie.value = code
  }
  const t = (key: string, params?: Record<string, string | number>) => translate(locale.value, key, params)
  return { locale, setLocale, t }
}
