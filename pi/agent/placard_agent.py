#!/usr/bin/env python3
"""Placard Signage agent for Raspberry Pi screens.

Pairs the screen, sends a heartbeat every 30 s, runs remote commands
(reload, reboot, display on/off, screenshot), restarts Chromium when it
hangs and updates itself when the server has a newer version.

Only needs Python 3.11+, requests and websocket-client.

SPDX-License-Identifier: AGPL-3.0-only
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import logging
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import tomllib
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import requests
import websocket

AGENT_VERSION = "1.1.0"

CONFIG_PATH = Path(os.environ.get("PLACARD_CONFIG", "/etc/placard/config.toml"))
RUN_DIR = Path(os.environ.get("PLACARD_RUN_DIR", "/run/placard"))
START_URL_FILE = RUN_DIR / "start-url"
DEVTOOLS = os.environ.get("PLACARD_DEVTOOLS", "http://127.0.0.1:9222")
TICK_S = 5
DEVTOOLS_TIMEOUT_S = 60
EVENT_MIN_INTERVAL_S = 10

log = logging.getLogger("placard-agent")


# --------------------------------------------------------------------------- config

def load_config(path: Path = CONFIG_PATH) -> dict[str, Any]:
    try:
        with path.open("rb") as f:
            return tomllib.load(f)
    except FileNotFoundError:
        return {}


def toml_value(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return json.dumps(str(v))  # a JSON string is a valid TOML basic string


def save_config(cfg: dict[str, Any], path: Path = CONFIG_PATH) -> None:
    """Writes the config atomically with mode 600."""
    lines = ["# Placard Signage agent configuration. Written by install.sh and the agent."]
    lines += [f"{k} = {toml_value(v)}" for k, v in cfg.items() if v is not None and not isinstance(v, dict)]
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".config-")
    try:
        with os.fdopen(fd, "w") as f:
            f.write("\n".join(lines) + "\n")
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def write_start_url(url: str) -> None:
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    tmp = START_URL_FILE.with_suffix(".tmp")
    tmp.write_text(url + "\n")
    os.chmod(tmp, 0o600)
    os.replace(tmp, START_URL_FILE)


# --------------------------------------------------------------------------- system info

def run(cmd: list[str], timeout: float = 10, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env, check=False)


def local_ip(server_url: str) -> str | None:
    host = urlparse(server_url).hostname or "1.1.1.1"
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect((socket.gethostbyname(host), 80))
            return s.getsockname()[0]
    except OSError:
        return None


def uptime_s() -> float | None:
    try:
        return float(Path("/proc/uptime").read_text().split()[0])
    except (OSError, ValueError, IndexError):
        return None


def cpu_temp_c() -> float | None:
    try:
        return int(Path("/sys/class/thermal/thermal_zone0/temp").read_text().strip()) / 1000
    except (OSError, ValueError):
        return None


def mem_free_mb() -> float | None:
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) / 1024
    except (OSError, ValueError, IndexError):
        pass
    return None


def disk_free_mb() -> float:
    return shutil.disk_usage("/").free / 1024 / 1024


# --------------------------------------------------------------------------- display (Wayland + HDMI-CEC)

def wayland_env() -> dict[str, str]:
    env = dict(os.environ)
    runtime = env.get("XDG_RUNTIME_DIR") or f"/run/user/{os.getuid()}"
    env["XDG_RUNTIME_DIR"] = runtime
    if "WAYLAND_DISPLAY" not in env:
        sockets = sorted(p.name for p in Path(runtime).glob("wayland-*") if not p.name.endswith(".lock"))
        if sockets:
            env["WAYLAND_DISPLAY"] = sockets[0]
    return env


def parse_wlr_randr(text: str) -> list[dict[str, Any]]:
    """Parses `wlr-randr` output into [{name, enabled, mode}]."""
    outputs: list[dict[str, Any]] = []
    for line in text.splitlines():
        if line and not line[0].isspace():
            outputs.append({"name": line.split()[0], "enabled": None, "mode": None})
        elif outputs:
            s = line.strip()
            if s.startswith("Enabled:"):
                outputs[-1]["enabled"] = s.split(":", 1)[1].strip() == "yes"
            elif "current" in s and re.match(r"^\d+x\d+", s):
                outputs[-1]["mode"] = s.split()[0]
    return outputs


def displays() -> list[dict[str, Any]]:
    if not shutil.which("wlr-randr"):
        return []
    try:
        r = run(["wlr-randr"], env=wayland_env())
    except (OSError, subprocess.TimeoutExpired):
        return []
    return parse_wlr_randr(r.stdout) if r.returncode == 0 else []


def cec(on: bool) -> str:
    """Wakes or puts the TV in standby via HDMI-CEC. Returns a short result text."""
    dev = next(iter(sorted(Path("/dev").glob("cec*"))), None)
    if dev and shutil.which("cec-ctl"):
        run(["cec-ctl", "-d", str(dev), "--playback"], timeout=10)
        r = run(["cec-ctl", "-d", str(dev), "--to", "0", "--image-view-on" if on else "--standby"], timeout=10)
        return "cec ok" if r.returncode == 0 else f"cec failed: {(r.stderr or r.stdout).strip()[:200]}"
    if shutil.which("cec-client"):
        cmd = "on 0" if on else "standby 0"
        r = subprocess.run(["cec-client", "-s", "-d", "1"], input=cmd, capture_output=True, text=True, timeout=20, check=False)
        return "cec ok" if r.returncode == 0 else "cec failed"
    return "no cec"


def set_display(on: bool) -> tuple[bool, str]:
    results = []
    ok = False
    outs = displays()
    for out in outs:
        r = run(["wlr-randr", "--output", out["name"], "--on" if on else "--off"], env=wayland_env())
        if r.returncode == 0:
            ok = True
            results.append(f"{out['name']} {'on' if on else 'off'}")
        else:
            results.append(f"{out['name']}: {(r.stderr or r.stdout).strip()[:200]}")
    if on:
        apply_rotation(outs)
    results.append(cec(on))
    if not outs:
        results.insert(0, "no Wayland outputs found")
    return ok or "cec ok" in results, "; ".join(results)


def apply_rotation(outs: list[dict[str, Any]]) -> None:
    rotate = os.environ.get("PLACARD_ROTATE") or read_kiosk_env().get("ROTATE", "0")
    if rotate in ("90", "180", "270"):
        for out in outs:
            run(["wlr-randr", "--output", out["name"], "--transform", rotate], env=wayland_env())


def read_kiosk_env() -> dict[str, str]:
    env: dict[str, str] = {}
    try:
        for line in (CONFIG_PATH.parent / "kiosk.env").read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"')
    except OSError:
        pass
    return env


# --------------------------------------------------------------------------- Chromium DevTools

class DevTools:
    def __init__(self, base: str = DEVTOOLS) -> None:
        self.base = base

    def version(self) -> dict[str, Any] | None:
        try:
            return requests.get(f"{self.base}/json/version", timeout=3).json()
        except (requests.RequestException, ValueError):
            return None

    def page(self) -> dict[str, Any] | None:
        try:
            targets = requests.get(f"{self.base}/json/list", timeout=3).json()
        except (requests.RequestException, ValueError):
            return None
        pages = [t for t in targets if t.get("type") == "page" and not t.get("url", "").startswith("devtools://")]
        return pages[0] if pages else None

    def call(self, method: str, params: dict[str, Any] | None = None, timeout: float = 20) -> dict[str, Any]:
        page = self.page()
        if not page or not page.get("webSocketDebuggerUrl"):
            raise RuntimeError("no Chromium page found on the DevTools port")
        ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=timeout, suppress_origin=True)
        try:
            ws.send(json.dumps({"id": 1, "method": method, "params": params or {}}))
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                msg = json.loads(ws.recv())
                if msg.get("id") == 1:
                    if "error" in msg:
                        raise RuntimeError(f"{method}: {msg['error'].get('message')}")
                    return msg.get("result", {})
            raise TimeoutError(f"{method}: no answer")
        finally:
            ws.close()

    def navigate(self, url: str) -> None:
        self.call("Page.navigate", {"url": url})

    def reload(self) -> None:
        # A normal reload: a cache-bypassing one would also bypass the player's service worker.
        self.call("Page.reload", {"ignoreCache": False})

    def screenshot(self) -> bytes:
        result = self.call("Page.captureScreenshot", {"format": "png"}, timeout=30)
        return base64.b64decode(result["data"])


def browser_version(info: dict[str, Any] | None) -> str | None:
    if not info:
        return None
    m = re.match(r"(?:Headless)?Chrome/([\d.]+)", info.get("Browser", ""))
    return f"Chromium {m.group(1)}" if m else info.get("Browser")


def kill_chromium() -> None:
    run(["pkill", "-f", "--", "--user-data-dir=/home/kiosk/.placard-profile"])
    time.sleep(2)
    run(["pkill", "-9", "-f", "--", "--user-data-dir=/home/kiosk/.placard-profile"])


TZ_NAME = re.compile(r"^[A-Za-z0-9_+\-]+(/[A-Za-z0-9_+\-]+)*$")


def system_timezone() -> str | None:
    """The Pi's time zone, e.g. "Europe/Zurich"."""
    try:
        r = run(["timedatectl", "show", "-p", "Timezone", "--value"])
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    try:
        target = os.readlink("/etc/localtime")
    except OSError:
        return None
    return target.split("zoneinfo/", 1)[1] if "zoneinfo/" in target else None


def version_tuple(v: str) -> tuple[int, ...]:
    return tuple(int(x) for x in re.findall(r"\d+", v)[:4])


# --------------------------------------------------------------------------- agent

class Agent:
    def __init__(self, config_path: Path = CONFIG_PATH, devtools: DevTools | None = None) -> None:
        self.config_path = config_path
        self.cfg = load_config(config_path)
        self.server = str(self.cfg.get("server_url", "")).rstrip("/")
        if not self.server:
            raise SystemExit(f"server_url missing in {config_path}")
        self.devtools = devtools or DevTools()
        self.http = requests.Session()
        self.http.headers["User-Agent"] = f"PlacardAgent/{AGENT_VERSION}"
        self.heartbeat_interval = 30.0
        self.next_heartbeat = 0.0
        self.devtools_down_since: float | None = None
        self.last_event_at = 0.0
        self.done_commands: set[int] = set()
        self.nightly_reboot: str | None = None
        self.timezone = "UTC"
        self.rebooted_for: str | None = None
        self.timezone_failed_for: str | None = None

    # ---- helpers
    @property
    def token(self) -> str | None:
        return self.cfg.get("token") or None

    def auth(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def player_url(self) -> str:
        return f"{self.server}/player#t={self.token}"

    def report(self, level: str, message: str) -> None:
        """Logs to the journal and, rate-limited, to the server's event log."""
        getattr(log, "error" if level == "error" else "warning" if level == "warn" else "info")(message)
        if not self.token or time.monotonic() - self.last_event_at < EVENT_MIN_INTERVAL_S:
            return
        self.last_event_at = time.monotonic()
        try:
            self.http.post(f"{self.server}/api/device/events", headers=self.auth(),
                           json={"level": level, "message": message[:3900], "source": "agent"}, timeout=10)
        except requests.RequestException:
            pass

    def show(self, url: str) -> None:
        """Sets the kiosk start URL and points the running Chromium at it."""
        write_start_url(url)
        try:
            self.devtools.navigate(url)
        except Exception as e:  # Chromium may not be up yet; the kiosk script reads the start URL
            log.info("Could not navigate Chromium yet: %s", e)

    # ---- pairing
    def pair(self) -> None:
        log.info("Not paired; requesting a pairing code from %s", self.server)
        while True:
            try:
                r = self.http.post(f"{self.server}/api/device/pair", timeout=15)
                r.raise_for_status()
                start = r.json()
            except (requests.RequestException, ValueError) as e:
                log.warning("Pairing request failed: %s; retrying in 15 s", e)
                time.sleep(15)
                continue
            code, secret = start["code"], start["secret"]
            log.info("Pairing code: %s", code)
            self.show(f"{self.server}/player/pair?code={code}")
            while True:
                time.sleep(float(start.get("pollInterval", 3)))
                try:
                    r = self.http.get(f"{self.server}/api/device/pair/{secret}", timeout=15)
                except requests.RequestException as e:
                    log.warning("Pairing poll failed: %s", e)
                    continue
                if r.status_code == 404:
                    break
                body = r.json()
                if body.get("status") == "paired":
                    self.cfg["token"] = body["token"]
                    save_config(self.cfg, self.config_path)
                    log.info("Paired as screen %s", body.get("screen", {}).get("name"))
                    self.show(self.player_url())
                    return
                if body.get("status") == "expired":
                    break

    def ensure_player(self) -> None:
        """At start: make sure Chromium shows the player (it may still show the pairing page)."""
        write_start_url(self.player_url())
        page = self.devtools.page()
        url = (page or {}).get("url", "")
        if page and (not url.startswith(f"{self.server}/player") or url.startswith(f"{self.server}/player/pair")):
            self.show(self.player_url())

    # ---- heartbeat
    def status(self) -> dict[str, Any]:
        outs = displays()
        enabled = [o for o in outs if o["enabled"] is not None]
        page = self.devtools.page()
        return {
            "source": "agent",
            "agentVersion": AGENT_VERSION,
            "browserVersion": browser_version(self.devtools.version()),
            "hostname": socket.gethostname(),
            "ip": local_ip(self.server),
            "uptimeS": uptime_s(),
            "cpuTempC": cpu_temp_c(),
            "diskFreeMb": round(disk_free_mb()),
            "memFreeMb": mem_free_mb(),
            "displayOn": any(o["enabled"] for o in enabled) if enabled else None,
            "resolution": next((o["mode"] for o in outs if o["enabled"] and o["mode"]), None),
            "currentUrl": re.sub(r"#t=[^&]*", "", page["url"]) if page and page.get("url") else None,
        }

    def heartbeat(self) -> None:
        body = {k: v for k, v in self.status().items() if v is not None}
        try:
            r = self.http.post(f"{self.server}/api/device/heartbeat", headers=self.auth(), json=body, timeout=15)
        except requests.RequestException as e:
            log.warning("Heartbeat failed (server unreachable?): %s", e)
            return
        if r.status_code == 401:
            log.warning("Token rejected by the server (screen deleted or re-paired); pairing again")
            self.cfg.pop("token", None)
            save_config(self.cfg, self.config_path)
            return
        if not r.ok:
            log.warning("Heartbeat: HTTP %s", r.status_code)
            return
        data = r.json()
        self.heartbeat_interval = float(data.get("heartbeatInterval", 30))
        self.nightly_reboot = data.get("nightlyReboot")
        self.timezone = data.get("timezone") or "UTC"
        if data.get("timezone"):
            self.sync_timezone(data["timezone"])
        for cmd in data.get("commands", []):
            self.run_command(cmd)
        agent = data.get("agent")
        if agent and version_tuple(agent.get("version", "0")) > version_tuple(AGENT_VERSION):
            self.self_update(agent)

    # ---- commands
    def ack(self, cmd_id: int, success: bool, result: str) -> None:
        try:
            self.http.post(f"{self.server}/api/device/commands/{cmd_id}/ack", headers=self.auth(),
                           json={"success": success, "result": result[:3900]}, timeout=15)
        except requests.RequestException as e:
            log.warning("Ack for command %s failed: %s", cmd_id, e)

    def run_command(self, cmd: dict[str, Any]) -> None:
        cid, ctype = int(cmd["id"]), cmd["type"]
        if cid in self.done_commands:
            return
        self.done_commands.add(cid)
        log.info("Command %s: %s", cid, ctype)
        try:
            if ctype == "reload":
                self.devtools.reload()
                self.ack(cid, True, "page reloaded")
            elif ctype == "reboot":
                self.ack(cid, True, "rebooting")
                self.reboot("requested from the dashboard")
            elif ctype in ("display_on", "display_off"):
                ok, result = set_display(ctype == "display_on")
                self.ack(cid, ok, result)
            elif ctype == "screenshot":
                png = self.devtools.screenshot()
                r = self.http.post(f"{self.server}/api/device/screenshot", data=png, timeout=60,
                                   headers={**self.auth(), "Content-Type": "image/png"})
                r.raise_for_status()
                self.ack(cid, True, f"{len(png) // 1024} KB uploaded")
            else:
                self.ack(cid, False, f"unknown command {ctype}")
        except Exception as e:
            self.ack(cid, False, str(e))
            self.report("error", f"Command {ctype} failed: {e}")

    def reboot(self, reason: str) -> None:
        log.info("Rebooting: %s", reason)
        r = run(["sudo", "-n", "/usr/bin/systemctl", "reboot"], timeout=30)
        if r.returncode != 0:
            self.report("error", f"Reboot failed: {(r.stderr or r.stdout).strip()}")

    def check_nightly_reboot(self) -> None:
        if not self.nightly_reboot or (uptime_s() or 0) < 3600:
            return
        try:
            now = datetime.now(ZoneInfo(self.timezone))
        except Exception:
            now = datetime.now()
        h, m = (int(x) for x in self.nightly_reboot.split(":"))
        minutes = now.hour * 60 + now.minute
        target = h * 60 + m
        key = now.strftime("%Y-%m-%d")
        if 0 <= minutes - target < 10 and self.rebooted_for != key:
            self.rebooted_for = key
            self.report("info", f"Nightly reboot at {self.nightly_reboot}")
            self.reboot("nightly")

    def sync_timezone(self, tz: str) -> None:
        """Sets the Pi's time zone to the dashboard's, so clocks on content pages are right.

        Turn it off with `sync_timezone = false` in config.toml.
        """
        if self.cfg.get("sync_timezone", True) is False or tz == self.timezone_failed_for:
            return
        try:
            if not TZ_NAME.match(tz):
                raise ValueError("invalid name")
            ZoneInfo(tz)
        except Exception:
            self.timezone_failed_for = tz
            self.report("warn", f"Ignoring unknown time zone {tz!r} from the server")
            return
        current = system_timezone()
        if current == tz:
            return
        r = run(["sudo", "-n", "/usr/bin/timedatectl", "set-timezone", tz], timeout=30)
        if r.returncode != 0:
            # Report once; older installs lack the sudo rule until install.sh runs again.
            self.timezone_failed_for = tz
            self.report("warn", f"Could not set the time zone to {tz} (run install.sh again to allow it): "
                                f"{(r.stderr or r.stdout).strip()[:300]}")
            return
        # Chromium reads the time zone at start, so restart it; the kiosk loop brings it back.
        self.report("info", f"Time zone changed from {current or 'unknown'} to {tz}; restarting Chromium")
        kill_chromium()

    # ---- watchdog
    def check_chromium(self) -> None:
        if self.devtools.version() is not None:
            self.devtools_down_since = None
            return
        now = time.monotonic()
        if self.devtools_down_since is None:
            self.devtools_down_since = now
        elif now - self.devtools_down_since > DEVTOOLS_TIMEOUT_S:
            self.report("error", f"Chromium DevTools not answering for {DEVTOOLS_TIMEOUT_S} s; restarting Chromium")
            kill_chromium()
            self.devtools_down_since = now

    # ---- self-update
    def self_update(self, agent: dict[str, Any]) -> None:
        target = Path(__file__).resolve()
        try:
            r = self.http.get(agent["url"], timeout=60)
            r.raise_for_status()
            body = r.content
            digest = hashlib.sha256(body).hexdigest()
            if agent.get("sha256") and digest != agent["sha256"]:
                raise ValueError(f"checksum mismatch ({digest})")
            compile(body, str(target), "exec")  # refuse to install a broken file
            tmp = target.with_suffix(".new")
            tmp.write_bytes(body)
            os.chmod(tmp, 0o755)
            os.replace(tmp, target)
        except Exception as e:
            self.report("error", f"Self-update to {agent.get('version')} failed: {e}")
            return
        self.report("info", f"Agent updated {AGENT_VERSION} -> {agent.get('version')}; restarting")
        # systemd (Restart=always) starts the new version.
        sys.exit(0)

    # ---- main loop
    def run_forever(self) -> None:
        log.info("Placard agent %s, server %s", AGENT_VERSION, self.server)
        while True:
            if not self.token:
                self.pair()
                self.next_heartbeat = 0
            else:
                if self.next_heartbeat == 0:
                    self.ensure_player()
                now = time.monotonic()
                if now >= self.next_heartbeat:
                    self.next_heartbeat = now + self.heartbeat_interval
                    self.heartbeat()
                    self.check_nightly_reboot()
                self.check_chromium()
            time.sleep(TICK_S)


def main() -> None:
    parser = argparse.ArgumentParser(description="Placard Signage agent")
    parser.add_argument("--status", action="store_true", help="print the status the agent would report and exit")
    parser.add_argument("--unpair", action="store_true", help="forget the device token, so the screen pairs again")
    parser.add_argument("--version", action="version", version=AGENT_VERSION)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if args.unpair:
        cfg = load_config()
        cfg.pop("token", None)
        save_config(cfg)
        print("Token removed. Restart the agent: sudo systemctl restart placard-agent")
        return
    agent = Agent()
    if args.status:
        print(json.dumps({**agent.status(), "paired": bool(agent.token), "server": agent.server}, indent=2))
        return
    agent.run_forever()


if __name__ == "__main__":
    main()
