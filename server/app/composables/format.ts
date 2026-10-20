export function useFormat() {
  const { locale, t } = useI18n()
  const dateTime = (ms: number | null | undefined) =>
    ms ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(ms) : '–'
  const relative = (ms: number | null | undefined) => {
    if (!ms) return t('common.never')
    const diff = Math.round((ms - Date.now()) / 1000)
    const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
    const abs = Math.abs(diff)
    if (abs < 60) return rtf.format(diff, 'second')
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
    return rtf.format(Math.round(diff / 86400), 'day')
  }
  const bytes = (n: number) => {
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024
      i++
    }
    return `${n.toFixed(i ? 1 : 0)} ${units[i]}`
  }
  return { dateTime, relative, bytes }
}
