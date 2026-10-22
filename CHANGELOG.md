# Changelog

## [Unreleased]

- Screens set their time zone to the one in **Settings** (agent 1.1.0). Existing Pis need `install.sh` once more to be allowed to change it.
- The mouse cursor is hidden on screens (`install.sh --show-cursor` brings it back).

## [0.1.0]

First version.

- Management server (Nuxt 3, SQLite) in one Docker image: screens, pairing, playlists with web pages, images and videos, groups, weekly schedules with priorities, remote commands, screenshots, event log, users with roles, local and OIDC login, API tokens, backups, Prometheus metrics, e-mail alerts.
- Player page with crossfade, preloading, offline cache, watchdog and error reporting.
- Raspberry Pi install script, Chromium kiosk loop and self-updating Python agent.
- English and German UI.
