/** The Raspberry Pi install script, with this server's URL filled in. */
export default defineEventHandler((event) => {
  let script: string
  try {
    script = readPiFile('install.sh')
  }
  catch {
    notFound('install.sh is not available on this server')
  }
  setHeader(event, 'Content-Type', 'text/x-shellscript; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-cache')
  return script.replace('__PLACARD_SERVER_URL__', useConfig().publicUrl)
})
