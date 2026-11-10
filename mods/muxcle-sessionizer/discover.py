#!/usr/bin/env python3
"""Bounded project-folder discovery for the Sessionizer mod."""

from __future__ import annotations

import base64
import binascii
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

MAX_INPUT_BYTES = 96 * 1024
MAX_OUTPUT_BYTES = 512 * 1024
MAX_ROOTS = 12
MAX_PATH_CHARS = 4_096
MAX_SPACES = 256
MAX_PROJECTS = 500
MAX_SCANNED_ENTRIES = 20_000
MAX_REMOTE_OUTPUT_BYTES = 512 * 1024
MAX_REMOTE_ENVELOPE_BYTES = 4 * 1024 * 1024
MAX_REMOTE_STDERR_BYTES = 1024 * 1024


def discover_projects(root_values: list[str]) -> dict[str, Any]:
    warnings: list[str] = []
    roots: list[Path] = []
    seen_roots: set[str] = set()

    for raw_root in root_values:
        if not valid_path_text(raw_root):
            warnings.append(warning("Invalid root", raw_root))
            continue
        root = Path(raw_root).expanduser()
        if not root.is_absolute():
            warnings.append(warning("Root is not absolute", raw_root))
            continue
        try:
            canonical_root = root.resolve(strict=True)
            if not canonical_root.is_dir():
                warnings.append(warning("Not a directory", raw_root))
                continue
        except FileNotFoundError:
            warnings.append(warning("Missing root", raw_root))
            continue
        except PermissionError:
            warnings.append(warning("Unreadable root", raw_root))
            continue
        except (OSError, RuntimeError):
            warnings.append(warning("Could not read root", raw_root))
            continue

        identity = path_identity(canonical_root)
        if identity not in seen_roots:
            roots.append(canonical_root)
            seen_roots.add(identity)

    projects_by_path: dict[str, dict[str, str]] = {}
    scanned_entries = 0
    truncated = False

    for root in roots:
        try:
            with os.scandir(root) as entries:
                for entry in entries:
                    scanned_entries += 1
                    if scanned_entries > MAX_SCANNED_ENTRIES:
                        truncated = True
                        break
                    if entry.name.startswith("."):
                        continue
                    try:
                        if not entry.is_dir(follow_symlinks=True):
                            continue
                        canonical_path = Path(entry.path).resolve(strict=True)
                        if not canonical_path.is_dir():
                            continue
                    except (OSError, RuntimeError):
                        continue

                    path = str(canonical_path)
                    identity = path_identity(canonical_path)
                    projects_by_path.setdefault(identity, {"name": canonical_path.name, "path": path})
        except PermissionError:
            warnings.append(warning("Unreadable root", str(root)))
        except OSError:
            warnings.append(warning("Could not read root", str(root)))

        if truncated:
            break

    projects = sorted(
        projects_by_path.values(),
        key=lambda project: (project["name"].casefold(), project["name"], path_identity(Path(project["path"]))),
    )
    if len(projects) > MAX_PROJECTS:
        projects = projects[:MAX_PROJECTS]
        truncated = True

    return bounded_discovery(projects, warnings[:MAX_ROOTS], truncated)


def find_local_space(payload: object) -> dict[str, str | None]:
    if not isinstance(payload, dict):
        raise ValueError("invalid payload")
    folder = payload.get("folder")
    spaces = payload.get("spaces")
    if not valid_path_text(folder) or not isinstance(spaces, list) or len(spaces) > MAX_SPACES:
        raise ValueError("invalid payload")

    candidate = Path(folder).expanduser()
    if not candidate.is_absolute():
        raise ValueError("invalid folder")
    try:
        canonical_candidate = candidate.resolve(strict=True)
        if not canonical_candidate.is_dir():
            return {"spaceId": None, "error": "folder_missing"}
    except FileNotFoundError:
        return {"spaceId": None, "error": "folder_missing"}
    except (OSError, RuntimeError):
        raise ValueError("folder could not be resolved") from None

    matches: list[tuple[bool, int, str]] = []
    for index, space in enumerate(spaces):
        if not isinstance(space, dict):
            raise ValueError("invalid space")
        space_id = space.get("id")
        space_folder = space.get("folder")
        active = space.get("active")
        if (
            not isinstance(space_id, str)
            or not space_id
            or len(space_id) > 512
            or not isinstance(space_folder, str)
            or len(space_folder) > MAX_PATH_CHARS
            or "\0" in space_folder
            or not isinstance(active, bool)
        ):
            raise ValueError("invalid space")
        try:
            candidate_folder = Path.home() if space_folder == "" else Path(space_folder).expanduser()
        except (OSError, RuntimeError):
            raise ValueError("space folder could not be resolved") from None
        if len(str(candidate_folder)) > MAX_PATH_CHARS:
            raise ValueError("space folder is too long")
        if not candidate_folder.is_absolute():
            continue
        try:
            canonical_folder = candidate_folder.resolve(strict=False)
        except (OSError, RuntimeError):
            continue
        if path_identity(canonical_folder) == path_identity(canonical_candidate):
            matches.append((not active, index, space_id))

    if not matches:
        return {"spaceId": None}
    matches.sort()
    return {"spaceId": matches[0][2]}


def bounded_discovery(
    projects: list[dict[str, str]],
    warnings: list[str],
    truncated: bool,
) -> dict[str, Any]:
    result: dict[str, Any] = {"projects": [], "warnings": warnings, "truncated": truncated}
    base_size = len(json.dumps(result, separators=(",", ":")).encode("utf-8"))
    included: list[dict[str, str]] = []
    used_size = base_size
    for project in projects:
        encoded = json.dumps(project, separators=(",", ":")).encode("utf-8")
        added_size = len(encoded) + (1 if included else 0)
        if len(included) >= MAX_PROJECTS or used_size + added_size > MAX_OUTPUT_BYTES:
            result["truncated"] = True
            break
        included.append(project)
        used_size += added_size

    result["projects"] = included
    return result


def path_identity(path: Path) -> str:
    return os.path.normcase(str(path))


def valid_path_text(value: object) -> bool:
    return isinstance(value, str) and 0 < len(value) <= MAX_PATH_CHARS and "\0" not in value


def warning(label: str, path: str) -> str:
    return f"{label}: {path[:1_900]}"


def read_payload(raw: str) -> object:
    if len(raw.encode("utf-8")) > MAX_INPUT_BYTES:
        raise ValueError("input too large")
    return json.loads(raw)


def run_remote(machine: str, mode: str, payload: str) -> dict[str, Any]:
    if not valid_machine(machine):
        raise ValueError("invalid machine")
    if mode not in {"discover", "match"}:
        raise ValueError("invalid remote mode")
    source = Path(__file__).read_text(encoding="utf-8")
    marker = "from __future__ import annotations\n"
    if marker not in source:
        raise ValueError("scanner cannot be isolated")
    arguments = ["discover.py", mode, payload]
    source = source.replace(marker, marker + f"import sys\nsys.argv = {arguments!r}\n", 1)
    result = subprocess.run(
        ["hc", "exec", "--json", "--on", machine, "--timeout", "6", "-i", "--", "python3", "-I", "-"],
        input=source, text=True, capture_output=True, timeout=8, check=False,
    )
    if result.returncode != 0 or len(result.stdout.encode("utf-8")) > MAX_REMOTE_ENVELOPE_BYTES:
        raise ValueError("remote scan failed; check hc machine ls and remote Python 3")
    envelope = json.loads(result.stdout)
    if (
        not isinstance(envelope, dict)
        or type(envelope.get("code")) is not int
        or not isinstance(envelope.get("stdout"), str)
        or not isinstance(envelope.get("stderr"), str)
        or envelope["code"] != 0
        or not valid_optional_flag(envelope, "timed_out")
        or not valid_optional_flag(envelope, "truncated")
        or envelope.get("timed_out", False)
        or envelope.get("truncated", False)
    ):
        raise ValueError("remote scan failed; check hc machine ls and remote Python 3")
    output = decode_base64_output(envelope["stdout"], MAX_REMOTE_OUTPUT_BYTES)
    decode_base64_output(envelope["stderr"], MAX_REMOTE_STDERR_BYTES)
    value = json.loads(output.decode("utf-8"))
    if mode == "discover" and (not isinstance(value, dict) or not isinstance(value.get("projects"), list)
            or not isinstance(value.get("warnings"), list) or not isinstance(value.get("truncated"), bool)):
        raise ValueError("invalid remote project list")
    return value


def valid_optional_flag(envelope: dict[str, Any], name: str) -> bool:
    return name not in envelope or isinstance(envelope[name], bool)


def decode_base64_output(value: str, limit: int) -> bytes:
    if len(value) > ((limit + 2) // 3) * 4:
        raise ValueError("remote command output is too large")
    try:
        decoded = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("remote command returned invalid output") from None
    if len(decoded) > limit:
        raise ValueError("remote command output is too large")
    return decoded


def remote_projects(machine: str, roots: list[str]) -> dict[str, Any]:
    return run_remote(machine, "discover", json.dumps(roots))


def connected_machines() -> list[dict[str, str]]:
    result = subprocess.run(["hc", "machine", "ls", "--json"], text=True,
                            capture_output=True, timeout=3, check=False)
    if result.returncode != 0:
        raise ValueError("machine listing failed; check hc machine ls")
    value = read_payload(result.stdout)
    machines = value.get("machines") if isinstance(value, dict) else None
    if not isinstance(machines, list):
        raise ValueError("invalid machine list; check hc machine ls")
    return [
        {"id": entry["id"], "name": entry["name"]}
        for entry in machines
        if isinstance(entry, dict) and entry.get("state") == "connected"
        and isinstance(entry.get("id"), str) and entry["id"]
        and isinstance(entry.get("name"), str) and entry["name"]
    ]


def valid_machine(value: object) -> bool:
    return (
        isinstance(value, str)
        and 0 < len(value) <= 256
        and all(ord(character) >= 32 and ord(character) != 127 for character in value)
    )


def main(arguments: list[str]) -> int:
    if len(arguments) < 1 or arguments[0] not in {"discover", "match", "remote", "remote-match", "machines"}:
        return 2
    try:
        if arguments[0] == "machines" and len(arguments) == 1:
            result = {"machines": connected_machines()}
        elif arguments[0] == "remote" and len(arguments) == 3:
            roots = read_payload(arguments[2])
            if not isinstance(roots, list) or len(roots) > MAX_ROOTS or not all(valid_path_text(root) for root in roots):
                raise ValueError("invalid roots")
            result = remote_projects(arguments[1], roots)
        elif arguments[0] == "remote-match" and len(arguments) == 3:
            payload = read_payload(arguments[2])
            if not isinstance(payload, dict):
                raise ValueError("invalid match payload")
            result = run_remote(arguments[1], "match", json.dumps(payload))
        elif len(arguments) == 2 and arguments[0] in {"discover", "match"}:
            payload = read_payload(arguments[1])
            if arguments[0] == "discover":
                if (not isinstance(payload, list) or len(payload) > MAX_ROOTS
                        or not all(valid_path_text(root) for root in payload)):
                    raise ValueError("invalid roots")
                result = discover_projects(payload)
            else:
                result = find_local_space(payload)
        else:
            return 2
        output = json.dumps(result, separators=(",", ":"))
        if len(output.encode("utf-8")) > MAX_OUTPUT_BYTES:
            return 3
        print(output)
        return 0
    except (OSError, subprocess.TimeoutExpired, UnicodeError, ValueError, json.JSONDecodeError):
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
