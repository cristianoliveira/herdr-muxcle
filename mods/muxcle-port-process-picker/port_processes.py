#!/usr/bin/env python3
"""Trusted local listener inventory and reviewed process signaling helper."""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import subprocess
import sys
from typing import Callable, Sequence

MAX_PROCESSES = 500
MAX_PORTS_PER_PROCESS = 256
MAX_REVIEW_COUNT = 32
MAX_REVIEW_CHARS = 64 * 1024
MAX_COMMAND_CHARS = 512
MAX_START_CHARS = 128
MAX_HELPER_OUTPUT = 512 * 1024
LIST_TIMEOUT_SECONDS = 10
PROCESS_TIMEOUT_SECONDS = 3


class CommandResult:
    def __init__(self, code: int, stdout: str, stderr: str):
        self.code = code
        self.stdout = stdout
        self.stderr = stderr


def run_command(args: Sequence[str], **options) -> CommandResult:
    try:
        completed = subprocess.run(args, check=False, **options)
    except FileNotFoundError as error:
        raise RuntimeError(f"Required local command is unavailable: {args[0]}") from error
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f"Local process query timed out: {args[0]}") from error
    stdout = completed.stdout or ""
    stderr = completed.stderr or ""
    if len(stdout) > MAX_HELPER_OUTPUT or len(stderr) > MAX_HELPER_OUTPUT:
        raise RuntimeError(f"Local process query output exceeded its size limit: {args[0]}")
    return CommandResult(completed.returncode, stdout, stderr)


def parse_lsof_output(text: str) -> dict[int, dict[str, object]]:
    if not isinstance(text, str) or len(text) > MAX_HELPER_OUTPUT:
        raise ValueError("lsof output exceeded its size limit")

    processes: dict[int, dict[str, object]] = {}
    current: dict[str, object] | None = None

    def finish() -> None:
        nonlocal current
        if current is None:
            return
        pid = current.get("pid")
        ports = current.get("ports")
        if not isinstance(pid, int) or pid <= 0:
            raise ValueError("lsof returned an invalid PID")
        if not isinstance(ports, set) or not ports:
            current = None
            return
        if len(processes) >= MAX_PROCESSES and pid not in processes:
            raise ValueError("lsof process count exceeded its limit")
        existing = processes.setdefault(
            pid,
            {"uid": current.get("uid"), "command": current.get("command"), "ports": set()},
        )
        if existing["uid"] != current.get("uid") or existing["command"] != current.get("command"):
            raise ValueError("lsof returned conflicting process identity records")
        existing["ports"].update(ports)
        if len(existing["ports"]) > MAX_PORTS_PER_PROCESS:
            raise ValueError("lsof port count exceeded its limit")
        current = None

    for line in text.splitlines():
        if not line:
            continue
        field, value = line[0], line[1:]
        if field == "p":
            finish()
            try:
                pid = int(value)
            except ValueError as error:
                raise ValueError("lsof returned an invalid PID") from error
            current = {"pid": pid, "ports": set()}
        elif current is None:
            continue
        elif field == "c":
            current["command"] = value
        elif field == "u":
            try:
                current["uid"] = int(value)
            except ValueError as error:
                raise ValueError("lsof returned an invalid UID") from error
        elif field == "n":
            match = re.search(r":([0-9]+)(?:\s+\(LISTEN\))?$", value)
            if not match:
                raise ValueError("lsof returned a listener with an invalid port")
            port = int(match.group(1))
            if not 1 <= port <= 65_535:
                raise ValueError("lsof returned a listener with an invalid port")
            current["ports"].add(port)
            if len(current["ports"]) > MAX_PORTS_PER_PROCESS:
                raise ValueError("lsof port count exceeded its limit")

    finish()
    result: dict[int, dict[str, object]] = {}
    for pid, process in processes.items():
        command = process["command"]
        uid = process["uid"]
        ports = process["ports"]
        if not isinstance(command, str) or not command or len(command) > MAX_COMMAND_CHARS or _has_control(command):
            raise ValueError("lsof returned an invalid command name")
        if not isinstance(uid, int) or uid < 0:
            raise ValueError("lsof returned an invalid UID")
        if not isinstance(ports, set) or not ports:
            continue
        result[pid] = {"uid": uid, "command": command, "ports": sorted(ports)}
    return result


def parse_ps_identity(pid: int, text: str) -> dict[str, object]:
    if not isinstance(pid, int) or pid <= 0 or not isinstance(text, str) or len(text) > 4_096:
        raise ValueError("ps returned an invalid process identity")
    fields = text.rstrip("\r\n").split(None, 7)
    if len(fields) != 8:
        raise ValueError("ps returned an invalid process identity")
    try:
        actual_pid = int(fields[0])
        uid = int(fields[1])
    except ValueError as error:
        raise ValueError("ps returned an invalid process identity") from error
    started_at = " ".join(fields[2:7])
    command = fields[7]
    if (
        actual_pid != pid
        or uid < 0
        or len(started_at) > MAX_START_CHARS
        or _has_control(started_at)
        or not command
        or len(command) > MAX_COMMAND_CHARS
        or _has_control(command)
    ):
        raise ValueError("ps returned an invalid process identity")
    return {"pid": actual_pid, "uid": uid, "startedAt": started_at, "command": command}


def inventory(runner: Callable = run_command) -> dict[str, object]:
    result = runner(
        ["lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcun"],
        capture_output=True,
        text=True,
        timeout=LIST_TIMEOUT_SECONDS,
    )
    if result.code == 1 and not result.stdout.strip() and not result.stderr.strip():
        return {"schema": 1, "processes": [], "warnings": []}
    if result.code != 0 or result.stderr.strip():
        raise RuntimeError("Listener inventory was incomplete; no processes are selectable. Check local lsof access and rescan.")

    listeners = parse_lsof_output(result.stdout)
    identities = _read_identities(list(listeners), runner)
    processes = []
    warnings = []
    for pid in sorted(listeners):
        identity = identities.get(pid)
        if identity is None:
            warnings.append(f"PID {pid} ended during inventory and was omitted; rescan before selecting.")
            continue
        listener = listeners[pid]
        if identity["uid"] != listener["uid"] or not _same_command_name(listener["command"], identity["command"]):
            raise RuntimeError("Listener identity changed during inventory; no processes are selectable. Rescan.")
        processes.append({**identity, "ports": listener["ports"]})

    if len(warnings) > 20:
        warnings = warnings[:19] + ["Additional processes changed during inventory; rescan for a complete view."]
    return {"schema": 1, "processes": processes, "warnings": warnings}


def validate_review(review: object) -> list[dict[str, object]]:
    if not isinstance(review, list) or not review or len(review) > MAX_REVIEW_COUNT:
        raise ValueError("Reviewed process list is empty or exceeds its limit")
    result = []
    seen: set[int] = set()
    for process in review:
        if not isinstance(process, dict):
            raise ValueError("Reviewed process identity is invalid")
        pid = process.get("pid")
        uid = process.get("uid")
        command = process.get("command")
        started_at = process.get("startedAt")
        ports = process.get("ports")
        if (
            not isinstance(pid, int)
            or isinstance(pid, bool)
            or pid <= 0
            or not isinstance(uid, int)
            or isinstance(uid, bool)
            or uid < 0
            or not isinstance(command, str)
            or not command
            or len(command) > MAX_COMMAND_CHARS
            or _has_control(command)
            or not isinstance(started_at, str)
            or not started_at
            or len(started_at) > MAX_START_CHARS
            or _has_control(started_at)
            or not isinstance(ports, list)
            or not ports
            or len(ports) > MAX_PORTS_PER_PROCESS
        ):
            raise ValueError("Reviewed process identity is invalid")
        if pid in seen:
            raise ValueError("Reviewed process list contains a duplicate PID")
        seen.add(pid)
        if any(not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65_535 for port in ports):
            raise ValueError("Reviewed process ports are invalid")
        if len(set(ports)) != len(ports):
            raise ValueError("Reviewed process ports contain duplicates")
        result.append({"pid": pid, "uid": uid, "command": command, "startedAt": started_at, "ports": sorted(ports)})
    return result


def signal_review(
    review: object,
    signal_name: str,
    identity_reader: Callable[[int], dict[str, object] | None] | None = None,
    ports_reader: Callable[[int], list[int]] | None = None,
    signal_sender: Callable[[int, int], None] | None = None,
) -> list[dict[str, object]]:
    targets = validate_review(review)
    if signal_name not in {"TERM", "KILL"}:
        raise ValueError("signal must be TERM or KILL")

    identity_reader = identity_reader or _read_identity
    ports_reader = ports_reader or _read_ports
    signal_sender = signal_sender or os.kill
    signal_number = signal.SIGTERM if signal_name == "TERM" else signal.SIGKILL
    results = []

    for target in targets:
        pid = target["pid"]
        try:
            current = identity_reader(pid)
        except (OSError, RuntimeError, ValueError):
            results.append({"pid": pid, "status": "stale", "message": "Process identity could not be revalidated."})
            continue
        if current is None:
            results.append({"pid": pid, "status": "gone"})
            continue
        expected_identity = {key: target[key] for key in ("pid", "uid", "startedAt", "command")}
        current_identity = {key: current.get(key) for key in expected_identity}
        if current_identity != expected_identity:
            results.append({"pid": pid, "status": "stale", "message": "Process identity or start time changed."})
            continue

        try:
            current_ports = sorted(set(ports_reader(pid)))
        except (OSError, RuntimeError, ValueError):
            current_ports = []
        if current_ports != target["ports"]:
            results.append({"pid": pid, "status": "stale", "message": "Listening ports changed since review."})
            continue

        try:
            final_identity = identity_reader(pid)
        except (OSError, RuntimeError, ValueError):
            results.append({"pid": pid, "status": "stale", "message": "Process identity could not be revalidated."})
            continue
        if final_identity is None:
            results.append({"pid": pid, "status": "gone"})
            continue
        final_identity_values = {key: final_identity.get(key) for key in expected_identity}
        if final_identity_values != expected_identity:
            results.append({"pid": pid, "status": "stale", "message": "Process identity changed after port revalidation."})
            continue

        try:
            signal_sender(pid, signal_number)
        except PermissionError:
            results.append({"pid": pid, "status": "denied", "message": "Operating-system permissions denied the signal."})
        except ProcessLookupError:
            results.append({"pid": pid, "status": "gone"})
        except OSError as error:
            results.append({"pid": pid, "status": "failed", "message": f"Signal failed: {error.strerror or 'operating-system error'}."})
        else:
            results.append({"pid": pid, "status": "sent", "signal": signal_name})
    return results


def _read_identities(pids: Sequence[int], runner: Callable = run_command) -> dict[int, dict[str, object]]:
    if not pids:
        return {}
    result = runner(
        ["ps", "-p", ",".join(str(pid) for pid in pids), "-o", "pid=,uid=,lstart=,comm="],
        capture_output=True,
        text=True,
        timeout=PROCESS_TIMEOUT_SECONDS,
    )
    if result.code != 0:
        raise RuntimeError("Could not read process identities; no processes are selectable. Rescan.")
    identities = {}
    for line in result.stdout.splitlines():
        fields = line.split(None, 1)
        if not fields:
            continue
        try:
            pid = int(fields[0])
        except ValueError as error:
            raise ValueError("ps returned an invalid process identity") from error
        if pid not in pids or pid in identities:
            raise ValueError("ps returned an unexpected or duplicate process identity")
        identities[pid] = parse_ps_identity(pid, line)
    return identities


def _read_identity(pid: int, runner: Callable = run_command) -> dict[str, object] | None:
    identities = _read_identities([pid], runner)
    return identities.get(pid)


def _read_ports(pid: int, runner: Callable = run_command) -> list[int]:
    result = runner(
        ["lsof", "-nP", "-a", "-p", str(pid), "-iTCP", "-sTCP:LISTEN", "-Fpcun"],
        capture_output=True,
        text=True,
        timeout=LIST_TIMEOUT_SECONDS,
    )
    if result.code == 1 and not result.stdout.strip() and not result.stderr.strip():
        return []
    if result.code != 0:
        raise RuntimeError("Could not recheck listener ports")
    records = parse_lsof_output(result.stdout)
    process = records.get(pid)
    return list(process["ports"]) if process else []


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Trusted local listening-process helper")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list", help="list local TCP listeners")
    signal_parser = commands.add_parser("signal", help="signal an exact reviewed process set")
    signal_parser.add_argument("--kind", required=True, choices=("TERM", "KILL"))
    signal_parser.add_argument("--review-json", required=True)
    options = parser.parse_args(argv)

    try:
        if options.command == "list":
            payload = inventory()
        else:
            if len(options.review_json) > MAX_REVIEW_CHARS:
                raise ValueError("Reviewed process payload exceeded its size limit")
            review = json.loads(options.review_json)
            payload = {"schema": 1, "signal": options.kind, "results": signal_review(review, options.kind)}
        encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
        if len(encoded) > MAX_HELPER_OUTPUT:
            raise RuntimeError("Helper response exceeded its size limit")
        print(encoded)
        return 0
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        print(f"port-process-picker: {error}", file=sys.stderr)
        return 2


def _same_command_name(lsof_command: str, ps_command: str) -> bool:
    def basename(command: str) -> str:
        return command.rsplit("/", 1)[-1]

    left = os.fsencode(basename(lsof_command))
    right = os.fsencode(basename(ps_command))
    if left == right:
        return True
    shorter, longer = sorted((left, right), key=len)
    return len(shorter) >= 15 and longer.startswith(shorter)


def _has_control(value: str) -> bool:
    return any(ord(character) < 32 or ord(character) == 127 for character in value)


if __name__ == "__main__":
    raise SystemExit(main())
