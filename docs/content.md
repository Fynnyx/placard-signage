# Content

## Playlists

A playlist is an ordered list of items. Each item has a type, a source and a duration:

| Type | Source | Duration |
| --- | --- | --- |
| Web page (`url`) | Any `http(s)` URL | Seconds on screen |
| Image | Upload (JPEG, PNG, GIF, WebP, AVIF, SVG) or URL | Seconds on screen |
| Video | Upload (MP4, WebM, Ogg, MOV) or URL | Plays until it ends; a duration > 0 cuts it off earlier |

Options per item:

- **Reload each time:** load the page fresh every time it comes up. Without it, web pages stay loaded in the background between rounds (useful for dashboards that update themselves).
- **Signed URL:** adds a signature so the page can trust the screen without a login. See [signed-urls.md](signed-urls.md).
- **Enabled:** switch an item off without deleting it.

Items crossfade (400 ms). Web pages are preloaded in a hidden frame 10 s before their turn, so there is no blank frame. With a single item in the playlist, it stays on screen (and reloads after its duration only with *Reload each time*). When you save a playlist, screens switch to it after their current item, within a minute.

Videos play muted; browsers do not allow autoplay with sound.

### Placeholders

URLs can contain placeholders that are filled per screen:

- `{screen.id}` – numeric id
- `{screen.name}` – screen name
- `{screen.group}` – group name (empty without a group)

Example: `https://intranet.example.org/rooms?display={screen.name}` lets one page show the right room on every door sign.

## Schedule

Assign playlists to screens or groups with weekdays and a time window. The rules:

1. Among the entries that match the current weekday and time, the **highest priority** wins.
2. On equal priority, an entry for the **screen** beats one for its **group**; then the newest entry wins.
3. With no matching entry, the screen plays the **default playlist** (Settings, or *Make default* in the playlist list).

Times use the time zone set in **Settings**. An end time before the start time runs overnight: Friday 22:00–06:00 covers Friday night until Saturday 6:00. Leave both times empty for the whole day.

## Web pages

Web pages are shown in an `<iframe>`. Two things matter:

**The page must allow framing.** Pages that send `X-Frame-Options: DENY`/`SAMEORIGIN` or a `Content-Security-Policy` with `frame-ancestors` that does not include the signage server stay white. The dashboard checks this when you add a URL and shows a warning. For pages you control, send:

```
Content-Security-Policy: frame-ancestors 'self' https://signage.example.org
```

and remove any `X-Frame-Options` header.

**Logins don't work in frames.** Many sites block their login in iframes or need third-party cookies. Use a [signed URL](signed-urls.md) and a read-only view instead.

### Tips for content authors

- Render the layout immediately and show placeholders while data loads, so a slow API never leaves a blank screen.
- Design for the screen's resolution (usually 1920×1080) and for being read from a distance: large fonts, high contrast.
- Refresh data in the page itself (e.g. every minute) instead of relying on reloads.
- Use `{screen.id}` / `{screen.name}` to vary the content per screen instead of keeping many similar playlists.
- Test with the **Preview** button on the playlist page.

## Offline behaviour

The player caches itself, the last playlist, and its images and videos. When the server is unreachable, the screen keeps looping the cached playlist; web pages are shown only if the content site itself is reachable. When the server comes back, the screen picks up changes within a minute.
