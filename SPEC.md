# Self-Hosted Digital Signage – Software Specification

Oct 20, 2026 · @Fynn Westerath

## Goal and scope

An open-source, self-hosted digital signage system: Raspberry Pis run a current Chromium in kiosk mode and are managed from one central web dashboard. It targets clubs, schools, associations and small businesses with 1 to about 100 screens that don't want per-screen fees.

**Problems this solves**

- Hosted signage services charge per screen and ship their own, often outdated, browser that can't be updated.
- Locked-down players offer no SSH or DevTools, so broken pages can't be debugged.
- Existing self-hosted tools either manage every screen separately or need a heavy CMS setup.

**In scope (v1)**

- Pair screens with a code, see their online status, browser version, last error and a screenshot.
- Playlists of web pages, images and videos with a display duration per item.
- Assign playlists to screens or screen groups, with weekly time windows.
- Remote commands: reload page, reboot, display on/off, screenshot.
- Several admin users with roles, logging in with local accounts or any OIDC provider.
- A one-command install that turns a fresh Raspberry Pi OS into a screen.
- UI in English and German, translatable.

**Out of scope (v1)**

- Several organisations on one server (multi-tenancy).
- Multi-zone layouts (several regions on one screen).
- Interactive or touch content.
- Native players for Android or smart TVs. The player page runs in any current browser, so an x86 mini PC in kiosk mode works too.

**Design principles**

- One Docker container with SQLite; no external services needed to run it.
- All settings through environment variables, with safe defaults.
- Screens only pull from the server, so they work behind any router without port forwarding.
- A screen keeps playing its last content when the server is unreachable.

## Architecture

Three parts: a management server, a player page it serves, and a small setup plus agent on each Pi.

&#91;embedded content: system architecture · server, Pi agent, Chromium kiosk\]

The Pis only ever call the server over HTTPS, so screens work behind any router without port forwarding. The admin never talks to a Pi directly; commands wait on the server until the next heartbeat.

## Component 1: Management server

One Nuxt 3 app (`signage-server`) holds the admin dashboard, the device API and the player page.

It ships as one Docker image and runs at any domain you configure.

**Stack**

- Nuxt 3, Vue 3, TypeScript, Nitro server routes for the API.
- SQLite with Drizzle ORM; media files on a mounted volume (`/data/media`).
- A neutral component library (e.g. Nuxt UI) with a configurable logo and accent colour.
- Device auth: a random per-screen token (32 bytes), stored hashed, sent as `Authorization: Bearer <token>`.

**Users and login**

- **Local accounts** work out of the box: passwords hashed with argon2id, first admin created by a setup wizard on first start or by `ADMIN_EMAIL` + `ADMIN_PASSWORD`.
- **OIDC** is optional and works with any provider (Keycloak, Authentik, Entra ID, Google). Roles come from a configurable claim, or are assigned in the UI.
- Three roles: `admin` (everything, incl. users, settings and reboots), `editor` (playlists, media, schedules), `viewer` (read-only status).

**Configuration** (environment variables)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PUBLIC_URL` | – (required) | Base URL the screens and browsers use |
| `DATA_DIR` | `/data` | SQLite file and media |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | unset | Create the first admin without the wizard |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | unset | Enable OIDC login |
| `OIDC_ROLE_CLAIM` | `roles` | Claim that holds the role names |
| `OIDC_ROLE_MAP` | `admin=admin,editor=editor` | Maps provider roles to app roles |
| `LOCAL_LOGIN` | `true` | Turn off local accounts when OIDC is the only login |
| `URL_SIGNING_SECRET` | generated | Key for signed content URLs (see Security) |
| `OFFLINE_AFTER_S` | `120` | Seconds without heartbeat before a screen counts as offline |
| `SMTP_URL` | unset | Enables offline alerts by email |

**Data model**

| Table | Key fields | Purpose |
| --- | --- | --- |
| `users` | id, email, name, role, password\_hash (nullable), oidc\_sub (nullable) | Admin users |
| `screens` | id, name, location, group\_id, token\_hash, last\_seen\_at, last\_ip, browser\_version, agent\_version, resolution, display\_on, last\_error | One row per screen |
| `screen_groups` | id, name | e.g. "Entrance", "Floor 2" |
| `pairing_codes` | code (6 digits), device\_secret, expires\_at, claimed\_screen\_id | Pairing a new screen |
| `playlists` | id, name, updated\_at | Ordered content lists |
| `playlist_items` | id, playlist\_id, position, type (`url`, `image`, `video`), source, duration\_s, reload\_each\_time, sign\_url, enabled | One slide |
| `assignments` | id, target (screen or group), playlist\_id, weekdays, time\_from, time\_to, priority | What plays where and when |
| `commands` | id, screen\_id, type (`reload`, `reboot`, `display_on`, `display_off`, `screenshot`), created\_at, acked\_at, result | Remote actions |
| `events` | id, screen\_id, at, level, message | Errors and status log, kept 30 days |
| `settings` | key, value | Branding, default playlist, timezone |

Resolving what a screen shows: take the matching assignment with the highest priority, screen before group, in the server's configured timezone. No match means the default playlist.

URL items may contain placeholders that are filled per screen: `{screen.id}`, `{screen.name}`, `{screen.group}`. This lets one content page show different data per screen.

**Device API** (called by the player page and the Pi agent)

| Method + path | Does |
| --- | --- |
| `POST /api/device/pair` | Device starts pairing, gets a 6-digit code + a device secret |
| `GET /api/device/pair/:secret` | Device polls until an admin claims the code, then receives its token |
| `GET /api/device/playlist` | Resolved playlist for now, with an `ETag` (304 when unchanged) |
| `POST /api/device/heartbeat` | Status every 30 s (versions, IP, uptime, display state); response lists pending commands |
| `POST /api/device/commands/:id/ack` | Command done or failed, with a result message |
| `POST /api/device/events` | JS errors and agent errors from the screen |
| `POST /api/device/screenshot` | Upload a PNG on request |

The admin API is a documented REST API (OpenAPI spec generated from the routes), so playlists can also be changed by scripts.

**Admin UI pages**

- **Screens:** all screens with online/offline, current item, browser version, last error and latest screenshot; buttons for reload, reboot, display on/off and screenshot.
- **Pair screen:** enter the 6-digit code shown on the new screen, give it a name and a group.
- **Playlists:** create, reorder by drag and drop, set durations, upload images and videos, preview in the browser.
- **Schedule:** assign playlists to screens or groups by weekday and time.
- **Users:** invite, set roles, disable (admin only).
- **Settings:** branding, timezone, default playlist, API tokens.
- **Event log:** filter by screen and level.

## Component 2: Player page

The player is one page on the server, `/player`, that Chromium opens full screen. It loops through the resolved playlist, keeps working offline, and reports its own errors.

**Behaviour**

1. On load it reads the device token from `localStorage`. Without a token it shows a "not paired" notice; pairing runs through the Pi agent (Component 3) or \`/player/pair\`.
2. It fetches `/api/device/playlist` and polls it every 60 s with the `ETag`. A changed playlist takes effect after the current item ends.
3. Each item type has its own renderer:
   - `url`: an `<iframe>`, preloaded in a hidden second iframe 10 s before its turn, so switching shows no blank frame.
   - `image`: an `<img>` with `object-fit: contain` on black.
   - `video`: a muted, autoplaying `<video>`. The item ends when the video ends, or after `duration_s`.
4. With only one item in the playlist, it stays on screen and reloads only when `reload_each_time` is set.
5. Crossfade between items, 400 ms.

**Robustness**

- A service worker caches the player itself, the last playlist and its images and videos. If the server is unreachable, the screen keeps looping the cached playlist.
- `window.onerror` and `unhandledrejection` are sent to `/api/device/events`, rate-limited to 1 per 10 s.
- A watchdog reloads the page if the rotation loop hasn't advanced for 3× the current item's duration.
- A hidden debug overlay (`?debug=1`) shows token status, current item, last poll and the last errors on screen.

**Iframe rules**

- Pages that forbid framing (`X-Frame-Options`, `frame-ancestors`) can't be shown in an iframe. The admin preview checks the headers and warns when an item is added.
- Content pages you control must allow framing by the signage server: `Content-Security-Policy: frame-ancestors 'self' <PUBLIC_URL>`.
- Pages that normally need a login can use a signed URL instead (see Security).
- Screens without a Pi agent (e.g. a mini PC or a TV browser) can open `/player/pair` directly; the page then handles pairing itself.

## Component 3: Raspberry Pi setup and agent

Each Pi runs Raspberry Pi OS Lite (64-bit, current release) with a minimal Wayland session that shows only Chromium, plus a small Python agent for pairing, status and remote commands. Supported: Pi 4, Pi 5, Pi 400; Pi 3 best effort.

**Install**

The server hosts its own install script, so one command sets up a fresh Pi:

```
curl -fsSL https://<PUBLIC_URL>/install.sh | sudo bash
```

The script is idempotent (safe to run again for updates) and:

- Installs `labwc`, `chromium`, `wlr-randr`, `cec-utils`, `python3-requests`, `python3-websocket` and `unattended-upgrades`.
- Creates a user `kiosk` with console autologin on tty1; its `.bash_profile` starts `labwc`, whose autostart starts the kiosk script.
- Disables screen blanking and the screensaver; sets HDMI hotplug in `config.txt`.
- Writes `/etc/signage/config.toml` with `server_url` and later the device token (mode 600).
- Installs and enables `signage-agent.service` (systemd, restarts on failure).
- Optional flags: `--hostname`, `--rotate 90`, `--vpn tailscale|netbird --vpn-key <key>` for remote SSH.

A pre-built SD card image (built with `pi-gen` in CI) is a later option for people who don't want to use a terminal.

**Kiosk script** (`/usr/local/bin/signage-kiosk`)

Starts Chromium in a restart loop, so a crash brings it back within seconds:

```
chromium --kiosk --ozone-platform=wayland --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble --autoplay-policy=no-user-gesture-required \
  --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
  --user-data-dir=/home/kiosk/.signage-profile \
  "$(cat /run/signage/start-url)"
```

The agent writes the start URL, so it decides whether the screen shows the pairing page or the player.

**Agent** (`pi/agent/`, Python 3.11+, only `requests` and `websocket-client`)

1. **Pairing:** with no token in the config, it calls `POST /api/device/pair` and sets the start URL to `/player/pair?code=<code>`, which shows the code large on screen. It polls until an admin claims the code, saves the token, and navigates Chromium to `/player#t=<token>`. The player stores the token in `localStorage` and removes it from the URL.
2. **Heartbeat** every 30 s: IP, uptime, CPU temperature, free disk, Chromium version, agent version, display state, current page URL (via DevTools).
3. **Commands** from the heartbeat response:
   - `reload`: `Page.reload` over the local DevTools websocket.
   - `reboot`: `systemctl reboot`, allowed for the agent via a narrow sudoers rule.
   - `display_off` / `display_on`: `wlr-randr --output <hdmi> --off/--on`; on TVs also HDMI-CEC standby / wake via `cec-ctl`.
   - `screenshot`: `Page.captureScreenshot`, uploaded as PNG.
4. **Watchdog:** if the DevTools endpoint doesn't answer for 60 s, it kills Chromium; the kiosk loop restarts it.
5. **Self-update:** when the server reports a newer agent version, it downloads and replaces itself, then restarts.
6. Every result is acknowledged; every failure is logged to `/api/device/events` and the journal.

**Remote debugging**

`ssh -L 9222:localhost:9222 kiosk@<screen>` (over your VPN or LAN), then open `chrome://inspect` on your computer and add `localhost:9222`. You get full DevTools for the page on the screen.

**Maintenance**

- `unattended-upgrades` keeps Chromium and the OS patched.
- Optional nightly reboot (systemd timer); time configurable per screen.

## Security, operations and browser support

**Security**

- Device tokens are random, stored only as a hash, and revoked by deleting or re-pairing the screen.
- Tokens travel in the URL fragment (`#t=`) once, never in a query string, so they don't end up in server logs.
- Pairing codes expire after 10 minutes; `POST /api/device/pair` is rate-limited per IP.
- Admin sessions: HTTP-only, `SameSite=Lax` cookies; CSRF protection on all admin writes; login rate-limited.
- Chromium DevTools listen only on `127.0.0.1`; they're reachable only through an SSH tunnel.
- The install script sets SSH to key-only login when a key is given.

**Signed content URLs**

For pages that normally need a login, an item can be marked `sign_url`. The player then receives the URL with three extra parameters: `sx_screen`, `sx_exp` (expiry, 24 h ahead) and `sx_sig` (HMAC-SHA256 over path, screen id and expiry, keyed with `URL_SIGNING_SECRET`).

The content site checks the signature with the same secret and shows a read-only view. The repo ships verification snippets for Node and Python in `docs/signed-urls.md`.

**Operations**

- Deployment: one container plus a `/data` volume; an example `docker-compose.yml` with a reverse proxy (Caddy) for HTTPS.
- Backups: `/api/admin/backup` downloads the SQLite file and media as one archive; restoring is a documented two-step process.
- `GET /api/health` for uptime monitors; optional Prometheus metrics at `/metrics` (screens online, heartbeat lag).
- Logs go to stdout as JSON lines.
- Offline alerts by email when `SMTP_URL` is set; events are kept 30 days.

**Browser support**

- The player page supports Chromium, Firefox and Safari from the last two years; the Pi setup always runs a current Chromium.
- The docs tell content authors to render layout immediately and show placeholders while data loads, so a slow API never leaves a blank screen.

## Implementation plan for Claude Code

Build it in seven phases in one repository, each ending with something that works on a real screen. Put this spec in the repo as `SPEC.md` and reference it from `CLAUDE.md`, so Claude Code reads it in every session.

**Repository layout**

```
signage/
  CLAUDE.md          # conventions + "read SPEC.md first"
  SPEC.md            # this document
  server/            # Nuxt 3 app: admin UI, device API, /player
  pi/
    install.sh       # served by the server at /install.sh
    kiosk.sh
    agent/           # Python agent + systemd unit
  docs/              # user docs, signed-urls.md
  deploy/            # docker-compose.yml, Caddyfile example
  .github/workflows/ # tests, image build, release
```

**Phases**

| Phase | Builds | Done when |
| --- | --- | --- |
| 1. Server skeleton | Nuxt app, Drizzle schema + migrations, local accounts with setup wizard, roles, Dockerfile, CI with lint and tests | A fresh container shows the wizard; an `editor` can't open the Users page |
| 2. Pairing + player (URLs only) | Device API for pairing, playlist and heartbeat; `/player` and `/player/pair` with `url` items; pages Screens, Pair screen, Playlists | A desktop browser at `/player/pair` can be paired and loops two URLs |
| 3. Pi setup + agent | `install.sh` served by the server, kiosk script, agent with pairing, heartbeat and `reload` | One command on a fresh Pi shows a code; after pairing it appears online with its Chromium version |
| 4. Media + scheduling | Uploads, groups, assignments with time windows, URL placeholders | An image playlist plays only during its time window on a group of screens |
| 5. Remote control + robustness | `reboot`, display on/off, screenshots, offline cache, watchdog, self-update, event log | Pulling the network cable keeps the playlist looping; a reload lands within 30 s |
| 6. Integrations | OIDC login with role mapping, signed content URLs, branding, English + German UI | Login works with a Keycloak and an Authentik test instance; a signed URL verifies with the Python snippet |
| 7. Release | Docs, compose example, image published to GHCR, versioned releases, LICENSE | A new user gets from zero to a playing screen by following the README only |

**Prompts to start each phase**

1. "Read SPEC.md. Implement phase 1: the Nuxt 3 app in `server/` with TypeScript, Drizzle + SQLite with the full data model, local accounts with argon2id, the setup wizard, the three roles, a Dockerfile and a CI workflow. Ask me for anything the spec leaves open before writing code."
2. "Implement phase 2 from SPEC.md: the device API for pairing, playlist (with ETag) and heartbeat, `/player` and `/player/pair` for `url` items with preloading, and the admin pages Screens, Pair screen and Playlists. Add tests for pairing and playlist resolution."
3. "Implement phase 3 from SPEC.md in `pi/`: an idempotent `install.sh` for Raspberry Pi OS Lite 64-bit served at `/install.sh`, the kiosk script, and the Python agent with pairing, heartbeat and `reload` over the local DevTools websocket. Keep the agent to `requests` and `websocket-client`."
4. "Implement phase 4 from SPEC.md: uploads, screen groups, assignments with weekday and time windows including the priority rules, and URL placeholders. Add tests for the resolution rules and timezones."
5. "Implement phase 5 from SPEC.md: the remaining commands, screenshots, the service worker offline cache, the watchdog, agent self-update and the event log page."
6. "Implement phase 6 from SPEC.md: optional OIDC login with `OIDC_ROLE_CLAIM` and `OIDC_ROLE_MAP`, signed content URLs with verification snippets in `docs/signed-urls.md`, branding settings, and i18n with English and German."
7. "Prepare phase 7 from SPEC.md: write the README and docs, the compose example with Caddy, a release workflow that publishes the image to GHCR with semantic version tags, and the LICENSE file."

## Open decisions

- [ ] Project name ("signage" is a working title).
- [ ] License: MIT (anyone may reuse it, also in closed products) or AGPL-3.0 (changes to a hosted version must be shared)?
- [ ] Server language: Nuxt full-stack (one codebase with the player) or a Python backend (FastAPI) with a Nuxt admin UI?
- [ ] Support PostgreSQL besides SQLite for larger installs?
- [ ] Ship the pre-built SD card image already in v1, or only the install script?
- [ ] Multi-tenancy (several organisations on one server) as a later goal, or never?
