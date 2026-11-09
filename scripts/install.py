#!/usr/bin/env python3
"""Safely deploy selected files from a verified Herdr Muxcle package archive."""

from __future__ import annotations

import argparse
import copy
import json
import os
import re
import secrets
import stat
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

SUPPORTED_PACKAGES = {
    "herdr-muxcle",
    "muxcle-tmux-keys",
    "muxcle-sessionizer",
    "muxcle-picker",
    "muxcle-history",
    "muxcle-rotation",
    "muxcle-sizing",
    "muxcle-pack",
}
FEATURE_MODS = {
    "muxcle-sessionizer",
    "muxcle-picker",
    "muxcle-history",
    "muxcle-rotation",
    "muxcle-sizing",
}
PACKAGE_MODS = {
    "herdr-muxcle": {"muxcle-compat"},
    "muxcle-tmux-keys": set(),
    **{name: {name} for name in FEATURE_MODS},
    "muxcle-pack": set(FEATURE_MODS),
}
PACKAGE_LAYOUTS = {
    "herdr-muxcle": "layouts/muxcle.json",
    "muxcle-pack": "layouts/muxcle-pack.json",
}
MAX_MANIFEST_BYTES = 1_048_576
MAX_FILES = 10_000
MAX_PAYLOAD_BYTES = 67_108_864
MAX_FILE_BYTES = 33_554_432
STABLE_VERSION = re.compile(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\Z")
MOD_NAME = re.compile(r"muxcle-[a-z0-9]+(?:-[a-z0-9]+)*\Z")


class InstallError(Exception):
    """Expected validation or filesystem failure with an actionable message."""


@dataclass
class PlannedFile:
    relative_path: str
    content: bytes
    action: str
    before: bytes | None = None
    mode: int = 0o644


@dataclass(frozen=True)
class TargetRoot:
    path: Path
    parent_identity: tuple[int, int]
    identity: tuple[int, int] | None


@dataclass
class InstallPlan:
    package_name: str
    version: str
    source: Path
    target: TargetRoot
    files: list[PlannedFile]
    conflicts: list[str]
    notices: list[str]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Preview or safely deploy the selected runtime files from any current "
            "Herdr Muxcle package (requires Python 3.11+ and POSIX dir_fd/O_NOFOLLOW support). "
            "No files change unless --apply is supplied."
        ),
        epilog=(
            "Examples:\n"
            "  python3 install.py --target \"$APP_HOME\"\n"
            "  python3 install.py --target \"$APP_HOME\" --apply\n"
            "  python3 install.py --source ./vendor/muxcle-picker --target \"$DOTFILES/.config/herdr-app\" --apply\n"
            "  python3 install.py --target \"$APP_HOME\" --apply --replace\n"
            "  python3 install.py --target \"$APP_HOME\" --apply --skip-keys\n\n"
            "Back up your dotfiles before applying. Replacements are backed up before writes. "
            "Do not edit the source or target tree concurrently with installation; path checks cannot defeat an active filesystem race. "
            "The installer does not fetch archives, run package code, alter app state, or select a layout."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--source",
        type=Path,
        help="extracted package directory (default: the directory containing this script)",
    )
    parser.add_argument("--target", required=True, type=Path, help="Herdr app home or dotfiles staging directory")
    parser.add_argument("--apply", action="store_true", help="write the previewed files; preview is the default")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="authorize differing deployed files and exact key conflicts; save backups first",
    )
    parser.add_argument(
        "--skip-keys",
        action="store_true",
        help="skip keys.json merge (use when key precedence or existing-map validation needs manual review)",
    )
    args = parser.parse_args(argv)

    source = args.source if args.source is not None else Path(__file__).absolute().parent
    try:
        plan = build_plan(source, args.target, replace=args.replace, skip_keys=args.skip_keys)
        print_plan(plan, apply=args.apply)
        if not args.apply:
            return 0
        if plan.conflicts:
            for conflict in plan.conflicts:
                print(f"Error: {conflict}", file=sys.stderr)
            print("No files were changed. Use --replace only for exact conflicts or --skip-keys to bypass keymap conflicts.", file=sys.stderr)
            return 2
        apply_plan(plan)
        return 0
    except InstallError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2
    except OSError as error:
        print(f"Error: filesystem operation failed: {error}", file=sys.stderr)
        return 3


def build_plan(source: Path, target: Path, *, replace: bool, skip_keys: bool) -> InstallPlan:
    if not str(source).isprintable() or not str(target).isprintable():
        raise InstallError("source and target paths must be printable and contain no control characters")
    source_root = Path(os.path.abspath(source))
    target_root = Path(os.path.abspath(target))
    source_root, source_files, manifest = read_package_tree(source_root)
    package_name = manifest["name"]
    version = manifest["version"]
    validate_package_policy(package_name, source_files)
    target_snapshot = ensure_target_root(target_root)
    ensure_disjoint_roots(source_root, target_snapshot.path)

    selected = select_runtime_files(package_name, source_files)
    planned: list[PlannedFile] = []
    conflicts: list[str] = []
    notices: list[str] = []

    for relative_path in sorted(path for path in selected if path != "keys.json"):
        planned_file, conflict = plan_file(
            source_files[relative_path], relative_path, target_snapshot, replace=replace
        )
        planned.append(planned_file)
        if conflict:
            conflicts.append(conflict)

    if "keys.json" in selected and not skip_keys:
        try:
            key_action, key_conflicts, key_notices = plan_keymap(
                source_files["keys.json"], target_snapshot, replace=replace
            )
        except InstallError as error:
            raise InstallError(f"cannot merge keys.json: {error}; inspect it or rerun with --skip-keys") from error
        planned.append(key_action)
        conflicts.extend(key_conflicts)
        notices.extend(key_notices)
    elif "keys.json" in selected:
        notices.append("keys.json was skipped by request; no package bindings will be merged.")

    return InstallPlan(package_name, version, source_root, target_snapshot, planned, conflicts, notices)


def read_package_tree(source: Path) -> tuple[Path, dict[str, bytes], dict[str, Any]]:
    source, source_fd = open_source_root(source)
    try:
        manifest_bytes = read_regular_file_at(
            source_fd, "manifest.json", MAX_MANIFEST_BYTES, label="manifest.json", require_single_link=True
        )
        manifest = validate_manifest(parse_json(manifest_bytes, "manifest.json"))
        actual_files: set[str] = set()
        actual_directories: set[str] = set()
        total_size = 0

        for directory, dirnames, filenames in os.walk(source, topdown=True, followlinks=False):
            directory_path = Path(directory)
            for name in sorted(dirnames):
                child = directory_path / name
                relative = child.relative_to(source).as_posix()
                validate_relative_path(relative)
                info = child.lstat()
                if stat.S_ISLNK(info.st_mode):
                    raise InstallError(f"symlinked source payload is not allowed: {relative}")
                if not stat.S_ISDIR(info.st_mode):
                    raise InstallError(f"unsupported source entry: {relative}")
                actual_directories.add(relative)
            for name in sorted(filenames):
                child = directory_path / name
                relative = child.relative_to(source).as_posix()
                validate_relative_path(relative)
                info = child.lstat()
                if stat.S_ISLNK(info.st_mode):
                    raise InstallError(f"symlinked source payload is not allowed: {relative}")
                if not stat.S_ISREG(info.st_mode):
                    raise InstallError(f"unsupported source entry: {relative}")
                if info.st_nlink != 1:
                    raise InstallError(f"hard-linked source payload is not allowed: {relative}")
                actual_files.add(relative)
                total_size += info.st_size
                if total_size > MAX_PAYLOAD_BYTES:
                    raise InstallError("package payload exceeds the 64 MiB safety limit")

        listed = set(manifest["files"])
        if actual_files != listed:
            missing = sorted(listed - actual_files)
            extra = sorted(actual_files - listed)
            detail = []
            if missing:
                detail.append("missing: " + ", ".join(missing[:5]))
            if extra:
                detail.append("unlisted: " + ", ".join(extra[:5]))
            raise InstallError("source tree does not match manifest (" + "; ".join(detail) + ")")

        expected_directories = {
            "/".join(path.split("/")[:index])
            for path in manifest["files"]
            for index in range(1, len(path.split("/")))
        }
        if actual_directories != expected_directories:
            raise InstallError("source directory tree does not match manifest-listed files")

        payload: dict[str, bytes] = {}
        total_read = 0
        for relative in manifest["files"]:
            parent_fd = open_relative_directory(source_fd, relative.split("/")[:-1], create=False)
            if parent_fd is None:
                raise InstallError(f"source path changed while reading: {relative}")
            try:
                data = read_regular_file_at(
                    parent_fd,
                    relative.split("/")[-1],
                    MAX_FILE_BYTES,
                    label=relative,
                    require_single_link=True,
                )
            finally:
                os.close(parent_fd)
            total_read += len(data)
            if total_read > MAX_PAYLOAD_BYTES:
                raise InstallError("package payload exceeds the 64 MiB safety limit")
            payload[relative] = data
        return source, payload, manifest
    finally:
        os.close(source_fd)


def validate_manifest(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise InstallError("manifest.json must contain a JSON object")
    required_fields = {"name", "version", "testedHerdrAppVersion", "files"}
    if set(value) != required_fields:
        raise InstallError("manifest.json must contain only name, version, testedHerdrAppVersion, and files")
    name = value["name"]
    version = value["version"]
    tested_version = value["testedHerdrAppVersion"]
    files = value["files"]
    if not isinstance(name, str) or name not in SUPPORTED_PACKAGES:
        raise InstallError("manifest package name is not a supported Muxcle package")
    if not isinstance(version, str) or not STABLE_VERSION.fullmatch(version):
        raise InstallError("manifest version must be stable semantic versioning (for example 0.1.1)")
    if not isinstance(tested_version, str) or not STABLE_VERSION.fullmatch(tested_version):
        raise InstallError("manifest testedHerdrAppVersion must be a stable semantic version")
    if not isinstance(files, list) or not files or len(files) > MAX_FILES:
        raise InstallError("manifest files must be a non-empty list of at most 10,000 paths")
    if any(not isinstance(path, str) for path in files):
        raise InstallError("manifest file paths must be strings")
    if files != sorted(files) or len(set(files)) != len(files):
        raise InstallError("manifest files must be sorted and contain no duplicates")
    for path in files:
        validate_relative_path(path)
    if "manifest.json" not in files:
        raise InstallError("manifest must list manifest.json")
    file_set = set(files)
    for path in files:
        parts = path.split("/")
        for index in range(1, len(parts)):
            parent = "/".join(parts[:index])
            if parent in file_set:
                raise InstallError(f"manifest file is also used as a parent directory: {parent}")
    return value


def validate_relative_path(value: str) -> None:
    if not value.isprintable():
        raise InstallError("manifest and source paths must be printable and contain no control characters")
    pure = PurePosixPath(value)
    windows = PureWindowsPath(value)
    parts = value.split("/")
    if (
        not value
        or pure.is_absolute()
        or windows.is_absolute()
        or windows.drive
        or "\\" in value
        or "\x00" in value
        or any(part in ("", ".", "..") for part in parts)
    ):
        raise InstallError(f"unsafe manifest path: {value!r}")


def validate_package_policy(package_name: str, files: dict[str, bytes]) -> None:
    if set(PACKAGE_MODS[package_name]) != {
        path.split("/")[1]
        for path in files
        if path.startswith("mods/") and len(path.split("/")) >= 3
    }:
        raise InstallError(f"manifest mod inventory does not match package {package_name}")

    for path in files:
        if path.startswith("mods/"):
            parts = path.split("/")
            if len(parts) < 3 or not MOD_NAME.fullmatch(parts[1]) or parts[1] not in PACKAGE_MODS[package_name]:
                raise InstallError(f"unsupported runtime mod path for {package_name}: {path}")
        if path.startswith("layouts/") and path != PACKAGE_LAYOUTS.get(package_name):
            raise InstallError(f"unsupported runtime layout path for {package_name}: {path}")

    expected_layout = PACKAGE_LAYOUTS.get(package_name)
    if (expected_layout is not None) != (expected_layout in files):
        raise InstallError(f"manifest layout inventory does not match package {package_name}")
    needs_keys = package_name != "herdr-muxcle"
    if ("keys.json" in files) != needs_keys:
        raise InstallError(f"manifest keymap inventory does not match package {package_name}")

    for mod_name in sorted(PACKAGE_MODS[package_name]):
        prefix = f"mods/{mod_name}/"
        mod_files = {path for path in files if path.startswith(prefix)}
        required = {prefix + "main.js", prefix + "mod.json"}
        if not required.issubset(mod_files):
            raise InstallError(f"runtime mod {mod_name} is missing main.js or mod.json")
        owner_path = prefix + "package-owner.json"
        if mod_name == "muxcle-compat":
            if owner_path in files:
                raise InstallError("scaffold compatibility mod must not claim a feature-package owner")
            continue
        if owner_path not in files:
            raise InstallError(f"runtime mod {mod_name} is missing its package ownership marker")
        owner = parse_json(files[owner_path], owner_path)
        if (
            not isinstance(owner, dict)
            or set(owner) != {"package", "schema"}
            or owner["package"] != mod_name
            or type(owner["schema"]) is not int
            or owner["schema"] != 1
        ):
            raise InstallError(f"invalid package ownership marker: {owner_path}")


def select_runtime_files(package_name: str, files: dict[str, bytes]) -> set[str]:
    selected = {"keys.json"} if package_name != "herdr-muxcle" else set()
    selected.update(path for path in files if path.startswith("mods/"))
    layout = PACKAGE_LAYOUTS.get(package_name)
    if layout:
        selected.add(layout)
    return selected


def plan_file(content: bytes, relative_path: str, target: TargetRoot, *, replace: bool) -> tuple[PlannedFile, str | None]:
    current, mode = inspect_target_file(target, relative_path)
    if current is None:
        return PlannedFile(relative_path, content, "create", mode=0o644), None
    if current == content:
        return PlannedFile(relative_path, content, "unchanged", before=current, mode=mode), None
    if replace:
        return PlannedFile(relative_path, content, "replace", before=current, mode=mode), None
    return (
        PlannedFile(relative_path, content, "conflict", before=current, mode=mode),
        f"{relative_path}: differs from the package; use --replace to back it up and replace it",
    )


def plan_keymap(snippet_bytes: bytes, target: TargetRoot, *, replace: bool) -> tuple[PlannedFile, list[str], list[str]]:
    current_bytes, mode = inspect_target_file(target, "keys.json")
    existing = {} if current_bytes is None else parse_json(current_bytes, "existing keys.json")
    snippet = parse_json(snippet_bytes, "package keys.json")
    merged, conflicts, added, unchanged = merge_keymaps(existing, snippet, replace_exact=replace)
    precedence = [item for item in conflicts if item["reason"] != "exact"]
    exact = [item for item in conflicts if item["reason"] == "exact"]
    messages = [format_key_conflict(item) for item in conflicts]
    if precedence:
        return PlannedFile("keys.json", b"", "conflict", current_bytes, mode), messages, []
    if exact and not replace:
        return PlannedFile("keys.json", b"", "conflict", current_bytes, mode), messages, []
    if merged == existing:
        return PlannedFile("keys.json", current_bytes or b"", "unchanged", current_bytes, mode), [], ["keys.json already contains the package bindings."]
    rendered = (json.dumps(merged, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")
    action = "create" if current_bytes is None else "merge"
    note = f"keys.json: {added} binding(s) added, {unchanged} already present"
    if exact:
        note += f", {len(exact)} exact conflict(s) replaced"
    return PlannedFile("keys.json", rendered, action, current_bytes, mode), [], [note]


def merge_keymaps(existing_value: Any, additions_value: Any, *, replace_exact: bool) -> tuple[dict[str, Any], list[dict[str, Any]], int, int]:
    existing = validate_keymap(existing_value, "existing key map", allow_metadata=True)
    additions = validate_keymap(additions_value, "package key snippet", allow_metadata=False)
    merged = copy.deepcopy(existing)
    conflicts: list[dict[str, Any]] = []
    added = 0
    unchanged = 0

    ordered_sections = sorted(additions.items(), key=lambda pair: (section_priority(pair[0]), pair[0]))
    for incoming_section, incoming_value in ordered_sections:
        incoming_bindings = incoming_value
        target = merged.get(incoming_section, {})
        for chord, incoming_action in incoming_bindings.items():
            if chord in target:
                existing_action = target[chord]
                if actions_equal(existing_action, incoming_action):
                    unchanged += 1
                    conflicts.extend(find_precedence_overlaps(merged, incoming_section, chord, incoming_action))
                    continue
                conflicts.append({
                    "chord": chord,
                    "existingSection": incoming_section,
                    "incomingSection": incoming_section,
                    "existingAction": existing_action,
                    "incomingAction": incoming_action,
                    "reason": "exact",
                })
                if replace_exact:
                    target[chord] = copy.deepcopy(incoming_action)
                    conflicts.extend(find_precedence_overlaps(merged, incoming_section, chord, incoming_action))
                continue

            overlaps = find_precedence_overlaps(merged, incoming_section, chord, incoming_action)
            conflicts.extend(overlaps)
            if overlaps:
                continue
            target[chord] = copy.deepcopy(incoming_action)
            merged[incoming_section] = target
            added += 1

    return merged, conflicts, added, unchanged


def validate_keymap(value: Any, label: str, *, allow_metadata: bool) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise InstallError(f"{label} must be a JSON object")
    for section, bindings in value.items():
        if not section.isprintable():
            raise InstallError(f"{label} contains a non-printable section name")
        is_package_section = section in ("global", "terminal")
        is_scoped_section = section.startswith("layout:") or section.startswith("mod:")
        if is_scoped_section and not section.split(":", 1)[1].strip():
            raise InstallError(f"{label} has an empty key section name: {section}")
        if not is_package_section and not is_scoped_section:
            if allow_metadata:
                continue
            raise InstallError(f"{label} contains unsupported section: {section}")
        if not allow_metadata and not is_package_section:
            raise InstallError(f"{label} contains unsupported section: {section}")
        if not isinstance(bindings, dict):
            raise InstallError(f"{label} section {section} must be an object")
        for chord, action in bindings.items():
            if not chord.isprintable():
                raise InstallError(f"{label} contains a non-printable key chord")
            if not chord.strip():
                raise InstallError(f"{label} section {section} has an empty key chord")
            validate_action(action, f"{label} section {section} chord {chord}")
    return value


def validate_action(value: Any, label: str) -> None:
    if isinstance(value, str):
        if not value.strip():
            raise InstallError(f"{label} action must not be empty")
        return
    if not isinstance(value, dict):
        raise InstallError(f"{label} action must be a string or command object")
    if set(value) - {"command", "args"}:
        raise InstallError(f"{label} command object may contain only command and args")
    if not isinstance(value.get("command"), str) or not value["command"].strip():
        raise InstallError(f"{label} command object requires a non-empty command")
    if "args" in value and not isinstance(value["args"], dict):
        raise InstallError(f"{label} command args must be an object")


def find_precedence_overlaps(keymap: dict[str, Any], incoming_section: str, chord: str, incoming_action: Any) -> list[dict[str, Any]]:
    incoming_priority = section_priority(incoming_section)
    if incoming_priority not in (0, 2):
        return []
    conflicts = []
    for existing_section, existing_bindings in keymap.items():
        if existing_section == incoming_section or not is_scoped_section(existing_section):
            continue
        existing_priority = section_priority(existing_section)
        existing_action = existing_bindings.get(chord)
        if existing_action is None or actions_equal(existing_action, incoming_action):
            continue
        shadows_incoming = existing_priority > incoming_priority
        if shadows_incoming != (incoming_section == "global"):
            continue
        conflicts.append({
            "chord": chord,
            "existingSection": existing_section,
            "incomingSection": incoming_section,
            "existingAction": existing_action,
            "incomingAction": incoming_action,
            "reason": "shadowed-by-existing" if shadows_incoming else "overrides-existing",
        })
    return conflicts


def section_priority(section: str) -> int:
    if section == "global":
        return 0
    if section.startswith("layout:"):
        return 1
    if section == "terminal":
        return 2
    return 3


def is_scoped_section(section: str) -> bool:
    return section in ("global", "terminal") or section.startswith("layout:")


def actions_equal(left: Any, right: Any) -> bool:
    return canonical_json(left) == canonical_json(right)


def canonical_json(value: Any) -> str:
    if isinstance(value, list):
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False) + ":" + canonical_json(value[key])
            for key in sorted(value)
        ) + "}"
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


def format_key_conflict(conflict: dict[str, Any]) -> str:
    return (
        f"keys.json {conflict['reason']}: {conflict['existingSection']}.{conflict['chord']} "
        f"conflicts with {conflict['incomingSection']}.{conflict['chord']}"
    )


def inspect_target_file(target: TargetRoot, relative_path: str) -> tuple[bytes | None, int]:
    parent_fd = open_absolute_directory(target.path.parent)
    try:
        verify_directory_identity(parent_fd, target.parent_identity, "target parent")
        root_fd = open_target_root(target, parent_fd, create=False)
        if root_fd is None:
            return None, 0o644
        try:
            return inspect_target_file_at_root(root_fd, relative_path)
        finally:
            os.close(root_fd)
    finally:
        os.close(parent_fd)


def inspect_target_file_at_root(root_fd: int, relative_path: str) -> tuple[bytes | None, int]:
    parts = relative_path.split("/")
    parent_fd = open_relative_directory(root_fd, parts[:-1], create=False)
    if parent_fd is None:
        return None, 0o644
    try:
        try:
            info = os.stat(parts[-1], dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            return None, 0o644
        if stat.S_ISLNK(info.st_mode):
            raise InstallError(f"symlinked target file is not allowed: {relative_path}")
        if not stat.S_ISREG(info.st_mode):
            raise InstallError(f"target path is not a regular file: {relative_path}")
        data = read_regular_file_at(
            parent_fd,
            parts[-1],
            MAX_FILE_BYTES,
            label=relative_path,
            expected_identity=file_identity(info),
        )
        return data, stat.S_IMODE(info.st_mode)
    finally:
        os.close(parent_fd)


def ensure_target_root(target: Path) -> TargetRoot:
    if target == Path(target.anchor):
        raise InstallError("target must be an app-home directory, not a filesystem root")
    try:
        parent = target.parent.resolve(strict=True)
    except OSError as error:
        raise InstallError(f"target parent must already exist and be a directory: {target.parent}") from error
    if not parent.is_dir():
        raise InstallError(f"target parent must already exist and be a directory: {parent}")
    canonical_target = parent / target.name
    if not str(canonical_target).isprintable():
        raise InstallError("target path resolves to a non-printable filesystem path")
    try:
        info = canonical_target.lstat()
    except FileNotFoundError:
        info = None
    if info is not None and (stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode)):
        raise InstallError("target root must be a real directory, not a symlink or file")
    return TargetRoot(
        canonical_target,
        file_identity(parent.stat()),
        file_identity(info) if info is not None else None,
    )


def ensure_disjoint_roots(source: Path, target: Path) -> None:
    source_resolved = source.resolve(strict=True)
    target_resolved = target.resolve(strict=False)
    if is_within(source_resolved, target_resolved) or is_within(target_resolved, source_resolved):
        raise InstallError("source and target directories must not overlap")


def is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def apply_plan(plan: InstallPlan) -> None:
    if plan.conflicts:
        raise InstallError("refusing to apply a plan with unresolved conflicts")

    backup_files = [item for item in plan.files if item.before is not None and item.action in ("replace", "merge")]
    backup_directory: Path | None = None
    completed: list[str] = []
    created_directories: list[Path] = []
    parent_fd = open_absolute_directory(plan.target.path.parent)
    backup_fd: int | None = None
    root_fd: int | None = None
    try:
        verify_directory_identity(parent_fd, plan.target.parent_identity, "target parent")
        if backup_files:
            backup_directory, backup_fd = create_backup_directory(parent_fd, plan)
            for item in backup_files:
                parts = item.relative_path.split("/")
                backup_parent = open_relative_directory(
                    backup_fd,
                    parts[:-1],
                    create=True,
                    display_root=backup_directory,
                    mode=0o700,
                )
                if backup_parent is None:
                    raise InstallError(f"could not create backup path for {item.relative_path}")
                try:
                    print(f"Backing up: {item.relative_path}", flush=True)
                    atomic_write(
                        backup_directory.joinpath(*parts),
                        item.before or b"",
                        mode=0o600,
                        create_only=True,
                        parent_fd=backup_parent,
                    )
                    print(f"Backed up: {item.relative_path}", flush=True)
                finally:
                    os.close(backup_parent)

        root_fd = open_target_root(plan.target, parent_fd, create=True, created_directories=created_directories)
        if root_fd is None:
            raise InstallError("target root is unavailable")

        for item in plan.files:
            if item.action == "unchanged":
                continue
            parts = item.relative_path.split("/")
            destination_parent = open_relative_directory(
                root_fd,
                parts[:-1],
                create=True,
                created_directories=created_directories,
                display_root=plan.target.path,
            )
            if destination_parent is None:
                raise InstallError(f"target directory is unavailable: {item.relative_path}")
            try:
                current, mode = inspect_target_entry(destination_parent, parts[-1], item.relative_path)
                if current != item.before:
                    raise InstallError(f"target changed after preview: {item.relative_path}")
                if item.before is not None and mode != item.mode:
                    raise InstallError(f"target permissions changed after preview: {item.relative_path}")
                try:
                    atomic_write(
                        plan.target.path.joinpath(*parts),
                        item.content,
                        mode=item.mode,
                        create_only=item.before is None,
                        parent_fd=destination_parent,
                    )
                except KeyboardInterrupt:
                    current, _ = inspect_target_entry(destination_parent, parts[-1], item.relative_path)
                    if current == item.content:
                        completed.append(item.relative_path)
                        print(f"Applied: {item.relative_path}", flush=True)
                    raise
                completed.append(item.relative_path)
                print(f"Applied: {item.relative_path}", flush=True)
            finally:
                os.close(destination_parent)
    except KeyboardInterrupt:
        raise
    except (InstallError, OSError) as error:
        finished = ", ".join(completed) if completed else "none"
        directories = ", ".join(str(path) for path in created_directories) if created_directories else "none"
        backup_text = f" Backups are at {backup_directory}." if backup_directory else ""
        raise InstallError(
            f"apply stopped after writing {finished} and creating directories {directories}: {error}. "
            f"No rollback was attempted; inspect the listed paths, remove new files only after review, and restore replaced files from backup if one was printed.{backup_text}"
        ) from error
    finally:
        if root_fd is not None:
            os.close(root_fd)
        if backup_fd is not None:
            os.close(backup_fd)
        os.close(parent_fd)

    unchanged = [item.relative_path for item in plan.files if item.action == "unchanged"]
    for relative in unchanged:
        print(f"Unchanged: {relative}")
    if plan.notices:
        for notice in plan.notices:
            print(f"Note: {notice}")
    if not completed and not unchanged:
        print("Nothing to apply.")
    print("No package scripts were executed and no layout was selected.")


def inspect_target_entry(parent_fd: int, name: str, relative_path: str) -> tuple[bytes | None, int]:
    try:
        info = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        return None, 0o644
    if stat.S_ISLNK(info.st_mode):
        raise InstallError(f"symlinked target file is not allowed: {relative_path}")
    if not stat.S_ISREG(info.st_mode):
        raise InstallError(f"target path is not a regular file: {relative_path}")
    data = read_regular_file_at(
        parent_fd,
        name,
        MAX_FILE_BYTES,
        label=relative_path,
        expected_identity=file_identity(info),
    )
    return data, stat.S_IMODE(info.st_mode)


def directory_flags() -> int:
    required = (os.open, os.stat, os.mkdir, os.unlink, os.link, os.rename)
    if (
        not hasattr(os, "O_NOFOLLOW")
        or not hasattr(os, "O_DIRECTORY")
        or any(function not in os.supports_dir_fd for function in required)
    ):
        raise InstallError("this platform lacks safe no-follow directory operations required for installation")
    return os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


def open_source_root(source: Path) -> tuple[Path, int]:
    source = Path(os.path.abspath(source))
    try:
        parent = source.parent.resolve(strict=True)
        canonical_source = parent / source.name
        if not str(canonical_source).isprintable():
            raise InstallError("source path resolves to a non-printable filesystem path")
        info = canonical_source.lstat()
    except OSError as error:
        raise InstallError(f"source directory is unavailable: {source}: {error}") from error
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise InstallError("source must be a real directory, not a symlink")

    parent_fd = open_absolute_directory(parent)
    try:
        descriptor = os.open(canonical_source.name, directory_flags(), dir_fd=parent_fd)
    except OSError as error:
        raise InstallError(f"cannot safely open source directory {canonical_source}: {error}") from error
    finally:
        os.close(parent_fd)
    if file_identity(os.fstat(descriptor)) != file_identity(info):
        os.close(descriptor)
        raise InstallError("source directory changed while being opened")
    return canonical_source, descriptor


def open_absolute_directory(path: Path) -> int:
    path = Path(os.path.abspath(path))
    if not path.is_absolute():
        raise InstallError(f"directory path must be absolute: {path}")
    descriptor = os.open(path.anchor, directory_flags())
    try:
        for part in path.parts[1:]:
            next_descriptor = os.open(part, directory_flags(), dir_fd=descriptor)
            os.close(descriptor)
            descriptor = next_descriptor
        return descriptor
    except OSError as error:
        os.close(descriptor)
        raise InstallError(f"cannot safely open directory {path}: {error}") from error


def open_relative_directory(
    root_fd: int,
    components: list[str],
    *,
    create: bool,
    created_directories: list[Path] | None = None,
    display_root: Path | None = None,
    mode: int = 0o755,
) -> int | None:
    descriptor = os.dup(root_fd)
    current_path = display_root
    try:
        for component in components:
            if create:
                try:
                    os.mkdir(component, mode=mode, dir_fd=descriptor)
                except FileExistsError:
                    pass
                else:
                    if created_directories is not None and current_path is not None:
                        created_path = current_path / component
                        created_directories.append(created_path)
                        print(f"Created directory: {created_path}", flush=True)
            try:
                next_descriptor = os.open(component, directory_flags(), dir_fd=descriptor)
            except FileNotFoundError:
                os.close(descriptor)
                return None
            except OSError as error:
                raise InstallError(f"unsafe target directory component {component}: {error}") from error
            os.close(descriptor)
            descriptor = next_descriptor
            if current_path is not None:
                current_path = current_path / component
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def open_target_root(
    target: TargetRoot,
    parent_fd: int,
    *,
    create: bool,
    created_directories: list[Path] | None = None,
) -> int | None:
    name = target.path.name
    created = False
    try:
        info = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        if target.identity is not None:
            raise InstallError("target root disappeared after preview")
        if not create:
            return None
        try:
            os.mkdir(name, mode=0o755, dir_fd=parent_fd)
        except FileExistsError as error:
            raise InstallError("target root appeared after preview") from error
        created = True
        if created_directories is not None:
            created_directories.append(target.path)
            print(f"Created directory: {target.path}", flush=True)
        info = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise InstallError("target root changed or is not a real directory")
    if target.identity is not None and file_identity(info) != target.identity:
        raise InstallError("target root changed after preview")
    if target.identity is None and not created:
        raise InstallError("target root appeared after preview")
    descriptor = os.open(name, directory_flags(), dir_fd=parent_fd)
    if file_identity(os.fstat(descriptor)) != file_identity(info):
        os.close(descriptor)
        raise InstallError("target root changed while opening it")
    return descriptor


def verify_directory_identity(descriptor: int, expected: tuple[int, int], label: str) -> None:
    if file_identity(os.fstat(descriptor)) != expected:
        raise InstallError(f"{label} changed after preview")


def file_identity(info: os.stat_result) -> tuple[int, int]:
    return info.st_dev, info.st_ino


def create_backup_directory(parent_fd: int, plan: InstallPlan) -> tuple[Path, int]:
    prefix = f".{plan.target.path.name}.muxcle-backup-{plan.version}-"
    for _ in range(20):
        name = prefix + secrets.token_hex(4)
        try:
            os.mkdir(name, mode=0o700, dir_fd=parent_fd)
        except FileExistsError:
            continue
        backup_path = plan.target.path.parent / name
        print(f"Backup directory: {backup_path}", flush=True)
        descriptor = os.open(name, directory_flags(), dir_fd=parent_fd)
        return backup_path, descriptor
    raise InstallError("could not create a unique backup directory")


def atomic_write(
    destination: Path,
    content: bytes,
    *,
    mode: int,
    create_only: bool,
    parent_fd: int,
) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    temporary_name = ""
    descriptor = -1
    for _ in range(20):
        temporary_name = ".muxcle-install-" + secrets.token_hex(8)
        try:
            descriptor = os.open(temporary_name, flags, mode, dir_fd=parent_fd)
            break
        except FileExistsError:
            continue
    if descriptor < 0:
        raise OSError("could not create a unique temporary file")
    try:
        with os.fdopen(descriptor, "wb", closefd=False) as output:
            os.fchmod(descriptor, mode)
            output.write(content)
            output.flush()
            os.fsync(descriptor)
        if create_only:
            os.link(
                temporary_name,
                destination.name,
                src_dir_fd=parent_fd,
                dst_dir_fd=parent_fd,
                follow_symlinks=False,
            )
        else:
            os.rename(temporary_name, destination.name, src_dir_fd=parent_fd, dst_dir_fd=parent_fd)
        try:
            os.unlink(temporary_name, dir_fd=parent_fd)
        except FileNotFoundError:
            pass
        try:
            os.fsync(parent_fd)
        except OSError:
            pass
    finally:
        os.close(descriptor)
        try:
            os.unlink(temporary_name, dir_fd=parent_fd)
        except FileNotFoundError:
            pass


def read_regular_file_at(
    parent_fd: int,
    name: str,
    maximum: int,
    *,
    label: str,
    expected_identity: tuple[int, int] | None = None,
    require_single_link: bool = False,
) -> bytes:
    flags = os.O_RDONLY | os.O_NOFOLLOW | getattr(os, "O_NONBLOCK", 0)
    try:
        descriptor = os.open(name, flags, dir_fd=parent_fd)
    except OSError as error:
        raise InstallError(f"cannot safely read {label}: {error}") from error
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise InstallError(f"not a regular file: {label}")
        if require_single_link and before.st_nlink != 1:
            raise InstallError(f"hard-linked source payload is not allowed: {label}")
        if expected_identity is not None and file_identity(before) != expected_identity:
            raise InstallError(f"file changed while being inspected: {label}")
        if before.st_size > maximum:
            raise InstallError(f"file is too large: {label}")
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            data = source.read(maximum + 1)
        after = os.fstat(descriptor)
        if len(data) > maximum:
            raise InstallError(f"file is too large: {label}")
        before_state = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
        after_state = (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
        if before_state != after_state:
            raise InstallError(f"file changed while being read: {label}")
        return data
    finally:
        os.close(descriptor)


def parse_json(data: bytes, label: str) -> Any:
    def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise InstallError(f"{label} contains a duplicate JSON key: {key!r}")
            result[key] = value
        return result

    def reject_constant(value: str) -> None:
        raise InstallError(f"{label} contains invalid JSON number {value}")

    try:
        text = data.decode("utf-8")
        return json.loads(text, object_pairs_hook=reject_duplicates, parse_constant=reject_constant)
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as error:
        raise InstallError(f"{label} is not valid UTF-8 JSON: {error}") from error


def print_plan(plan: InstallPlan, *, apply: bool) -> None:
    mode = "Apply plan" if apply else "Preview only (no files will be changed)"
    print(f"{mode}: {plan.package_name} {plan.version}")
    print(f"Source: {plan.source}")
    print(f"Target: {plan.target.path}")
    for item in plan.files:
        verb = {
            "create": "Create",
            "replace": "Replace (backup first)",
            "merge": "Merge (backup first)",
            "unchanged": "Unchanged",
            "conflict": "Conflict",
        }[item.action]
        print(f"{verb}: {item.relative_path}")
    for conflict in plan.conflicts:
        print(f"Conflict: {conflict}")
    for notice in plan.notices:
        print(f"Note: {notice}")
    if plan.conflicts and not apply:
        print("Resolve conflicts before applying; use --replace for exact conflicts or --skip-keys for keymap conflicts.")
    elif not apply:
        print("Review the plan, then add --apply to write these files.")
    if apply and plan.conflicts:
        print("No files were changed; fix conflicts or re-run with an explicit safe option.")


def main_guard() -> int:
    try:
        return main()
    except KeyboardInterrupt:
        print(
            "Interrupted. Review the emitted Applied, Backed up, and Created directory entries, "
            "plus any backup directory; an operation in progress may need inspection. No rollback was attempted.",
            file=sys.stderr,
        )
        return 130


if __name__ == "__main__":
    raise SystemExit(main_guard())
