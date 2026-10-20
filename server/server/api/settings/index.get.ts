defineRouteMeta({ openAPI: { tags: ['Settings'], summary: 'Server settings' } })

export default defineEventHandler((event) => {
  requireRole(event, 'viewer')
  const { setupDone: _, ...s } = getSettings()
  const cfg = useConfig()
  return {
    ...s,
    info: {
      publicUrl: cfg.publicUrl,
      oidc: !!cfg.oidc,
      localLogin: cfg.localLogin,
      mail: !!cfg.smtpUrl,
      offlineAfterS: cfg.offlineAfterS,
      metrics: cfg.metrics,
      signingSecretFromEnv: !!cfg.urlSigningSecret,
      agentVersion: getAgentInfo()?.version ?? null,
    },
  }
})
