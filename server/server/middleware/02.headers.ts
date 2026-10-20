export default defineEventHandler((event) => {
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  setHeader(event, 'Referrer-Policy', 'same-origin')
  // The admin UI must not be framed; the player only frames other sites.
  if (!event.path.startsWith('/media/')) setHeader(event, 'X-Frame-Options', 'SAMEORIGIN')
})
