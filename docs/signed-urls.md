# Signed content URLs

Pages that normally need a login can trust the signage screen through a signed URL instead. Mark an item as **Signed URL** in the playlist; the player then gets the URL with three extra query parameters:

| Parameter | Value |
| --- | --- |
| `sx_screen` | Screen id |
| `sx_exp` | Expiry, Unix seconds (at least 24 h ahead) |
| `sx_sig` | `HMAC-SHA256(secret, path + "\n" + sx_screen + "\n" + sx_exp)`, lowercase hex |

`path` is the URL path only (e.g. `/menu/today`), without query string. The secret is `URL_SIGNING_SECRET`. Set it explicitly on the signage server and give the same value to the content site.

Your content site checks the signature, rejects expired links, and shows a read-only view. The screen fetches a fresh signature with the playlist, so links never expire on a running screen.

## Node.js

[`examples/verify-signed-url.mjs`](examples/verify-signed-url.mjs):

```js
import { createHmac, timingSafeEqual } from 'node:crypto'

export function verify(url, secret, now = Date.now()) {
  const u = new URL(url)
  const screen = u.searchParams.get('sx_screen')
  const exp = Number(u.searchParams.get('sx_exp'))
  const sig = u.searchParams.get('sx_sig') || ''
  if (!screen || !Number.isInteger(exp) || exp * 1000 < now) return null
  const expected = createHmac('sha256', secret).update(`${u.pathname}\n${screen}\n${exp}`).digest('hex')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b) ? screen : null
}
```

Express example:

```js
app.get('/menu/today', (req, res) => {
  const screen = verify(`https://${req.get('host')}${req.originalUrl}`, process.env.URL_SIGNING_SECRET)
  if (!screen) return res.status(403).send('Forbidden')
  res.render('menu', { readOnly: true })
})
```

## Python

[`examples/verify_signed_url.py`](examples/verify_signed_url.py):

```python
import hashlib, hmac, time
from urllib.parse import parse_qs, urlsplit

def verify(url: str, secret: str, now: float | None = None) -> str | None:
    parts = urlsplit(url)
    q = parse_qs(parts.query)
    try:
        screen, exp, sig = q["sx_screen"][0], int(q["sx_exp"][0]), q["sx_sig"][0]
    except (KeyError, IndexError, ValueError):
        return None
    if exp < (now if now is not None else time.time()):
        return None
    message = f"{parts.path}\n{screen}\n{exp}".encode()
    expected = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return screen if hmac.compare_digest(expected, sig) else None
```

Flask example:

```python
@app.get("/menu/today")
def menu():
    if not verify(request.url, os.environ["URL_SIGNING_SECRET"]):
        abort(403)
    return render_template("menu.html", read_only=True)
```

Both snippets are tested against URLs the server signs (`server/tests/integration/api.test.ts`).

## Notes

- Behind a reverse proxy, make sure the URL you verify has the same path the screen requested.
- The signature covers the path but not other query parameters; don't rely on them for access decisions.
- The signature is a capability: anyone with a link can open it until it expires. Show only what may be seen on a public screen.
