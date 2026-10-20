defineRouteMeta({ openAPI: { tags: ['Auth'], summary: 'Current user, login options and branding' } })

export default defineEventHandler((event) => {
  const auth = getAuth(event)
  const cfg = useConfig()
  const s = getSettings()
  return {
    user: auth?.kind === 'session' ? auth.user : null,
    csrfToken: auth?.csrfToken ?? null,
    setupRequired: !isSetupDone(),
    localLogin: cfg.localLogin || !cfg.oidc,
    oidc: cfg.oidc ? { name: cfg.oidc.name } : null,
    mail: mailEnabled(),
    branding: { name: s.brandName, accentColor: s.accentColor, logoUrl: s.logoUrl },
    publicUrl: cfg.publicUrl,
  }
})
