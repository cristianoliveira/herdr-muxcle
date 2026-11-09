import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

from vision import ScreenText, normalize_text


class ScreenTextTests(unittest.TestCase):
    def test_normalizes_wrapped_command_names_without_hiding_letter_changes(self):
        self.assertEqual(normalize_text("muxcle-sizing.\nshrink-height"), "muxclesizingshrinkheight")
        self.assertNotEqual(normalize_text("muxcie-sizing.help"), normalize_text("muxcle-sizing.help"))

    def test_extracts_only_strings_from_successful_local_ocr(self):
        result = subprocess.CompletedProcess([], 0, json.dumps(["Pane sizing", "muxcle-sizing.help"]), "")
        with patch("vision.subprocess.run", return_value=result) as run:
            text = ScreenText(Path("/owned/bin/ocr"), {"HOME": "/owned/home"}).read(Path("/owned/shot.png"))

        self.assertEqual(text, ["Pane sizing", "muxcle-sizing.help"])
        self.assertEqual(run.call_args.args[0], ["/owned/bin/ocr", "/owned/shot.png"])
        self.assertEqual(run.call_args.kwargs["env"], {"HOME": "/owned/home"})
        self.assertEqual(run.call_args.kwargs["timeout"], 15)

    def test_rejects_failed_malformed_or_oversized_output(self):
        for result in [
            subprocess.CompletedProcess([], 1, "", "recognition failed"),
            subprocess.CompletedProcess([], 0, "not json", ""),
            subprocess.CompletedProcess([], 0, '{"text":"not a list"}', ""),
            subprocess.CompletedProcess([], 0, '["text",42]', ""),
            subprocess.CompletedProcess([], 0, "x" * (1024 * 1024 + 1), ""),
        ]:
            with self.subTest(result=result.returncode, size=len(result.stdout)):
                with patch("vision.subprocess.run", return_value=result):
                    with self.assertRaises(RuntimeError):
                        ScreenText(Path("/owned/ocr"), {}).read(Path("/owned/shot.png"))

    def test_local_ocr_timeout_is_reported_without_retry(self):
        with patch("vision.subprocess.run", side_effect=subprocess.TimeoutExpired("ocr", 15)) as run:
            with self.assertRaisesRegex(RuntimeError, "timed out"):
                ScreenText(Path("/owned/ocr"), {}).read(Path("/owned/shot.png"))
        self.assertEqual(run.call_count, 1)
