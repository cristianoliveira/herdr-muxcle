import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import run


class RunnerTests(unittest.TestCase):
    def test_listing_never_starts_native_resources_or_requires_swift(self):
        with patch.object(run, "NativeSession") as native, patch.object(run.shutil, "which") as compiler:
            with contextlib.redirect_stdout(io.StringIO()) as output:
                status = run.main(["--list"])

        self.assertEqual(status, 0)
        self.assertIn("help-visible-and-native-dismissal", output.getvalue())
        self.assertIn("NOT", output.getvalue().upper())
        native.assert_not_called()
        compiler.assert_not_called()

    def test_missing_compiler_fails_before_starting_native_resources(self):
        with patch.object(run, "NativeSession") as native, patch.object(run.shutil, "which", return_value=None):
            with contextlib.redirect_stderr(io.StringIO()) as output:
                status = run.main([])

        self.assertEqual(status, 2)
        self.assertIn("xcode-select --install", output.getvalue())
        native.assert_not_called()

    def test_refused_existing_output_is_not_modified(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            sentinel = output / "results.json"
            sentinel.write_text("keep existing evidence")
            session = Mock()
            session.__enter__ = Mock(side_effect=run.HarnessUnavailable("output must be new"))
            session.__exit__ = Mock(return_value=False)
            with patch.object(run, "NativeSession", return_value=session), \
                    patch.object(run.shutil, "which", return_value="/fake/swiftc"), \
                    patch.object(run, "revision", return_value="revision"):
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    status = run.main(["--output", str(output)])
            self.assertEqual(sentinel.read_text(), "keep existing evidence")
        self.assertEqual(status, 1)

    def test_startup_cleanup_failure_notes_and_retained_scope_are_visible(self):
        with tempfile.TemporaryDirectory() as temporary:
            error = RuntimeError("app startup failed")
            error.add_note("cleanup incomplete: core identity could not be proven")
            session = Mock()
            session.root = Path(temporary) / "retained-scratch"
            session.__enter__ = Mock(side_effect=error)
            session.__exit__ = Mock(return_value=False)
            with patch.object(run, "NativeSession", return_value=session), \
                    patch.object(run.shutil, "which", return_value="/fake/swiftc"), \
                    patch.object(run, "revision", return_value="revision"):
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()) as diagnostics:
                    status = run.main(["--output", str(Path(temporary) / "new-run")])
            self.assertIn("cleanup incomplete", diagnostics.getvalue())
            self.assertIn(str(session.root), diagnostics.getvalue())
        self.assertEqual(status, 1)

    def test_case_failure_closes_session_and_records_remaining_cases_as_not_run(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "new-run"
            session = Mock()
            session.root = Path(temporary)
            session.nonce = "owned"
            session.core_pid = 123
            session.core_id = "core"
            session.app_pid = 456
            session.env = {"HOME": str(Path(temporary) / "home")}
            session.__enter__ = Mock(side_effect=lambda: (output.mkdir(), session)[1])
            session.__exit__ = Mock(return_value=False)
            fail = Mock(side_effect=RuntimeError("wrong geometry"))
            later = Mock()
            scenarios = Mock()
            scenarios.cases.return_value = [("geometry", fail), ("later", later)]
            with patch.object(run, "NativeSession", return_value=session), \
                    patch.object(run, "Scenarios", return_value=scenarios), \
                    patch.object(run.ScreenText, "compile"), \
                    patch.object(run.shutil, "which", return_value="/fake/swiftc"), \
                    patch.object(run, "revision", return_value="revision"):
                with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                    status = run.main(["--output", str(output)])

            summary = json.loads((output / "results.json").read_text())
        self.assertEqual(status, 1)
        self.assertEqual([item["status"] for item in summary["results"]], ["failed", "not-run"])
        self.assertEqual(summary["cleanup"], "completed")
        session.__exit__.assert_called_once()
        session.snapshot.assert_called_once_with("failure")
        later.assert_not_called()
