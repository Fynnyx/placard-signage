"""Unit tests for the agent: python3 -m unittest discover -s pi/agent -p 'test_*.py'"""
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

import placard_agent as pa

WLR_RANDR = """HDMI-A-1 "Samsung Electric Company SAMSUNG 0x01000E00 (HDMI-A-1)"
  Make: Samsung Electric Company
  Model: SAMSUNG
  Physical size: 1600x900 mm
  Enabled: yes
  Modes:
    720x400 px, 70.081001 Hz
    1920x1080 px, 60.000000 Hz (preferred, current)
    1280x720 px, 60.000000 Hz
  Position: 0,0
  Transform: normal
HDMI-A-2 "Unknown"
  Enabled: no
  Modes:
    1024x768 px, 60.000000 Hz
"""


class FakeDevTools:
    def __init__(self):
        self.calls = []

    def version(self):
        return {"Browser": "Chrome/141.0.7390.37"}

    def page(self):
        return {"url": "https://s.example/player#t=secret", "webSocketDebuggerUrl": "ws://x"}

    def reload(self):
        self.calls.append("reload")

    def navigate(self, url):
        self.calls.append(("navigate", url))

    def screenshot(self):
        return b"\x89PNG fake"


class Response:
    def __init__(self, status=200, body=None):
        self.status_code = status
        self.ok = 200 <= status < 300
        self._body = body or {}

    def json(self):
        return self._body

    def raise_for_status(self):
        if not self.ok:
            raise RuntimeError(f"HTTP {self.status_code}")


class HelpersTest(unittest.TestCase):
    def test_parse_wlr_randr(self):
        outs = pa.parse_wlr_randr(WLR_RANDR)
        self.assertEqual([o["name"] for o in outs], ["HDMI-A-1", "HDMI-A-2"])
        self.assertEqual(outs[0]["enabled"], True)
        self.assertEqual(outs[0]["mode"], "1920x1080")
        self.assertEqual(outs[1]["enabled"], False)
        self.assertIsNone(outs[1]["mode"])

    def test_versions(self):
        self.assertGreater(pa.version_tuple("1.10.0"), pa.version_tuple("1.9.3"))
        self.assertEqual(pa.version_tuple("v2.0"), (2, 0))
        self.assertEqual(pa.browser_version({"Browser": "Chrome/141.0.1"}), "Chromium 141.0.1")
        self.assertEqual(pa.browser_version({"Browser": "HeadlessChrome/141.0.1"}), "Chromium 141.0.1")
        self.assertIsNone(pa.browser_version(None))

    def test_config_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "config.toml"
            pa.save_config({"server_url": 'https://x.org/"quoted"', "token": "abc", "n": 3}, path)
            self.assertEqual(pa.load_config(path), {"server_url": 'https://x.org/"quoted"', "token": "abc", "n": 3})
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            self.assertEqual(pa.load_config(Path(d) / "missing.toml"), {})


class AgentTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.cfg_path = Path(self.dir.name) / "config.toml"
        pa.save_config({"server_url": "https://s.example", "token": "tok"}, self.cfg_path)
        self.devtools = FakeDevTools()
        self.agent = pa.Agent(self.cfg_path, self.devtools)
        self.agent.http = mock.Mock()
        self.agent.http.post.return_value = Response(200, {"ok": True})

    def tearDown(self):
        self.dir.cleanup()

    def acks(self):
        return [c for c in self.agent.http.post.call_args_list if "/ack" in c.args[0]]

    def test_reload_is_acked_once(self):
        self.agent.run_command({"id": 7, "type": "reload"})
        self.agent.run_command({"id": 7, "type": "reload"})
        self.assertEqual(self.devtools.calls, ["reload"])
        self.assertEqual(len(self.acks()), 1)
        self.assertEqual(self.acks()[0].kwargs["json"]["success"], True)

    def test_screenshot_upload(self):
        self.agent.run_command({"id": 8, "type": "screenshot"})
        upload = self.agent.http.post.call_args_list[0]
        self.assertTrue(upload.args[0].endswith("/api/device/screenshot"))
        self.assertEqual(upload.kwargs["headers"]["Content-Type"], "image/png")
        self.assertEqual(upload.kwargs["headers"]["Authorization"], "Bearer tok")

    def test_failed_command_is_reported(self):
        self.devtools.reload = mock.Mock(side_effect=RuntimeError("no page"))
        self.agent.run_command({"id": 9, "type": "reload"})
        ack = self.acks()[0].kwargs["json"]
        self.assertEqual(ack, {"success": False, "result": "no page"})

    def test_reboot_acks_first(self):
        with mock.patch.object(pa, "run") as run:
            run.return_value = mock.Mock(returncode=0, stdout="", stderr="")
            self.agent.run_command({"id": 10, "type": "reboot"})
            self.assertEqual(len(self.acks()), 1)
            run.assert_called_with(["sudo", "-n", "/usr/bin/systemctl", "reboot"], timeout=30)

    def test_heartbeat_runs_commands_and_handles_revoked_token(self):
        with mock.patch.object(pa, "displays", return_value=[]):
            self.agent.http.post.side_effect = [
                Response(200, {"commands": [{"id": 1, "type": "reload"}], "heartbeatInterval": 30}),
                Response(200, {}),  # ack
            ]
            self.agent.heartbeat()
            self.assertEqual(self.devtools.calls, ["reload"])
            body = self.agent.http.post.call_args_list[0].kwargs["json"]
            self.assertEqual(body["source"], "agent")
            self.assertEqual(body["browserVersion"], "Chromium 141.0.7390.37")
            self.assertEqual(body["currentUrl"], "https://s.example/player")  # token stripped

            self.agent.http.post.side_effect = [Response(401)]
            self.agent.heartbeat()
            self.assertIsNone(self.agent.token)
            self.assertNotIn("token", pa.load_config(self.cfg_path))

    def test_self_update_checks_the_checksum(self):
        self.agent.http.get.return_value = mock.Mock(content=b"print('x')\n", raise_for_status=lambda: None)
        with mock.patch.object(self.agent, "report") as report:
            self.agent.self_update({"version": "9.9.9", "url": "https://s.example/agent/placard_agent.py", "sha256": "0" * 64})
            self.assertIn("checksum mismatch", report.call_args.args[1])

    def test_nightly_reboot(self):
        self.agent.nightly_reboot = "03:00"
        self.agent.timezone = "UTC"
        with mock.patch.object(pa, "uptime_s", return_value=7200), \
             mock.patch.object(self.agent, "reboot") as reboot, \
             mock.patch.object(pa, "datetime") as dt:
            dt.now.return_value = datetime(2026, 10, 20, 3, 4)
            self.agent.check_nightly_reboot()
            self.agent.check_nightly_reboot()
            self.assertEqual(reboot.call_count, 1)
            dt.now.return_value = datetime(2026, 10, 21, 2, 59)
            self.agent.check_nightly_reboot()
            self.assertEqual(reboot.call_count, 1)



class TimezoneSyncTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.cfg_path = Path(self.dir.name) / "config.toml"
        pa.save_config({"server_url": "https://s.example", "token": "tok"}, self.cfg_path)
        self.agent = pa.Agent(self.cfg_path, FakeDevTools())
        self.agent.http = mock.Mock()
        self.ok = mock.Mock(returncode=0, stdout="", stderr="")

    def tearDown(self):
        self.dir.cleanup()

    def sudo_calls(self, run):
        return [c for c in run.call_args_list if c.args[0][:2] == ["sudo", "-n"]]

    def test_sets_a_different_zone_and_restarts_chromium(self):
        with mock.patch.object(pa, "system_timezone", return_value="Etc/UTC"), \
             mock.patch.object(pa, "run", return_value=self.ok) as run, \
             mock.patch.object(pa, "kill_chromium") as kill:
            self.agent.sync_timezone("Europe/Zurich")
            self.assertEqual(self.sudo_calls(run)[0].args[0], ["sudo", "-n", "/usr/bin/timedatectl", "set-timezone", "Europe/Zurich"])
            kill.assert_called_once()

    def test_leaves_a_matching_zone_alone(self):
        with mock.patch.object(pa, "system_timezone", return_value="Europe/Zurich"), \
             mock.patch.object(pa, "run") as run, mock.patch.object(pa, "kill_chromium") as kill:
            self.agent.sync_timezone("Europe/Zurich")
            run.assert_not_called()
            kill.assert_not_called()

    def test_rejects_unknown_or_odd_names(self):
        with mock.patch.object(pa, "system_timezone", return_value="Etc/UTC"), \
             mock.patch.object(pa, "run") as run, mock.patch.object(self.agent, "report"):
            self.agent.sync_timezone("Mars/Olympus_Mons")
            self.agent.sync_timezone("Europe/Zurich; reboot")
            self.agent.sync_timezone("../../etc/passwd")
            run.assert_not_called()

    def test_reports_a_missing_sudo_rule_once(self):
        denied = mock.Mock(returncode=1, stdout="", stderr="sudo: a password is required")
        with mock.patch.object(pa, "system_timezone", return_value="Etc/UTC"), \
             mock.patch.object(pa, "run", return_value=denied) as run, \
             mock.patch.object(pa, "kill_chromium") as kill, \
             mock.patch.object(self.agent, "report") as report:
            self.agent.sync_timezone("Europe/Zurich")
            self.agent.sync_timezone("Europe/Zurich")
            self.assertEqual(len(self.sudo_calls(run)), 1)
            self.assertEqual(report.call_count, 1)
            self.assertIn("install.sh", report.call_args.args[1])
            kill.assert_not_called()

    def test_can_be_turned_off(self):
        self.agent.cfg["sync_timezone"] = False
        with mock.patch.object(pa, "run") as run:
            self.agent.sync_timezone("Europe/Zurich")
            run.assert_not_called()

    def test_heartbeat_passes_the_zone_on(self):
        with mock.patch.object(pa, "displays", return_value=[]), \
             mock.patch.object(self.agent, "sync_timezone") as sync:
            self.agent.http.post.return_value = Response(200, {"commands": [], "timezone": "Europe/Zurich"})
            self.agent.heartbeat()
            sync.assert_called_once_with("Europe/Zurich")


if __name__ == "__main__":
    unittest.main()
