# Placard Signage

Open-source, self-hosted digital signage. Raspberry Pis run a current Chromium in kiosk mode and are managed from one web dashboard. No per-screen fees, full DevTools access, one Docker container.

Built for clubs, schools, associations and small businesses with 1 to about 100 screens.

## Features

- **Screens:** pair with a 6-digit code; see online status, what is showing, browser version, last error and a screenshot.
- **Playlists** of web pages, images and videos, with a duration per item, drag-and-drop ordering and a live preview.
- **Schedule** playlists per screen or group by weekday and time, with priorities and a default playlist.
- **Remote control:** reload, reboot, display on/off (incl. HDMI-CEC), screenshot.
- **Keeps playing offline:** the player caches itself, the playlist and its media.
- **Users and roles** (admin, editor, viewer) with local accounts or any OIDC provider (Keycloak, Authentik, Entra ID, Google, …).
- **One-command Pi setup:** `curl -fsSL https://your-server/install.sh | sudo bash`.
- Signed content URLs, URL placeholders per screen, REST API with OpenAPI docs, backups, Prometheus metrics, e-mail alerts.
- UI in English and German.

## Quick start

You need a server with Docker and a domain name pointing to it.

```sh
mkdir placard && cd placard
curl -fsSLO https://raw.githubusercontent.com/OWNER/placard-signage/main/deploy/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/OWNER/placard-signage/main/deploy/Caddyfile
curl -fsSL https://raw.githubusercontent.com/OWNER/placard-signage/main/deploy/.env.example -o .env
nano .env              # set DOMAIN and ACME_EMAIL
docker compose up -d
```

Open `https://<your domain>` and create the first admin account.

### Add a screen

1. Flash **Raspberry Pi OS Lite (64-bit)** with Raspberry Pi Imager. Set Wi-Fi (or use Ethernet), a user and SSH in the Imager settings.
2. Log in on the Pi and run:
   ```sh
   curl -fsSL https://<your domain>/install.sh | sudo bash
   ```
3. After the reboot the screen shows a 6-digit code. In the dashboard, open **Screens → Pair screen** and enter it.
4. Create a playlist under **Playlists**. The first playlist becomes the default and plays on every screen right away.

No Pi? Open `https://<your domain>/player/pair` full screen in any current browser (a mini PC in kiosk mode, a smart TV browser) and pair it the same way.

## Documentation

- [Server installation, updates and backups](docs/installation.md)
- [Configuration (environment variables)](docs/configuration.md)
- [Raspberry Pi setup, remote debugging and troubleshooting](docs/raspberry-pi.md)
- [Content: playlists, schedules, web pages in iframes](docs/content.md)
- [Login with OIDC](docs/oidc.md)
- [Signed content URLs](docs/signed-urls.md)
- [REST API](docs/api.md)
- [Development](CLAUDE.md) and the [specification](SPEC.md)

## How it works

```
 Admin's browser ──HTTPS──▶  Placard server (Docker: Nuxt + SQLite)
                                ▲            ▲
                     heartbeat, │            │ playlist, media
                     commands   │            │
                          Pi agent (Python) ─┼─ Chromium kiosk ── /player
```

Screens only make outgoing HTTPS requests, so they work behind any router without port forwarding. Commands wait on the server until the next heartbeat (every 30 s).

## License

See [LICENSE](LICENSE).
