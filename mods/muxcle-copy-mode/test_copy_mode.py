import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SOURCE = Path(__file__).resolve().with_name("copy_mode.py")
spec = importlib.util.spec_from_file_location("muxcle_copy_mode", SOURCE)
copy_mode = importlib.util.module_from_spec(spec)
spec.loader.exec_module(copy_mode)


def completed(argv, value, code=0, stderr=""):
    output = value if isinstance(value, str) else json.dumps(value)
    return subprocess.CompletedProcess(argv, code, output, stderr)


def core_status(core_id="core-1"):
    return completed([], {"core": {"id": core_id}})


def machine_list(machine_id="machine-1"):
    return completed([], {"machines": [{"name": "mac", "id": machine_id}]})


def read_result(text="snapshot", complete=True, how="history", why=None):
    return completed([], {"text": text, "complete": complete, "how": how, "why": why})


class CopyModeTests(unittest.TestCase):
    def test_remote_snapshot_is_private_scoped_and_removed_after_viewer_exits(self):
        text = "secret 日本語\nvim: set modeline: !touch NEVER\n"
        paths = []

        def run(argv, **kwargs):
            if argv[0] == "hc":
                self.assertEqual(kwargs["timeout"], 3)
                self.assertEqual(kwargs["cwd"], Path.home())
            if argv[:3] == ["hc", "server", "status"]:
                return core_status()
            if argv[:3] == ["hc", "machine", "ls"]:
                return machine_list()
            if argv[0] == "hc":
                self.assertEqual(argv, ["hc", "read", "--json", "--lines", "10000", "mac/t3"])
                return read_result(text)

            self.assertEqual(argv[0], "nvim")
            self.assertIn("-M", argv)
            self.assertIn("--noplugin", argv)
            self.assertIn("--", argv)
            snapshot = Path(argv[-1])
            paths.append(snapshot)
            self.assertEqual(snapshot.read_text(), text)
            self.assertEqual(snapshot.stat().st_mode & 0o777, 0o600)
            self.assertEqual(snapshot.parent.stat().st_mode & 0o777, 0o700)
            self.assertEqual(kwargs["env"]["HERDR_COPY_MODE_STATUS"], "full")
            return subprocess.CompletedProcess(argv, 0)

        with patch.object(copy_mode.subprocess, "run", side_effect=run):
            self.assertEqual(copy_mode.view("mac/t3", "core-1", "mac", "machine-1"), 0)
        self.assertFalse(paths[0].exists())

    def test_read_result_discloses_screen_only_and_incomplete_history(self):
        text, status, notices = copy_mode.read_snapshot(
            read_result("visible", complete=True, how="screen")
        )
        self.assertEqual((text, status), ("visible", "screen-only"))
        self.assertIn("Screen only", notices[0])

        text, status, notices = copy_mode.read_snapshot(
            read_result("partial", complete=False, how="history", why="working")
        )
        self.assertEqual((text, status), ("partial", "incomplete"))
        self.assertIn("Incomplete snapshot", notices[0])
        self.assertIn("working", notices[0])

    def test_malformed_read_envelopes_never_start_editor(self):
        for value in [
            {"text": "missing complete", "how": "history"},
            {"text": "missing how", "complete": True},
            {"text": 42, "complete": True, "how": "history"},
            {"text": "bad method", "complete": True, "how": "screen?"},
            {"text": "bad reason", "complete": True, "how": "history", "why": 42},
        ]:
            with self.subTest(value=value):
                with patch.object(
                    copy_mode.subprocess,
                    "run",
                    side_effect=[core_status(), completed([], value), core_status()],
                ) as run:
                    with self.assertRaisesRegex(ValueError, "snapshot"):
                        copy_mode.view("t3", "core-1")
                    self.assertEqual(run.call_count, 3)

    def test_capture_errors_never_start_editor(self):
        for result in [
            completed([], {}, code=1, stderr="capture failed"),
            completed([], "not json"),
        ]:
            with self.subTest(result=result):
                with patch.object(
                    copy_mode.subprocess,
                    "run",
                    side_effect=[core_status(), result, core_status()],
                ) as run:
                    with self.assertRaises(ValueError):
                        copy_mode.view("t3", "core-1")
                    self.assertEqual(run.call_count, 3)

    def test_timeout_falls_back_once_and_discloses_screen_only_capture(self):
        calls = []

        def run(argv, **kwargs):
            calls.append(argv)
            if argv[:3] == ["hc", "server", "status"]:
                return core_status()
            if argv[:3] == ["hc", "machine", "ls"]:
                return machine_list()
            if argv[0] == "hc":
                if argv[argv.index("--lines") + 1] == "10000":
                    raise subprocess.TimeoutExpired(argv, 3)
                self.assertEqual(argv, ["hc", "read", "--json", "--lines", "0", "mac/t3"])
                return read_result("screen text", how="screen")
            self.assertIn("Screen only", Path(argv[-1]).read_text())
            self.assertEqual(kwargs["env"]["HERDR_COPY_MODE_STATUS"], "screen-only")
            return subprocess.CompletedProcess(argv, 0)

        with patch.object(copy_mode.subprocess, "run", side_effect=run):
            self.assertEqual(copy_mode.view("mac/t3", "core-1", "mac", "machine-1"), 0)
        self.assertEqual(sum(argv[:2] == ["hc", "read"] for argv in calls), 2)

    def test_second_timeout_fails_without_starting_editor(self):
        calls = []

        def run(argv, **kwargs):
            calls.append(argv)
            if argv[:3] == ["hc", "server", "status"]:
                return core_status()
            raise subprocess.TimeoutExpired(argv, 3)

        with patch.object(copy_mode.subprocess, "run", side_effect=run):
            with self.assertRaisesRegex(ValueError, "screen capture timed out"):
                copy_mode.view("t3", "core-1")
        self.assertEqual(sum(argv[:2] == ["hc", "read"] for argv in calls), 2)
        self.assertFalse(any(argv and argv[0] == "nvim" for argv in calls))

    def test_core_change_before_or_during_capture_refuses_snapshot(self):
        with patch.object(
            copy_mode.subprocess,
            "run",
            side_effect=[core_status("core-2")],
        ) as run:
            with self.assertRaisesRegex(ValueError, "Core/session changed"):
                copy_mode.snapshot("t3", "core-1")
            self.assertEqual(run.call_count, 1)

        with patch.object(
            copy_mode.subprocess,
            "run",
            side_effect=[core_status("core-1"), completed([], {"text": "secret", "complete": True, "how": "history"}), core_status("core-2")],
        ) as run:
            with self.assertRaisesRegex(ValueError, "Core/session changed"):
                copy_mode.view("t3", "core-1")
            self.assertEqual(run.call_count, 3)

    def test_remote_machine_retarget_before_or_during_capture_refuses_snapshot(self):
        with patch.object(
            copy_mode.subprocess,
            "run",
            side_effect=[core_status(), machine_list("machine-2")],
        ) as run:
            with self.assertRaisesRegex(ValueError, "machine 'mac' changed identity"):
                copy_mode.snapshot("mac/t3", "core-1", "mac", "machine-1")
            self.assertEqual(run.call_count, 2)

        with patch.object(
            copy_mode.subprocess,
            "run",
            side_effect=[
                core_status(), machine_list(), read_result(), core_status(), machine_list("machine-2"),
            ],
        ) as run:
            with self.assertRaisesRegex(ValueError, "machine 'mac' changed identity"):
                copy_mode.view("mac/t3", "core-1", "mac", "machine-1")
            self.assertEqual(run.call_count, 5)

    def test_rejects_invalid_addresses_and_scope_before_capture(self):
        for address in ["--help", "t3; touch bad", "", "mac/--help"]:
            with self.subTest(address=address):
                with patch.object(copy_mode.subprocess, "run") as run:
                    with self.assertRaises(ValueError):
                        copy_mode.view(address, "core-1")
                    run.assert_not_called()

        with patch.object(copy_mode.subprocess, "run") as run:
            with self.assertRaisesRegex(ValueError, "does not match"):
                copy_mode.snapshot("mac/t3", "core-1")
            run.assert_not_called()

    def test_size_limit_includes_incomplete_capture_notice(self):
        with patch.object(copy_mode, "MAX_BYTES", 20):
            with patch.object(
                copy_mode.subprocess,
                "run",
                side_effect=[core_status(), read_result("x" * 20, complete=False, why="working"), core_status()],
            ) as run:
                with self.assertRaisesRegex(ValueError, "8 MiB"):
                    copy_mode.snapshot("t3", "core-1")
                self.assertEqual(run.call_count, 3)

    def test_editor_failure_removes_private_snapshot(self):
        paths = []

        def run(argv, **kwargs):
            if argv[:3] == ["hc", "server", "status"]:
                return core_status()
            if argv[0] == "hc":
                return read_result("data")
            paths.append(Path(argv[-1]))
            raise OSError("editor unavailable")

        with patch.object(copy_mode.subprocess, "run", side_effect=run):
            with self.assertRaises(OSError):
                copy_mode.view("t3", "core-1")
        self.assertFalse(paths[0].exists())

    @unittest.skipUnless(shutil.which("nvim"), "Neovim is required")
    def test_viewer_disables_user_config_modelines_and_auto_clipboard(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot = root / "snapshot.txt"
            snapshot.write_text("COPY_MODE_TEST\nvim: set ts=99:\n")
            (root / ".nvim.lua").write_text("error('local config must not run')")
            check = """
                assert(not vim.o.modeline and not vim.o.exrc)
                assert(not vim.bo.modifiable and vim.bo.readonly)
                assert(vim.bo.undolevels == -1, 'undo history must be disabled')
                assert(vim.bo.tabstop ~= 99)
                assert(vim.fn.maparg('q', 'n') ~= '')
                assert(vim.o.statusline:find('COPY MODE %(screen only%)'))
                assert(_G.copied == nil, 'opening the viewer must not write the clipboard')
                package.loaded['vim.ui.clipboard.osc52'] = {
                    copy = function(reg)
                        assert(reg == '+')
                        return function(lines) _G.copied = lines end
                    end
                }
                vim.cmd('normal! ggyy')
                assert(_G.copied[1] == 'COPY_MODE_TEST')
                _G.copied = nil
                vim.bo.readonly = false
                vim.bo.modifiable = true
                vim.api.nvim_buf_set_lines(0, 0, -1, false, { string.rep('x', 1024 * 1024 + 1) })
                vim.bo.modifiable = false
                vim.bo.readonly = true
                vim.cmd('normal! ggyy')
                assert(_G.copied == nil, 'oversized selection must not reach the clipboard')
            """
            result = subprocess.run(
                [
                    "nvim", "--headless", "-u", str(SOURCE.with_name("copy-mode.lua")),
                    "--noplugin", "-i", "NONE", "-n", "-R", "-M",
                    "-c", "lua " + check, "-c", "qa!", "--", str(snapshot),
                ],
                cwd=root,
                env={**os.environ, "HERDR_COPY_MODE_STATUS": "screen-only"},
                capture_output=True,
                text=True,
                timeout=10,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("Error", result.stderr)


if __name__ == "__main__":
    unittest.main()
