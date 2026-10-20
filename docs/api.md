# REST API

Everything the dashboard does goes through a REST API, so playlists and schedules can also be changed by scripts.

- OpenAPI document: `GET /api/openapi.json`
- Interactive docs: `/api/docs`

## Authentication

Create a token under **Settings → API tokens** (admin) and pick its role. Send it as a bearer token:

```sh
export PLACARD=https://signage.example.org
export TOKEN=plc_…
curl -fsS -H "Authorization: Bearer $TOKEN" $PLACARD/api/screens
```

API tokens need no CSRF header. Requests with the browser session cookie must send `x-csrf-token` (from `GET /api/auth/me`).

## Examples

Replace the items of playlist 3:

```sh
curl -fsS -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $PLACARD/api/playlists/3 -d '{
    "items": [
      { "type": "url", "source": "https://example.org/news?screen={screen.id}", "durationS": 20 },
      { "type": "image", "source": "/media/abc123.jpg", "durationS": 10 }
    ]
  }'
```

Upload an image:

```sh
curl -fsS -H "Authorization: Bearer $TOKEN" -F file=@poster.jpg $PLACARD/api/media
```

Show a playlist on group 2 on weekdays from 11:30 to 14:00:

```sh
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $PLACARD/api/assignments -d '{ "groupId": 2, "playlistId": 3, "weekdays": 31, "timeFrom": "11:30", "timeTo": "14:00", "priority": 10 }'
```

`weekdays` is a bitmask: Monday = 1, Tuesday = 2, Wednesday = 4, Thursday = 8, Friday = 16, Saturday = 32, Sunday = 64 (127 = every day).

Reload a screen:

```sh
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $PLACARD/api/screens/5/commands -d '{ "type": "reload" }'
```

## Device API

The player and the Pi agent use `/api/device/*` with the screen's own token. See `SPEC.md` and the OpenAPI document; you normally don't call these yourself.
