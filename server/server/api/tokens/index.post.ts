defineRouteMeta({ openAPI: { tags: ['Settings'], summary: 'Create an API token (admin); the token is shown only once' } })

const Body = z.object({ name: z.string().trim().min(1).max(100), role: z.enum(ROLES).default('editor') })

export default defineEventHandler(async (event) => {
  const auth = requireRole(event, 'admin')
  const body = await parseBody(event, Body)
  const token = API_TOKEN_PREFIX + randomToken(32)
  const row = useDb().insert(schema.apiTokens).values({ ...body, tokenHash: sha256(token), createdBy: auth.user.id }).returning().get()
  return { id: row.id, name: row.name, role: row.role, token }
})
