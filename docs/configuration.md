# Configuration

Everything is configured with environment variables. Only `PUBLIC_URL` is required.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PUBLIC_URL` | – (required) | Base URL screens and browsers use, e.g. `https://signage.example.org` |
| `DATA_DIR` | `/data` | SQLite database (`placard.db`), `media/`, `screenshots/` |
| `PORT`, `HOST` | `3000`, `0.0.0.0` | Where the server listens |
| `TZ` | `UTC` | Container time zone; also the initial time zone in **Settings**, which the schedule uses and Raspberry Pi screens set their clock to |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | unset | Create the first admin on start instead of using the setup wizard. With OIDC as the only login, `ADMIN_EMAIL` alone makes that OIDC user the first admin |
| `LOCAL_LOGIN` | `true` | Set to `false` to allow only OIDC login |
| `OIDC_ISSUER` | unset | Issuer URL; enables OIDC login together with `OIDC_CLIENT_ID` |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | unset | Client credentials |
| `OIDC_NAME` | `Single sign-on` | Label of the login button |
| `OIDC_SCOPES` | `openid email profile` | Requested scopes |
| `OIDC_ROLE_CLAIM` | `roles` | Claim with the role names; dotted paths work, e.g. `realm_access.roles` |
| `OIDC_ROLE_MAP` | `admin=admin,editor=editor` | Maps provider roles to app roles: `provider=app,…` |
| `OIDC_DEFAULT_ROLE` | `viewer` | Role for new OIDC users without a mapped role; `none` refuses them unless an admin invited them |
| `URL_SIGNING_SECRET` | generated | Key for [signed content URLs](signed-urls.md). If unset, a random key is generated and kept in the database |
| `OFFLINE_AFTER_S` | `120` | Seconds without heartbeat before a screen counts as offline |
| `SMTP_URL` | unset | Enables e-mail (offline alerts, invitations), e.g. `smtps://user:pass@mail.example.org:465` |
| `SMTP_FROM` | `Placard Signage <signage@localhost>` | Sender address |
| `MAX_UPLOAD_MB` | `1024` | Largest accepted upload |
| `METRICS` | `false` | Serve Prometheus metrics at `/metrics` |

Settings that change at runtime (branding, logo, accent colour, schedule time zone, default playlist, API tokens) live in the dashboard under **Settings**.

## Roles

| | viewer | editor | admin |
| --- | :-: | :-: | :-: |
| See screens, playlists, schedule, events | ✓ | ✓ | ✓ |
| Edit playlists, media, schedule, groups; reload, screenshot, display on/off | | ✓ | ✓ |
| Pair, delete and reboot screens; users; settings; API tokens; backups | | | ✓ |
