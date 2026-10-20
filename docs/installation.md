# Server installation

The server is one Docker image with a `/data` volume (SQLite database, uploaded media, screenshots). It serves the admin dashboard, the device API, the player page and the Raspberry Pi install script.

## With Docker Compose and Caddy (recommended)

`deploy/` contains a `docker-compose.yml` that runs Placard behind [Caddy](https://caddyserver.com), which gets a Let's Encrypt certificate automatically.

1. Point a DNS record (e.g. `signage.example.org`) to your server. Ports 80 and 443 must be reachable from the internet for the certificate.
2. Copy `deploy/docker-compose.yml`, `deploy/Caddyfile` and `deploy/.env.example` (as `.env`) to the server.
3. Set `DOMAIN` and `ACME_EMAIL` in `.env`.
4. `docker compose up -d`
5. Open `https://signage.example.org` and create the first admin.

To skip the setup wizard, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the compose file; the admin is created on the first start.

## Behind your own reverse proxy

Run the container and proxy HTTPS to port 3000:

```sh
docker run -d --name placard --restart unless-stopped \
  -e PUBLIC_URL=https://signage.example.org \
  -v placard-data:/data -p 127.0.0.1:3000:3000 \
  ghcr.io/OWNER/placard-signage:1
```

- `PUBLIC_URL` must be the address browsers and screens use.
- Allow large request bodies for video uploads (e.g. nginx: `client_max_body_size 2g;`).
- The server trusts `X-Forwarded-For` for rate limits and logs; make sure the proxy sets it.

## Updates

```sh
docker compose pull && docker compose up -d
```

Database migrations run automatically at startup. Image tags: `1` (latest 1.x), `1.2` (latest 1.2.x), `1.2.3` (exact), `latest`.

The Raspberry Pi agent updates itself: when the server ships a newer agent, every screen downloads it with its next heartbeat. Chromium and the OS are updated by `unattended-upgrades` on each Pi.

## Backups

**Settings → Backup → Download backup** (admin), or with an API token:

```sh
curl -fsS -H "Authorization: Bearer $TOKEN" https://signage.example.org/api/admin/backup -o placard-backup.tar.gz
```

The archive contains `placard.db` (a consistent copy of the database) and the `media/` folder. Screenshots are not included.

### Restore

1. Stop the server: `docker compose stop placard`
2. Unpack the archive into the data volume, replacing the database:
   ```sh
   docker run --rm -v placard_placard-data:/data -v "$PWD":/backup alpine \
     sh -c 'rm -f /data/placard.db /data/placard.db-wal /data/placard.db-shm && tar -xzf /backup/placard-backup.tar.gz -C /data && chown -R 1000:1000 /data'
   ```
   (`placard_placard-data` is the volume name Compose creates; check with `docker volume ls`.)
3. Start it again: `docker compose start placard`

Screens keep their tokens, so they reconnect on their own.

## Monitoring

- `GET /api/health` returns `{"status":"ok"}` when the server and database work. Use it for uptime monitors; the image also has a Docker `HEALTHCHECK`.
- With `METRICS=true`, `GET /metrics` serves Prometheus metrics: `placard_screens`, `placard_screens_online`, `placard_heartbeat_lag_seconds{screen=…}`. Restrict access to `/metrics` in your reverse proxy.
- Logs go to stdout as JSON lines: `docker compose logs -f placard`.
- With `SMTP_URL` set, admins get an e-mail when screens go offline.
