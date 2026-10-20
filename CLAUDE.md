# Placard Signage

Read `SPEC.md` first: it is the specification this repository implements.

## Layout

- `server/` – Nuxt 3 app (compatibility version 4): admin UI (`app/`), Nitro API (`server/`), player (`app/pages/player/`).
- `pi/` – Raspberry Pi side: `install.sh` (served at `/install.sh`), `kiosk.sh`, `agent/placard_agent.py` (+ systemd unit).
- `docs/` – user docs. `deploy/` – compose example with Caddy.

## Conventions

- TypeScript strict, ESLint via `@nuxt/eslint` (no semicolons, single quotes, 2 spaces).
- Database: SQLite + Drizzle. Change `server/server/db/schema.ts`, then `pnpm db:generate` and commit the migration. Migrations run at startup.
- Timestamps are Unix milliseconds in integer columns.
- API handlers: one file per route under `server/server/api/`, `defineRouteMeta` for the OpenAPI docs, validate bodies with `parseBody(event, zodSchema)`, check roles with `requireRole(event, 'viewer' | 'editor' | 'admin')`.
- Device routes (`/api/device/*`) authenticate with `requireDevice(event)` (bearer token, stored as SHA-256 hash).
- Admin writes with a session cookie need the `x-csrf-token` header; `api()` in `app/composables/useApi.ts` adds it.
- All UI strings go through `t('key')`; add keys to both `app/locales/en.ts` and `app/locales/de.ts`.
- Configuration only through environment variables (`server/server/utils/config.ts`), documented in `docs/configuration.md`.
- Logs: `log(level, msg, fields)` writes JSON lines; screen-related events go through `logEvent()` so they appear in the event log.
- The agent stays dependency-light: Python 3.11+ standard library plus `requests` and `websocket-client`. Bump `AGENT_VERSION` when changing it; screens update themselves.

## Commands (in `server/`)

```sh
pnpm install
pnpm dev                 # http://localhost:3000, data in server/.data
pnpm lint && pnpm typecheck
pnpm build && pnpm test  # integration tests start the built server
python3 -m unittest discover -s ../pi/agent -p 'test_*.py'   # agent tests
```
