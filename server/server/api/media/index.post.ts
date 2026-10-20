defineRouteMeta({ openAPI: { tags: ['Media'], summary: 'Upload images or videos (multipart/form-data, field "file", repeatable)' } })

export default defineEventHandler(async (event) => {
  requireRole(event, 'editor')
  const files = await receiveUploads(event)
  return files.map(mediaDto)
})
