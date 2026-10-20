#!/usr/bin/env bash
# Placard Signage kiosk: started by labwc's autostart for the user "kiosk".
# Runs Chromium full screen in a loop, so a crash brings it back within seconds.
set -u

CONFIG=/etc/placard/config.toml
START_URL_FILE=/run/placard/start-url
PROFILE="$HOME/.placard-profile"

# shellcheck source=/dev/null
[ -f /etc/placard/kiosk.env ] && . /etc/placard/kiosk.env
ROTATE="${ROTATE:-0}"

CHROMIUM="$(command -v chromium || command -v chromium-browser || true)"
if [ -z "$CHROMIUM" ]; then
  echo "placard-kiosk: chromium is not installed" >&2
  exit 1
fi

server_url() {
  sed -n 's/^server_url *= *"\(.*\)"/\1/p' "$CONFIG" 2>/dev/null | head -n1
}

apply_rotation() {
  case "$ROTATE" in
    90|180|270)
      for out in $(wlr-randr 2>/dev/null | awk '/^[^ ]/ {print $1}'); do
        wlr-randr --output "$out" --transform "$ROTATE" || true
      done
      ;;
  esac
}

# Chromium shows a "restore pages" bubble after an unclean exit; mark the last exit as clean.
mark_clean_exit() {
  local prefs="$PROFILE/Default/Preferences"
  [ -f "$prefs" ] || return 0
  sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"[^"]*"/"exit_type":"Normal"/' "$prefs"
}

apply_rotation
mkdir -p "$PROFILE"

while true; do
  # The agent writes the start URL (pairing page or player). Wait for it briefly after boot.
  for _ in $(seq 1 20); do
    [ -s "$START_URL_FILE" ] && break
    sleep 1
  done
  url="$(cat "$START_URL_FILE" 2>/dev/null || true)"
  [ -n "$url" ] || url="$(server_url)/player"

  mark_clean_exit
  "$CHROMIUM" \
    --kiosk \
    --ozone-platform=wayland \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --autoplay-policy=no-user-gesture-required \
    --remote-debugging-port=9222 \
    --remote-debugging-address=127.0.0.1 \
    --user-data-dir="$PROFILE" \
    --no-first-run \
    --password-store=basic \
    --check-for-update-interval=31536000 \
    --disable-features=Translate,TranslateUI \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    "$url"
  echo "placard-kiosk: chromium exited with $?, restarting" >&2
  sleep 3
done
