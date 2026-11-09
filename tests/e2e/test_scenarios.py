import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from scenarios import ScenarioFailure, Scenarios, fixture_invocation_matches, require


class VisibleOutcomeTests(unittest.TestCase):
    def test_accepts_only_exact_fixture_or_native_login_shell_envelope(self):
        expected = ["/owned/python", "-I", "-B", "-u", "/repo/fixture.py", "A"]
        wrapped = ["/bin/sh", "-lic", '"$@"; exec "$0" -li', "/bin/sh", *expected]

        self.assertTrue(fixture_invocation_matches(expected, expected))
        self.assertTrue(fixture_invocation_matches(wrapped, expected))
        self.assertFalse(fixture_invocation_matches(["/different/python", *expected[1:]], expected))
        self.assertFalse(fixture_invocation_matches([*wrapped[:-1], "B"], expected))
        self.assertFalse(fixture_invocation_matches(["/bin/sh", "-lic", "unexpected command", "/bin/sh", *expected], expected))
        self.assertFalse(fixture_invocation_matches(None, expected))

    def test_native_creation_receipt_is_registered_before_the_scenario_continues(self):
        with tempfile.TemporaryDirectory() as directory:
            session = SimpleNamespace(artifacts=Path(directory), command=Mock(return_value={"terminal": "t4"}),
                                      core=SimpleNamespace(call=Mock(return_value={"created_ms": 7, "argv": ["fixture.py", "A"]})),
                                      track_terminal=Mock())
            scenarios = Scenarios(session, None)

            scenarios.command("space.new", {"argv": ["fixture.py", "A"]})

            session.track_terminal.assert_called_once_with("t4", {"created_ms": 7, "argv": ["fixture.py", "A"]})

    def test_unexpected_created_program_is_still_registered_for_owned_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            session = SimpleNamespace(artifacts=Path(directory), command=Mock(return_value={"terminal": "t4"}),
                                      core=SimpleNamespace(call=Mock(return_value={"created_ms": 7, "argv": ["unexpected"]})),
                                      track_terminal=Mock())
            scenarios = Scenarios(session, None)

            with self.assertRaisesRegex(ScenarioFailure, "harmless fixture"):
                scenarios.command("space.new", {"argv": ["fixture.py", "A"]})

            session.track_terminal.assert_called_once_with("t4", {"created_ms": 7, "argv": ["unexpected"]})

    def test_waits_for_visible_content_instead_of_accepting_first_render(self):
        with tempfile.TemporaryDirectory() as directory:
            session = SimpleNamespace(artifacts=Path(directory), screenshot=Mock(return_value=Path("shot.png")), snapshot=Mock())
            observer = Mock()
            observer.read.side_effect = [["Pane sizing", "help"], ["Pane sizing", "help", "shrink-height"]]
            scenarios = Scenarios(session, observer)

            scenarios.visible("help", ["help", "shrink-height"])

            self.assertEqual(session.screenshot.call_count, 2)
            session.snapshot.assert_called_once_with("help")
            self.assertEqual(len(list(Path(directory).glob("*-text.json"))), 2)

    def test_truncated_help_fails_and_keeps_the_observed_text(self):
        with tempfile.TemporaryDirectory() as directory:
            session = SimpleNamespace(artifacts=Path(directory), screenshot=Mock(return_value=Path("shot.png")), snapshot=Mock())
            observer = Mock()
            observer.read.return_value = ["Pane sizing", "help", "equalize"]
            scenarios = Scenarios(session, observer)

            with patch("scenarios.time.monotonic", side_effect=[0, 0.1, 16]):
                with self.assertRaisesRegex(ScenarioFailure, "shrink-height"):
                    scenarios.visible("help", ["help", "shrink-height"], timeout=15)

            session.snapshot.assert_not_called()
            self.assertTrue((Path(directory) / "help-001-text.json").is_file())

    def test_failed_expectations_are_explicit_exceptions_not_optimizable_assertions(self):
        with self.assertRaisesRegex(ScenarioFailure, "wrong focus"):
            require(False, "wrong focus")
        require(True, "valid focus")
