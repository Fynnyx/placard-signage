import { readBody, type H3Event } from 'h3'
import { z } from 'zod'

export function idParam(event: H3Event, name = 'id') {
  const id = Number(getRouterParam(event, name))
  if (!Number.isInteger(id) || id <= 0) throw createError({ statusCode: 400, statusMessage: `Invalid ${name}` })
  return id
}

/** Reads the JSON body and validates it; responds 400 with the first problem. */
export async function parseBody<T extends z.ZodTypeAny>(event: H3Event, schema: T): Promise<z.infer<T>> {
  const body = await readBody(event).catch(() => {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON body' })
  })
  return parseWith(schema, body ?? {})
}

export function parseWith<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw createError({
      statusCode: 400,
      statusMessage: issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request body',
      data: parsed.error.issues,
    })
  }
  return parsed.data
}

export function notFound(what = 'Not found'): never {
  throw createError({ statusCode: 404, statusMessage: what })
}

export const hhmm = z.string().regex(/^(([01]?\d|2[0-3]):[0-5]\d|24:00)$/, 'expected HH:MM')
export { z }
