from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from discover import discover_projects, find_local_space, main


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

    def test_match_reports_a_stale_project_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            result = find_local_space({"folder": str(Path(temporary) / "gone"), "spaces": []})
            self.assertEqual(result, {"spaceId": None, "error": "folder_missing"})

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
