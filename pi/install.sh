#!/usr/bin/env bash
# Placard Signage – turns a fresh Raspberry Pi OS Lite (64-bit) into a screen.
#
#   curl -fsSL https://signage.example.org/install.sh | sudo bash
#   curl -fsSL https://signage.example.org/install.sh | sudo bash -s -- --hostname foyer --rotate 90
#
# Options:
#   --server URL            server to use (default: the server this script was downloaded from)
#   --hostname NAME         set the hostname
#   --rotate 0|90|180|270   rotate the display
#   --vpn tailscale|netbird --vpn-key KEY   join a VPN for remote SSH
#   --ssh-key "ssh-ed25519 AAAA…"           allow this key for the user kiosk and turn off SSH passwords
#   --no-reboot             do not reboot at the end of a first install
#   --show-cursor           show the mouse cursor (it is hidden by default)
#
# Safe to run again: it updates the packages, the kiosk script and the agent, and keeps the pairing.
set -euo pipefail

SERVER_URL="__PLACARD_SERVER_URL__"
HOSTNAME_NEW=""
ROTATE=""
VPN=""
VPN_KEY=""
SSH_KEY=""
REBOOT=1
SHOW_CURSOR=0
KIOSK_USER=kiosk
CONF_DIR=/etc/placard
AGENT_DIR=/opt/placard

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --server) SERVER_URL="${2:?}"; shift 2 ;;
    --hostname) HOSTNAME_NEW="${2:?}"; shift 2 ;;
    --rotate) ROTATE="${2:?}"; shift 2 ;;
    --vpn) VPN="${2:?}"; shift 2 ;;
    --vpn-key) VPN_KEY="${2:?}"; shift 2 ;;
    --ssh-key) SSH_KEY="${2:?}"; shift 2 ;;
    --no-reboot) REBOOT=0; shift ;;
    --show-cursor) SHOW_CURSOR=1; shift ;;
    -h|--help) sed -n '2,19p' "$0" 2>/dev/null || true; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

SERVER_URL="${SERVER_URL%/}"
[ "$(id -u)" -eq 0 ] || die "run as root: curl -fsSL $SERVER_URL/install.sh | sudo bash"
case "$SERVER_URL" in http://*|https://*) ;; *) die "no server URL; pass --server https://your-server" ;; esac
case "$ROTATE" in ""|0|90|180|270) ;; *) die "--rotate must be 0, 90, 180 or 270" ;; esac
case "$VPN" in ""|tailscale|netbird) ;; *) die "--vpn must be tailscale or netbird" ;; esac
[ -z "$VPN" ] || [ -n "$VPN_KEY" ] || die "--vpn needs --vpn-key"
command -v apt-get >/dev/null || die "this script supports Raspberry Pi OS / Debian only"
[ "$(uname -m)" = aarch64 ] || warn "not a 64-bit ARM system ($(uname -m)); continuing anyway"

FIRST_INSTALL=1
[ -f "$CONF_DIR/config.toml" ] && FIRST_INSTALL=0

say "Checking the server at $SERVER_URL"
curl -fsS --max-time 20 "$SERVER_URL/api/health" >/dev/null || die "cannot reach $SERVER_URL/api/health"

# ---------------------------------------------------------------- packages
say "Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
# Raspberry Pi OS Bookworm ships its optimised build as chromium-browser; Trixie and Debian call it chromium.
CHROMIUM_PKG=chromium
apt-cache show chromium-browser >/dev/null 2>&1 && CHROMIUM_PKG=chromium-browser
apt-get install -y -q --no-install-recommends \
  labwc wlr-randr "$CHROMIUM_PKG" cec-utils v4l-utils \
  python3 python3-requests python3-websocket \
  unattended-upgrades curl ca-certificates fonts-noto-color-emoji fonts-dejavu-core
apt-get upgrade -y -q "$CHROMIUM_PKG" || true

# ---------------------------------------------------------------- user and autologin
if ! id "$KIOSK_USER" >/dev/null 2>&1; then
  say "Creating user $KIOSK_USER"
  useradd -m -s /bin/bash "$KIOSK_USER"
fi
for g in video render input audio; do
  getent group "$g" >/dev/null && usermod -aG "$g" "$KIOSK_USER"
done
KIOSK_HOME="$(getent passwd "$KIOSK_USER" | cut -d: -f6)"

say "Setting up console autologin and labwc"
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf <<EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $KIOSK_USER --noclear %I \$TERM
EOF
systemctl set-default multi-user.target >/dev/null

cat > "$KIOSK_HOME/.bash_profile" <<'EOF'
# Placard Signage: start the Wayland session on the first console only.
if [ -z "${WAYLAND_DISPLAY:-}" ] && [ "$(tty)" = /dev/tty1 ]; then
  exec labwc
fi
EOF
mkdir -p "$KIOSK_HOME/.config/labwc"
cat > "$KIOSK_HOME/.config/labwc/autostart" <<'EOF'
/usr/local/bin/placard-kiosk >/tmp/placard-kiosk.log 2>&1 &
EOF

# ---------------------------------------------------------------- mouse cursor
# Wayland has no "hide cursor" switch, so the kiosk session gets a cursor theme
# whose cursors are a single transparent pixel. It covers labwc, the player and
# pages inside iframes. --show-cursor switches back to the normal cursor.
CURSOR_THEME=placard-hidden
CURSOR_DIR="/usr/share/icons/$CURSOR_THEME/cursors"
mkdir -p "$CURSOR_DIR"
python3 - "$CURSOR_DIR/left_ptr" <<'EOF'
import struct, sys
# Xcursor file: header, one table-of-contents entry, one 1x1 image chunk (all little-endian uint32).
IMAGE = 0xFFFD0002
header = struct.pack("<4sIII", b"Xcur", 16, 0x10000, 1)
toc = struct.pack("<III", IMAGE, 1, 28)
chunk = struct.pack("<IIIIIIIIII", 36, IMAGE, 1, 1, 1, 1, 0, 0, 0, 0)  # 1x1, hotspot 0,0, transparent pixel
open(sys.argv[1], "wb").write(header + toc + chunk)
EOF
for name in default arrow top_left_arrow pointer hand hand1 hand2 pointing_hand text xterm ibeam \
  wait watch progress left_ptr_watch half-busy crosshair cross move fleur grab grabbing openhand closedhand \
  not-allowed no-drop forbidden crossed_circle help question_arrow context-menu cell copy alias \
  col-resize row-resize n-resize s-resize e-resize w-resize ne-resize nw-resize se-resize sw-resize \
  ew-resize ns-resize nesw-resize nwse-resize all-scroll zoom-in zoom-out vertical-text \
  sb_h_double_arrow sb_v_double_arrow top_side bottom_side left_side right_side \
  top_left_corner top_right_corner bottom_left_corner bottom_right_corner; do
  ln -sf left_ptr "$CURSOR_DIR/$name"
done
printf '[Icon Theme]\nName=%s\nComment=Invisible cursor for Placard Signage kiosks\n' "$CURSOR_THEME" \
  > "/usr/share/icons/$CURSOR_THEME/index.theme"

# labwc reads its environment from this file; keep lines the admin added (e.g. XKB_DEFAULT_LAYOUT=ch).
LABWC_ENV="$KIOSK_HOME/.config/labwc/environment"
touch "$LABWC_ENV"
sed -i '/^XCURSOR_THEME=/d; /^XCURSOR_SIZE=/d' "$LABWC_ENV"
mkdir -p "$KIOSK_HOME/.config/gtk-3.0"
if [ "$SHOW_CURSOR" = 1 ]; then
  rm -f "$KIOSK_HOME/.config/gtk-3.0/settings.ini"
  if grep -qs "Inherits=$CURSOR_THEME" /usr/share/icons/default/index.theme; then
    rm -f /usr/share/icons/default/index.theme
  fi
else
  printf 'XCURSOR_THEME=%s\nXCURSOR_SIZE=24\n' "$CURSOR_THEME" >> "$LABWC_ENV"
  # Chromium may take the theme from GTK settings or the system default theme instead.
  printf '[Settings]\ngtk-cursor-theme-name=%s\n' "$CURSOR_THEME" > "$KIOSK_HOME/.config/gtk-3.0/settings.ini"
  if [ ! -e /usr/share/icons/default/index.theme ] || grep -qs "Inherits=$CURSOR_THEME" /usr/share/icons/default/index.theme; then
    mkdir -p /usr/share/icons/default
    printf '[Icon Theme]\nInherits=%s\n' "$CURSOR_THEME" > /usr/share/icons/default/index.theme
  fi
fi
chown -R "$KIOSK_USER:$KIOSK_USER" "$KIOSK_HOME/.bash_profile" "$KIOSK_HOME/.config"

# ---------------------------------------------------------------- display settings
BOOT_DIR=/boot/firmware
[ -d "$BOOT_DIR" ] || BOOT_DIR=/boot
if [ -f "$BOOT_DIR/config.txt" ] && ! grep -q '^hdmi_force_hotplug=1' "$BOOT_DIR/config.txt"; then
  say "Enabling HDMI hotplug in $BOOT_DIR/config.txt"
  printf '\n# Placard Signage\n[all]\nhdmi_force_hotplug=1\n' >> "$BOOT_DIR/config.txt"
fi
if [ -f "$BOOT_DIR/cmdline.txt" ] && ! grep -q 'consoleblank=0' "$BOOT_DIR/cmdline.txt"; then
  say "Disabling console blanking"
  sed -i '1 s/$/ consoleblank=0/' "$BOOT_DIR/cmdline.txt"
fi
if command -v raspi-config >/dev/null; then
  raspi-config nonint do_blanking 1 >/dev/null 2>&1 || true
fi

# ---------------------------------------------------------------- configuration
say "Writing $CONF_DIR"
mkdir -p "$CONF_DIR"
TOKEN_LINE=""
if [ -f "$CONF_DIR/config.toml" ]; then
  TOKEN_LINE="$(grep -E '^token *=' "$CONF_DIR/config.toml" || true)"
  OLD_SERVER="$(sed -n 's/^server_url *= *"\(.*\)"/\1/p' "$CONF_DIR/config.toml")"
  if [ -n "$OLD_SERVER" ] && [ "$OLD_SERVER" != "$SERVER_URL" ]; then
    warn "server changed from $OLD_SERVER to $SERVER_URL; the screen has to be paired again"
    TOKEN_LINE=""
  fi
fi
{
  echo "# Placard Signage agent configuration. Written by install.sh and the agent."
  echo "server_url = \"$SERVER_URL\""
  [ -n "$TOKEN_LINE" ] && echo "$TOKEN_LINE"
} > "$CONF_DIR/config.toml"
if [ -n "$ROTATE" ] || [ ! -f "$CONF_DIR/kiosk.env" ]; then
  echo "ROTATE=${ROTATE:-0}" > "$CONF_DIR/kiosk.env"
fi
chown -R "$KIOSK_USER:$KIOSK_USER" "$CONF_DIR"
chmod 700 "$CONF_DIR"
chmod 600 "$CONF_DIR/config.toml"

# ---------------------------------------------------------------- kiosk script and agent
say "Installing the kiosk script and the agent from $SERVER_URL"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$SERVER_URL/agent/placard-kiosk" -o "$TMP/placard-kiosk"
curl -fsSL "$SERVER_URL/agent/placard_agent.py" -o "$TMP/placard_agent.py"
curl -fsSL "$SERVER_URL/agent/placard-agent.service" -o "$TMP/placard-agent.service"
python3 -m py_compile "$TMP/placard_agent.py"
install -m 755 "$TMP/placard-kiosk" /usr/local/bin/placard-kiosk
install -d -o "$KIOSK_USER" -g "$KIOSK_USER" -m 755 "$AGENT_DIR"
install -o "$KIOSK_USER" -g "$KIOSK_USER" -m 755 "$TMP/placard_agent.py" "$AGENT_DIR/placard_agent.py"
install -m 644 "$TMP/placard-agent.service" /etc/systemd/system/placard-agent.service

# The agent may reboot the Pi and set its time zone (from the dashboard), nothing else.
cat > "$TMP/sudoers" <<EOF
$KIOSK_USER ALL=(root) NOPASSWD: /usr/bin/systemctl reboot, /usr/bin/timedatectl set-timezone *
EOF
visudo -cf "$TMP/sudoers" >/dev/null
install -m 440 "$TMP/sudoers" /etc/sudoers.d/placard

systemctl daemon-reload
systemctl enable placard-agent.service >/dev/null
systemctl restart placard-agent.service

# ---------------------------------------------------------------- updates
say "Enabling automatic security and Chromium updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
cat > /etc/apt/apt.conf.d/52placard-unattended <<'EOF'
// Placard Signage: keep Chromium and the OS patched.
Unattended-Upgrade::Origins-Pattern {
  "origin=Debian,codename=${distro_codename},label=Debian";
  "origin=Debian,codename=${distro_codename}-updates";
  "origin=Debian,codename=${distro_codename},label=Debian-Security";
  "origin=Debian,codename=${distro_codename}-security,label=Debian-Security";
  "origin=Raspberry Pi Foundation,codename=${distro_codename}";
  "origin=Raspbian,codename=${distro_codename}";
};
Unattended-Upgrade::Automatic-Reboot "false";
EOF

# ---------------------------------------------------------------- hostname, SSH, VPN
if [ -n "$HOSTNAME_NEW" ] && [ "$HOSTNAME_NEW" != "$(hostname)" ]; then
  say "Setting hostname to $HOSTNAME_NEW"
  OLD_HOST="$(hostname)"
  hostnamectl set-hostname "$HOSTNAME_NEW"
  sed -i "s/\b$OLD_HOST\b/$HOSTNAME_NEW/g" /etc/hosts
  grep -q "\b$HOSTNAME_NEW\b" /etc/hosts || echo "127.0.1.1 $HOSTNAME_NEW" >> /etc/hosts
fi

if [ -n "$SSH_KEY" ]; then
  say "Adding the SSH key for $KIOSK_USER and turning off password login"
  install -d -o "$KIOSK_USER" -g "$KIOSK_USER" -m 700 "$KIOSK_HOME/.ssh"
  touch "$KIOSK_HOME/.ssh/authorized_keys"
  grep -qxF "$SSH_KEY" "$KIOSK_HOME/.ssh/authorized_keys" || echo "$SSH_KEY" >> "$KIOSK_HOME/.ssh/authorized_keys"
  chown "$KIOSK_USER:$KIOSK_USER" "$KIOSK_HOME/.ssh/authorized_keys"
  chmod 600 "$KIOSK_HOME/.ssh/authorized_keys"
  mkdir -p /etc/ssh/sshd_config.d
  cat > /etc/ssh/sshd_config.d/50-placard.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
  systemctl enable --now ssh >/dev/null 2>&1 || true
  systemctl reload ssh >/dev/null 2>&1 || true
fi

case "$VPN" in
  tailscale)
    say "Joining Tailscale"
    command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
    tailscale up --authkey "$VPN_KEY" --hostname "$(hostname)" --ssh=false
    ;;
  netbird)
    say "Joining NetBird"
    command -v netbird >/dev/null || curl -fsSL https://pkgs.netbird.io/install.sh | sh
    netbird up --setup-key "$VPN_KEY"
    ;;
esac

# ---------------------------------------------------------------- done
say "Done."
if [ "$FIRST_INSTALL" = 1 ]; then
  echo "After the reboot the screen shows a pairing code. Enter it at $SERVER_URL/pair"
  if [ "$REBOOT" = 1 ]; then
    say "Rebooting in 10 seconds (Ctrl+C to cancel)"
    sleep 10
    systemctl reboot
  else
    echo "Reboot to start the kiosk: sudo reboot"
  fi
else
  echo "Updated. The kiosk keeps running; reboot to apply display changes."
fi
