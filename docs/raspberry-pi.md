# Raspberry Pi screens

Supported: Raspberry Pi 4, Pi 5 and Pi 400 with **Raspberry Pi OS Lite (64-bit)**, current release. Pi 3 works on a best-effort basis. Any Debian-based mini PC works the same way.

## Install

1. Flash Raspberry Pi OS Lite (64-bit) with Raspberry Pi Imager. In the Imager settings, set a user, Wi-Fi if needed, and enable SSH.
2. Boot the Pi, log in (locally or over SSH) and run:

   ```sh
   curl -fsSL https://signage.example.org/install.sh | sudo bash
   ```

3. The Pi reboots and shows a pairing code. Enter it in the dashboard under **Screens → Pair screen**.

Options go after `bash -s --`:

```sh
curl -fsSL https://signage.example.org/install.sh | sudo bash -s -- \
  --hostname foyer --rotate 90 --ssh-key "ssh-ed25519 AAAA… you@laptop"
```

| Option | Effect |
| --- | --- |
| `--hostname NAME` | Sets the hostname |
| `--rotate 0\|90\|180\|270` | Rotates the display (portrait screens) |
| `--ssh-key "KEY"` | Adds the key for the user `kiosk` and turns off SSH password login |
| `--vpn tailscale --vpn-key KEY` | Joins your Tailscale network (for remote SSH) |
| `--vpn netbird --vpn-key KEY` | Joins your NetBird network |
| `--server URL` | Uses another server than the one the script came from |
| `--no-reboot` | Does not reboot at the end of the first install |
| `--show-cursor` | Shows the mouse cursor (hidden by default) |

The script is safe to run again: it updates packages, the kiosk script and the agent, and keeps the pairing.

## What gets installed

- Packages: `labwc` (a minimal Wayland compositor), `chromium`, `wlr-randr`, `cec-utils`, `v4l-utils`, `python3-requests`, `python3-websocket`, `unattended-upgrades`.
- User `kiosk` with console autologin on tty1. Its `~/.bash_profile` starts `labwc`, whose autostart runs `/usr/local/bin/placard-kiosk`.
- `/usr/local/bin/placard-kiosk` starts Chromium in kiosk mode in a loop, so a crash brings it back within seconds. DevTools listen on `127.0.0.1:9222` only.
- `/opt/placard/placard_agent.py` with `placard-agent.service` (systemd, runs as `kiosk`, restarts on failure).
- `/etc/placard/config.toml` (server URL and device token, mode 600) and `/etc/placard/kiosk.env` (rotation).
- `/etc/sudoers.d/placard`: the agent may run `systemctl reboot`, nothing else.
- The mouse cursor is hidden: the kiosk session uses an invisible cursor theme (`/usr/share/icons/placard-hidden`), which also covers web pages in iframes. Run the script again with `--show-cursor` to get it back.
- Screen blanking off, `hdmi_force_hotplug=1` in `config.txt` (the Pi outputs video even when the screen is switched off at boot).
- `unattended-upgrades` for Debian and Raspberry Pi OS updates, which includes Chromium.

## The agent

The agent is a single Python file. It:

1. **pairs** the screen: it asks the server for a code, shows `/player/pair?code=…` and waits until an admin enters the code, then stores the token and opens the player;
2. sends a **heartbeat** every 30 s: IP, uptime, CPU temperature, free disk and memory, Chromium and agent version, display state and the current page;
3. runs **commands** from the heartbeat response: reload (DevTools `Page.reload`), reboot, display on/off (`wlr-randr`, plus HDMI-CEC standby/wake on TVs), screenshot (DevTools `Page.captureScreenshot`);
4. restarts Chromium when DevTools do not answer for 60 s (**watchdog**);
5. **updates itself** when the server has a newer version (checksum-verified);
6. reboots nightly if a time is set for the screen in the dashboard.

Useful commands on the Pi:

```sh
journalctl -u placard-agent -f                 # agent log
sudo -u kiosk python3 /opt/placard/placard_agent.py --status  # what the agent reports
sudo -u kiosk python3 /opt/placard/placard_agent.py --unpair && sudo systemctl restart placard-agent
cat /tmp/placard-kiosk.log                     # kiosk script / Chromium output
```

## Remote debugging

Chromium's DevTools are reachable only through an SSH tunnel:

```sh
ssh -L 9222:localhost:9222 kiosk@<screen>
```

Then open `chrome://inspect` in Chrome on your computer, click **Configure…**, add `localhost:9222`, and inspect the page. You get the full DevTools for what the screen shows, including the content iframes.

Add `?debug=1` to the player URL to see token status, the current item, the last poll and recent errors on the screen itself.

## Replacing a Pi

Install the new Pi as usual; it shows a code. Open the old screen in the dashboard and use **Re-pair** with the new code: the screen keeps its name, group and schedule, and the old device's token stops working.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Black screen, no code | `journalctl -u placard-agent` – can the Pi reach the server? `curl https://signage.example.org/api/health` |
| Screen shows "not paired" | The screen was deleted in the dashboard. Run the `--unpair` command above to get a new code |
| A web page stays white | The page probably forbids framing. See [content.md](content.md#web-pages) |
| Display on/off does nothing | Some monitors ignore DPMS; TVs need HDMI-CEC enabled in their settings ("Anynet+", "Bravia Sync", "SimpLink") |
| Video does not play | Use H.264 MP4 or VP9 WebM; very high bitrates can overload a Pi 3 |
