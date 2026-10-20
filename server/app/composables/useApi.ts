export interface Me {
  user: { id: number, email: string, name: string, role: 'admin' | 'editor' | 'viewer' } | null
  csrfToken: string | null
  setupRequired: boolean
  localLogin: boolean
  oidc: { name: string } | null
  mail: boolean
  branding: { name: string, accentColor: string, logoUrl: string | null }
  publicUrl: string
}

export function useMe() {
  return useState<Me | null>('me', () => null)
}

export async function refreshMe() {
  const me = useMe()
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
  me.value = await $fetch<Me>('/api/auth/me', { headers })
  return me.value
}

const RANK = { viewer: 1, editor: 2, admin: 3 } as const

export function useRole() {
  const me = useMe()
  return {
    can: (min: keyof typeof RANK) => !!me.value?.user && RANK[me.value.user.role] >= RANK[min],
  }
}

/** $fetch for the admin API: sends the CSRF token and the session cookie during SSR. */
export function api<T = any>(url: string, opts: Parameters<typeof $fetch>[1] = {}): Promise<T> {
  const me = useMe()
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string> | undefined) }
  if (me.value?.csrfToken) headers['x-csrf-token'] = me.value.csrfToken
  if (import.meta.server) Object.assign(headers, useRequestHeaders(['cookie']))
  return $fetch<T>(url, { ...opts, headers } as any) as Promise<T>
}

export function errorMessage(err: unknown): string {
  const e = err as { data?: { statusMessage?: string, message?: string }, statusMessage?: string, message?: string }
  return e?.data?.statusMessage || e?.data?.message || e?.statusMessage || e?.message || String(err)
}
