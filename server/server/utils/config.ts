import { resolve } from 'node:path'

function bool(v: string | undefined, def: boolean) {
  if (v === undefined || v === '') return def
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

function int(v: string | undefined, def: number) {
  const n = Number.parseInt(v ?? '', 10)
  return Number.isFinite(n) ? n : def
}

export interface AppConfig {
  publicUrl: string
  dataDir: string
  mediaDir: string
  dbFile: string
  migrationsDir: string
  piDir: string
  adminEmail?: string
  adminPassword?: string
  oidc?: { issuer: string, clientId: string, clientSecret?: string, roleClaim: string, roleMap: Record<string, string>, name: string }
  localLogin: boolean
  urlSigningSecret?: string
  offlineAfterS: number
  smtpUrl?: string
  smtpFrom: string
  maxUploadMb: number
  metrics: boolean
  secureCookies: boolean
}

let cached: AppConfig | undefined

export function parseRoleMap(v: string) {
  const map: Record<string, string> = {}
  for (const pair of v.split(',')) {
    const [from, to] = pair.split('=').map(s => s.trim())
    if (from && to) map[from] = to
  }
  return map
}

export function useConfig(): AppConfig {
  if (cached) return cached
  const env = process.env
  const dataDir = resolve(env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : '.data'))
  let publicUrl = env.PUBLIC_URL
  if (!publicUrl) {
    if (process.env.NODE_ENV === 'production') throw new Error('PUBLIC_URL must be set, e.g. https://signage.example.org')
    publicUrl = 'http://localhost:3000'
  }
  publicUrl = publicUrl.replace(/\/+$/, '')
  cached = {
    publicUrl,
    dataDir,
    mediaDir: resolve(dataDir, 'media'),
    dbFile: resolve(dataDir, 'placard.db'),
    migrationsDir: resolve(env.MIGRATIONS_DIR || 'server/db/migrations'),
    piDir: resolve(env.PI_DIR || '../pi'),
    adminEmail: env.ADMIN_EMAIL || undefined,
    adminPassword: env.ADMIN_PASSWORD || undefined,
    oidc: env.OIDC_ISSUER && env.OIDC_CLIENT_ID
      ? {
          issuer: env.OIDC_ISSUER,
          clientId: env.OIDC_CLIENT_ID,
          clientSecret: env.OIDC_CLIENT_SECRET || undefined,
          roleClaim: env.OIDC_ROLE_CLAIM || 'roles',
          roleMap: parseRoleMap(env.OIDC_ROLE_MAP || 'admin=admin,editor=editor'),
          name: env.OIDC_NAME || 'Single sign-on',
        }
      : undefined,
    localLogin: bool(env.LOCAL_LOGIN, true),
    urlSigningSecret: env.URL_SIGNING_SECRET || undefined,
    offlineAfterS: int(env.OFFLINE_AFTER_S, 120),
    smtpUrl: env.SMTP_URL || undefined,
    smtpFrom: env.SMTP_FROM || 'Placard Signage <signage@localhost>',
    maxUploadMb: int(env.MAX_UPLOAD_MB, 1024),
    metrics: bool(env.METRICS, false),
    secureCookies: publicUrl.startsWith('https://'),
  }
  return cached
}

/** Test helper. */
export function resetConfig() {
  cached = undefined
}
