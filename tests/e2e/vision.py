"""Offline text observations from full-window native screenshots."""
import json
import subprocess
import unicodedata
from pathlib import Path


def normalize_text(value):
    return "".join(character for character in unicodedata.normalize("NFKC", value).lower() if character.isalnum())


class ScreenText:
    def __init__(self, executable, environment):
        self.executable = Path(executable)
        self.environment = environment

    @classmethod
    def compile(cls, compiler, workspace, environment):
        workspace = Path(workspace)
        executable = workspace / "bin" / "screen-text"
        executable.parent.mkdir(parents=True, exist_ok=True)
        source = Path(__file__).with_name("screen_text.swift")
        cache = workspace / "cache" / "swift"
        cache.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            [str(compiler), "-module-cache-path", str(cache), str(source), "-o", str(executable)],
            env=environment, text=True, capture_output=True, timeout=120,
        )
        if result.returncode:
            raise RuntimeError("Cannot compile local Vision text observer: " + result.stderr[-2000:])
        return cls(executable, environment)

    def read(self, screenshot):
        try:
            result = subprocess.run(
                [str(self.executable), str(screenshot)], env=self.environment,
                text=True, capture_output=True, timeout=15,
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError("Local screenshot text recognition timed out.") from None
        if result.returncode:
            raise RuntimeError("Local screenshot text recognition failed: " + result.stderr[-1000:])
        if len(result.stdout) > 1024 * 1024:
            raise RuntimeError("Local screenshot text output exceeds the limit.")
        try:
            lines = json.loads(result.stdout)
        except ValueError:
            raise RuntimeError("Local screenshot text observer returned invalid JSON.") from None
        if not isinstance(lines, list) or not all(isinstance(line, str) for line in lines):
            raise RuntimeError("Local screenshot text observer returned invalid text observations.")
        return lines
