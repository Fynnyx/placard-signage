import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import type { H3Event } from 'h3'
import Busboy from 'busboy'

export const MEDIA_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/ogg': '.ogv',
  'video/quicktime': '.mov',
}

export const EXT_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(MEDIA_TYPES).map(([mime, ext]) => [ext, mime]).concat([['.jpeg', 'image/jpeg'], ['.m4v', 'video/mp4']]),
)

export type Media = typeof schema.media.$inferSelect

export function mediaDto(m: Media) {
  return { ...m, url: `/media/${m.filename}`, kind: m.mime.startsWith('video/') ? 'video' : 'image' }
}

/** Streams multipart uploads to DATA_DIR/media without buffering them in memory. */
export function receiveUploads(event: H3Event): Promise<Media[]> {
  const cfg = useConfig()
  const maxBytes = cfg.maxUploadMb * 1024 * 1024
  const req = event.node.req
  return new Promise((resolvePromise, reject) => {
    let bb: Busboy.Busboy
    try {
      bb = Busboy({ headers: req.headers, limits: { fileSize: maxBytes, files: 20 } })
    }
    catch {
      return reject(createError({ statusCode: 400, statusMessage: 'Expected multipart/form-data' }))
    }
    const jobs: Promise<Media | null>[] = []
    let failed: Error | undefined
    bb.on('file', (_field, stream, info) => {
      const original = info.filename || 'upload'
      const mime = info.mimeType === 'image/jpg' ? 'image/jpeg' : info.mimeType
      const realMime = MEDIA_TYPES[mime] ? mime : EXT_TYPES[extname(original).toLowerCase()]
      if (!realMime) {
        stream.resume()
        failed ??= createError({ statusCode: 415, statusMessage: `Unsupported file type: ${original}` })
        return
      }
      const filename = `${randomToken(12)}${MEDIA_TYPES[realMime]}`
      const path = resolve(cfg.mediaDir, filename)
      let size = 0
      const counter = new Transform({
        transform(chunk, _enc, cb) {
          size += chunk.length
          cb(null, chunk)
        },
      })
      jobs.push(pipeline(stream, counter, createWriteStream(path)).then(async () => {
        if ((stream as any).truncated) {
          await rm(path, { force: true })
          failed ??= createError({ statusCode: 413, statusMessage: `File too large (max ${cfg.maxUploadMb} MB): ${original}` })
          return null
        }
        return useDb().insert(schema.media).values({
          filename, originalName: original.slice(0, 255), mime: realMime, size,
        }).returning().get()
      }))
    })
    bb.on('error', err => reject(createError({ statusCode: 400, statusMessage: `Upload failed: ${(err as Error).message}` })))
    bb.on('close', async () => {
      try {
        const results = (await Promise.all(jobs)).filter((m): m is Media => !!m)
        if (failed && !results.length) return reject(failed)
        resolvePromise(results)
      }
      catch (err) {
        reject(err)
      }
    })
    req.pipe(bb)
  })
}
