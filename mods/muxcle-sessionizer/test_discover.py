from __future__ import annotations

import base64
import contextlib
import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from discover import connected_machines, discover_projects, find_local_space, main


class DiscoveryTests(unittest.TestCase):
    def test_lists_only_immediate_nonhidden_directories_and_deduplicates_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "projects"
            root.mkdir()
            project = root / "alpha"
            (project / "nested").mkdir(parents=True)
            (root / ".hidden").mkdir()
            (root / "plain-file").write_text("not a directory", encoding="utf-8")
            alias = root / "alpha-alias"
            try:
                alias.symlink_to(project, target_is_directory=True)
            except OSError as error:
                self.skipTest(f"directory symlinks are unavailable: {error}")

            result = discover_projects([str(root)])

            self.assertEqual(result["projects"], [{"name": "alpha", "path": str(project.resolve())}])
            self.assertFalse(result["truncated"])
            self.assertEqual(result["warnings"], [])

    def test_canonicalizes_and_deduplicates_roots(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "projects"
            root.mkdir()
            (root / "beta").mkdir()
            alias = Path(temporary) / "projects-link"
            try:
                alias.symlink_to(root, target_is_directory=True)
            except OSError as error:
                self.skipTest(f"directory symlinks are unavailable: {error}")

            result = discover_projects([str(root), str(alias)])

            self.assertEqual(len(result["projects"]), 1)
            self.assertEqual(result["projects"][0]["path"], str((root / "beta").resolve()))

    def test_warns_for_missing_and_unreadable_roots_without_raising(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "projects"
            root.mkdir()
            missing = Path(temporary) / "missing"

            with patch("discover.os.scandir", side_effect=PermissionError("permission detail")):
                result = discover_projects([str(missing), str(root)])

            self.assertEqual(result["warnings"][0], f"Missing root: {missing}")
            self.assertEqual(result["warnings"][1], f"Unreadable root: {root.resolve()}")
            self.assertEqual(result["projects"], [])

    def test_result_count_is_bounded_and_reports_truncation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "projects"
            root.mkdir()
            for index in range(505):
                (root / f"project-{index:03}").mkdir()

            result = discover_projects([str(root)])

            self.assertEqual(len(result["projects"]), 500)
            self.assertTrue(result["truncated"])
            self.assertEqual(result["projects"][0]["name"], "project-000")

    def test_match_resolves_symlinks_and_prefers_the_active_local_space(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            project = Path(temporary) / "project"
            project.mkdir()
            alias = Path(temporary) / "project-link"
            try:
                alias.symlink_to(project, target_is_directory=True)
            except OSError as error:
                self.skipTest(f"directory symlinks are unavailable: {error}")

            result = find_local_space({
                "folder": str(project.resolve()),
                "spaces": [
                    {"id": "inactive", "folder": str(alias), "active": False},
                    {"id": "active", "folder": str(project), "active": True},
                ],
            })

            self.assertEqual(result, {"spaceId": "active"})

    def test_empty_space_folder_is_the_scanning_machines_home(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary) / "remote-home"
            project = home / "project"
            home.mkdir()
            project.mkdir()
            spaces = [{"id": "default-home", "folder": "", "active": True}]
            with patch("discover.Path.home", return_value=home):
                same_home = find_local_space({"folder": str(home), "spaces": spaces})
                different_project = find_local_space({"folder": str(project), "spaces": spaces})
        self.assertEqual(same_home, {"spaceId": "default-home"})
        self.assertEqual(different_project, {"spaceId": None})

    def test_match_reports_a_stale_project_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            result = find_local_space({"folder": str(Path(temporary) / "gone"), "spaces": []})
            self.assertEqual(result, {"spaceId": None, "error": "folder_missing"})

    def test_remote_scan_uses_isolated_stdin_transport_and_literal_machine_argv(self) -> None:
        with patch("discover.subprocess.run") as run:
            run.return_value.returncode = 0
            run.return_value.stdout = json.dumps({
                "code": 0,
                "stdout": base64.b64encode(b'{"projects":[],"warnings":[],"truncated":false}').decode(),
                "stderr": base64.b64encode(b"").decode(),
                "timed_out": False,
                "truncated": False,
            })
            status = main(["remote", "machine; not-shell", '["/work/with spaces;$(unsafe)"]'])

        self.assertEqual(status, 0)
        command = run.call_args.args[0]
        self.assertEqual(command, ["hc", "exec", "--json", "--on", "machine; not-shell", "--timeout", "6", "-i", "--", "python3", "-I", "-"])
        source = run.call_args.kwargs["input"]
        self.assertIn(
            "from __future__ import annotations\nimport sys\nsys.argv = ['discover.py', 'discover', ",
            source,
        )
        self.assertIn("/work/with spaces;$(unsafe)", source)
        self.assertIn("\ndef discover_projects", source)
        compile(source, "<remote-scanner>", "exec")
        self.assertEqual(run.call_args.kwargs["timeout"], 8)
        self.assertEqual(run.call_args.kwargs["text"], True)

    def test_remote_match_uses_the_isolated_machine_transport(self) -> None:
        with patch("discover.subprocess.run") as run, contextlib.redirect_stdout(io.StringIO()) as output:
            run.return_value.returncode = 0
            run.return_value.stdout = json.dumps({
                "code": 0,
                "stdout": base64.b64encode(b'{"spaceId":"remote-space"}').decode(),
                "stderr": base64.b64encode(b"").decode(),
                "timed_out": False,
                "truncated": False,
            })
            status = main(["remote-match", "build", '{"folder":"/remote/app","spaces":[]}'])
        self.assertEqual(status, 0)
        self.assertEqual(json.loads(output.getvalue()), {"spaceId": "remote-space"})
        self.assertEqual(run.call_args.args[0][:6], ["hc", "exec", "--json", "--on", "build", "--timeout"])
        self.assertIn("sys.argv = ['discover.py', 'match',", run.call_args.kwargs["input"])
        compile(run.call_args.kwargs["input"], "<remote-scanner>", "exec")

    def test_machine_listing_requires_connected_permanent_core_ids(self) -> None:
        with patch("discover.subprocess.run") as run:
            run.return_value.returncode = 0
            run.return_value.stdout = json.dumps({"machines": [
                {"id": "core-a", "name": "a", "state": "connected", "temporary": False},
                {"id": "core-b", "name": "b", "state": "unreachable"},
                {"id": "core-c", "name": "c", "state": "connected", "temporary": True},
            ]})
            self.assertEqual(connected_machines(), [
                {"id": "core-a", "name": "a"},
                {"id": "core-c", "name": "c"},
            ])
            self.assertEqual(run.call_args.args[0], ["hc", "machine", "ls", "--json"])
            self.assertEqual(run.call_args.kwargs["timeout"], 3)

    def test_invalid_machine_name_is_rejected_before_transport(self) -> None:
        with patch("discover.subprocess.run") as run, contextlib.redirect_stdout(io.StringIO()) as output:
            status = main(["remote", "bad" + chr(10) + "machine", '["/remote/work"]'])
        self.assertEqual(status, 2)
        self.assertEqual(run.call_count, 0)
        self.assertEqual(output.getvalue(), "")

    def test_remote_scan_failure_does_not_fall_back_to_local_discovery(self) -> None:
        with patch("discover.subprocess.run") as run, contextlib.redirect_stdout(io.StringIO()) as output:
            run.return_value.returncode = 1
            status = main(["remote", "build", '["/remote/work"]'])
        self.assertEqual(status, 2)
        self.assertEqual(output.getvalue(), "")
        self.assertEqual(run.call_count, 1)

    def test_remote_program_failure_in_json_envelope_fails_closed(self) -> None:
        with patch("discover.subprocess.run") as run, contextlib.redirect_stdout(io.StringIO()) as output:
            run.return_value.returncode = 0
            run.return_value.stdout = json.dumps({
                "code": 1,
                "stdout": base64.b64encode(b"").decode(),
                "stderr": base64.b64encode(b"remote failure").decode(),
            })
            status = main(["remote", "build", '["/remote/work"]'])
        self.assertEqual(status, 2)
        self.assertEqual(output.getvalue(), "")

    def test_remote_envelope_rejects_timeout_truncation_and_untrusted_output(self) -> None:
        valid = {
            "code": 0,
            "stdout": base64.b64encode(b'{"projects":[],"warnings":[],"truncated":false}').decode(),
            "stderr": base64.b64encode(b"").decode(),
        }
        cases = [
            {**valid, "timed_out": True},
            {**valid, "truncated": True},
            {**valid, "stdout": "%%%"},
            {**valid, "stderr": "%%%"},
            {**valid, "stdout": base64.b64encode(b"x" * (512 * 1024 + 1)).decode()},
        ]
        for envelope in cases:
            with self.subTest(envelope=envelope.keys()):
                with patch("discover.subprocess.run") as run, contextlib.redirect_stdout(io.StringIO()) as output:
                    run.return_value.returncode = 0
                    run.return_value.stdout = json.dumps(envelope)
                    status = main(["remote", "build", '["/remote/work"]'])
                self.assertEqual(status, 2)
                self.assertEqual(output.getvalue(), "")

    def test_remote_client_timeout_fails_closed_without_local_fallback(self) -> None:
        with patch("discover.subprocess.run", side_effect=subprocess.TimeoutExpired("hc", 8)) as run, contextlib.redirect_stdout(io.StringIO()) as output:
            status = main(["remote", "build", '["/remote/work"]'])
        self.assertEqual(status, 2)
        self.assertEqual(run.call_count, 1)
        self.assertEqual(output.getvalue(), "")

    def test_rejects_oversized_or_malformed_cli_payload_without_traceback(self) -> None:
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = main(["discover", "not-json"])
        self.assertEqual(status, 2)
        self.assertEqual(output.getvalue(), "")

        with contextlib.redirect_stdout(output):
            status = main(["discover", json.dumps(["relative/path"])])
        self.assertEqual(status, 0)
        self.assertIn('"projects":[]', output.getvalue())


if __name__ == "__main__":
    unittest.main()
