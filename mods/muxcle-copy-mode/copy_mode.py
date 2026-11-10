#!/usr/bin/env python3
"""Open a terminal snapshot in an isolated, read-only keyboard copy viewer."""

import argparse
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile


MAX_BYTES = 8 * 1024 * 1024
MAX_REASON_CHARS = 120
TERMINAL_ADDRESS = re.compile(r"(?:[A-Za-z0-9_.-]+/)?t[a-z0-9]+\Z")
READ_METHODS = {"screen", "history", "stitched"}


def hc(args):
    return subprocess.run(
        ["hc", *args],
        capture_output=True,
        text=True,
        timeout=3,
        cwd=Path.home(),
    )


def read_core_id():
    result = hc(["server", "status", "--json"])
    if result.returncode != 0:
        raise ValueError("Cannot verify the Herdr Core/session before capture.")
    try:
        core_id = json.loads(result.stdout)["core"]["id"]
    except (ValueError, KeyError, TypeError) as error:
        raise ValueError("Herdr returned an invalid Core identity.") from error
    if not isinstance(core_id, str) or not core_id:
        raise ValueError("Herdr returned an invalid Core identity.")
    return core_id


def read_machine_id(machine):
    result = hc(["machine", "ls", "--json"])
    if result.returncode != 0:
        raise ValueError(f"Cannot verify remote machine {machine!r} before capture.")
    try:
        machines = json.loads(result.stdout)["machines"]
        matches = [item["id"] for item in machines if item["name"] == machine]
    except (ValueError, KeyError, TypeError) as error:
        raise ValueError("Herdr returned invalid remote machine metadata.") from error
    if len(matches) != 1 or not isinstance(matches[0], str) or not matches[0]:
        raise ValueError(f"Remote machine {machine!r} is missing or ambiguous.")
    return matches[0]


def verify_scope(core_id, machine, machine_id):
    if read_core_id() != core_id:
        raise ValueError("Herdr Core/session changed; no snapshot was captured. Refocus the terminal and retry.")
    if machine is not None and read_machine_id(machine) != machine_id:
        raise ValueError(f"Remote machine {machine!r} changed identity; no snapshot was captured.")


def capture(terminal, lines, core_id, machine, machine_id):
    verify_scope(core_id, machine, machine_id)
    try:
        return hc(["read", "--json", "--lines", str(lines), terminal])
    finally:
        verify_scope(core_id, machine, machine_id)


def read_snapshot(result):
    if result.returncode != 0:
        raise ValueError("Cannot capture terminal text. Check the terminal and machine connection.")
    try:
        value = json.loads(result.stdout)
    except (ValueError, TypeError) as error:
        raise ValueError("Herdr returned invalid terminal snapshot JSON.") from error

    if not isinstance(value, dict):
        raise ValueError("Herdr returned an invalid terminal snapshot.")
    text = value.get("text")
    complete = value.get("complete")
    how = value.get("how")
    why = value.get("why")
    if (
        not isinstance(text, str)
        or not isinstance(complete, bool)
        or how not in READ_METHODS
        or (why is not None and not isinstance(why, str))
    ):
        raise ValueError("Herdr returned an invalid terminal snapshot envelope.")

    reason = clean_reason(why)
    notices = []
    if how == "screen":
        detail = f" ({reason})" if reason else ""
        notices.append(f"[Screen only: scrollback is not included{detail}.]")
    elif not complete:
        detail = f" ({reason})" if reason else ""
        notices.append(f"[Incomplete snapshot: older output may be missing{detail}.]")

    status = "screen-only" if how == "screen" else "incomplete" if not complete else "full"
    return text, status, notices


def clean_reason(reason):
    if reason is None:
        return ""
    return " ".join(reason.split())[:MAX_REASON_CHARS]


def snapshot(terminal, core_id, machine=None, machine_id=None):
    if not isinstance(terminal, str) or not TERMINAL_ADDRESS.fullmatch(terminal):
        raise ValueError("Focus a terminal with a valid Herdr address first.")
    if not isinstance(core_id, str) or not core_id:
        raise ValueError("A verified Herdr Core identity is required for capture.")
    if (machine is None) != (machine_id is None):
        raise ValueError("Remote machine identity is incomplete.")

    machine_name = terminal.split("/", 1)[0] if "/" in terminal else None
    if machine_name != machine:
        raise ValueError("The terminal address does not match its verified machine.")

    try:
        result = capture(terminal, 10000, core_id, machine, machine_id)
        timed_out = False
    except subprocess.TimeoutExpired:
        try:
            result = capture(terminal, 0, core_id, machine, machine_id)
        except subprocess.TimeoutExpired as error:
            raise ValueError("Terminal screen capture timed out; hc read did not respond.") from error
        timed_out = True

    text, status, notices = read_snapshot(result)
    if timed_out and status != "screen-only":
        notices.insert(0, "[Scrollback capture timed out; showing the current screen only.]")
        status = "screen-only"
    payload = "\n\n".join([*notices, text]) if notices else text
    if len(payload.encode("utf-8")) > MAX_BYTES:
        raise ValueError("Terminal snapshot is invalid or exceeds 8 MiB.")
    return payload, status


def view(terminal, core_id, machine=None, machine_id=None):
    text, status = snapshot(terminal, core_id, machine, machine_id)
    with tempfile.TemporaryDirectory(prefix="muxcle-copy-") as directory:
        snapshot_path = Path(directory) / "scrollback.txt"
        descriptor = os.open(snapshot_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            file.write(text)

        config = Path(__file__).with_name("copy-mode.lua")
        return subprocess.run(
            [
                "nvim", "-u", str(config), "--noplugin", "-i", "NONE", "-n",
                "-R", "-M", "--", str(snapshot_path),
            ],
            cwd=Path.home(),
            env={**os.environ, "HERDR_COPY_MODE_STATUS": status},
        ).returncode


def exit_on_signal(_signal, _frame):
    raise SystemExit(0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--terminal", required=True)
    parser.add_argument("--core-id", required=True)
    parser.add_argument("--machine")
    parser.add_argument("--machine-id")
    args = parser.parse_args()
    for name in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(name, exit_on_signal)

    try:
        return view(args.terminal, args.core_id, args.machine, args.machine_id)
    except (ValueError, OSError, subprocess.TimeoutExpired) as error:
        print(f"Copy mode failed: {error}", flush=True)
        input("Press Enter to close.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
