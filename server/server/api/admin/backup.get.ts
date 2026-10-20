import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { create } from 'tar'

defineRouteMeta({ openAPI: { tags: ['Admin'], summary: 'Download the database and media as one .tar.gz (admin)' } })

export default defineEventHandler(async (event) => {
  requireRole(event, 'admin')
  const cfg = useConfig()
  // A consistent copy of the live database via SQLite's online backup, next to a link to the media folder.
  const tmp = await mkdtemp(join(tmpdir(), 'placard-backup-'))
  await useDb().$client.backup(join(tmp, 'placard.db'))
  await symlink(cfg.mediaDir, join(tmp, 'media'))
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  setHeader(event, 'Content-Type', 'application/gzip')
  setHeader(event, 'Content-Disposition', `attachment; filename="placard-backup-${stamp}.tar.gz"`)
  const stream = create({ gzip: true, portable: true, follow: true, cwd: tmp }, ['placard.db', 'media'])
  const cleanup = () => void rm(tmp, { recursive: true, force: true })
  stream.on('end', cleanup)
  stream.on('error', cleanup)
  log('info', 'Backup downloaded', { by: getAuth(event)?.user.email })
  return sendStream(event, stream as any)
})
